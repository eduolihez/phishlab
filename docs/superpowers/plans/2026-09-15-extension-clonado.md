# Extensión de captura de clonado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir el marcador Ctrl+S como camino principal de captura de webs por una extensión de Chrome MV3 que manda la página directa al servidor local (sin portapapeles), soporta flujos multi-paso, e incrusta recursos con más fidelidad (cookies de sesión, sin CORS).

**Architecture:** Server (`tools/servidor.js`) gana un canal de confianza nuevo — código de emparejamiento en cabecera `X-PhishLab-Pair` — separado del guardián de origen local que ya existe, para el único endpoint que habla la extensión (`/api/extension/clonar-flujo`). La extensión (`extension/`) tiene tres piezas: un content script que serializa el DOM (incluido shadow DOM abierto vía `<template shadowrootmode="open">`) sin hacer ningún fetch, un service worker que sí hace los fetch (con `host_permissions`, sin CORS, con cookies) e incrusta cada recurso como `data:` URI, y un popup que controla la sesión de captura (capturar paso / enviar / descartar). La UI existente (`assets/js/ui/importarWeb.js`) hace polling silencioso a `/api/extension/pendientes` mientras está en el paso "Origen" del wizard de clonado.

**Tech Stack:** Node.js nativo (`node:http`, `node:crypto`, `node:fs/promises`) en el servidor, sin dependencias nuevas. `node --test` para las pruebas. Manifest V3 (`chrome.scripting`, `chrome.storage.session`, `chrome.storage.local`, `chrome.action`) para la extensión, sin bundler ni build — igual que el resto de PhishLab, módulos servidos tal cual.

**Spec:** [docs/superpowers/specs/2026-09-15-extension-clonado.md](../specs/2026-09-15-extension-clonado.md)

## Global Constraints

- El guardián de origen local (`origenLocal()`) que ya protege `/api/*` no se toca ni se relaja: el nuevo endpoint de la extensión vive en un canal de confianza aparte (código de emparejamiento), nunca sustituyendo la comprobación de origen existente.
- Tope de 8 pasos por sesión de captura, aplicado en dos sitios (extensión y servidor) — defensa en profundidad, no basta con confiar en el cliente.
- Tope de 5MB por recurso incrustado y 60 recursos por paso, replicando los topes que `crearResolver()` ya aplica hoy en `tools/sanearWeb.js`.
- El código de emparejamiento vive en `.pareado` en la raíz del repo, fuera de git.
- `tools/sanearWeb.js` no cambia de contrato: se sigue llamando con `{ urlOrigen, resolver }`, pasando `resolver: null` cuando los recursos ya llegan incrustados.
- El marcador Ctrl+S (`assets/js/bookmarklet/capturar.js`) no se retira ni se modifica.

---

## Task 1: Servidor — emparejamiento (`/api/emparejar`)

**Files:**
- Modify: `tools/servidor.js`
- Modify: `.gitignore`
- Create: `tests/servidorExtension.test.js`

**Interfaces:**
- Produces: `codigoPareado` (variable de módulo, `string | null`), `FICHERO_PAREADO` (const, ruta absoluta a `.pareado`), `cargarCodigoPareado()`, `parejaValida(peticion)` — usadas por la Task 2.
- Consumes: nada nuevo — usa `RAIZ`, `json()`, `origenLocal()` ya existentes en `tools/servidor.js`.

- [x] **Step 1: Añadir `.pareado` a `.gitignore`**

Editar `.gitignore` añadiendo al final:

```
# Codigo de emparejamiento con la extension de captura. Es un secreto local
# de esta maquina, no algo que compartir en el repositorio.
.pareado
```

- [x] **Step 2: Escribir el test que falla, para GET/POST /api/emparejar**

Crear `tests/servidorExtension.test.js`:

```js
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
```

- [x] **Step 3: Ejecutar y comprobar que falla**

Run: `node --test tests/servidorExtension.test.js`
Expected: FAIL — `/api/emparejar` todavía no existe, da 404.

- [x] **Step 4: Implementar el endpoint en `tools/servidor.js`**

Añadir el import de `randomBytes` junto a los demás imports de `node:crypto` (no existe todavía ese import en el fichero, se añade nuevo):

```js
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
```

Añadir junto a las demás constantes de módulo (cerca de `PROPIAS`):

```js
const FICHERO_PAREADO = join(RAIZ, '.pareado');

let codigoPareado = cargarCodigoPareado();

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
```

Dentro de `async function api(peticion, respuesta, ruta)`, justo después de la comprobación de `salud` y antes de la comprobación de método POST:

