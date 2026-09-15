# PhishLab

Biblioteca de plantillas de correo y landing para **simulaciones de phishing
autorizadas por contrato**, con exportación lista para GoPhish.

Eliges una plantilla, pones la marca del cliente, ajustas idioma y señales, y te
llevas un ZIP con el HTML del correo, el de la landing, la página formativa y
las instrucciones de importación en GoPhish.

No envía nada ni ejecuta campañas: eso lo sigue haciendo GoPhish.

---

## Uso previsto

Herramienta interna de un equipo de ciberseguridad para preparar ejercicios de
concienciación contratados por el cliente. Cada paquete que se genera incluye un
`AUTORIZACION.md` con el checklist previo: contrato firmado, alcance, ventana de
ejecución, contacto de escalado, aviso al SOC y acuerdo de tratamiento de datos.

**No publiques la herramienta completa en internet.** No guarda nada sensible,
pero genera material de phishing con la marca de tus clientes dentro. Para
enseñarla hay una demo pública aparte, con marcas inventadas y sin exportación:
ver «La demo pública» más abajo.

**No la alojes en el mismo host que sirve las landings de campaña.** Ese host lo
visita gente ajena a tu organización.

---

## Arrancar

**Doble clic en `abrir-phishlab.bat`.** Arranca el servidor local y abre el
navegador. Deja la ventana negra abierta mientras lo uses; ciérrala para parar.
Para cambiar de puerto: `abrir-phishlab.bat 8081`.

A mano:

```bash
npm run dev          # node tools/servidor.js 8080
```

**Abrir `index.html` con doble clic no funciona.** El navegador bloquea los
módulos ES y la carga de plantillas bajo `file://`, así que la página saldría en
blanco. Tiene que servirse por HTTP, aunque sea en localhost.

Node hace falta para el servidor local. Sin él (por ejemplo con
`python -m http.server`) la biblioteca se ve, se compone y se exporta igual,
pero **no se puede importar un `.eml` ni guardar plantillas propias**: eso lo
hace la API local. La aplicación lo detecta al arrancar y lo dice en la barra.

Para desarrollar:

```bash
npm test             # 339 pruebas, sin dependencias
npm run lint         # revisión del catálogo
npm run build:demo   # genera la demo pública en demo/
```

No hay build ni `node_modules`: la aplicación son módulos ES que el navegador
carga tal cual.

---

## Cómo funciona

### Los dos espacios de nombres

Conviven en el HTML de cada plantilla:

| Variable | Quién la resuelve |
|---|---|
| `{{empresa}}`, `{{importe}}`, `{{saludo}}`… | PhishLab, al exportar |
| `{{.FirstName}}`, `{{.URL}}`, `{{.Tracker}}` | **GoPhish**, en el momento del envío |

El motor sustituye las primeras y deja las segundas literales. Confundirlas es
el fallo caro: una plantilla exportada con `{{.URL}}` ya resuelto manda al
destinatario a ninguna parte, y no te enteras hasta haber lanzado la campaña
entera. Hay pruebas que lo blindan.

El interruptor **«datos de ejemplo»** de la vista previa sí sustituye las de
GoPhish (`{{.FirstName}}` → *María*) para que leas el correo como lo verá la
víctima. La exportación nunca lo hace.

### Señales, no niveles

La dificultad no es un botón de tres posiciones: es la combinación de pistas que
se dejan puestas. Hay seis señales independientes:

| Señal | Qué mide |
|---|---|
| `urgencia` | Presión temporal y amenaza de consecuencia |
| `erratas` | Faltas de ortografía y acentos ausentes |
| `saludo-generico` | «Estimado usuario» en vez del nombre |
| `dominio-ajeno` | Remitente en un dominio visiblemente distinto |
| `enlace-visible` | La URL cruda a la vista, sin coincidir con el texto |
| `incoherencia-marca` | Logo, tono o firma que no cuadran |

