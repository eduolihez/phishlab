/**
 * Motor de plantillas de PhishLab.
 *
 * Dos espacios de nombres conviven en el mismo HTML:
 *
 *   {{empresa}}      -> nuestro. Se sustituye aquí, antes de exportar.
 *   {{.FirstName}}   -> de GoPhish. Se deja LITERAL para que lo resuelva
 *                       GoPhish en el momento del envío.
 *
 * Confundirlos es el fallo caro: una plantilla exportada con {{.URL}} ya
 * sustituido manda al destinatario a ninguna parte, y no te enteras hasta
 * haber lanzado la campaña entera.
 */

/** Variables que resuelve GoPhish. Empiezan por punto y son intocables. */
const GOPHISH = /\{\{\s*\.\w+\s*\}\}/g;

/** Nuestras variables: {{clave}} o {{clave.subclave}}, nunca con punto inicial. */
const PROPIAS = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

/** Marcador temporal. Elegido para no aparecer jamás en HTML real. */
const ABRE = '@@GP';
const CIERRA = '@@';

/** Tope de pasadas de sustitucion. Corta cualquier ciclo entre fragmentos. */
const MAX_PASADAS = 6;

/**
 * Sustituye nuestras variables dejando las de GoPhish intactas.
 *
 * @param {string} html
 * @param {Record<string, unknown>} ctx
 * @returns {{ html: string, faltantes: string[] }}
 */
export function render(html, ctx = {}) {
  if (typeof html !== 'string') throw new TypeError('render() espera una cadena');

  // 1. Aparta las de GoPhish para que ningún paso posterior las toque.
  const guardadas = [];
  let texto = html.replace(GOPHISH, (m) => {
    guardadas.push(m);
    return `${ABRE}${guardadas.length - 1}${CIERRA}`;
  });

  // 2. Sustituye las nuestras, en pasadas sucesivas.
  //
  // Hace falta más de una pasada porque los fragmentos de copy son a su vez
  // plantillas: {{entradilla}} se resuelve a "Por tus {{anios}} años en
  // {{empresa}}...", y esas dos variables solo existen una vez insertado el
  // fragmento. Con una única pasada saldrían literales en el correo enviado.
  let pases = 0;
  let hubocambio = true;
  while (hubocambio && pases < MAX_PASADAS) {
    hubocambio = false;
    texto = texto.replace(PROPIAS, (match, clave) => {
      const valor = leer(ctx, clave);
      // undefined/null es "no existe": se deja el hueco visible.
      // Cadena vacía es un valor deliberado (p. ej. el aviso del nivel
      // difícil, que no lleva ninguno) y sí se sustituye.
      if (valor === undefined || valor === null) return match;
      hubocambio = true;
      return String(valor);
    });
    pases++;
  }

  // 3. Lo que siga en pie tras las pasadas es lo que de verdad falta.
  const faltantes = new Set();
  texto.replace(PROPIAS, (_, clave) => {
    faltantes.add(clave);
    return '';
  });

  // 4. Devuelve las de GoPhish a su sitio, tal cual estaban.
  texto = texto.replace(/@@GP(\d+)@@/g, (_, i) => guardadas[Number(i)]);

  return { html: texto, faltantes: [...faltantes] };
}

