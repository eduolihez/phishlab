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
 * La sesión de captura vive en `chrome.storage.local` con `unlimitedStorage`
 * concedido en el manifest — NO en `chrome.storage.session`, que tiene un
 * tope duro de 10MB que ninguna concesión de permiso puede levantar (a
 * diferencia de `storage.local`, donde `unlimitedStorage` sí quita el tope).
 * Una sola página con una imagen de fondo ya se come ese tope en cuanto se
 * incrusta en base64, así que era la causa real de "Session storage quota
 * bytes exceeded" — no un caso límite, el caso normal. Para conservar la
 * intención original (que la sesión de captura no sobreviva a un reinicio
 * del navegador, tan efímera como un Ctrl+S), se vacía a mano en
 * `chrome.runtime.onStartup`.
 */

import { registrarEvento } from './telemetry.js';

const LIMITE_BYTES_RECURSO = 5 * 1024 * 1024;
const MAX_RECURSOS_POR_PASO = 60;
const MAX_PASOS = 8;
const TIMEOUT_RECURSO_MS = 8000;
const CONCURRENCIA_RECURSOS = 6;
const ESPERA_TRAS_AVANZAR_MS = 1600;

/** Bandera de parada del autopiloto — module-level porque un mensaje corto
 * ("Detener") necesita poder interrumpir un mensaje largo ya en marcha
 * ("Capturar flujo automático"); no hay otra forma de comunicar dos
 * invocaciones distintas del listener entre sí. */
let autopilotoEnMarcha = false;

/** Cómo se capturó la sesión actual, solo para el payload de telemetría (nunca URL ni dominio). */
let modoSesion = 'manual';

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('pasos');
});

chrome.runtime.onMessage.addListener((mensaje, _remitente, enviarRespuesta) => {
  manejar(mensaje)
    .then(enviarRespuesta)
    .catch((e) => enviarRespuesta({ error: e.message }));
  return true; // indica respuesta asíncrona
});

async function manejar(mensaje) {
  if (mensaje.tipo === 'capturar-paso') return await capturarPaso();
  if (mensaje.tipo === 'capturar-flujo-automatico') return await capturarFlujoAutomatico();
  if (mensaje.tipo === 'detener-flujo-automatico') { autopilotoEnMarcha = false; return { ok: true }; }
  if (mensaje.tipo === 'estado-sesion') return await leerSesion();
  if (mensaje.tipo === 'descartar-sesion') return await descartarSesion();
  if (mensaje.tipo === 'enviar-sesion') return await enviarSesion();
  throw new Error(`mensaje desconocido: ${mensaje.tipo}`);
}

async function pestanaActiva() {
  const [pestana] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!pestana?.id) throw new Error('no hay pestaña activa');
  if (!/^https?:/i.test(pestana.url ?? '')) {
    throw new Error('esta pestaña no es una web http(s) — la extensión no puede capturar chrome://, la Chrome Web Store ni ficheros locales');
  }
  return pestana;
}

async function capturarPaso() {
  const pestana = await pestanaActiva();
  const paso = await capturarPasoDe(pestana);
  const sesion = await leerSesion();
  if (sesion.pasos.length >= MAX_PASOS) {
    throw new Error(`máximo ${MAX_PASOS} pasos por sesión de captura`);
  }
  const nuevaLista = [...sesion.pasos, paso];
  await chrome.storage.local.set({ pasos: nuevaLista });
  await actualizarBadge(nuevaLista.length);
  return { ok: true, pasos: nuevaLista.length };
}

const REINTENTOS_INYECCION = 2;
const ESPERA_ENTRE_REINTENTOS_MS = 400;

/**
 * Inyecta content.js y devuelve su resultado, reintentando si hace falta.
 *
 * Páginas de login reales (Google, Microsoft, PayPal...) suelen redirigir o
 * hidratarse por JS justo después de la carga inicial. Si "Capturar paso" se
 * pulsa en ese instante, el content script puede inyectarse en un documento
 * que está siendo destruido a mitad — Chrome no siempre lo reporta como un
 * error que se pueda atrapar: a veces `executeScript` simplemente resuelve
 * con un resultado vacío, sin lanzar nada. Un reintento corto después de una
 * espera breve (tiempo de sobra para que la navegación/hidratación termine)
 * arregla la inmensa mayoría de estos casos sin que quien está capturando
 * tenga que darse cuenta de nada.
 */
