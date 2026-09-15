/**
 * Servidor local de PhishLab: estáticos + API de importación.
 *
 * Escucha solo en 127.0.0.1 y rechaza peticiones cuyo Origin no sea local. No
 * es paranoia de manual: este proceso escribe ficheros dentro del proyecto y
 * parsea correos ajenos, así que no puede estar accesible desde la red de la
 * oficina ni desde una pestaña de otro sitio web.
 *
 *   node tools/servidor.js [puerto]
 */

import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile, readdir, cp } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsearEml } from './eml.js';
import { sanear } from './sanear.js';
import { sanearWeb } from './sanearWeb.js';

const RAIZ = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const PROPIAS = join(RAIZ, 'templates', 'propias');
const PUERTO = Number(process.argv[2]) || 8080;
const VERSION = '3.1';

const CUERPO_MAXIMO = 25 * 1024 * 1024;
const MAX_PASOS_FLUJO = 8;

const FICHERO_PAREADO = join(RAIZ, '.pareado');

let codigoPareado = cargarCodigoPareado();
let pendientesExtension = [];

function cargarCodigoPareado() {
  try {
    return readFileSync(FICHERO_PAREADO, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function parejaValida(peticion) {
  return Boolean(codigoPareado) && peticion.headers['x-phishlab-pair'] === codigoPareado;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const servidor = createServer(async (peticion, respuesta) => {
  try {
    const url = new URL(peticion.url, `http://${peticion.headers.host}`);

    if (url.pathname === '/api/extension/clonar-flujo') {
      if (peticion.method !== 'POST') return json(respuesta, 405, { error: 'method not allowed' });
      if (!parejaValida(peticion)) return json(respuesta, 401, { error: 'código de emparejamiento inválido' });
      const datos = await leerJson(peticion);
      return await clonarFlujo(respuesta, datos);
    }

    if (url.pathname.startsWith('/api/')) {
      if (!origenLocal(peticion)) {
        return json(respuesta, 403, { error: 'origen no local' });
      }
      return await api(peticion, respuesta, url.pathname.slice(5));
    }

    return await estatico(url, respuesta);
  } catch (e) {
    console.error(e);
    json(respuesta, 500, { error: e.message });
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`PhishLab en http://127.0.0.1:${PUERTO}/`);
  console.log('API local activa: se puede importar y guardar plantillas propias.');
  console.log('Ctrl+C para parar.');
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} está ocupado. Prueba: node tools/servidor.js ${PUERTO + 1}`);
    process.exit(1);
  }
  throw e;
});

// ----------------------------------------------------------------- estático ---

async function estatico(url, respuesta) {
  let ruta = decodeURIComponent(url.pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';

  const destino = resolve(join(RAIZ, ruta));

  // Sin esta comprobación, un "../.." serviría cualquier fichero del disco.
  if (destino !== RAIZ && !destino.startsWith(RAIZ + sep)) {
    return respuesta.writeHead(403).end('Prohibido');
  }

  try {
    const info = await stat(destino);
    if (!info.isFile()) return respuesta.writeHead(404).end('No encontrado');

    const contenido = await readFile(destino);
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
      // Sin caché: al editar una plantilla quieres verla al recargar, no
      // pelearte con la versión anterior guardada por el navegador.
      'Cache-Control': 'no-store',
    });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404).end('No encontrado');
  }
}

// ---------------------------------------------------------------------- API ---

async function api(peticion, respuesta, ruta) {
  if (ruta === 'salud' && peticion.method === 'GET') {
    return json(respuesta, 200, { phishlab: true, version: VERSION });
  }

  if (ruta === 'emparejar' && peticion.method === 'GET') {
    return json(respuesta, 200, { codigo: codigoPareado });
  }

  if (ruta === 'extension/pendientes' && peticion.method === 'GET') {
    return json(respuesta, 200, { pasos: vaciarPendientes() });
  }

  if (peticion.method !== 'POST') return json(respuesta, 405, { error: 'method not allowed' });

  const datos = await leerJson(peticion);

  if (ruta === 'importar/eml') return await importarEml(respuesta, datos);
  if (ruta === 'importar/html') return await importarHtml(respuesta, datos);
  if (ruta === 'plantillas') return await guardarPlantilla(respuesta, datos);
  if (ruta === 'clonar-html') return await clonarHtml(respuesta, datos);
  if (ruta === 'clonar-url') return await clonarUrl(respuesta, datos);
  if (ruta === 'emparejar') return await emparejar(respuesta);

  return json(respuesta, 404, { error: `ruta desconocida: ${ruta}` });
}

// ------------------------------------------------------------ clonado web ---

/**
 * Sanea el HTML que el marcador dejó en el portapapeles y que se ha pegado en
 * Importar → Web. Es una petición normal, desde la propia pestaña de
 * PhishLab: no hace falta ningún permiso especial ni salir a buscar nada por
 * la red, porque el navegador ya hizo el trabajo de renderizar la página.
 */
async function clonarHtml(respuesta, { html, urlOrigen }) {
  if (!html?.trim()) return json(respuesta, 400, { error: 'falta el HTML pegado' });

  try {
    const resultado = await sanearWeb(html, { urlOrigen: urlOrigen ?? '', resolver: crearResolver() });
    json(respuesta, 200, { ...resultado, urlOrigen: urlOrigen ?? '' });
  } catch (e) {
    json(respuesta, 500, { error: e.message });
  }
}

async function emparejar(respuesta) {
  codigoPareado = randomBytes(6).toString('base64url');
  await writeFile(FICHERO_PAREADO, codigoPareado, 'utf8');
  json(respuesta, 200, { codigo: codigoPareado });
}

/**
 * Recibe uno o varios pasos capturados por la extensión, ya con sus recursos
 * incrustados (el service worker de la extensión los trae con las cookies de
 * la pestaña y sin CORS — ver `extension/background.js`), y los sanea igual
 * que el resto de caminos de clonado. `resolver: null` porque no hay nada más
 * que resolver: si un recurso no llegó incrustado, `sanearWeb` ya lo anota
 * como no incrustado en su informe.
 */
async function clonarFlujo(respuesta, { pasos }) {
  if (!Array.isArray(pasos) || pasos.length === 0) {
    return json(respuesta, 400, { error: 'falta el array de pasos' });
  }
  if (pasos.length > MAX_PASOS_FLUJO) {
    return json(respuesta, 400, { error: `máximo ${MAX_PASOS_FLUJO} pasos por envío` });
  }

  const resultados = [];
  for (const paso of pasos) {
    if (!paso?.html?.trim()) return json(respuesta, 400, { error: 'cada paso necesita HTML' });
    try {
      const resultado = await sanearWeb(paso.html, { urlOrigen: paso.url ?? '', resolver: null });
      resultados.push({ ...resultado, urlOrigen: paso.url ?? '' });
    } catch (e) {
      return json(respuesta, 500, { error: e.message });
    }
  }

  pendientesExtension.push(...resultados);
  json(respuesta, 200, { recibidos: resultados.length });
}

function vaciarPendientes() {
  const copia = pendientesExtension;
  pendientesExtension = [];
  return copia;
}

/** Pega-una-URL: el propio servidor hace el fetch. No sirve para logins que se renderizan por JS. */
async function clonarUrl(respuesta, { url }) {
  if (!/^https?:\/\//i.test(url ?? '')) return json(respuesta, 400, { error: 'falta una URL http(s) válida' });

  let html;
  try {
    const controlador = new AbortController();
    const tope = setTimeout(() => controlador.abort(), 10_000);
    const res = await fetch(url, { signal: controlador.signal });
    clearTimeout(tope);
    if (!res.ok) return json(respuesta, 502, { error: `la web respondió ${res.status}` });
    html = await res.text();
  } catch (e) {
    return json(respuesta, 502, { error: `no se pudo descargar la página: ${e.message}` });
  }

  try {
    const resultado = await sanearWeb(html, { urlOrigen: url, resolver: crearResolver() });
    json(respuesta, 200, { ...resultado, urlOrigen: url });
  } catch (e) {
    json(respuesta, 500, { error: e.message });
  }
}

/**
 * Recursos de una página clonada: imágenes, hojas de estilo, fondos de CSS.
 * Con tope de tamaño y de peticiones para que una página con cientos de
 * recursos no cuelgue el clonado entero por una sola imagen enorme.
 */
function crearResolver() {
  const LIMITE_BYTES = 5 * 1024 * 1024;
  const MAX_PETICIONES = 60;
  let peticiones = 0;

  return async function resolver(url) {
    if (peticiones++ >= MAX_PETICIONES || !/^https?:\/\//i.test(url)) return null;

    const controlador = new AbortController();
    const tope = setTimeout(() => controlador.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controlador.signal });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > LIMITE_BYTES) return null;
      return { contentType, base64: buffer.toString('base64') };
    } catch {
      return null;
    } finally {
      clearTimeout(tope);
    }
  };
}

async function importarEml(respuesta, { base64, nombre }) {
  if (!base64) return json(respuesta, 400, { error: 'falta el fichero' });

  const correo = parsearEml(Buffer.from(base64, 'base64'));

  if (!correo.html && !correo.texto) {
    return json(respuesta, 422, { error: 'el .eml no trae ni parte HTML ni parte de texto' });
  }

  // Un correo solo en texto plano se envuelve para poder trabajarlo como los
  // demás. Pierde el diseño, pero el pretexto se conserva, que es lo que vale.
  const crudo = correo.html ?? `<html><body><pre>${escapar(correo.texto)}</pre></body></html>`;
  const { html, informe } = sanear(crudo, { tipo: 'emails', imagenes: correo.imagenes });

  if (!correo.html) informe.unshift({ clase: 'reescrito', texto: 'el correo era solo texto plano; se ha envuelto en HTML' });

  json(respuesta, 200, {
    html,
    informe,
    asunto: correo.asunto,
    remitente: correo.remitente,
    fecha: correo.fecha,
    procedencia: nombre ?? 'correo.eml',
  });
}

async function importarHtml(respuesta, { html, tipo }) {
  if (!html?.trim()) return json(respuesta, 400, { error: 'falta el HTML' });

  const resultado = sanear(html, { tipo: tipo === 'landings' ? 'landings' : 'emails' });
  const asunto = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';

  json(respuesta, 200, { ...resultado, asunto, remitente: {} });
}

/**
 * Escribe una plantilla bajo `templates/propias/`.
 *
 * Con `derivadaDe` se copia primero la carpeta original y encima se escribe lo
 * que llegue: así una variante editada solo en castellano conserva el catalán
 * y el inglés de la plantilla de la que sale, en vez de nacer coja.
 */
async function guardarPlantilla(respuesta, { id, tipo, meta, layout, copy, derivadaDe }) {
  if (!/^[a-z0-9-]{1,60}$/.test(id ?? '')) {
    return json(respuesta, 400, { error: 'identificador no válido: solo minúsculas, números y guiones' });
  }
  if (!['emails', 'landings'].includes(tipo)) {
    return json(respuesta, 400, { error: 'tipo debe ser emails o landings' });
  }
  if (!meta?.origen?.autorizacion) {
    return json(respuesta, 400, { error: 'falta la nota de autorización en origen.autorizacion' });
  }

  const destino = join(PROPIAS, tipo, id);

  if (derivadaDe) {
    const origen = join(RAIZ, 'templates', tipo, derivadaDe);
    if (existsSync(origen)) await cp(origen, destino, { recursive: true });
  }

  await mkdir(join(destino, 'copy'), { recursive: true });

  if (layout) await writeFile(join(destino, 'layout.html'), layout, 'utf8');

  for (const [idioma, contenido] of Object.entries(copy ?? {})) {
    const fichero = join(destino, 'copy', `${idioma}.json`);
    // Si la plantilla venía de otra, se mezcla con su copy en vez de pisarlo:
    // editar un fragmento no debería borrar los otros veinte.
    let base = {};
    if (existsSync(fichero)) base = JSON.parse(await readFile(fichero, 'utf8'));
    await writeFile(fichero, JSON.stringify({ ...base, ...contenido }, null, 2) + '\n', 'utf8');
  }

  const metaFinal = { ...meta, schema: 2 };
  delete metaFinal.id;
  delete metaFinal.tipo;
  delete metaFinal.ruta;
  delete metaFinal.propia;
  if (!metaFinal.idiomas?.length) metaFinal.idiomas = Object.keys(copy ?? { es: {} });

  await writeFile(join(destino, 'meta.json'), JSON.stringify(metaFinal, null, 2) + '\n', 'utf8');

  await regenerarIndicePropias();

  json(respuesta, 200, { guardada: true, ruta: `templates/propias/${tipo}/${id}` });
}

/**
 * Reconstruye `templates/propias/index.json` leyendo el disco.
 *
 * El navegador no puede listar directorios, así que necesita este índice. Se
 * regenera entero en cada guardado en lugar de irlo parcheando: si borras una
 * carpeta a mano, el índice se corrige solo al siguiente guardado.
 */
async function regenerarIndicePropias() {
  const indice = { _comentario: 'Generado por el servidor local. No editar a mano.', emails: [], landings: [] };

  for (const tipo of ['emails', 'landings']) {
    const dir = join(PROPIAS, tipo);
    if (!existsSync(dir)) continue;
    const entradas = await readdir(dir, { withFileTypes: true });
    indice[tipo] = entradas
      .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, 'meta.json')))
      .map((e) => e.name)
      .sort();
  }

  await mkdir(PROPIAS, { recursive: true });
  await writeFile(join(PROPIAS, 'index.json'), JSON.stringify(indice, null, 2) + '\n', 'utf8');
}

// -------------------------------------------------------------------- varios ---

/**
 * Solo se atiende a peticiones del propio equipo.
 *
 * Sin Origin (fetch de misma página, curl) se acepta; con Origin, tiene que
 * ser localhost. Es lo que impide que una pestaña abierta en cualquier web
 * hable con este servidor mientras lo tienes arrancado.
 */
function origenLocal(peticion) {
  const origen = peticion.headers.origin;
  if (!origen) return true;
  try {
    const { hostname } = new URL(origen);
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);
  } catch {
    return false;
  }
}

function leerJson(peticion) {
  return new Promise((resolver, rechazar) => {
    const trozos = [];
    let total = 0;

    peticion.on('data', (trozo) => {
      total += trozo.length;
      if (total > CUERPO_MAXIMO) {
        rechazar(new Error('cuerpo demasiado grande'));
        peticion.destroy();
        return;
      }
      trozos.push(trozo);
    });

    peticion.on('end', () => {
      try {
        resolver(JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}'));
      } catch (e) {
        rechazar(new Error(`JSON inválido: ${e.message}`));
      }
    });

    peticion.on('error', rechazar);
  });
}

function json(respuesta, codigo, cuerpo) {
  respuesta.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  respuesta.end(JSON.stringify(cuerpo));
}

const escapar = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
