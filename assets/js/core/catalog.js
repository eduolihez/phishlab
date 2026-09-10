/**
 * Carga del catálogo de plantillas.
 *
 * El navegador no puede listar directorios, así que `templates/index.json`
 * hace de índice. Añadir una plantilla nueva = crear su carpeta y añadir
 * su id a ese fichero. No se toca ni una línea del dashboard.
 */

const RAIZ = 'templates';

/** @returns {Promise<{emails: object[], landings: object[]}>} */
export async function cargarCatalogo() {
  const indice = await json(`${RAIZ}/index.json`);
  const [emails, landings] = await Promise.all([
    Promise.all(indice.emails.map((id) => cargarMeta('emails', id))),
    Promise.all(indice.landings.map((id) => cargarMeta('landings', id))),
  ]);
  return { emails, landings };
}

async function cargarMeta(tipo, id) {
  const meta = await json(`${RAIZ}/${tipo}/${id}/meta.json`);
  return { ...meta, id, tipo, ruta: `${RAIZ}/${tipo}/${id}` };
}

/** Devuelve el HTML crudo de una plantilla en un idioma dado. */
export async function cargarHtml(meta, idioma) {
  const lang = meta.idiomas.includes(idioma) ? idioma : meta.idiomas[0];
  const res = await fetch(`${meta.ruta}/${lang}.html`);
  if (!res.ok) throw new Error(`No se pudo cargar ${meta.ruta}/${lang}.html`);
  return res.text();
}

/**
 * Resuelve los fragmentos de copy para un idioma y nivel de dificultad.
 * Si el idioma no existe cae al primero declarado; si el nivel no existe,
 * a "medio". Ambas caídas se avisan por consola en lugar de fallar en
 * silencio, que es como se cuelan las campañas en el idioma equivocado.
 */
export function resolverFragmentos(meta, idioma, nivel) {
  const porIdioma = meta.fragmentos?.[idioma];
  if (!porIdioma) {
    console.warn(`[${meta.id}] sin fragmentos en "${idioma}", se usa "${meta.idiomas[0]}"`);
    return meta.fragmentos?.[meta.idiomas[0]]?.[nivel] ?? {};
  }
  const porNivel = porIdioma[nivel];
  if (!porNivel) {
    console.warn(`[${meta.id}] sin nivel "${nivel}" en "${idioma}", se usa "medio"`);
    return porIdioma.medio ?? {};
  }
  return porNivel;
}

/** Texto del asunto para un idioma y nivel. */
export function resolverAsunto(meta, idioma, nivel) {
  const porIdioma = meta.asunto?.[idioma] ?? meta.asunto?.[meta.idiomas[0]];
  if (!porIdioma) return '';
  return porIdioma[nivel] ?? porIdioma.medio ?? '';
}

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}