`facil`, `medio` y `dificil` son **presets** de esas señales, definidos en
`templates/presets.json`. Puedes partir de uno y encender o apagar señales
sueltas.

Esto es lo que cambia el informe que entregas: en vez de «picó el 31%», puedes
decir «el 31% no miró el dominio del remitente, y de esos, la mitad tampoco
notó la urgencia». La tabla de señales de la campaña va dentro del
`INSTRUCCIONES.md` de cada ZIP.

### Bloques

El layout de cada plantilla está anotado con comentarios:

```html
<!--@bloque:urgencia @senal:urgencia @opcional-->
<tr><td class="aviso">{{urgencia}}</td></tr>
<!--@/bloque-->
```

Un bloque se enciende o se apaga desde el panel, o lo gobierna una señal. El
motor los poda **antes** de sustituir variables, y los marcadores nunca salen en
el HTML exportado: un `<!--@bloque:urgencia-->` en el código fuente de un correo
es la clase de rastro que delata que el mensaje es material de simulación.

Un bloque puede depender de que una señal esté **apagada**, con `!` delante. El
pie legal completo es justo lo que un phishing no se molesta en copiar, así que
vive con `@senal:!incoherencia-marca`.

---

## Importar material real

`Importar` convierte un correo real en plantilla. Dos entradas: un `.eml`
exportado de Outlook o de la cuarentena, y HTML pegado a mano.

Las dos pasan por el mismo saneado, que:

- Quita scripts, `<iframe>` y manejadores `onclick`.
- **Corta las imágenes remotas**, incluidos los píxeles de seguimiento del
  remitente original. Si se quedaran, cada empleado que abriese tu simulación se
  lo estaría notificando a un tercero.
- Incrusta en base64 las imágenes que venían adjuntas.
- Reescribe los enlaces a `{{.URL}}` e inserta `{{.Tracker}}`.

Antes de guardar nada se enseña el informe de lo que se ha tocado. La **nota de
autorización es obligatoria**: el linter no deja pasar una plantilla importada
sin ella.

Lo importado se guarda en `templates/propias/`, que está fuera de git: lleva
dentro material de un encargo concreto.

### Clonar una web entera (pestaña "Web")

La misma pantalla de Importar tiene una segunda pestaña para convertir una
página real —típicamente un login— en landing, con dos formas de traerla:

- **Marcador Ctrl+S.** Lo arrastras a la barra de marcadores una vez; en la
  web real, ya cargada y logueada si hace falta, lo pulsas o usas Ctrl+S en
  cualquier momento — sirve incluso para una pantalla que solo aparece tras
  interactuar con la página, como el segundo paso de un login. Copia la
  página al portapapeles (no manda nada por red: un intento anterior posteaba
  directo al servidor local, pero Chrome bloquea ese salto de una web pública
  a una dirección local salvo permiso explícito del navegador — ver
  `SECURITY.md`), así que el último paso es volver a esta pestaña y pegarlo.
  Es la opción con más fidelidad: captura la página tal como la renderizó el
  navegador, JavaScript incluido.
- **Pegar una URL.** El servidor local hace el fetch él mismo. Más simple,
  pero no sirve para logins que se pintan por JavaScript.
- **Extensión de captura (recomendado si la tienes instalada).** Vive en
  `extension/`, se carga como extensión descomprimida
  (`chrome://extensions` → Modo desarrollador → Cargar descomprimida). A
  diferencia del marcador, manda la captura directa al servidor local — sin
  copiar ni pegar — porque una extensión instalada sí puede pedir permiso de
  host para `127.0.0.1` en su instalación, el permiso que una web pública no
  puede obtener (ver `SECURITY.md`). También soporta capturar varios pasos de
  un login antes de enviarlos juntos, y su incrustado de recursos es más fiel
  que el del servidor: corre con las cookies de la propia pestaña y sin las
  restricciones de CORS de un fetch normal. Requiere emparejarse una vez
  pegando en el popup de la extensión el código que se genera desde esta
  misma pantalla. El popup también tiene un botón "Capturar flujo
  automático": rellena con datos genéricos (`test@dominio.com` /
  `Test1234!`) cualquier campo de email/contraseña que detecte, envía el
  formulario y repite — para no ir pulsando "Capturar paso" a mano en cada
  pantalla de un login de varios pasos. Cuando llegan varios pasos capturados
  a la vez, la revisión marca cuál trae el campo de contraseña detectado
  como el recomendado para exportar: GoPhish solo admite una página por
  landing, así que el resto quedan solo de referencia.

