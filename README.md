# PhishLab

Generador de plantillas de correo y landing para **simulaciones de phishing
autorizadas por contrato**, con exportación lista para GoPhish.

Eliges una plantilla, pones la marca del cliente, ajustas el idioma y el nivel
de dificultad, y te llevas un ZIP con el HTML del correo, el de la landing, la
página formativa y las instrucciones de importación en GoPhish.

No envía nada ni ejecuta campañas: eso lo sigue haciendo GoPhish.

---

## Uso previsto

Herramienta interna de un equipo de ciberseguridad para preparar ejercicios de
concienciación contratados por el cliente. Cada paquete que se genera incluye
un `AUTORIZACION.md` con el checklist previo: contrato firmado, alcance,
ventana de ejecución, contacto de escalado, aviso al SOC y acuerdo de
tratamiento de datos.

**No la publiques en internet.** No guarda nada sensible, pero es un generador
de material de phishing con la marca de tus clientes dentro.

**No la alojes en el mismo host que sirve las landings de campaña.** Ese host
lo visita gente ajena a tu organización.

---

## Arrancar

**Doble clic en `abrir-phishlab.bat`.** Arranca el servidor local y abre el
navegador. Deja la ventana negra abierta mientras lo uses; ciérrala para parar.

Usa Python si está instalado y Node si no; con cualquiera de los dos basta.
Para cambiar de puerto: `abrir-phishlab.bat 8081`.

A mano, si lo prefieres:

```bash
python -m http.server 8080 --bind 127.0.0.1
# o
node tools/servidor.js 8080
```

**Abrir `index.html` con doble clic no funciona.** El navegador bloquea los
módulos ES y la carga de plantillas bajo `file://`, así que la página saldría
en blanco. Tiene que servirse por HTTP, aunque sea en localhost.

Para el equipo, copia la carpeta a un nginx o IIS interno; no hay build ni
dependencias que instalar.

Node hace falta solo para desarrollar:

```bash
npm test     # pruebas del motor de plantillas
npm run lint # revisión del catálogo
```

---

## Cómo funciona

Dos espacios de nombres conviven en el HTML de cada plantilla:

| Variable | Quién la resuelve |
|---|---|
| `{{empresa}}`, `{{importe}}`, `{{saludo}}`… | PhishLab, al exportar |
| `{{.FirstName}}`, `{{.URL}}`, `{{.Tracker}}` | **GoPhish**, en el momento del envío |

El motor sustituye las primeras y deja las segundas literales. Confundirlas es
el fallo caro: una plantilla exportada con `{{.URL}}` ya resuelto manda al
destinatario a ninguna parte, y no te enteras hasta haber lanzado la campaña
entera. Hay pruebas que lo blindan (`tests/engine.test.js`).

El interruptor **«datos de ejemplo»** de la vista previa sí sustituye las de
GoPhish (`{{.FirstName}}` → *María*) para que leas el correo como lo verá la
víctima. La exportación nunca lo hace.

---

## Captura de credenciales

Las landings de login llevan un formulario estándar, sin lógica en cliente:

```html
<form method="post" action="">
  <input name="email" ...>
  <input name="password" ...>
</form>
```

Quién decide qué se guarda es GoPhish, con sus casillas *Capture Submitted
Data* y *Capture Passwords*. Recomendación por defecto: la primera marcada y la
segunda **desmarcada** — registras quién envió el formulario y el usuario, pero
la contraseña se descarta antes de escribirla en la base de datos.

**Los campos se llaman `email` y `password` exactamente así porque es como
GoPhish identifica la contraseña.** Si renombras esos campos al editar una
landing, *Capture Passwords* deja de reconocerla y la contraseña se guarda
aunque tengas la casilla desmarcada. El linter comprueba esto en cada plantilla.

Aunque no se almacene, la contraseña **sí viaja** en el cuerpo del POST hasta tu
servidor de GoPhish. Asegúrate de que el reverse proxy que tengas delante no
registra cuerpos de petición, y purga los resultados al entregar el informe.

---

## Estructura

```
index.html              Dashboard
assets/css/             Estilos, sin CDN
assets/js/core/         engine · catalog · brand · zip · gophish
assets/js/ui/           fields · preview
templates/index.json    Índice del catálogo
templates/emails/       Una carpeta por plantilla: meta.json + es/ca/en.html
templates/landings/     Igual
tests/                  Pruebas del motor (node --test)
tools/lint.js           Linter del catálogo
tools/servidor.js       Servidor estático de respaldo (si no hay Python)
abrir-phishlab.bat      Lanzador de doble clic
docs/                   GOPHISH.md · PLANTILLAS.md
```

Todo lo que hay en `templates/` son datos: añadir una plantilla no toca ni una
línea del dashboard. Ver `docs/PLANTILLAS.md`.

---

## Catálogo actual

**Correos** — `tarjeta-regalo-antiguedad`, `m365-caducidad-password`,
`rrhh-nomina`.

**Landings** — `microsoft-login`, `canjeo-tarjeta-regalo`, `pagina-formativa`.

Los tres idiomas (castellano, catalán, inglés) y los tres niveles de dificultad
(fácil, medio, difícil) están escritos a mano, no traducidos automáticamente.

El nivel de dificultad no cambia de plantilla: recalibra la misma. En **fácil**
el saludo es genérico, la urgencia agresiva, el dominio del remitente
visiblemente ajeno y hay erratas. En **difícil** la personalización es completa,
no hay errores y el pretexto es coherente. Así podéis comparar resultados de un
año contra otro sobre la misma base.