/** Lee "a.b.c" dentro de un objeto anidado. */
function leer(obj, ruta) {
  return ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * Datos de ejemplo para la VISTA PREVIA únicamente.
 * Nunca se aplican al exportar: allí las variables salen literales.
 */
const EJEMPLO = {
  '{{.FirstName}}': 'María',
  '{{.LastName}}': 'García',
  '{{.Position}}': 'Técnica de Administración',
  '{{.Email}}': 'maria.garcia@ejemplo.com',
  '{{.From}}': 'notificaciones@ejemplo.com',
  '{{.URL}}': '#',
  '{{.BaseURL}}': '#',
  '{{.TrackingURL}}': '#',
  '{{.RId}}': 'preview',
  '{{.Tracker}}': '', // el píxel no pinta nada en la vista previa
};

/** Sustituye las variables de GoPhish por datos de ejemplo. Solo para previsualizar. */
export function conDatosDeEjemplo(html) {
  return html.replace(GOPHISH, (m) => {
    const clave = m.replace(/\s+/g, '');
    return EJEMPLO[clave] !== undefined ? EJEMPLO[clave] : m;
  });
}

/** Lista las variables de GoPhish presentes en un HTML. Lo usa el linter. */
export function variablesGophish(html) {
  return [...new Set((html.match(GOPHISH) || []).map((m) => m.replace(/\s+/g, '')))];
}

/**
 * Construye el contexto de sustitución a partir de marca, campos y fragmentos.
 * Los fragmentos (saludo, urgencia...) se aplanan al primer nivel para que la
 * plantilla escriba {{saludo}} y no {{fragmentos.saludo}}.
 */
export function construirContexto({ marca = {}, campos = {}, fragmentos = {} }) {
  return { ...marca, ...fragmentos, ...campos };
}

// --------------------------------------------------------------- bloques ---

/**
 * Marcador de bloque. Se escribe como comentario HTML para que sobreviva a
 * cualquier editor de correo y no estorbe al render:
 *
 *   <!--@bloque:urgencia @senal:urgencia @opcional-->
 *     <tr>...</tr>
 *   <!--@/bloque-->
 *
 * Se eligió comentario y no atributo `data-` porque un bloque de email suele
 * abarcar varios `<tr>` hermanos, que no tienen un padre común al que colgarle
 * el atributo sin romper la tabla.
 */
const MARCA_BLOQUE = /<!--\s*@(\/)?bloque(?::([\w-]+))?([^>]*?)-->/g;

/**
 * Lista los bloques declarados en un layout, en orden de aparición.
 * Lo usan el linter (para cuadrar layout y meta.json) y el importador.
 *
 * @returns {Array<{id: string, senal: string|null, opcional: boolean}>}
 */
export function bloquesDeclarados(html) {
  const salida = [];
  MARCA_BLOQUE.lastIndex = 0;
  let m;
  while ((m = MARCA_BLOQUE.exec(html))) {
    if (m[1] || !m[2]) continue; // cierre
    const attrs = m[3] ?? '';
    const senal = attrs.match(/@senal:(!?[\w-]+)/)?.[1] ?? null;
    salida.push({ id: m[2], senal, opcional: /@opcional\b/.test(attrs) });
  }
  return salida;
}

/**
 * Quita del HTML los bloques que no están activos y limpia los marcadores
 * de los que sobreviven.
 *
 * Los marcadores NUNCA salen en el HTML exportado: un `<!--@bloque:urgencia-->`
 * en el código fuente de un correo es exactamente la clase de rastro que
 * delata que el mensaje es material de simulación.
 *
 * Podar ocurre siempre ANTES de render(): así una variable que solo existía
 * dentro de un bloque cortado no se cuenta como "faltante" y no ensucia el
 * aviso de la interfaz.
 *
 * @param {string} html
 * @param {Set<string>|((b: {id: string}) => boolean)} activos
 * @returns {{ html: string, eliminados: string[] }}
 */
export function podar(html, activos) {
  if (typeof html !== 'string') throw new TypeError('podar() espera una cadena');
  const decidir = typeof activos === 'function' ? activos : (b) => activos.has(b.id);

  const marcas = [];
  MARCA_BLOQUE.lastIndex = 0;
  let m;
  while ((m = MARCA_BLOQUE.exec(html))) {
    marcas.push({
      cierre: Boolean(m[1]),
      id: m[2] ?? null,
      attrs: m[3] ?? '',
      inicio: m.index,
      fin: m.index + m[0].length,
    });
  }

  const pila = [];
  const cortes = [];
  const eliminados = [];

  for (const marca of marcas) {
    if (!marca.cierre) {
      pila.push(marca);
      continue;
    }
    const abre = pila.pop();
    if (!abre) continue; // cierre huérfano: el linter lo caza aparte

    // Si el bloque ya cae dentro de otro que se corta, no hace falta cortarlo
    // dos veces ni contarlo como eliminado por separado.
    if (cortes.some(([i, f]) => abre.inicio >= i && marca.fin <= f)) continue;

    if (!decidir({ id: abre.id, attrs: abre.attrs })) {
      cortes.push([abre.inicio, marca.fin]);
      eliminados.push(abre.id);
    }
  }

  // Todo lo que hay que quitar: los bloques cortados enteros, y los
  // marcadores sueltos de los que se quedan.
  const quitar = [...cortes];
  for (const marca of marcas) {
    if (cortes.some(([i, f]) => marca.inicio >= i && marca.fin <= f)) continue;
    quitar.push([marca.inicio, marca.fin]);
  }

  // De atrás hacia delante, para que los índices sigan valiendo.
  quitar.sort((a, b) => b[0] - a[0]);
  let texto = html;
  for (const [i, f] of quitar) texto = texto.slice(0, i) + texto.slice(f);

  return { html: texto, eliminados };
}