```js
  if (ruta === 'emparejar' && peticion.method === 'GET') {
    return json(respuesta, 200, { codigo: codigoPareado });
  }
```

Y en la lista de rutas POST (junto a `clonar-html`, `clonar-url`):

```js
  if (ruta === 'emparejar') return await emparejar(respuesta);
```

Añadir la función `emparejar`, cerca de las demás funciones de clonado web:

```js
async function emparejar(respuesta) {
  codigoPareado = randomBytes(6).toString('base64url');
  await writeFile(FICHERO_PAREADO, codigoPareado, 'utf8');
  json(respuesta, 200, { codigo: codigoPareado });
}
```

- [x] **Step 5: Ejecutar y comprobar que pasa**

Run: `node --test tests/servidorExtension.test.js`
Expected: PASS (2 tests)

- [x] **Step 6: Commit**

```bash
git add tools/servidor.js .gitignore tests/servidorExtension.test.js
git commit -m "Servidor: endpoint de emparejamiento para la extension de captura"
```

---

## Task 2: Servidor — `/api/extension/clonar-flujo` y `/api/extension/pendientes`

**Files:**
- Modify: `tools/servidor.js`
- Modify: `tests/servidorExtension.test.js`

**Interfaces:**
- Consumes: `parejaValida(peticion)`, `codigoPareado` de la Task 1; `sanearWeb` ya importado en `tools/servidor.js`; `origenLocal()` existente.
- Produces: nada que otras tasks del servidor consuman — el resto de tasks son cliente/extensión y hablan por HTTP, no por import.

- [x] **Step 1: Escribir los tests que fallan**

Añadir a `tests/servidorExtension.test.js`, después de los tests de emparejamiento:

```js
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
```

- [x] **Step 2: Ejecutar y comprobar que fallan**

Run: `node --test tests/servidorExtension.test.js`
Expected: FAIL — `/api/extension/clonar-flujo` da 404 (no pasa por `origenLocal`, así que sin ruta específica cae al 404 genérico del servidor estático o similar).

- [x] **Step 3: Implementar en `tools/servidor.js`**

Añadir constante junto a `MAX_PETICIONES` (dentro de `crearResolver` no, es aparte — junto a `CUERPO_MAXIMO`):

```js
const MAX_PASOS_FLUJO = 8;
```

Añadir variable de módulo junto a `codigoPareado`:

```js
let pendientesExtension = [];
```

Modificar el `createServer` callback para interceptar `/api/extension/clonar-flujo` ANTES de la comprobación de origen local (porque una extensión no tiene un origen `http(s)` local que pase esa comprobación):

```js
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
```

Dentro de `async function api(...)`, añadir junto al chequeo de `emparejar` GET:

```js
  if (ruta === 'extension/pendientes' && peticion.method === 'GET') {
    return json(respuesta, 200, { pasos: vaciarPendientes() });
  }
```

Añadir las funciones nuevas, cerca de `clonarUrl`/`clonarHtml`:

```js
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
```

- [x] **Step 4: Ejecutar y comprobar que pasan**

Run: `node --test tests/servidorExtension.test.js`
Expected: PASS (7 tests en total, sumando los de la Task 1)

- [x] **Step 5: Ejecutar la suite completa para comprobar que no rompió nada**

Run: `npm test`
Expected: PASS — todos los ficheros de `tests/*.test.js`, incluido `servidor.test.js` sin cambios.

- [x] **Step 6: Commit**

```bash
git add tools/servidor.js tests/servidorExtension.test.js
git commit -m "Servidor: /api/extension/clonar-flujo y /api/extension/pendientes"
```

---

## Task 3: Cliente — helpers de emparejamiento en `assets/js/core/importar.js`

**Files:**
- Modify: `assets/js/core/importar.js`

**Interfaces:**
- Produces: `obtenerCodigoEmparejamiento()`, `generarCodigoEmparejamiento()`, `obtenerPendientesExtension()` — usadas por la Task 4.
- Consumes: `disponible` (variable de módulo existente), nada más nuevo.

No hay arnés de test de navegador en este proyecto para el módulo cliente (se prueba a través de la UI, Task 4). Este task es implementación directa, verificada manualmente en la Task 4.

- [x] **Step 1: Añadir el helper GET y las tres funciones exportadas**

En `assets/js/core/importar.js`, añadir después de la función `pedir(...)` existente:

```js
async function pedirGet(ruta) {
  if (!disponible) throw new Error('el servidor local no está arrancado');

  const res = await fetch(`api/${ruta}`, { headers: { Accept: 'application/json' } });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `error ${res.status}`);
  return datos;
}
```

Y al final del fichero, junto a las demás funciones exportadas:

