/**
 * Pruebas del servidor local: la capa que no tenía ni una.
 *
 * Se arranca el proceso real (`node tools/servidor.js <puerto>`) y se le
 * habla por HTTP de verdad, en vez de importar sus funciones internas: es la
 * única forma de probar lo que de verdad importa aquí — que el filtro de
 * origen no tenga un agujero, y que servir estáticos no deje salir del
 * proyecto — sin reescribir el módulo para hacerlo "testeable" a costa de
 * complicar un servidor que no tiene ninguna otra razón para exportar nada.
 *
 * Las pruebas de `/api/plantillas` que de verdad escriben en disco limpian
 * tras de sí en un `after()`: usan un id que no se parece a nada real, pero
 * aun así no debe quedar ni rastro si el test falla a medias.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8199;
const BASE = `http://127.0.0.1:${PUERTO}`;
const ID_PRUEBA = 'zzz-prueba-servidor-tmp';

let proceso;

before(async () => {
  proceso = spawn(process.execPath, [join(RAIZ, 'tools', 'servidor.js'), String(PUERTO)], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
  await esperarListo();
});

after(async () => {
  proceso.kill();
  // Por si algún test de guardado falló a medias y no llegó a su propia limpieza.
  const carpeta = join(RAIZ, 'templates', 'propias', 'landings', ID_PRUEBA);
  if (existsSync(carpeta)) await rm(carpeta, { recursive: true, force: true });
});

async function esperarListo(intentos = 50) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(`${BASE}/api/salud`);
      if (res.ok) return;
    } catch {
      // el proceso todavía no escucha; se reintenta
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('el servidor de pruebas no llegó a arrancar');
}

/** Petición HTTP cruda, sin pasar por el parser de URL de fetch(): a fetch()
 * y a WHATWG URL les da por normalizar un ".." antes de mandar la petición,
 * así que con ellos nunca se probaría la defensa del propio servidor. */
function peticionCruda(path, { headers = {} } = {}) {
  return new Promise((resolver, rechazar) => {
    const req = httpRequest({ host: '127.0.0.1', port: PUERTO, path, headers }, (res) => {
      let cuerpo = '';
      res.on('data', (d) => { cuerpo += d; });
      res.on('end', () => resolver({ status: res.statusCode, cuerpo }));
    });
    req.on('error', rechazar);
    req.end();
  });
}

// --------------------------------------------------------------------------

test('GET /api/salud confirma que el servidor está arriba', async () => {
  const res = await fetch(`${BASE}/api/salud`);
  const datos = await res.json();
  assert.equal(res.status, 200);
  assert.equal(datos.phishlab, true);
  assert.equal(typeof datos.version, 'string');
});

test('una petición a /api/* con Origin ajeno se rechaza, sin excepciones', async () => {
  const res = await fetch(`${BASE}/api/salud`, { headers: { Origin: 'https://ejemplo-ajeno.example' } });
  assert.equal(res.status, 403);
});

test('un Origin local en otro puerto sí se acepta', async () => {
  const res = await fetch(`${BASE}/api/salud`, { headers: { Origin: 'http://127.0.0.1:9999' } });
  assert.equal(res.status, 200);
});

test('una ruta de API desconocida da 404, no un 500', async () => {
  const res = await fetch(`${BASE}/api/esto-no-existe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(res.status, 404);
});

test('un método no permitido en una ruta de API da 405', async () => {
  const res = await fetch(`${BASE}/api/plantillas`, { method: 'GET' });
  assert.equal(res.status, 405);
});

test('un ".." normal en la URL no escapa: Node ya lo resuelve al fichero real', async () => {
  // new URL() normaliza los segmentos ".." (y su forma "%2e%2e") antes de que
  // el servidor los vea, así que esto nunca llega a ser una travesía: acaba
  // sirviendo package.json de la raíz, que es justo lo correcto. No hay nada
  // que bloquear aquí — bloquearlo sería el bug, no al revés.
  const res = await fetch(`${BASE}/../package.json`);
  assert.equal(res.status, 200);
});

test('una travesía con barra invertida codificada (%5c) sí se rechaza', async () => {
  // "%5c" no lo normaliza new URL() como separador de ruta (al contrario que
  // "/" o "%2e%2e"), así que llega intacto a decodeURIComponent() y ahí se
  // convierte en "\": en Windows, path.join() SÍ lo trata como separador, y
  // sin la comprobación de `resolve(...).startsWith(RAIZ)` esto serviría
  // cualquier fichero del disco.
  const { status } = await peticionCruda('/foo%5c..%5c..%5c..%5cWindows%5cwin.ini');
  assert.equal(status, 403);
});

test('un fichero estático real se sirve con normalidad', async () => {
  const res = await fetch(`${BASE}/package.json`);
  assert.equal(res.status, 200);
  const datos = await res.json();
  assert.equal(datos.name, 'phishlab');
});

test('un fichero que no existe da 404, no 500', async () => {
  const res = await fetch(`${BASE}/esto-no-existe.html`);
  assert.equal(res.status, 404);
});

// ------------------------------------------------------------ clonar-html ---

test('/api/clonar-html sanea el HTML pegado y detecta el login', async () => {
  const res = await fetch(`${BASE}/api/clonar-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html: '<html><body><form><input type="email" name="correo"><input type="password" name="clave"></form></body></html>',
      urlOrigen: 'https://ejemplo.example/login',
    }),
  });
  const datos = await res.json();
  assert.equal(res.status, 200);
  assert.equal(datos.camposLogin.email.confianza, 'alta');
  assert.equal(datos.camposLogin.password.confianza, 'alta');
  assert.match(datos.html, /name="email"/);
  assert.match(datos.html, /name="password"/);
});

test('/api/clonar-html sin HTML da 400, no revienta', async () => {
  const res = await fetch(`${BASE}/api/clonar-html`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: '' }),
  });
  assert.equal(res.status, 400);
});

// ------------------------------------------------------------- plantillas ---

test('/api/plantillas rechaza un id con mayúsculas o espacios', async () => {
  const res = await fetch(`${BASE}/api/plantillas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'Con Espacios', tipo: 'landings', meta: { origen: { autorizacion: 'x' } } }),
  });
  assert.equal(res.status, 400);
});

test('/api/plantillas exige la nota de autorización antes de tocar el disco', async () => {
  const res = await fetch(`${BASE}/api/plantillas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ID_PRUEBA, tipo: 'landings', meta: {} }),
  });
  assert.equal(res.status, 400);
  assert.equal(existsSync(join(RAIZ, 'templates', 'propias', 'landings', ID_PRUEBA)), false);
});

test('/api/plantillas guarda una plantilla válida en templates/propias', async () => {
  const res = await fetch(`${BASE}/api/plantillas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: ID_PRUEBA,
      tipo: 'landings',
      layout: '<html><body>prueba</body></html>',
      meta: { nombre: 'Prueba temporal', origen: { tipo: 'clonado-web', autorizacion: 'test automatizado' } },
      copy: { es: {} },
    }),
  });
  const datos = await res.json();
  assert.equal(res.status, 200);
  assert.equal(datos.guardada, true);
  assert.ok(existsSync(join(RAIZ, 'templates', 'propias', 'landings', ID_PRUEBA, 'meta.json')));

  await rm(join(RAIZ, 'templates', 'propias', 'landings', ID_PRUEBA), { recursive: true, force: true });
});
