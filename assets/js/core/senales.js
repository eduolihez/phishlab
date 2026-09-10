/**
 * Señales de phishing: resolución de presets, variantes de copy y bloques.
 *
 * En v1 la dificultad era un bloque cerrado: `facil` traía su propio copy,
 * su propio saludo y su propio remitente, y no había forma de decir "urgencia
 * sí, pero erratas no". El informe al cliente sabía cuántos habían picado,
 * pero no qué señal habían dejado pasar.
 *
 * Aquí la unidad es la señal. El nivel de dificultad pasa a ser un preset —
 * una combinación con nombre — y todo lo demás (qué texto se usa, qué bloques
 * aparecen, qué remitente se sugiere) se deriva de qué señales están activas.
 */

/** Señales activas a partir de un preset y los ajustes manuales encima. */
export function resolverSenales(presets, presetId, overrides = {}) {
  const preset = presets.find((p) => p.id === presetId) ?? presets[0];
  const base = { ...(preset?.senales ?? {}) };
  for (const [id, valor] of Object.entries(overrides)) {
    if (valor !== undefined && valor !== null) base[id] = Boolean(valor);
  }
  return base;
}

/** Las activas, como Set, que es como se consultan. */
export function activas(senales) {
  return new Set(Object.entries(senales).filter(([, v]) => v).map(([id]) => id));
}

/** ¿Los ajustes manuales se han apartado del preset? Lo pinta la interfaz. */
export function esPersonalizado(presets, presetId, senales) {
  const preset = presets.find((p) => p.id === presetId);
  if (!preset) return true;
  return Object.entries(preset.senales).some(([id, v]) => Boolean(senales[id]) !== Boolean(v));
}

/**
 * Elige la variante de un fragmento según las señales activas.
 *
 * Las claves son combinaciones separadas por "+": "urgencia+erratas" solo
 * entra si AMBAS están activas. Entre las que entran gana la más específica,
 * es decir, la que cubre más señales; "base" es el suelo y siempre entra.
 *
 * Se decide así, y no por nivel, para que el copy no haya que duplicarlo:
 * un mismo texto con urgencia sirve para cualquier combinación que la
 * incluya, sin escribir una versión por cada permutación.
 *
 * @param {string|Record<string,string>} variantes
 * @param {Set<string>} senalesActivas
 * @returns {string}
 */
export function elegirVariante(variantes, senalesActivas) {
  // Un fragmento constante entre señales se escribe como cadena suelta.
  if (typeof variantes === 'string') return variantes;
  if (!variantes || typeof variantes !== 'object') return '';

  let mejor = '';
  let mejorPeso = -1;

  for (const [clave, texto] of Object.entries(variantes)) {
    if (clave.startsWith('_')) continue; // comentarios en el JSON
    const exigidas = clave === 'base' ? [] : clave.split('+').map((s) => s.trim()).filter(Boolean);
    if (!exigidas.every((s) => senalesActivas.has(s))) continue;

    // A igualdad de especificidad gana la primera declarada: el orden del
    // fichero es la desempate, y así el resultado no depende del motor.
    if (exigidas.length > mejorPeso) {
      mejor = texto;
      mejorPeso = exigidas.length;
    }
  }

  return mejor;
}

/** Resuelve todos los fragmentos de un idioma a texto plano. */
export function resolverCopy(copy, senalesActivas) {
  const salida = {};
  for (const [clave, variantes] of Object.entries(copy ?? {})) {
    if (clave.startsWith('_')) continue;
    salida[clave] = elegirVariante(variantes, senalesActivas);
  }
  return salida;
}

/**
 * Decide qué bloques del layout sobreviven.
 *
 * Prioridad, de más fuerte a más débil:
 *   1. Lo que el usuario haya tocado a mano en el panel.
 *   2. La señal que gobierna el bloque, si la declara.
 *   3. Su valor por defecto.
 *
 * Un bloque puede depender de que una señal esté APAGADA, con "!" delante:
 * el pie legal completo es justo lo que un phishing no se molesta en copiar,
 * así que vive con `@senal:!incoherencia-marca`.
 *
 * @returns {Set<string>} ids de los bloques activos
 */
export function bloquesActivos(bloques = [], senalesActivas, overrides = {}) {
  const vivos = new Set();

  for (const bloque of bloques) {
    let activo;

    if (overrides[bloque.id] !== undefined && overrides[bloque.id] !== null) {
      activo = Boolean(overrides[bloque.id]);
    } else if (bloque.senal) {
      const negada = bloque.senal.startsWith('!');
      const id = negada ? bloque.senal.slice(1) : bloque.senal;
      activo = negada ? !senalesActivas.has(id) : senalesActivas.has(id);
    } else {
      activo = bloque.defecto !== false;
    }

    if (activo) vivos.add(bloque.id);
  }

  return vivos;
}

/**
 * Sugiere el envelope sender según la señal de dominio.
 *
 * Con `dominio-ajeno` activa hay dos escalones: si además hay erratas o saludo
 * genérico estamos en una campaña burda y el dominio es descaradamente otro;
 * si no, un lookalike plausible. Sin la señal, el dominio real del cliente.
 */
export function sugerirRemitente(meta, marca, senalesActivas) {
  const dominio = (marca?.dominio || 'ejemplo.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  const buzon = meta?.remitente?.buzon || 'notificaciones';
  const nombre = meta?.remitente?.nombre || 'Notificaciones';
  const partes = dominio.split('.');

  if (!senalesActivas.has('dominio-ajeno')) {
    return `${nombre} <${buzon}@${dominio}>`;
  }
  if (senalesActivas.has('erratas') || senalesActivas.has('saludo-generico')) {
    return `${nombre} <${buzon}@${buzon}-${partes[0]}.net>`;
  }
  return `${nombre} <${buzon}@${partes[0]}-${buzon}.${partes.slice(1).join('.') || 'com'}>`;
}

/** Resumen legible de las señales activas. Va al INSTRUCCIONES.md y al informe. */
export function describir(catalogo, senales) {
  const encendidas = catalogo.filter((s) => senales[s.id]);
  const apagadas = catalogo.filter((s) => !senales[s.id]);
  return { encendidas, apagadas };
}