```js
/** Código de emparejamiento actual con la extensión de captura, o null si no se ha generado ninguno. */
export async function obtenerCodigoEmparejamiento() {
  return pedirGet('emparejar');
}

/** Genera (o regenera) el código de emparejamiento con la extensión. */
export async function generarCodigoEmparejamiento() {
  return pedir('emparejar', {});
}

/** Lo que la extensión haya mandado desde la última vez que se consultó: la cola se vacía al leerla. */
export async function obtenerPendientesExtension() {
  return pedirGet('extension/pendientes');
}
```

- [x] **Step 2: Commit**

```bash
git add assets/js/core/importar.js
git commit -m "Cliente: helpers de emparejamiento y lectura de pendientes de la extension"
```

---

## Task 4: UI — zona "Desde la extensión" en `assets/js/ui/importarWeb.js`

**Files:**
- Modify: `assets/js/ui/importarWeb.js`

**Interfaces:**
- Consumes: `obtenerCodigoEmparejamiento`, `generarCodigoEmparejamiento`, `obtenerPendientesExtension` de la Task 3; `el`, `pintarEn`, `brindis` de `./dom.js` (ya importados).
- Produces: nada que otras tasks consuman — es la última pieza del lado servidor/UI.

- [x] **Step 1: Importar los nuevos helpers**

Modificar la línea de import existente:

```js
import { clonarUrl, clonarHtml, guardarPlantilla, obtenerCodigoEmparejamiento, generarCodigoEmparejamiento, obtenerPendientesExtension } from '../core/importar.js';
```

- [x] **Step 2: Añadir estado de cola y polling en `panelImportarWeb`**

Modificar la parte alta de `panelImportarWeb()`, donde se declaran `paso` y `resultado`:

```js
  let paso = 1;
  let resultado = null; // { r, procedencia }
  let colaExtension = []; // pasos adicionales capturados en un mismo envío de la extensión, pendientes de revisar
  let intervaloExtension = null;
```

Sustituir la función `pintar()` existente por esta versión, que arranca/para el polling según el paso activo:

```js
  function pintar() {
    pintarEn(barraPasos, pasos(paso, [
      { etiqueta: 'Origen', onclick: () => ir(1) },
      { etiqueta: 'Revisión', onclick: resultado ? () => ir(2) : undefined },
      { etiqueta: 'Guardar', onclick: resultado ? () => ir(3) : undefined },
    ]));

    detenerPollingExtension();

    if (paso === 1) {
      pintarEn(cuerpo, pasoOrigen());
      iniciarPollingExtension();
      return;
    }
    if (paso === 2) return pintarEn(cuerpo, pasoRevision());
    return pintarEn(cuerpo, pasoGuardar());
  }

  function iniciarPollingExtension() {
    intervaloExtension = setInterval(async () => {
      try {
        const { pasos: pendientes } = await obtenerPendientesExtension();
        if (pendientes.length === 0) return;

        detenerPollingExtension();
        colaExtension = pendientes.map((p, i) => ({
          r: p,
          procedencia: p.urlOrigen || `captura de la extensión (paso ${i + 1})`,
        }));
        resultado = colaExtension.shift();
        ir(2);
      } catch {
        // servidor no disponible o sin código generado todavía: se reintenta en el siguiente tick
      }
    }, 3000);
  }

  function detenerPollingExtension() {
    if (intervaloExtension) clearInterval(intervaloExtension);
    intervaloExtension = null;
  }
```

- [x] **Step 3: Añadir la zona "Desde la extensión" al paso Origen**

Modificar `pasoOrigen()` para incluir la nueva zona entre el marcador y la URL:

```js
  function pasoOrigen() {
    return el('div', [
      el('.nota', { style: { marginBottom: '20px' } }, [
        el('strong', { texto: 'Antes de clonar. ' }),
        'Recrear el login de una marca real para una simulación entra dentro del encargo, pero conviene que quede por escrito de dónde salió: cada plantilla clonada guarda una nota de autorización obligatoria, y el linter no la deja pasar vacía.',
      ]),
      zonaMarcador(),
      el('.separador-o', { texto: 'o desde la extensión' }),
      zonaExtension(),
      el('.separador-o', { texto: 'o pega una URL' }),
      zonaUrl(),
    ]);
  }
```

Añadir la función `zonaExtension()`, cerca de `zonaMarcador()`:

