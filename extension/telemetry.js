/**
 * Telemetría opcional de la extensión hacia el mismo panel multi-proyecto
 * que usa la web (api.eduolihez.com, ver assets/js/core/telemetry.js y
 * docs/EDUOLIHEZ.md). Mismo contrato, adaptado al service worker:
 *
 *   - No hay distinción demo/local: la extensión SIEMPRE trata con una
 *     instalación local real, así que empieza apagada y hace falta
 *     encenderla a mano desde options.html.
 *   - No hay `localStorage` en un service worker: el estado de activación
 *     vive en `chrome.storage.local`, junto al código de emparejamiento.
 *   - No hay `navigator.sendBeacon` en un service worker: todo va por
 *     `fetch`, que ya mantiene el worker vivo hasta que la promesa resuelve.
 *   - Reutiliza la misma app `phishlab` y la misma clave que la web — es el
 *     mismo producto, no dos aplicaciones distintas en el panel.
 *
 * El payload de cualquier evento se limita a conteos y modos — nunca la URL
 * ni el dominio capturado, nunca cliente ni expediente. Ninguna llamada de
 * este módulo lanza una excepción hacia quien la usa: si falla, si falta la
 * clave, o si está desactivada, es un no-op silencioso.
 */

const ENDPOINT_EVENTOS = 'https://api.eduolihez.com/events.php';
const CLAVE_ACTIVAR = 'telemetriaActiva';

let configCargada = null;

async function cargarConfig() {
  if (configCargada) return configCargada;
  configCargada = (async () => {
    try {
      const res = await fetch(chrome.runtime.getURL('telemetry.config.json'), { cache: 'no-store' });
      if (!res.ok) return null;
      const datos = await res.json();
      return datos?.apiKey ? datos : null;
    } catch {
      return null;
    }
  })();
  return configCargada;
}

export async function telemetriaActiva() {
  try {
    const { [CLAVE_ACTIVAR]: valor } = await chrome.storage.local.get(CLAVE_ACTIVAR);
    return valor === true;
  } catch {
    return false;
  }
}

/** Se llama desde options.js al cambiar la casilla. */
export async function activarTelemetria(valor) {
  try {
    await chrome.storage.local.set({ [CLAVE_ACTIVAR]: Boolean(valor) });
  } catch {
    // Sin storage no hay nada que persistir; la próxima carga vuelve a apagada.
  }
}

/**
 * Evento agregable. `payload` no debe llevar nunca URL, dominio, cliente ni
 * expediente — solo conteos y modos, que es lo único que tiene sentido
 * comparar entre instalaciones.
 */
export async function registrarEvento(tipo, payload = {}) {
  try {
    if (!(await telemetriaActiva())) return;
    const cfg = await cargarConfig();
    if (!cfg?.apiKey) return;

    await fetch(ENDPOINT_EVENTOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify({ event_id: crypto.randomUUID(), type: tipo, payload }),
    });
  } catch {
    // La telemetría nunca debe romper la extensión.
  }
}
