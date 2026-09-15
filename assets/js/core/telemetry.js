/**
 * Telemetría opcional hacia el panel multi-proyecto de eduolihez.com
 * (admin.eduolihez.com / api.eduolihez.com — ver docs/designs/admin-dashboard.md
 * en el repo eduolihez.com). Dos niveles, según de dónde venga la visita:
 *
 *   - Visita: un ping sin autenticar a /api/visit.php, igual que hace
 *     public/projects/nowait/index.html en eduolihez.com. Solo tiene sentido
 *     cuando PhishLab se sirve DESDE eduolihez.com (la demo pública); desde
 *     la herramienta local ese endpoint ni existe.
 *   - Evento: POST autenticado con clave de API a /api/events.php, para lo
 *     que de verdad interesa medir (qué plantillas se componen, qué campaña
 *     se exporta). Necesita `assets/telemetry.config.json` con una clave real
 *     generada desde /admin — sin ese fichero, todo es un no-op silencioso.
 *
 * Encendida por defecto en la demo pública (no hay nada sensible que
 * reportar: marcas ficticias, sin exportación). Apagada por defecto en la
 * herramienta local — el uso real trata con clientes y expedientes de
 * verdad, así que hace falta encenderla a mano — y aun encendida, el
 * payload de cada evento está limitado a ids de plantilla y señales, nunca
 * a `cliente`, `expediente` ni `marca`.
 *
 * Ninguna llamada de este módulo bloquea la interfaz ni lanza una excepción
 * hacia quien la usa: si falla, si no hay clave, o si está desactivada, es
 * un no-op silencioso.
 */

const ENDPOINT_EVENTOS = 'https://api.eduolihez.com/events.php';
const ENDPOINT_VISITA = '/api/visit.php';
const CLAVE_ACTIVAR_LOCAL = 'phishlab_telemetria_activa';

let configCargada = null;

async function cargarConfig() {
  if (configCargada) return configCargada;
  configCargada = (async () => {
    try {
      const res = await fetch('assets/telemetry.config.json', { cache: 'no-store' });
      if (!res.ok) return null;
      const datos = await res.json();
      return datos?.apiKey ? datos : null;
    } catch {
      return null;
    }
  })();
  return configCargada;
}

/**
 * "demo" (marcas ficticias, público) y "lab" (marca real, detrás de un muro
 * de acceso — ver tools/build-lab.js) comparten el mismo tratamiento de
 * telemetría: ambos son builds estáticos servidos desde eduolihez.com, sin
 * datos de cliente/expediente reales que proteger en el payload.
 */
function esDemo() {
  const modo = document.documentElement.dataset.modo;
  return modo === 'demo' || modo === 'lab';
}

function activaEnLocal() {
  try {
    return localStorage.getItem(CLAVE_ACTIVAR_LOCAL) === '1';
  } catch {
    return false;
  }
}

/** Se llama desde el panel de ajustes de la herramienta local. */
export function activarTelemetriaLocal(valor) {
  try {
    localStorage.setItem(CLAVE_ACTIVAR_LOCAL, valor ? '1' : '0');
  } catch {
    // Sin localStorage no hay nada que persistir; la próxima carga vuelve a apagada.
  }
}

export function telemetriaActiva() {
  return esDemo() || activaEnLocal();
}

/** Ping de visita sin autenticar. Solo dispara si esto corre servido desde eduolihez.com. */
export function registrarVisita() {
  if (!esDemo()) return;
  try {
    const cuerpo = JSON.stringify({ app: 'phishlab', path: location.pathname, referrer: document.referrer || '' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT_VISITA, new Blob([cuerpo], { type: 'application/json' }));
    } else {
      fetch(ENDPOINT_VISITA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo, keepalive: true }).catch(() => {});
    }
  } catch {
    // La analítica nunca debe romper la página.
  }
}

/**
 * Evento agregable. `payload` no debe llevar nunca `cliente`, `expediente`
 * ni `marca` — solo ids de plantilla, tipo, familia y señales, que es lo
 * único que tiene sentido comparar entre instalaciones.
 */
export async function registrarEvento(tipo, payload = {}) {
  try {
    if (!telemetriaActiva()) return;
    const cfg = await cargarConfig();
    if (!cfg?.apiKey) return;

    // sendBeacon no deja mandar cabeceras propias, y la clave va en una
    // cabecera (X-API-Key) por diseño del endpoint — así que aquí siempre es
    // fetch con keepalive, no sendBeacon, aunque sobreviva igual al unload.
    await fetch(ENDPOINT_EVENTOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.apiKey },
      body: JSON.stringify({ event_id: crypto.randomUUID(), type: tipo, payload }),
      keepalive: true,
    });
  } catch {
    // La telemetría nunca debe romper la interfaz.
  }
}
