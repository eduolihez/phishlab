/**
 * Carga del catálogo de plantillas.
 *
 * El navegador no puede listar directorios, así que `templates/index.json`
 * hace de índice. Añadir una plantilla = crear su carpeta y añadir su id a
 * ese fichero. No se toca ni una línea del dashboard.
 *
 * Formato v2. Cada plantilla es:
 *
 *   <id>/meta.json          metadatos, campos y bloques declarados
 *   <id>/layout.html        UN layout anotado, compartido entre idiomas
 *   <id>/copy/{es,ca,en}.json   el copy, en variantes por señal
 *
 * En v1 había un HTML por idioma. Se unificaron porque la maquetación nunca
 * cambiaba entre ellos: eran tres copias del mismo diseño que había que
 * mantener a la vez, y el fallo típico era arreglar un `<td>` en `es.html`
 * y olvidarse de los otros dos.
 */

const RAIZ = 'templates';

/**
 * Carga el catálogo entero: plantillas de fábrica, propias, señales y presets.
 * @returns {Promise<{emails: object[], landings: object[], senales: object[], presets: object[]}>}
 */
export async function cargarCatalogo() {
  const [indice, senales, presets] = await Promise.all([
    json(`${RAIZ}/index.json`),
    json(`${RAIZ}/senales.json`),
    json(`${RAIZ}/presets.json`),
  ]);

  const propias = await indicePropias();

  const [emails, landings] = await Promise.all([
    cargarLista('emails', indice.emails ?? [], propias.emails ?? []),
    cargarLista('landings', indice.landings ?? [], propias.landings ?? []),
  ]);

  return { emails, landings, senales: senales.senales, presets: presets.presets };
}

/**
 * Las plantillas propias viven en `templates/propias/` y están fuera de git:
 * son las que tú importas o guardas al editar, y suelen llevar dentro material
 * de un cliente concreto. Que el índice no exista es lo normal en una
 * instalación recién clonada, así que su ausencia no es un error.
 */
async function indicePropias() {
  try {
    const res = await fetch(`${RAIZ}/propias/index.json`);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

async function cargarLista(tipo, deFabrica, propias) {
  const todas = await Promise.all([
    ...deFabrica.map((id) => cargarMeta(`${RAIZ}/${tipo}/${id}`, id, tipo, false)),
    ...propias.map((id) => cargarMeta(`${RAIZ}/propias/${tipo}/${id}`, id, tipo, true)),
  ]);
  return todas.filter(Boolean);
}

async function cargarMeta(ruta, id, tipo, propia) {
  try {
    const meta = await json(`${ruta}/meta.json`);
    if (meta.schema !== 2) {
      console.error(`[${id}] meta.json no declara "schema": 2 — se omite del catálogo`);
      return null;
    }
    return {
      ...meta,
      id,
      tipo,
      ruta,
      propia,
      bloques: meta.bloques ?? [],
      tags: meta.tags ?? [],
      idiomas: meta.idiomas ?? ['es'],
    };
  } catch (e) {
    console.error(`[${id}] no se pudo cargar: ${e.message}`);
    return null;
  }
}

/** HTML crudo del layout, con los marcadores de bloque todavía puestos. */
export async function cargarLayout(meta) {
  const res = await fetch(`${meta.ruta}/layout.html`);
  if (!res.ok) throw new Error(`No se pudo cargar ${meta.ruta}/layout.html`);
  return res.text();
}

/**
 * Copy de un idioma. Si el idioma pedido no existe cae al primero declarado
 * y avisa por consola: una campaña lanzada en el idioma equivocado es de los
 * fallos que no se detectan hasta que responde el primer empleado.
 */
export async function cargarCopy(meta, idioma) {
  const lang = meta.idiomas.includes(idioma) ? idioma : meta.idiomas[0];
  if (lang !== idioma) {
    console.warn(`[${meta.id}] sin copy en "${idioma}", se usa "${lang}"`);
  }
  return json(`${meta.ruta}/copy/${lang}.json`);
}

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}
