/**
 * Traducción de una campaña de PhishLab al lenguaje de GoPhish.
 *
 * Genera el INSTRUCCIONES.md que acompaña al ZIP: qué pegar en cada
 * pantalla de GoPhish y, sobre todo, cómo dejar las casillas de captura.
 * Ese fichero es también el único sitio donde se estampa el cliente y el
 * expediente: dentro del email o de la landing sería una pista para
 * cualquiera que mirase el código fuente.
 */

import { sugerirRemitente, describir } from './senales.js';

const IDIOMAS = { es: 'Castellano', ca: 'Catalán', en: 'Inglés' };

/**
 * @param {object} datos
 * @param {object|null} datos.email      meta del email elegido
 * @param {object|null} datos.landing    meta de la landing elegida
 * @param {string} datos.asunto
 * @param {object} datos.marca
 * @param {string} datos.idioma
 * @param {string} datos.preset          id del preset de dificultad
 * @param {Record<string,boolean>} datos.senales
 * @param {object[]} datos.catalogoSenales
 * @param {object[]} datos.presets
 * @param {string[]} datos.bloquesQuitados
 * @param {string} datos.cliente
 * @param {string} datos.expediente
 * @param {boolean} datos.incluirFormativa
 * @returns {string} contenido markdown
 */
export function instrucciones(datos) {
  const {
    email,
    landing,
    asunto,
    marca,
    idioma,
    preset,
    senales = {},
    catalogoSenales = [],
    presets = [],
    bloquesQuitados = [],
    cliente,
    expediente,
    incluirFormativa,
  } = datos;

  const hoy = new Date().toISOString().slice(0, 10);
  const activas = new Set(Object.entries(senales).filter(([, v]) => v).map(([id]) => id));
  const remitente = sugerirRemitente(email, marca, activas);
  const nombrePreset = presets.find((p) => p.id === preset)?.nombre ?? preset;
  const l = [];

  l.push('# Instrucciones de importación en GoPhish');
  l.push('');
  l.push('| | |');
  l.push('|---|---|');
  if (cliente) l.push(`| Cliente | ${cliente} |`);
  if (expediente) l.push(`| Expediente | ${expediente} |`);
  l.push(`| Generado | ${hoy} |`);
  l.push(`| Idioma | ${IDIOMAS[idioma] ?? idioma} |`);
  l.push(`| Calibración | ${nombrePreset} |`);
  if (email) l.push(`| Plantilla de correo | ${email.nombre} (\`${email.id}\`) |`);
  if (landing) l.push(`| Landing | ${landing.nombre} (\`${landing.id}\`) |`);
  l.push('');

  l.push('> Simulación de phishing autorizada. Antes de lanzar, confirma que el');
  l.push('> contrato, el alcance, la ventana de ejecución y el contacto de');
  l.push('> escalado están cerrados por escrito. Ver `AUTORIZACION.md`.');
  l.push('');

  l.push(...seccionSenales(catalogoSenales, senales, bloquesQuitados));

  if (email) {
    l.push('## 1. Email Template');
    l.push('');
    l.push('En GoPhish: **Email Templates → New Template**.');
    l.push('');
    l.push(`- **Name:** ${email.nombre} — ${cliente || marca.empresa || 'cliente'} — ${nombrePreset}`);
    l.push(`- **Subject:** \`${asunto}\``);
    l.push('- **Envelope Sender:** `' + remitente + '`');
    l.push('- Pestaña **HTML** → botón `<>` (Source) → pega el contenido de `email.html`.');
    l.push('- **Add Tracking Image:** déjalo **desmarcado**. La plantilla ya lleva');
    l.push('  `{{.Tracker}}` colocado donde toca; marcarlo añadiría un segundo píxel.');
    l.push('');
    l.push('Variables de GoPhish que usa esta plantilla y que se resuelven solas:');
    l.push('');
    l.push('```');
    l.push((email.variables || ['{{.FirstName}}', '{{.URL}}', '{{.Tracker}}']).join('  '));
    l.push('```');
    l.push('');
  }

  if (landing) {
    l.push(`## ${email ? 2 : 1}. Landing Page`);
    l.push('');
    l.push('En GoPhish: **Landing Pages → New Page**.');
    l.push('');
    l.push(`- **Name:** ${landing.nombre} — ${cliente || marca.empresa || 'cliente'}`);
    l.push('- Botón `<>` (Source) → pega el contenido de `landing.html`.');
    l.push('');
    l.push('### Casillas de captura');
    l.push('');
    if (landing.captura === 'credenciales') {
      l.push('| Casilla | Recomendado | Por qué |');
      l.push('|---|---|---|');
      l.push('| Capture Submitted Data | **Marcada** | Sin esto no sabrás quién llegó a enviar el formulario. |');
      l.push('| Capture Passwords | **Desmarcada** | Registra el evento y el usuario, pero descarta la contraseña antes de guardarla. Tienes la métrica completa sin custodiar credenciales reales del cliente. |');
      l.push('');
      l.push('Márcala solo si el contrato lo exige de forma expresa, y purga los');
      l.push('resultados al entregar el informe.');
      l.push('');
      l.push('El formulario nombra los campos `email` y `password` exactamente así,');
      l.push('que es como GoPhish identifica la contraseña. Si renombras esos campos');
      l.push('al editar la landing, *Capture Passwords* deja de reconocerla y la');
      l.push('contraseña se guardará aunque tengas la casilla desmarcada.');
    } else {
      l.push('| Casilla | Recomendado |');
      l.push('|---|---|');
      l.push('| Capture Submitted Data | **Marcada** |');
      l.push('| Capture Passwords | **Desmarcada** (no hay campo de contraseña) |');
    }
    l.push('');
    if (incluirFormativa) {
      l.push('- **Redirect to:** la URL donde publiques `formativa.html`.');
      l.push('  Es la página que explica al empleado que era un simulacro. Sin ella');
      l.push('  la campaña mide pero no enseña.');
    } else {
      l.push('- **Redirect to:** la URL de la página formativa que uses habitualmente.');
    }
    l.push('');
  }

  l.push('## Comprobaciones antes de lanzar');
  l.push('');
  l.push('- [ ] Envío de prueba a tu propio buzón (**Send Test Email**).');
  l.push('- [ ] El botón del correo lleva a la landing, no a `#`.');
  l.push('- [ ] La landing se ve correctamente en móvil.');
  l.push('- [ ] El logo del cliente se muestra en ambos (va incrustado, no enlazado).');
  l.push('- [ ] Casillas de captura como indica la tabla de arriba.');
  l.push('- [ ] *Redirect to* apunta a la página formativa.');
  l.push('- [ ] El reverse proxy delante de GoPhish **no** registra cuerpos de');
  l.push('      petición: la contraseña viaja en el POST aunque no se almacene.');
  l.push('- [ ] Ventana de ejecución y contacto de escalado confirmados con el cliente.');
  l.push('');

  return l.join('\n');
}

