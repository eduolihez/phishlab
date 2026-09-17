/**
 * Informe de resultados de una campaña.
 *
 * Cruza `campana.json` (lo que se exportó: qué señales llevaba) con el CSV de
 * resultados que exporta GoPhish (qué pasó de verdad), para que el texto
 * "quien haya picado ha dejado pasar estas señales..." de `INSTRUCCIONES.md`
 * también se pueda ver ya con los números reales, no solo antes de lanzar.
 *
 * Todo el cálculo es agregado y en memoria: ninguna fila de destinatario se
 * guarda en ningún sitio, ni aquí ni en localStorage. Coherente con "purga
 * los resultados al entregar el informe" (SECURITY.md) — esta pantalla es
 * justo para leerlos una vez y quedarse con el agregado, no con la lista.
 */

/** Cabeceras que reconoce GoPhish (y variantes con guion bajo/espacio) para cada estado. */
const ALIAS_ESTADO = {
  enviado: ['email sent', 'sent'],
  abierto: ['email opened', 'opened'],
  clic: ['clicked link', 'clicked'],
  datos: ['submitted data', 'submitted'],
  reportado: ['email reported', 'reported'],
};

/**
 * Parsea un CSV de resultados de GoPhish.
 *
 * No asume un orden de columnas fijo: lee la cabecera y resuelve por nombre
 * (case-insensitive), porque GoPhish permite elegir qué campos exportar y la
 * versión exacta puede variar la capitalización.
 *
 * @param {string} texto contenido crudo del .csv
 * @returns {Array<Record<string,string>>}
 */
export function parsearCsvResultados(texto) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length);
  if (!lineas.length) return [];

  const cabecera = partirLineaCsv(lineas[0]).map((c) => c.trim().toLowerCase());
  const filas = [];

  for (const linea of lineas.slice(1)) {
    const valores = partirLineaCsv(linea);
    if (!valores.length) continue;
    const fila = {};
    cabecera.forEach((clave, i) => { fila[clave] = (valores[i] ?? '').trim(); });
    filas.push(fila);
  }

  return filas;
}

