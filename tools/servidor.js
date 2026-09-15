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
import { existsSync } from 'node:fs';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { parsearEml } from './eml.js';
import { sanear } from './sanear.js';
import { sanearWeb } from './sanearWeb.js';

const RAIZ = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const PROPIAS = join(RAIZ, 'templates', 'propias');
const PUERTO = Number(process.argv[2]) || 8080;
const VERSION = '3.0';

/**
 * El marcador Ctrl+S postea la captura desde la pestaña de la web real: su
 * Origin nunca va a ser local, a propósito — es la pestaña de otra persona
 * abierta en otro dominio. Para esa única ruta la protección no es el origen
 * (ver `origenLocal()`) sino este token de sesión, que solo conoce el
 * marcador que se generó DESDE esta misma instalación (ver `importarWeb.js`).
 * Sin él, cualquier web que abrieras mientras el servidor está arrancado
 * podría intentar postear a ciegas — con el token, necesita adivinar 16
 * bytes aleatorios.
 */
const TOKEN_CLONADO = randomBytes(16).toString('hex');

/** Última captura del marcador a la espera de que la revises. Una sola: esta
 * herramienta la usa una persona a la vez. */
let capturaPendiente = null;

const CUERPO_MAXIMO = 25 * 1024 * 1024;

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

    // Preflight de CORS: solo para /api/clonar, que es la única ruta pensada
    // para que la llame una pestaña de otro origen (ver TOKEN_CLONADO).
    if (peticion.method === 'OPTIONS' && url.pathname === '/api/clonar') {
      respuesta.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return respuesta.end();
    }

    if (url.pathname.startsWith('/api/')) {
      const ruta = url.pathname.slice(5);

      if (ruta !== 'clonar' && !origenLocal(peticion)) {
        return json(respuesta, 403, { error: 'origen no local' });
      }
      return await api(peticion, respuesta, ruta);
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
    // El token va aquí, no en un endpoint aparte: /api/salud ya está detrás
    // de origenLocal(), y es lo primero que pide la aplicación al arrancar.
    return json(respuesta, 200, { phishlab: true, version: VERSION, tokenClonado: TOKEN_CLONADO });
  }

  if (ruta === 'clonar/pendiente' && peticion.method === 'GET') {
    return json(respuesta, 200, capturaPendiente ? { disponible: true, ...capturaPendiente } : { disponible: false });
  }

  if (peticion.method !== 'POST') return json(respuesta, 405, { error: 'method not allowed' });

  const datos = await leerJson(peticion);

  if (ruta === 'importar/eml') return await importarEml(respuesta, datos);
  if (ruta === 'importar/html') return await importarHtml(respuesta, datos);
  if (ruta === 'plantillas') return await guardarPlantilla(respuesta, datos);
  if (ruta === 'clonar') return await clonarCaptura(respuesta, datos);
  if (ruta === 'clonar-url') return await clonarUrl(respuesta, datos);
  if (ruta === 'clonar/pendiente/descartar') { capturaPendiente = null; return json(respuesta, 200, { ok: true }); }

  return json(respuesta, 404, { error: `ruta desconocida: ${ruta}` });
}

// ------------------------------------------------------------ clonado web ---

/** Recibe la captura del marcador Ctrl+S: HTML ya renderizado por el navegador real. */
async function clonarCaptura(respuesta, { html, urlOrigen, token }) {
  if (token !== TOKEN_CLONADO) {
    return json(respuesta, 403, { error: 'token de clonado inválido o caducado: vuelve a generar el marcador desde Importar → Web' }, { cors: true });
  }
  if (!html?.trim()) return json(respuesta, 400, { error: 'falta el HTML capturado' }, { cors: true });

  try {
    const resultado = await sanearWeb(html, { urlOrigen: urlOrigen ?? '', resolver: crearResolver() });
    capturaPendiente = { ...resultado, urlOrigen: urlOrigen ?? '', capturadoEn: new Date().toISOString() };
    json(respuesta, 200, { guardado: true }, { cors: true });
  } catch (e) {
    json(respuesta, 500, { error: e.message }, { cors: true });
  }
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

function json(respuesta, codigo, cuerpo, { cors = false } = {}) {
  const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  // Solo /api/clonar responde con esto: es la única ruta que llama una
  // pestaña de otro origen (ver TOKEN_CLONADO más arriba).
  if (cors) cabeceras['Access-Control-Allow-Origin'] = '*';
  respuesta.writeHead(codigo, cabeceras);
  respuesta.end(JSON.stringify(cuerpo));
}

const escapar = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