```js
  function zonaExtension() {
    const contenido = el('div', { texto: 'Comprobando emparejamiento…' });
    const zona = el('.zona-soltar', [
      el('strong', { texto: 'Extensión de captura.' }),
      contenido,
    ]);

    refrescarExtension();
    return zona;

    async function refrescarExtension() {
      try {
        const { codigo } = await obtenerCodigoEmparejamiento();
        pintarEn(contenido, codigo ? conCodigo(codigo) : sinCodigo());
      } catch {
        pintarEn(contenido, el('p.ayuda', { texto: 'El servidor local no responde: la extensión no puede usarse sin él.' }));
      }
    }

    function sinCodigo() {
      return el('div', [
        el('div', { texto: 'Todavía no hay código de emparejamiento generado.' }),
        el('button.btn.btn-mini', {
          type: 'button',
          style: { marginTop: '8px' },
          texto: 'Generar código',
          onclick: async () => {
            try {
              const { codigo } = await generarCodigoEmparejamiento();
              brindis(`Código generado: ${codigo}. Pégalo en las opciones de la extensión.`);
              await refrescarExtension();
            } catch (err) {
              brindis(`No se pudo generar: ${err.message}`);
            }
          },
        }),
      ]);
    }

    function conCodigo(codigo) {
      return el('div', [
        el('div', { texto: 'Código de emparejamiento (pégalo en las opciones de la extensión):' }),
        el('output.salida-mono', { texto: codigo, style: { display: 'block', margin: '8px 0' } }),
        el('button.btn.btn-mini', {
          type: 'button',
          texto: 'Regenerar código',
          onclick: async () => {
            try {
              const { codigo: nuevo } = await generarCodigoEmparejamiento();
              brindis(`Nuevo código: ${nuevo}. Actualiza las opciones de la extensión.`);
              await refrescarExtension();
            } catch (err) {
              brindis(`No se pudo regenerar: ${err.message}`);
            }
          },
        }),
        el('p.ayuda', { texto: 'Esta pantalla revisa cada pocos segundos si la extensión ha mandado algo. Solo con pulsar "Enviar a PhishLab" en su icono, la captura aparece aquí sola.' }),
      ]);
    }
  }
```

- [x] **Step 4: Ofrecer el siguiente paso de la cola tras guardar uno**

Modificar el bloque `try`/`catch` de éxito dentro del `onclick` del botón "Guardar como plantilla propia" en `pasoGuardar()` (donde hoy se llama a `pintarEn(zonaAviso, ...)` tras guardar con éxito), añadiendo el aviso de cola pendiente justo después de la nota de "Guardada.":

```js
              brindis(`Guardada en templates/propias/landings/${id}. Recarga para verla en la biblioteca.`);
              pintarEn(zonaAviso, el('.nota', { style: { marginTop: '16px' } }, [
                el('strong', { texto: 'Guardada. ' }),
                'Está en la biblioteca al recargar, marcada como clonada. Ábrela para revisar los campos de credenciales y editar el texto en vivo, directamente sobre la preview.',
                colaExtension.length > 0
                  ? el('div', { style: { marginTop: '10px' } }, [
                      el('button.btn.btn-mini', {
                        type: 'button',
                        texto: `Revisar el siguiente paso capturado (quedan ${colaExtension.length})`,
                        onclick: () => { resultado = colaExtension.shift(); ir(2); },
                      }),
                    ])
                  : null,
              ]));
```

- [x] **Step 5: Verificación manual**

Run: `npm run dev` y abrir `http://127.0.0.1:8080/#/importar` (pestaña Web).
Expected: la nueva zona "Extensión de captura" aparece entre el marcador y la URL, muestra "Todavía no hay código de emparejamiento generado." y el botón "Generar código" funciona (tras pulsarlo aparece el código y el brindis de confirmación). Esto valida el servidor + cliente de las Tasks 1–3 de punta a punta, sin necesitar todavía la extensión (Tasks 5–7).

- [x] **Step 6: Commit**

```bash
git add assets/js/ui/importarWeb.js
git commit -m "UI: zona de emparejamiento y recepcion de capturas de la extension"
```

---