Las tres pasan por `tools/sanearWeb.js`, que se parece al saneado de correo en
lo esencial (fuera scripts y manejadores, enlaces a `{{.URL}}`) pero difiere en
las imágenes: en vez de cortarlas, **intenta incrustarlas** como data URI —son
el logo y el fondo de la propia página que se clona, no un píxel de un
tercero— y lo que no consigue leer lo deja dicho en el informe, marcado para
corregir a mano, nunca en silencio. También detecta por heurística los campos
de email y contraseña del formulario y los renombra a `email`/`password`
exactamente así, con un nivel de confianza (alta/baja/no detectado) que se
enseña antes de guardar: el linter no deja pasar una landing de credenciales
si esos dos campos no están.

Los logins de varios pasos (Google, Microsoft) quedan fuera de una sola
captura: cada Ctrl+S trae una pantalla, y combinar dos capturas en una misma
landing es trabajo manual en el editor en vivo después.

---

## Editor en vivo

Cada plantilla se edita directamente sobre su propia preview, sin una lista de
campos aparte: el texto y las imágenes que se ven en el workspace son
clicables. Un clic vuelve editable ese texto; al salir del campo, el cambio se
ve al momento en la misma preview.

Por debajo hay dos rutas distintas según de qué texto se trate:

- **Fragmento de copy** (`{{entradilla}}`, `{{saludo}}`...): el cambio se
  escribe en la variante de la señal que estuviera activa en ese momento — si
  editas con "urgencia" encendida, cambias esa variante, no la de "difícil".
  El resto de variantes y del sistema de señales sigue intacto debajo.
- **Cualquier otro texto o imagen** (una etiqueta escrita a mano en el layout,
  o el cuerpo entero de una plantilla importada/clonada): el cambio se guarda
  como un parche literal sobre esa plantilla, sin pasar por el sistema de
  variantes.

Editar así **no modifica la plantilla de fábrica**: es un borrador de sesión,
igual que siempre. Para conservarlo hace falta "Guardar como plantilla
propia", que aparece en cuanto tocas algo. Si el cambio incluye texto o
imágenes sueltas (no solo fragmentos de copy), la plantilla guardada queda con
el idioma y la marca de ese momento fijados — deja de recomponerse con otra
marca o preset, porque ya no hay forma de deshacer un texto suelto de vuelta a
una variable.

---

## Captura de credenciales

Las landings de login llevan un formulario estándar, sin lógica en cliente:

```html
<form method="post" action="">
  <input name="email" ...>
  <input name="password" ...>
</form>
```

Quién decide qué se guarda es GoPhish, con sus casillas *Capture Submitted Data*
y *Capture Passwords*. Recomendación por defecto: la primera marcada y la segunda
**desmarcada** — registras quién envió el formulario y el usuario, pero la
contraseña se descarta antes de escribirla en la base de datos.

**Los campos se llaman `email` y `password` exactamente así porque es como
GoPhish identifica la contraseña.** Si los renombras al editar una landing,
*Capture Passwords* deja de reconocerla y la contraseña se guarda aunque tengas
la casilla desmarcada. El linter lo comprueba en cada plantilla.

Aunque no se almacene, la contraseña **sí viaja** en el cuerpo del POST hasta tu
servidor de GoPhish. Asegúrate de que el reverse proxy que tengas delante no
registra cuerpos de petición, y purga los resultados al entregar el informe.

---

## La demo pública

