/**
 * Saneado del HTML importado.
 *
 * Un correo real trae cosas que no pueden entrar en una plantilla de campaña:
 *
 *   - Píxeles y recursos del remitente original. Si se quedan, cada empleado
 *     que abra tu simulación estará notificando a un tercero. Es el peor de
 *     los fallos posibles aquí y por eso va el primero.
 *   - Scripts y manejadores `onclick`. La previsualización va en un iframe
 *     con sandbox, pero el HTML acaba pegado en GoPhish y servido de verdad.
 *   - Enlaces al destino original. Hay que reescribirlos a `{{.URL}}` o el
 *     botón llevará al sitio auténtico y la campaña no medirá nada.
 *
 * No se usa un parser de HTML completo a propósito: sin dependencias, y sobre
 * HTML de correo (que es tablas y atributos en línea) las expresiones
 * regulares dan un resultado predecible. El informe dice exactamente qué se ha
 * tocado, así que nada de esto ocurre a espaldas de quien importa.
 */

export const ENTIDADES_PELIGROSAS = /^(javascript|vbscript|data:text\/html)/i;

/**
 * @param {string} html
 * @param {{ tipo?: 'emails'|'landings', imagenes?: Map<string,string> }} opciones
 * @returns {{ html: string, informe: {clase: string, texto: string}[] }}
 */
export function sanear(html, { tipo = 'emails', imagenes = new Map() } = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new TypeError('sanear() necesita HTML: el correo no traía parte que saneár');
  }

  const informe = [];
  const anotar = (clase, texto) => informe.push({ clase, texto });

  let salida = html;

  // 1. Fuera todo lo ejecutable.
  salida = quitarEtiqueta(salida, 'script', (n) => n && anotar('quitado', `${n} bloque(s) <script>`));
  salida = quitarEtiqueta(salida, 'noscript', () => {});
  salida = quitarEtiqueta(salida, 'iframe', (n) => n && anotar('quitado', `${n} <iframe>`));
  salida = quitarEtiqueta(salida, 'object', () => {});
  salida = quitarEtiqueta(salida, 'embed', () => {});
  salida = quitarEtiqueta(salida, 'form', () => {}, { soloEtiqueta: true, cuando: tipo === 'emails' });

  const manejadores = salida.match(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi) ?? [];
  if (manejadores.length) {
    salida = salida.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    anotar('quitado', `${manejadores.length} manejador(es) de evento (onclick, onload…)`);
  }

  // 2. Hojas de estilo externas: desaparecen el día que el remitente las mueva.
  const enlacesCss = salida.match(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi) ?? [];
  if (enlacesCss.length) {
    salida = salida.replace(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi, '');
    anotar('quitado', `${enlacesCss.length} hoja(s) de estilo externa(s)`);
  }

  // 3. Imágenes: las que vienen adjuntas se incrustan, las remotas se cortan.
  let incrustadas = 0;
  let rastreadores = 0;

  salida = salida.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (todo, antes, src, despues) => {
    const cid = src.match(/^cid:(.+)$/i)?.[1];
    if (cid) {
      const datos = imagenes.get(cid) ?? imagenes.get(cid.replace(/^</, '').replace(/>$/, ''));
      if (datos) {
        incrustadas++;
        return `${antes}${datos}${despues}`;
      }
      rastreadores++;
      return '';
    }

    if (/^data:/i.test(src)) return todo;

    // Una imagen remota de 1x1 es un píxel de seguimiento del remitente
    // original. Cualquier imagen remota se corta igual, pero conviene decir
    // cuáles eran claramente rastreadores.
    rastreadores++;
    return '';
  });

  if (incrustadas) anotar('incrustado', `${incrustadas} imagen(es) adjunta(s) incrustada(s) en base64`);
  if (rastreadores) anotar('quitado', `${rastreadores} imagen(es) remota(s), incluidos los píxeles de seguimiento del remitente original`);

  // 4. Enlaces al destino original → {{.URL}}.
  let reescritos = 0;
  let anclas = 0;

  salida = salida.replace(/(<a\b[^>]*\bhref=["'])([^"']*)(["'])/gi, (todo, antes, href, cierra) => {
    if (/^\{\{/.test(href)) return todo;
    if (/^(#|mailto:|tel:)/i.test(href)) { anclas++; return todo; }
    if (ENTIDADES_PELIGROSAS.test(href.trim())) { reescritos++; return `${antes}#${cierra}`; }
    reescritos++;
    return `${antes}{{.URL}}${cierra}`;
  });

  if (reescritos) anotar('reescrito', `${reescritos} enlace(s) apuntando ahora a {{.URL}}`);
  if (anclas) anotar('reescrito', `${anclas} enlace(s) internos o mailto: dejados como estaban`);

  // 5. Lo que la plantilla necesita para funcionar en GoPhish.
  if (tipo === 'emails' && !salida.includes('{{.Tracker}}')) {
    salida = /<\/body>/i.test(salida)
      ? salida.replace(/<\/body>/i, '{{.Tracker}}\n</body>')
      : `${salida}\n{{.Tracker}}`;
    anotar('reescrito', 'añadido {{.Tracker}} al final para la métrica de apertura');
  }

  if (tipo === 'emails' && !salida.includes('{{.URL}}')) {
    anotar('quitado', 'ojo: el correo no tiene ningún enlace, así que no habrá nada que pulsar');
  }

  // 6. Envolver el cuerpo entero como un único bloque. Se podrá trocear
  // después desde el editor; lo importante es que funcione ya.
  salida = envolverEnBloque(salida);

  return { html: salida, informe };
}

/** Quita una etiqueta y su contenido (o solo la etiqueta, si se pide). */
export function quitarEtiqueta(html, etiqueta, alQuitar, { soloEtiqueta = false, cuando = true } = {}) {
  if (!cuando) return html;

  if (soloEtiqueta) {
    const re = new RegExp(`</?${etiqueta}\\b[^>]*>`, 'gi');
    const n = (html.match(re) ?? []).length;
    alQuitar(n);
    return html.replace(re, '');
  }

  const re = new RegExp(`<${etiqueta}\\b[^>]*>[\\s\\S]*?</${etiqueta}>`, 'gi');
  const n = (html.match(re) ?? []).length;
  alQuitar(n);
  let salida = html.replace(re, '');
  // Etiquetas sin cerrar, que en correo real son más comunes de lo que parece.
  salida = salida.replace(new RegExp(`<${etiqueta}\\b[^>]*/?>`, 'gi'), '');
  return salida;
}

/**
 * Marca el cuerpo como un bloque llamado `cuerpo`.
 *
 * Un correo importado entra de una pieza y funciona desde el primer momento.
 * Trocearlo en bloques con sentido es un trabajo manual que se hace después,
 * cuando esa plantilla merezca la pena; obligarlo al importar haría que
 * importar dejara de ser útil. La usa también `tools/sanearWeb.js`, por el
 * mismo motivo, para una web clonada entera.
 */
export function envolverEnBloque(html) {
  if (html.includes('<!--@bloque:')) return html;

  const cuerpo = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if (cuerpo) {
    return html.replace(cuerpo[1], `\n<!--@bloque:cuerpo-->\n${cuerpo[1]}\n<!--@/bloque-->\n`);
  }
  return `<!--@bloque:cuerpo-->\n${html}\n<!--@/bloque-->`;
}
