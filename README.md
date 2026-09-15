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
npm test             # 259 pruebas, sin dependencias
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
index.html                 Shell de la aplicación
assets/css/                Estilos, sin CDN
assets/js/core/            engine · senales · catalog · componer · brand · zip · gophish · importar · estado
assets/js/ui/              router · biblioteca · detalle · campana · importar · editor · marca · senales · fields · preview · dom
templates/senales.json     Las seis señales
templates/presets.json     facil / medio / dificil como combinaciones de señales
templates/index.json       Índice del catálogo
templates/layouts/         Layouts compartidos (aviso, login)
templates/emails/<id>/     meta.json + copy/{es,ca,en}.json  (+ layout.html propio si no comparte)
templates/landings/<id>/   Igual
templates/propias/         Importadas y variantes propias. Fuera de git.
catalogo/                  Ficheros de alta de plantillas para tools/nueva-plantilla.js
tests/                     259 pruebas (node --test)
tools/servidor.js          Servidor local + API de importación
tools/eml.js               Parser de .eml sin dependencias
tools/sanear.js            Saneado del HTML importado
tools/lint.js              Linter del catálogo
tools/nueva-plantilla.js   Alta de plantillas desde un JSON
tools/build-demo.js        Generador de la demo pública
tools/migrar-v2.js         Migración de plantillas v1 a v2
docs/                      GOPHISH.md · PLANTILLAS.md
```

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
