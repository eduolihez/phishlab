/**
 * Cliente de la API local.
 *
 * PhishLab funciona sin servidor: si lo abres con `python -m http.server`,
 * todo lo de leer, componer, previsualizar y exportar sigue yendo. Lo que
 * necesita el servidor local es escribir en disco (guardar una plantilla
 * propia) y parsear un `.eml`, porque el navegador no puede hacer ni una cosa
 * ni la otra.
 *
 * Cuando no hay servidor, la interfaz lo dice y esconde esas dos acciones en
 * lugar de fallar al pulsarlas.
 */

let disponible = false;
let version = null;

/** ¿Está el servidor local con la API detrás? */
export const hayServidor = () => disponible;
export const versionServidor = () => version;

/**
 * Se llama una vez al arrancar. No lanza: no tener servidor es un modo de
 * funcionamiento normal, no un error.
 */
export async function detectarServidor() {
  try {
    const res = await fetch('api/salud', { headers: { Accept: 'application/json' } });
    if (!res.ok) return false;
    const datos = await res.json();
    disponible = datos.phishlab === true;
    version = datos.version ?? null;
    return disponible;
  } catch {
    disponible = false;
    return false;
  }
}

async function pedir(ruta, cuerpo) {
  if (!disponible) throw new Error('el servidor local no está arrancado');

  const res = await fetch(`api/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `error ${res.status}`);
  return datos;
}

/**
 * Convierte un `.eml` en plantilla.
 *
 * El fichero se manda en base64 y no como texto porque un correo real trae
 * partes en base64, en quoted-printable y a veces en latin-1: decodificarlo
 * en el navegador antes de enviarlo estropearía la mitad de los acentos.
 *
 * @returns {Promise<{html: string, asunto: string, remitente: object, informe: object[]}>}
 */
export async function importarEml(fichero) {
  const base64 = await comoBase64(fichero);
  return pedir('importar/eml', { nombre: fichero.name, base64 });
}

/** Sanea un HTML pegado a mano y lo prepara como plantilla. */
export async function importarHtml(html, { tipo = 'emails' } = {}) {
  return pedir('importar/html', { html, tipo });
}

/**
 * Escribe una plantilla en `templates/propias/`.
 *
 * `derivadaDe` hace que el servidor copie primero la carpeta original y luego
 * superponga lo que se le mande: así una variante editada solo en castellano
 * conserva el catalán y el inglés de la plantilla de la que sale.
 */
export async function guardarPlantilla({ id, tipo, meta, layout, copy }) {
  return pedir('plantillas', { id, tipo, meta, layout, copy, derivadaDe: meta?.origen?.derivadaDe });
}

function comoBase64(fichero) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('no se pudo leer el fichero'));
    lector.onload = () => resolver(String(lector.result).split(',')[1] ?? '');
    lector.readAsDataURL(fichero);
  });
}