## Task 5: Extensión — manifest y content script

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/content.js`

**Interfaces:**
- Produces: el contrato de retorno de `content.js` cuando se inyecta vía `chrome.scripting.executeScript` — un objeto `{ html: string, recursos: string[], huboPosibleShadowCerrado: boolean }`, consumido por `background.js` en la Task 6.
- Consumes: nada — es la pieza más aislada, sin dependencias de las tasks anteriores.

- [x] **Step 1: Crear `extension/manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "PhishLab — Captura de clonado",
  "version": "1.0.0",
  "description": "Captura páginas reales, incluida su sesión autenticada, y las envía directo al PhishLab local para convertirlas en landing.",
  "permissions": ["scripting", "storage"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html", "default_title": "PhishLab" },
  "options_page": "options.html"
}
```

- [x] **Step 2: Crear `extension/content.js`**

```js
/**
 * Content script del marcador de captura de PhishLab.
 *
 * Se inyecta bajo demanda (no vive en cada página) al pulsar "Capturar paso"
 * en el popup. Serializa el DOM actual a HTML autocontenido, incluidos los
 * shadow roots abiertos (como declarative shadow DOM nativo, sin script de
 * rehidratación), pero NO hace ningún fetch: eso lo hace `background.js`,
 * que sí tiene privilegios de red que este script no tiene (cookies
 * cross-origin, sin CORS). Un shadow root cerrado no es alcanzable desde
 * ningún script de página — se marca con una heurística, nunca en silencio,
 * igual que `tools/sanearWeb.js` anota lo que no puede incrustar.
 */
