/**
 * Pruebas del canal de confianza de la extensión: emparejamiento y
 * `/api/extension/*`. Aparte de `servidor.test.js` porque respalda y
 * restaura `.pareado` alrededor de todo el fichero — un secreto de esta
 * máquina que las pruebas no deben pisar si ya existe uno real.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = 8198;
const BASE = `http://127.0.0.1:${PUERTO}`;
const FICHERO_PAREADO = join(RAIZ, '.pareado');

let proceso;
let respaldoPareado = null;

before(async () => {
  if (existsSync(FICHERO_PAREADO)) {
    respaldoPareado = await readFile(FICHERO_PAREADO, 'utf8');
    await rm(FICHERO_PAREADO);
  }

  proceso = spawn(process.execPath, [join(RAIZ, 'tools', 'servidor.js'), String(PUERTO)], {
    cwd: RAIZ,
    stdio: 'ignore',
  });
  await esperarListo();
});

after(async () => {
  proceso.kill();
  if (respaldoPareado !== null) {
    await writeFile(FICHERO_PAREADO, respaldoPareado, 'utf8');
  } else {
    await rm(FICHERO_PAREADO, { force: true });
  }
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

// -------------------------------------------------------------- emparejar ---

test('GET /api/emparejar sin código generado devuelve null', async () => {
  const res = await fetch(`${BASE}/api/emparejar`);
  const datos = await res.json();
  assert.equal(res.status, 200);
  assert.equal(datos.codigo, null);
});

test('POST /api/emparejar genera un código y lo persiste', async () => {
  const res = await fetch(`${BASE}/api/emparejar`, { method: 'POST' });
  const datos = await res.json();
  assert.equal(res.status, 200);
  assert.equal(typeof datos.codigo, 'string');
  assert.ok(datos.codigo.length > 0);

  const otraVez = await fetch(`${BASE}/api/emparejar`);
  const datosOtraVez = await otraVez.json();
  assert.equal(datosOtraVez.codigo, datos.codigo);
});

// ------------------------------------------------------------ clonar-flujo ---

test('/api/extension/clonar-flujo sin código de emparejamiento da 401', async () => {
  const res = await fetch(`${BASE}/api/extension/clonar-flujo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pasos: [{ url: 'https://ejemplo.example', html: '<html></html>' }] }),
  });
  assert.equal(res.status, 401);
});

test('/api/extension/clonar-flujo con código incorrecto da 401', async () => {
  const res = await fetch(`${BASE}/api/extension/clonar-flujo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PhishLab-Pair': 'codigo-incorrecto' },
    body: JSON.stringify({ pasos: [{ url: 'https://ejemplo.example', html: '<html></html>' }] }),
  });
  assert.equal(res.status, 401);
});

test('/api/extension/clonar-flujo con código correcto sanea cada paso y los deja pendientes', async () => {
  const generado = await (await fetch(`${BASE}/api/emparejar`, { method: 'POST' })).json();

  const res = await fetch(`${BASE}/api/extension/clonar-flujo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PhishLab-Pair': generado.codigo },
    body: JSON.stringify({
      pasos: [
        { url: 'https://ejemplo.example/paso1', html: '<html><body><form><input type="email" name="correo"><input type="password" name="clave"></form></body></html>' },
        { url: 'https://ejemplo.example/paso2', html: '<html><body>segundo paso</body></html>' },
      ],
    }),
  });
  const datos = await res.json();
  assert.equal(res.status, 200);
  assert.equal(datos.recibidos, 2);

  const pendientes = await (await fetch(`${BASE}/api/extension/pendientes`)).json();
  assert.equal(pendientes.pasos.length, 2);
  assert.equal(pendientes.pasos[0].urlOrigen, 'https://ejemplo.example/paso1');
  assert.match(pendientes.pasos[0].html, /name="email"/);

  // La cola se vacía al leerla: una segunda lectura no repite lo mismo.
  const segundaLectura = await (await fetch(`${BASE}/api/extension/pendientes`)).json();
  assert.equal(segundaLectura.pasos.length, 0);
});

test('/api/extension/clonar-flujo con más de 8 pasos da 400', async () => {
  const generado = await (await fetch(`${BASE}/api/emparejar`, { method: 'POST' })).json();
  const pasos = Array.from({ length: 9 }, (_, i) => ({ url: `https://ejemplo.example/${i}`, html: '<html></html>' }));

  const res = await fetch(`${BASE}/api/extension/clonar-flujo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PhishLab-Pair': generado.codigo },
    body: JSON.stringify({ pasos }),
  });
  assert.equal(res.status, 400);
});

test('/api/extension/pendientes exige origen local, no código de emparejamiento', async () => {
  const res = await fetch(`${BASE}/api/extension/pendientes`, {
    headers: { Origin: 'https://ejemplo-ajeno.example' },
  });
  assert.equal(res.status, 403);
});