async function inyectarContentScript(tabId) {
  let ultimoError = null;

  for (let intento = 0; intento <= REINTENTOS_INYECCION; intento++) {
    if (intento > 0) await esperar(ESPERA_ENTRE_REINTENTOS_MS);

    try {
      const inyeccion = await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      const result = inyeccion?.[0]?.result;
      if (result?.html) return result;
      ultimoError = null; // resultado vacío sin excepción: reintentar en silencio
    } catch (e) {
      ultimoError = e;
    }
  }

  if (ultimoError) {
    throw new Error(`no se pudo inyectar el script de captura en esta pestaña: ${ultimoError.message}`);
  }
  throw new Error('la captura no devolvió HTML tras varios intentos — recarga la pestaña e inténtalo de nuevo');
}

/**
 * Inyecta el content script, incrusta sus recursos y devuelve el paso listo
 * para guardar — sin tocar el storage. Aparte de `capturarPaso()` porque el
 * autopiloto (`capturarFlujoAutomatico`) necesita repetir esto en bucle sin
 * relanzar la comprobación de tope en cada vuelta.
 */
async function capturarPasoDe(pestana) {
  const result = await inyectarContentScript(pestana.id);

  // `result.recursos` es `[{ marcador, url }]` — content.js ya sustituyó cada
  // URL de recurso por un marcador único en el HTML, así que aquí solo hay
  // que sustituir cada marcador por su dato incrustado (o, si no se pudo
  // alcanzar, por la URL original: se pierde el incrustado de ese recurso
  // concreto, pero no la referencia — un navegador normal aún podría cargarlo
  // en directo, y así se comporta igual que antes de tener esta extensión).
  const mapaRecursos = result.recursos ?? [];
  const incrustados = await incrustarRecursos(mapaRecursos, pestana.url);
  let html = result.html;
  for (const { marcador, url } of mapaRecursos) {
    html = html.split(marcador).join(incrustados.get(marcador) ?? url);
  }

  return { url: pestana.url, html, timestamp: Date.now() };
}

/**
 * Autopiloto: captura la pantalla actual, rellena con datos genéricos
 * cualquier formulario de email/contraseña que encuentre y lo envía, espera
 * a que la SPA pinte el siguiente paso, y repite. Pensado para logins de
 * varios pasos (Google, Microsoft) donde antes había que ir pulsando
 * "Capturar paso" a mano en cada pantalla.
 *
 * Se detiene sola en cuanto la pantalla recién capturada trae ya un campo de
 * contraseña visible — esa es la última captura útil: en una campaña real,
 * de ahí el flujo pasa a la página de concienciación, así que seguir
 * rellenando y enviando esa contraseña de mentira no aporta nada y sí cruza
 * una línea que no hace falta cruzar (enviar un intento de login, aunque sea
 * con datos inventados, contra el sitio real). También para si se agota el
 * tope de pasos, si no encuentra ya ningún formulario que avanzar, o si el
 * usuario pulsa "Detener" en el popup (`autopilotoEnMarcha` se comprueba
 * entre cada paso).
 *
 * GoPhish solo admite una página por landing (ver README/SECURITY.md): esto
 * no intenta encadenar las capturas en una sola plantilla, solo ahorra el
 * trabajo manual de rellenar y enviar cada pantalla — de las N capturas que
 * deja en la cola, en PhishLab se exporta una sola (la última, con la
 * contraseña).
 */
async function capturarFlujoAutomatico() {
  await descartarSesion();
  autopilotoEnMarcha = true;
  modoSesion = 'autopiloto';
  const pasos = [];

  try {
    for (let i = 0; i < MAX_PASOS && autopilotoEnMarcha; i++) {
      const pestana = await pestanaActiva();
      let paso;
      try {
        paso = await capturarPasoDe(pestana);
      } catch (e) {
        if (pasos.length === 0) throw e;
        break; // ya hay algo capturado: se entrega lo conseguido en vez de perderlo todo
      }
      pasos.push(paso);
      await chrome.storage.local.set({ pasos });
      await actualizarBadge(pasos.length);

      if (pasos.length >= MAX_PASOS || !autopilotoEnMarcha) break;
      if (await tienePasswordVisible(pestana)) break;

      const avance = await intentarAvanzar(pestana);
      if (!avance.avanzado) break;

      await esperar(ESPERA_TRAS_AVANZAR_MS);
    }
  } finally {
    autopilotoEnMarcha = false;
  }

  return { ok: true, pasos: pasos.length };
}