(function () {
  const recursos = [];

  function verRecurso(url) {
    if (!url || /^data:/i.test(url)) return;
    recursos.push(url);
  }

  function extraerUrlsCss(texto) {
    const encontradas = [];
    const patron = /url\((['"]?)([^'")]+)\1\)/gi;
    let m;
    while ((m = patron.exec(texto ?? ''))) encontradas.push(m[2]);
    return encontradas;
  }

  function serializarNodo(nodo) {
    if (nodo.nodeType !== Node.ELEMENT_NODE) return nodo.cloneNode(true);
    return serializarElemento(nodo);
  }

  function serializarElemento(nodo) {
    const clon = nodo.cloneNode(false);

    if (nodo.shadowRoot) {
      const plantilla = document.createElement('template');
      plantilla.setAttribute('shadowrootmode', 'open');
      for (const hijo of nodo.shadowRoot.childNodes) {
        plantilla.content.appendChild(serializarNodo(hijo));
      }
      clon.appendChild(plantilla);
    }

    if (nodo.tagName === 'IMG' && nodo.getAttribute('src')) verRecurso(nodo.getAttribute('src'));
    if (nodo.tagName === 'LINK' && (nodo.getAttribute('rel') || '').includes('stylesheet')) {
      verRecurso(nodo.getAttribute('href'));
    }
    if (nodo.tagName === 'STYLE') {
      for (const url of extraerUrlsCss(nodo.textContent)) verRecurso(url);
    }
    if (nodo.hasAttribute('style')) {
      for (const url of extraerUrlsCss(nodo.getAttribute('style'))) verRecurso(url);
    }

    for (const hijo of nodo.childNodes) {
      clon.appendChild(serializarNodo(hijo));
    }

    return clon;
  }

  // Heurística de shadow DOM cerrado: un elemento personalizado registrado
  // que no expone `shadowRoot` casi siempre lo tiene, solo que cerrado. No es
  // certeza absoluta (podría no usar shadow DOM en absoluto), por eso se
  // reporta como "posible", para revisar a mano — nunca como un hecho.
  let huboPosibleShadowCerrado = false;
  for (const elemento of document.body.querySelectorAll('*')) {
    const nombre = elemento.tagName.toLowerCase();
    if (nombre.includes('-') && customElements.get(nombre) && elemento.shadowRoot === null) {
      huboPosibleShadowCerrado = true;
      break;
    }
  }

  const raizClonada = serializarElemento(document.documentElement);

  return {
    html: '<!doctype html>' + raizClonada.outerHTML,
    recursos: [...new Set(recursos)],
    huboPosibleShadowCerrado,
  };
})();
```

- [x] **Step 3: Verificación manual**

Cargar la carpeta `extension/` como extensión descomprimida en `chrome://extensions` (Modo desarrollador → Cargar descomprimida). Confirmar que Chrome no marca ningún error de manifest y que el icono aparece en la barra (sin popup funcional todavía — eso es la Task 7).

- [x] **Step 4: Commit**

```bash
git add extension/manifest.json extension/content.js
git commit -m "Extension: manifest MV3 y content script de captura con shadow DOM"
```

---

## Task 6: Extensión — service worker (`background.js`)

**Files:**
- Create: `extension/background.js`

**Interfaces:**
- Consumes: el contrato de retorno de `content.js` (Task 5): `{ html, recursos, huboPosibleShadowCerrado }`.
- Produces: el protocolo de mensajes que `popup.js` (Task 7) envía vía `chrome.runtime.sendMessage`: `{ tipo: 'capturar-paso' }`, `{ tipo: 'estado-sesion' }`, `{ tipo: 'descartar-sesion' }`, `{ tipo: 'enviar-sesion' }`, cada uno resuelto a un objeto con `{ ok: true, ... }` o `{ error: string }`.

- [x] **Step 1: Crear `extension/background.js`**

```js
/**
 * Service worker de la extensión de captura.
 *
 * Es quien de verdad hace fetch de recursos (imágenes, hojas de estilo,
 * fuentes) que `content.js` solo detecta — con `host_permissions` concedidos
 * en la instalación, ese fetch no está sujeto a CORS de la misma forma que
 * uno disparado desde la página, y puede llevar las cookies de la pestaña
 * (`credentials: 'include'`) para traer recursos que exigen sesión iniciada.
 * Es la mejora de fidelidad central de esta extensión frente al marcador
 * Ctrl+S, cuyo saneado de recursos corre sin ninguna cookie.
 *
 * La sesión de captura vive en `chrome.storage.session`: sobrevive a que
 * este service worker se descargue entre pulsaciones del popup (normal en
 * MV3), pero no a un reinicio del navegador — a propósito, es tan efímera
 * como un Ctrl+S de toda la vida.
 */

const LIMITE_BYTES_RECURSO = 5 * 1024 * 1024;
const MAX_RECURSOS_POR_PASO = 60;
const MAX_PASOS = 8;

chrome.runtime.onMessage.addListener((mensaje, _remitente, enviarRespuesta) => {
  manejar(mensaje)
    .then(enviarRespuesta)
    .catch((e) => enviarRespuesta({ error: e.message }));
  return true; // indica respuesta asíncrona
});

async function manejar(mensaje) {
  if (mensaje.tipo === 'capturar-paso') return await capturarPaso();
  if (mensaje.tipo === 'estado-sesion') return await leerSesion();
  if (mensaje.tipo === 'descartar-sesion') return await descartarSesion();
  if (mensaje.tipo === 'enviar-sesion') return await enviarSesion();
  throw new Error(`mensaje desconocido: ${mensaje.tipo}`);
}

async function capturarPaso() {
  const sesion = await leerSesion();
  if (sesion.pasos.length >= MAX_PASOS) {
    throw new Error(`máximo ${MAX_PASOS} pasos por sesión de captura`);
  }

  const [pestana] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!pestana?.id) throw new Error('no hay pestaña activa');

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: pestana.id },
    files: ['content.js'],
  });

  const recursosInlinados = await incrustarRecursos(result.recursos, pestana.url);
  let html = result.html;
  for (const [url, dataUri] of Object.entries(recursosInlinados)) {
    html = html.split(url).join(dataUri);
  }

  const paso = { url: pestana.url, html, timestamp: Date.now() };
  const nuevaLista = [...sesion.pasos, paso];
  await chrome.storage.session.set({ pasos: nuevaLista });
  await actualizarBadge(nuevaLista.length);
  return { ok: true, pasos: nuevaLista.length };
}

async function incrustarRecursos(urls, urlPestana) {
  const resultado = {};
  const unicas = [...new Set(urls)].slice(0, MAX_RECURSOS_POR_PASO);

  for (const url of unicas) {
    try {
      const absoluta = new URL(url, urlPestana).href;
      const res = await fetch(absoluta, { credentials: 'include' });
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > LIMITE_BYTES_RECURSO) continue;
      const tipo = res.headers.get('content-type') ?? 'application/octet-stream';
      resultado[url] = `data:${tipo};base64,${arrayBufferABase64(buffer)}`;
    } catch {
      // recurso no alcanzable: se deja el HTML como estaba. sanearWeb.js, en
      // el servidor, ya lo anota como "no incrustado" en su informe — nunca
      // en silencio.
    }
  }
  return resultado;
}

function arrayBufferABase64(buffer) {
  let binario = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binario += String.fromCharCode(bytes[i]);
  return btoa(binario);
}

async function leerSesion() {
  const { pasos = [] } = await chrome.storage.session.get('pasos');
  return { pasos };
}

async function descartarSesion() {
  await chrome.storage.session.set({ pasos: [] });
  await actualizarBadge(0);
  return { ok: true };
}

async function enviarSesion() {
  const sesion = await leerSesion();
  if (sesion.pasos.length === 0) throw new Error('no hay nada capturado todavía');

  const { codigoPareado, puerto } = await chrome.storage.local.get(['codigoPareado', 'puerto']);
  if (!codigoPareado) throw new Error('falta el código de emparejamiento — configúralo en Opciones');

  const res = await fetch(`http://127.0.0.1:${puerto || 8080}/api/extension/clonar-flujo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PhishLab-Pair': codigoPareado },
    body: JSON.stringify({ pasos: sesion.pasos.map(({ url, html }) => ({ url, html })) }),
  });

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `el servidor respondió ${res.status}`);

  await descartarSesion();
  return { ok: true, recibidos: datos.recibidos };
}

