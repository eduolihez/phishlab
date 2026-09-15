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