async function intentarAvanzar(pestana) {
  try {
    const inyeccion = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      files: ['avanzar.js'],
    });
    return inyeccion?.[0]?.result ?? { avanzado: false };
  } catch {
    return { avanzado: false };
  }
}

/** Detección ligera, sin fichero aparte: solo mira si hay ya un campo de
 * contraseña visible en la pantalla que se acaba de capturar. */
async function tienePasswordVisible(pestana) {
  try {
    const inyeccion = await chrome.scripting.executeScript({
      target: { tabId: pestana.id },
      func: () => Array.from(document.querySelectorAll('input[type="password"]')).some((c) => c.offsetParent !== null),
    });
    return Boolean(inyeccion?.[0]?.result);
  } catch {
    return false;
  }
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {{marcador: string, url: string}[]} mapaRecursos
 * @returns {Promise<Map<string, string>>} marcador -> data: URI (solo los que se lograron incrustar)
 */
async function incrustarRecursos(mapaRecursos, urlPestana) {
  const limitado = mapaRecursos.slice(0, MAX_RECURSOS_POR_PASO);
  const resultado = new Map();
  // Varios marcadores distintos pueden apuntar a la misma URL absoluta (el
  // mismo icono referenciado dos veces, por ejemplo) — se cachea por URL para
  // no pedirla dos veces por red.
  const cachePorUrl = new Map();

  let cursor = 0;
  async function trabajador() {
    while (cursor < limitado.length) {
      const { marcador, url } = limitado[cursor++];
      let absoluta;
      try {
        absoluta = new URL(url, urlPestana).href;
      } catch {
        continue;
      }
      if (!cachePorUrl.has(absoluta)) {
        cachePorUrl.set(absoluta, await incrustarUno(absoluta));
      }
      const dataUri = cachePorUrl.get(absoluta);
      if (dataUri) resultado.set(marcador, dataUri);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_RECURSOS, limitado.length) }, trabajador));

  return resultado;
}

async function incrustarUno(absoluta) {
  try {
    const controlador = new AbortController();
    const tope = setTimeout(() => controlador.abort(), TIMEOUT_RECURSO_MS);
    let res;
    try {
      res = await fetch(absoluta, { credentials: 'include', signal: controlador.signal });
    } finally {
      clearTimeout(tope);
    }
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > LIMITE_BYTES_RECURSO) return null;
    const tipo = res.headers.get('content-type') ?? 'application/octet-stream';
    return `data:${tipo};base64,${arrayBufferABase64(buffer)}`;
  } catch {
    // recurso no alcanzable o timeout: se deja el HTML como estaba.
    // sanearWeb.js, en el servidor, ya lo anota como "no incrustado" en su
    // informe — nunca en silencio.
    return null;
  }
}

/** Conversión por bloques: `String.fromCharCode(...bytes)` revienta la pila con ficheros grandes. */
function arrayBufferABase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const TAMANO_BLOQUE = 8192;
  let binario = '';
  for (let i = 0; i < bytes.length; i += TAMANO_BLOQUE) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + TAMANO_BLOQUE));
  }
  return btoa(binario);
}

async function leerSesion() {
  const { pasos = [] } = await chrome.storage.local.get('pasos');
  return { pasos, autopilotoEnMarcha };
}

async function descartarSesion() {
  await chrome.storage.local.set({ pasos: [] });
  await actualizarBadge(0);
  modoSesion = 'manual';
  return { ok: true };
}

async function enviarSesion() {
  const sesion = await leerSesion();
  if (sesion.pasos.length === 0) throw new Error('no hay nada capturado todavía');

  const { codigoPareado, puerto } = await chrome.storage.local.get(['codigoPareado', 'puerto']);
  if (!codigoPareado) throw new Error('falta el código de emparejamiento — pégalo en el popup');

  const res = await fetch(`http://127.0.0.1:${puerto || 8080}/api/extension/clonar-flujo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PhishLab-Pair': codigoPareado },
    body: JSON.stringify({ pasos: sesion.pasos.map(({ url, html }) => ({ url, html })) }),
  });

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(datos.error ?? `el servidor respondió ${res.status}`);

  registrarEvento('extension_flujo_enviado', { pasos: sesion.pasos.length, modo: modoSesion });
  await descartarSesion();
  return { ok: true, recibidos: datos.recibidos };
}

async function actualizarBadge(n) {
  await chrome.action.setBadgeText({ text: n > 0 ? String(n) : '' });
  await chrome.action.setBadgeBackgroundColor({ color: '#1E8A3B' });
}