/** Parte una línea CSV respetando comillas — GoPhish cita cualquier campo con comas (nombres, posición...). */
function partirLineaCsv(linea) {
  const campos = [];
  let actual = '';
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else actual += c;
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ',') {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

/**
 * Agrega las filas de resultados en tasas, sin guardar ni un destinatario.
 *
 * Un destinatario que llegó a "Clicked Link" cuenta también como abierto:
 * GoPhish no siempre trae una fila por estado, a veces una sola fila con el
 * estado más avanzado alcanzado — por eso cada tasa es "llegó al menos hasta
 * aquí", no un embudo estricto de transiciones exclusivas.
 *
 * @param {Array<Record<string,string>>} filas
 * @returns {{ total: number, enviados: number, abiertos: number, clics: number,
 *             datosEnviados: number, reportados: number,
 *             tasas: Record<string, number> }}
 */
export function agregarResultados(filas) {
  const total = filas.length;
  const cuenta = { enviados: 0, abiertos: 0, clics: 0, datosEnviados: 0, reportados: 0 };

  for (const fila of filas) {
    const estado = (fila.status ?? fila.estado ?? '').toLowerCase();
    const reportado = /^(true|1|s[ií]|yes)$/i.test(fila.reported ?? fila.reportado ?? '') || coincide(estado, ALIAS_ESTADO.reportado);

    if (estado || fila['send date'] || fila.send_date) cuenta.enviados++;
    if (coincide(estado, ALIAS_ESTADO.abierto) || coincide(estado, ALIAS_ESTADO.clic) || coincide(estado, ALIAS_ESTADO.datos)) cuenta.abiertos++;
    if (coincide(estado, ALIAS_ESTADO.clic) || coincide(estado, ALIAS_ESTADO.datos)) cuenta.clics++;
    if (coincide(estado, ALIAS_ESTADO.datos)) cuenta.datosEnviados++;
    if (reportado) cuenta.reportados++;
  }

  const tasa = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  return {
    total,
    enviados: cuenta.enviados,
    abiertos: cuenta.abiertos,
    clics: cuenta.clics,
    datosEnviados: cuenta.datosEnviados,
    reportados: cuenta.reportados,
    tasas: {
      abiertos: tasa(cuenta.abiertos),
      clics: tasa(cuenta.clics),
      datosEnviados: tasa(cuenta.datosEnviados),
      reportados: tasa(cuenta.reportados),
    },
  };
}

function coincide(estado, alias) {
  return alias.some((a) => estado.includes(a));
}

/**
 * Informe en Markdown: los números agregados más la misma tabla de señales
 * que ya lleva INSTRUCCIONES.md, para que el cliente reciba un solo
 * documento que une "qué se le puso delante" con "qué pasó de verdad".
 *
 * @param {{ campana: object, resumen: ReturnType<typeof agregarResultados>,
 *           catalogoSenales: object[] }} datos
 */
export function informeMarkdown({ campana, resumen, catalogoSenales }) {
  const hoy = new Date().toISOString().slice(0, 10);
  const l = [];

  l.push('# Informe de resultados');
  l.push('');
  l.push('| | |');
  l.push('|---|---|');
  if (campana.cliente) l.push(`| Cliente | ${campana.cliente} |`);
  if (campana.expediente) l.push(`| Expediente | ${campana.expediente} |`);
  l.push(`| Campaña exportada | ${campana.fecha ?? '—'} |`);
  l.push(`| Informe generado | ${hoy} |`);
  if (campana.emailNombre) l.push(`| Plantilla de correo | ${campana.emailNombre} |`);
  if (campana.landingNombre) l.push(`| Landing | ${campana.landingNombre} |`);
  l.push(`| Destinatarios | ${resumen.total} |`);
  l.push('');

  l.push('## Tasas');
  l.push('');
  l.push('| Evento | Destinatarios | % |');
  l.push('|---|---|---|');
  l.push(`| Abrieron el correo | ${resumen.abiertos} | ${resumen.tasas.abiertos}% |`);
  l.push(`| Pulsaron el enlace | ${resumen.clics} | ${resumen.tasas.clics}% |`);
  l.push(`| Enviaron datos | ${resumen.datosEnviados} | ${resumen.tasas.datosEnviados}% |`);
  l.push(`| Reportaron el correo | ${resumen.reportados} | ${resumen.tasas.reportados}% |`);
  l.push('');

  const senalesCampana = campana.senales ?? {};
  if (catalogoSenales?.length) {
    const encendidas = catalogoSenales.filter((s) => senalesCampana[s.id]);
    l.push('## Señales que llevaba esta campaña');
    l.push('');
    l.push('| Señal | Estado |');
    l.push('|---|---|');
    for (const s of catalogoSenales) {
      l.push(`| ${s.nombre} | ${senalesCampana[s.id] ? '**Presente**' : 'Ausente'} |`);
    }
    l.push('');
    if (encendidas.length) {
      l.push(`Quien haya llegado a enviar datos ha dejado pasar ${encendidas.length === 1 ? 'esta señal' : `estas ${encendidas.length} señales`}: ` +
        encendidas.map((s) => `**${s.nombre.toLowerCase()}**`).join(', ') + '.');
    } else {
      l.push('Esta campaña no llevaba ninguna señal evidente: mide la exposición real de la organización, no la capacidad de detectar pistas.');
    }
    l.push('');
  }

  l.push('---');
  l.push('');
  l.push('Este informe se ha calculado en el navegador a partir del CSV de');
  l.push('resultados: ningún destinatario individual se ha guardado en ningún');
  l.push('sitio. Purga el CSV original y los resultados de GoPhish según lo');
  l.push('acordado en el tratamiento de datos de la campaña.');
  l.push('');

  return l.join('\n');
}