/**
 * Tabla de señales de la campaña.
 *
 * Es la sección que convierte el ZIP en algo que sirve para el informe. Sin
 * ella el resultado de una campaña es un porcentaje suelto; con ella se puede
 * decir "el 34% no miró el dominio del remitente", que es lo que el cliente
 * puede convertir en formación.
 */
function seccionSenales(catalogo, senales, bloquesQuitados) {
  if (!catalogo.length) return [];

  const { encendidas, apagadas } = describir(catalogo, senales);
  const l = [];

  l.push('## Señales que lleva esta campaña');
  l.push('');
  l.push('| Señal | Estado | Qué mide |');
  l.push('|---|---|---|');
  for (const s of catalogo) {
    const activa = Boolean(senales[s.id]);
    l.push(`| ${s.nombre} | ${activa ? '**Presente**' : 'Ausente'} | ${s.queEnsena} |`);
  }
  l.push('');

  if (encendidas.length) {
    l.push('Al analizar los resultados, quien haya picado ha dejado pasar estas');
    l.push(`${encendidas.length === 1 ? 'señal' : `${encendidas.length} señales`}: ` +
      encendidas.map((s) => `**${s.nombre.toLowerCase()}**`).join(', ') + '.');
  } else {
    l.push('No hay ninguna señal evidente: este correo mide la exposición real de la');
    l.push('organización, no la capacidad de detectar pistas. Avisa al SOC antes de lanzarlo.');
  }
  l.push('');

  if (apagadas.length && encendidas.length) {
    l.push('Las ausentes no se han medido en esta campaña. Para medir una en concreto,');
    l.push('repite con el preset difícil y enciende solo esa.');
    l.push('');
  }

  if (bloquesQuitados.length) {
    l.push(`Bloques retirados de las plantillas: \`${[...new Set(bloquesQuitados)].join('`, `')}\`.`);
    l.push('');
  }

  return l;
}

/** Checklist de autorización que viaja en el ZIP. */
export function autorizacion({ cliente, expediente }) {
  const hoy = new Date().toISOString().slice(0, 10);
  return `# Autorización de la simulación

| | |
|---|---|
| Cliente | ${cliente || '(rellenar)'} |
| Expediente | ${expediente || '(rellenar)'} |
| Paquete generado | ${hoy} |

Este material es para una simulación de phishing **autorizada por contrato**.
No se lanza nada hasta que estas seis casillas estén marcadas.

- [ ] Contrato o adenda firmada que cubre expresamente la simulación de phishing.
- [ ] Alcance cerrado: dominios, número de destinatarios y departamentos incluidos.
- [ ] Ventana de ejecución acordada por escrito (fechas y franja horaria).
- [ ] Contacto de escalado del cliente, localizable durante toda la ventana.
- [ ] SOC o proveedor de seguridad avisado, para no generar un incidente real.
- [ ] Tratamiento de datos acordado: qué se captura, dónde se guarda y cuándo se borra.

## Al cerrar la campaña

- [ ] Resultados exportados para el informe.
- [ ] Datos de destinatarios y credenciales purgados de GoPhish.
- [ ] Landing retirada del servidor público.
- [ ] Página formativa comunicada a todo el personal incluido en el alcance.
`;
}