async function actualizarBadge(n) {
  await chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#1E8A3B' });
}
```

- [x] **Step 2: Verificación manual**

Recargar la extensión en `chrome://extensions`. Abrir cualquier página, hacer clic en el icono de la extensión (el popup de la Task 7 todavía no existe, así que se usa la consola del service worker: `chrome://extensions` → "Inspeccionar vistas: service worker" → en la consola, ejecutar `chrome.runtime.sendMessage({tipo: 'capturar-paso'})` y comprobar que devuelve `{ok: true, pasos: 1}` sin lanzar ningún error.

- [x] **Step 3: Commit**

```bash
git add extension/background.js
git commit -m "Extension: service worker que incrusta recursos y habla con el servidor"
```

---

## Task 7: Extensión — popup y opciones

**Files:**
- Create: `extension/popup.html`
- Create: `extension/popup.js`
- Create: `extension/options.html`
- Create: `extension/options.js`

**Interfaces:**
- Consumes: el protocolo de mensajes de `background.js` (Task 6); `chrome.storage.local` con las claves `codigoPareado` y `puerto`, escritas aquí y leídas por `enviarSesion()` en `background.js`.

- [x] **Step 1: Crear `extension/popup.html`**

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>PhishLab</title>
<style>
  body { width: 260px; font: 13px system-ui, sans-serif; margin: 0; padding: 14px; background: #14171C; color: #EDEEF0; }
  h1 { font-size: 14px; margin: 0 0 10px; }
  .estado { margin-bottom: 12px; color: #9AA3AF; }
  button { width: 100%; padding: 8px; margin-bottom: 8px; border: none; border-radius: 6px; font: inherit; cursor: pointer; }
  .primario { background: #1E8A3B; color: #fff; }
  .secundario { background: #262B33; color: #EDEEF0; }
  .aviso { color: #E5484D; font-size: 12px; margin-top: 8px; min-height: 14px; }
</style>
</head>
<body>
  <h1>PhishLab — captura</h1>
  <div class="estado" id="estado">Comprobando…</div>
  <button class="primario" id="btn-capturar">Capturar paso</button>
  <button class="secundario" id="btn-enviar">Enviar a PhishLab</button>
  <button class="secundario" id="btn-descartar">Descartar</button>
  <div class="aviso" id="aviso"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [x] **Step 2: Crear `extension/popup.js`**

```js
const elEstado = document.getElementById('estado');
const elAviso = document.getElementById('aviso');

document.getElementById('btn-capturar').addEventListener('click', () => ejecutar({ tipo: 'capturar-paso' }));
document.getElementById('btn-enviar').addEventListener('click', () => ejecutar({ tipo: 'enviar-sesion' }));
document.getElementById('btn-descartar').addEventListener('click', () => ejecutar({ tipo: 'descartar-sesion' }));

actualizarEstado();

async function ejecutar(mensaje) {
  elAviso.textContent = '';
  const respuesta = await chrome.runtime.sendMessage(mensaje);
  if (respuesta?.error) {
    elAviso.textContent = respuesta.error;
  } else if (mensaje.tipo === 'enviar-sesion') {
    elAviso.textContent = '';
    elAviso.style.color = '#3FB950';
    elAviso.textContent = `Enviado (${respuesta.recibidos} paso${respuesta.recibidos === 1 ? '' : 's'}).`;
  }
  await actualizarEstado();
}

async function actualizarEstado() {
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'estado-sesion' });
  const pasos = respuesta?.pasos ?? [];
  elEstado.textContent = pasos.length === 0
    ? 'Sin capturar'
    : `${pasos.length} paso${pasos.length === 1 ? '' : 's'} capturado${pasos.length === 1 ? '' : 's'}`;
}
```

- [x] **Step 3: Crear `extension/options.html`**

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>PhishLab — opciones</title>
<style>
  body { font: 14px system-ui, sans-serif; max-width: 420px; margin: 24px auto; padding: 0 16px; }
  label { display: block; margin-top: 14px; font-weight: 600; }
  input { width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  button { margin-top: 16px; padding: 8px 16px; }
  p.ayuda { color: #666; font-size: 12px; }
  .guardado { color: #1E8A3B; font-size: 12px; margin-top: 8px; min-height: 14px; }
</style>
</head>
<body>
  <h1>PhishLab — Opciones</h1>
  <p class="ayuda">El código de emparejamiento se genera en la pestaña Importar → Web de tu PhishLab local, en la zona "Extensión de captura".</p>
  <label for="codigo">Código de emparejamiento</label>
  <input id="codigo" type="text" autocomplete="off">
  <label for="puerto">Puerto del servidor local</label>
  <input id="puerto" type="number" value="8080">
  <button id="guardar">Guardar</button>
  <div class="guardado" id="guardado"></div>
  <script src="options.js"></script>
</body>
</html>
```

- [x] **Step 4: Crear `extension/options.js`**

```js
const campoCodigo = document.getElementById('codigo');
const campoPuerto = document.getElementById('puerto');
const avisoGuardado = document.getElementById('guardado');

chrome.storage.local.get(['codigoPareado', 'puerto']).then(({ codigoPareado, puerto }) => {
  if (codigoPareado) campoCodigo.value = codigoPareado;
  if (puerto) campoPuerto.value = puerto;
});

document.getElementById('guardar').addEventListener('click', async () => {
  await chrome.storage.local.set({
    codigoPareado: campoCodigo.value.trim(),
    puerto: Number(campoPuerto.value) || 8080,
  });
  avisoGuardado.textContent = 'Guardado.';
  setTimeout(() => { avisoGuardado.textContent = ''; }, 2000);
});
```

- [x] **Step 5: Verificación manual — flujo completo de un paso**

1. Recargar la extensión en `chrome://extensions`.
2. `npm run dev` en PhishLab, abrir Importar → Web, generar el código de emparejamiento.
3. Abrir la página de opciones de la extensión, pegar el código, guardar.
4. Ir a cualquier página real (ej. una de login pública), pulsar el icono de la extensión, "Capturar paso" → el badge pasa a "1".
5. "Enviar a PhishLab" → el popup confirma "Enviado (1 paso)."
6. En la pestaña de PhishLab (Importar → Web, sin recargar), en menos de 3s debe aparecer el paso de revisión con el HTML capturado.

Expected: los 6 pasos anteriores completan sin error manual y el HTML revisado en el paso 2 del wizard corresponde a la página capturada.

- [x] **Step 6: Verificación manual — flujo multi-paso**

Repetir "Capturar paso" dos o tres veces en páginas distintas antes de "Enviar a PhishLab". Confirmar que el badge sube con cada captura, que el envío manda todos los pasos juntos, y que en Importar → Web aparece el primero para revisar con un botón "Revisar el siguiente paso capturado (quedan N)" tras guardarlo.

Expected: cada paso llega con su propio informe de saneado y detección de campos de login, sin mezclarse entre sí.

- [x] **Step 7: Commit**

```bash
git add extension/popup.html extension/popup.js extension/options.html extension/options.js
git commit -m "Extension: popup de captura y pagina de opciones"
```

---

## Task 8: Verificación final y notas de uso

**Files:**
- Modify: `README.md`

**Interfaces:** ninguna — task de cierre.

- [x] **Step 1: Ejecutar toda la suite de pruebas**

Run: `npm test`
Expected: PASS — todos los `tests/*.test.js`, incluidos los nuevos de `servidorExtension.test.js`.

- [x] **Step 2: Ejecutar el linter del catálogo**

Run: `npm run lint`
Expected: PASS — esta spec no toca `templates/`, así que no debería haber cambios de comportamiento aquí; confirma que nada se rompió por accidente.

- [x] **Step 3: Verificación manual contra un login real de varios pasos**

Probar la extensión contra un login real de dos pantallas (ej. un formulario que pide email primero y contraseña en una pantalla separada, sin necesidad de completarlo con credenciales reales). Documentar en el propio README lo que salió: qué se incrustó, qué no, y si la heurística de shadow DOM cerrado dio algún falso positivo.

- [x] **Step 4: Documentar la extensión en `README.md`**

Añadir un párrafo nuevo en la sección "Clonar una web entera (pestaña 'Web')" del README, después del párrafo que describe el marcador Ctrl+S actual:

```markdown
**Extensión de captura (recomendado si la tienes instalada).** Vive en
`extension/`, se carga como extensión descomprimida
(`chrome://extensions` → Modo desarrollador → Cargar descomprimida). A
diferencia del marcador, manda la captura directa al servidor local — sin
copiar ni pegar — porque una extensión instalada sí puede pedir permiso de
host para `127.0.0.1` en su instalación, el permiso que una web pública no
puede obtener (ver `SECURITY.md`). También soporta capturar varios pasos de
un login antes de enviarlos juntos, y su incrustado de recursos es más fiel
que el del servidor: corre con las cookies de la propia pestaña y sin las
restricciones de CORS de un fetch normal. Requiere emparejarse una vez con
un código que se genera desde esta misma pantalla.
```

- [x] **Step 5: Commit**

```bash
git add README.md
git commit -m "Docs: extension de captura en el README"
```