`npm run build:demo` genera en `demo/` un estático publicable:

- Solo entran las plantillas marcadas `"demo": true`.
- Todas las marcas son inventadas. **El linter falla si una plantilla marcada
  para la demo menciona una marca real**, y el generador se niega a escribir
  nada si la comprobación no pasa.
- La exportación y la importación están desactivadas, y los formularios de
  credenciales no envían a ninguna parte.

Es lo que se puede enseñar en un portfolio sin publicar un kit de phishing
alojado. La herramienta completa se queda en local.

---

## Estructura

```
index.html                 Shell de la aplicación (nav: Biblioteca · Importar)
assets/css/                Estilos, sin CDN
assets/js/core/            engine · senales · catalog · componer · edicionInline · brand · zip · gophish · importar · estado
assets/js/ui/              router · biblioteca · detalle · exportar · editorEnVivo · importar · importarWeb · marca · fields · dom
assets/js/bookmarklet/     capturar.js — fuente del marcador Ctrl+S de clonado
templates/senales.json     Las seis señales
templates/presets.json     facil / medio / dificil como combinaciones de señales
templates/index.json       Índice del catálogo
templates/layouts/         Layouts compartidos (aviso, login)
templates/emails/<id>/     meta.json + copy/{es,ca,en}.json  (+ layout.html propio si no comparte)
templates/landings/<id>/   Igual
templates/propias/         Importadas, clonadas y variantes propias. Fuera de git.
catalogo/                  Ficheros de alta de plantillas para tools/nueva-plantilla.js
tests/                     346 pruebas (node --test)
extension/                 Extensión de captura MV3 (sustituye al marcador para clonar webs)
tools/servidor.js          Servidor local + API de importación y clonado
tools/eml.js               Parser de .eml sin dependencias
tools/sanear.js            Saneado del HTML importado
tools/sanearWeb.js         Saneado de una web clonada entera (incrusta recursos, detecta login)
tools/lint.js              Linter del catálogo
tools/nueva-plantilla.js   Alta de plantillas desde un JSON
tools/build-demo.js        Generador de la demo pública
tools/migrar-v2.js         Migración de plantillas v1 a v2
docs/                      GOPHISH.md · PLANTILLAS.md
docs/superpowers/specs/    Specs de diseño (v2: modelo de datos · v3: workspace, editor en vivo, clonado)
```

La app tiene dos secciones en el nav: **Biblioteca** (portada — explorar, calibrar,
editar en vivo y exportar cada plantilla desde un único workspace) e **Importar**
(traer material real, en correo o en web entera). Montar una campaña ya no es una
pantalla aparte: se hace desde la pestaña "Exportar" del workspace de la propia
plantilla.

Todo lo que hay en `templates/` son datos: añadir una plantilla no toca ni una
línea de la aplicación. Ver `docs/PLANTILLAS.md`.

---

## Catálogo actual

22 plantillas (11 correos + 11 landings), todas de marca real salvo la página
formativa, las tres en castellano, catalán e inglés.

**Correos** — Adobe (documento para firmar), DHL (paquete en aduana), DocuSign
(documento por firmar), Dropbox (documento compartido), GitHub (nuevo inicio de
sesión), Google (verificación de actividad), Jira (restablecer contraseña),
LinkedIn (mensaje pendiente), Microsoft 365 (caducidad de contraseña), Netflix
(problema de pago), PayPal (actividad sospechosa).

**Landings** — la misma marca, en login o verificación: Adobe, DocuSign,
Dropbox, GitHub, Google, Jira (vía Atlassian), LinkedIn, Microsoft, Netflix,
PayPal.

**Formación** — página formativa post-clic, sin marca.

El logo de cada marca vive en `assets/img/marcas/` (SVG real, descargado de
fuentes libres de derechos — ver `SECURITY.md`). `{{logoHtml}}` sigue siendo
aparte: es el logo del **cliente** (tenant), que se sube al montar la campaña,
no el de la marca suplantada.
