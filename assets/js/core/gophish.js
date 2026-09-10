/**
 * Traducción de una campaña de PhishLab al lenguaje de GoPhish.
 *
 * Genera el INSTRUCCIONES.md que acompaña al ZIP: qué pegar en cada
 * pantalla de GoPhish y, sobre todo, cómo dejar las casillas de captura.
 * Ese fichero es también el único sitio donde se estampa el cliente y el
 * expediente: dentro del email o de la landing sería una pista para
 * cualquiera que mirase el código fuente.
 */

const NIVELES = { facil: 'Fácil', medio: 'Medio', dificil: 'Difícil' };
const IDIOMAS = { es: 'Castellano', ca: 'Catalán', en: 'Inglés' };

/**
 * @param {object} datos
 * @param {object|null} datos.email      meta del email elegido
 * @param {object|null} datos.landing    meta de la landing elegida
 * @param {string} datos.asunto
 * @param {object} datos.marca
 * @param {string} datos.idioma
 * @param {string} datos.nivel
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
    nivel,
    cliente,
    expediente,
    incluirFormativa,
  } = datos;

  const hoy = new Date().toISOString().slice(0, 10);
  const remitente = sugerirRemitente(email, marca, nivel);
  const l = [];

  l.push('# Instrucciones de importación en GoPhish');
  l.push('');
  l.push('| | |');
  l.push('|---|---|');
  if (cliente) l.push(`| Cliente | ${cliente} |`);
  if (expediente) l.push(`| Expediente | ${expediente} |`);
  l.push(`| Generado | ${hoy} |`);
  l.push(`| Idioma | ${IDIOMAS[idioma] ?? idioma} |`);
  l.push(`| Dificultad | ${NIVELES[nivel] ?? nivel} |`);
  if (email) l.push(`| Plantilla de correo | ${email.nombre} (\`${email.id}\`) |`);
  if (landing) l.push(`| Landing | ${landing.nombre} (\`${landing.id}\`) |`);
  l.push('');

  l.push('> Simulación de phishing autorizada. Antes de lanzar, confirma que el');
  l.push('> contrato, el alcance, la ventana de ejecución y el contacto de');
  l.push('> escalado están cerrados por escrito. Ver `AUTORIZACION.md`.');
  l.push('');

  if (email) {
    l.push('## 1. Email Template');
    l.push('');
    l.push('En GoPhish: **Email Templates → New Template**.');
    l.push('');
    l.push(`- **Name:** ${email.nombre} — ${cliente || marca.empresa || 'cliente'} — ${NIVELES[nivel]}`);
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

/** Propone un envelope sender coherente con el nivel de dificultad. */
export function sugerirRemitente(email, marca, nivel) {
  const dominio = (marca.dominio || 'ejemplo.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const buzon = email?.remitente?.buzon || 'notificaciones';
  const nombre = email?.remitente?.nombre || 'Notificaciones';

  if (nivel === 'facil') {
    // Dominio evidentemente ajeno: la pista que debe detectar el empleado.
    return `${nombre} <${buzon}@${buzon}-${dominio.split('.')[0]}.net>`;
  }
  if (nivel === 'medio') {
    // Lookalike plausible.
    const partes = dominio.split('.');
    return `${nombre} <${buzon}@${partes[0]}-${buzon}.${partes.slice(1).join('.')}>`;
  }
  // Difícil: indistinguible a simple vista.
  return `${nombre} <${buzon}@${dominio}>`;
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
