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
