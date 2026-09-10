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
