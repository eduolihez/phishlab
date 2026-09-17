# Uso responsable y seguridad

PhishLab genera material de phishing. Este documento no es papeleo: define qué
se puede hacer con él y qué controles lleva dentro.

---

## Para qué es

Preparar el material de **simulaciones de phishing autorizadas por contrato**,
dentro de ejercicios de concienciación contratados por el cliente.

Cada paquete que genera la herramienta incluye un `AUTORIZACION.md` con el
checklist previo, que no es opcional:

- Contrato o adenda firmada que cubre expresamente la simulación.
- Alcance cerrado: dominios, número de destinatarios y departamentos.
- Ventana de ejecución acordada por escrito.
- Contacto de escalado del cliente, localizable durante toda la ventana.
- SOC o proveedor de seguridad avisado, para no generar un incidente real.
- Tratamiento de datos acordado: qué se captura, dónde se guarda y cuándo se
  borra.

## Para qué no es

Cualquier envío a destinatarios que no estén cubiertos por una autorización
escrita. La herramienta no envía correos por diseño: solo produce HTML que
alguien tiene que importar en GoPhish y lanzar deliberadamente.

---

## Controles que lleva dentro

**La contraseña no se guarda por defecto.** Las instrucciones de cada paquete
recomiendan *Capture Submitted Data* marcada y *Capture Passwords* desmarcada:
registras quién envió el formulario y con qué usuario, pero la contraseña se
descarta antes de escribirla en la base de datos.

**Los campos se llaman `email` y `password` exactamente así.** Es como GoPhish
identifica la contraseña para poder descartarla. Si se renombran al editar una
landing, *Capture Passwords* deja de reconocerla y **la contraseña se guarda
aunque la casilla esté desmarcada**. El linter lo comprueba en cada plantilla
con captura de credenciales.

**La contraseña viaja igualmente en el POST** hasta el servidor de GoPhish,
aunque no se almacene. El reverse proxy que haya delante no debe registrar
cuerpos de petición.

**El material importado se sanea.** Al clonar un correo real se cortan las
imágenes remotas, incluidos los píxeles de seguimiento del remitente original:
si se quedaran, cada empleado que abriese la simulación se lo estaría
notificando a un tercero. Se enseña un informe de todo lo tocado antes de
guardar, y la nota de autorización de la plantilla es obligatoria.

**Ni el cliente ni el expediente entran en el correo.** Se estampan solo en el
`INSTRUCCIONES.md` del ZIP: dentro del HTML serían una pista para cualquiera que
mirase el código fuente.

---

## El marcador de clonado no habla con el servidor

El servidor local rechaza cualquier petición a `/api/*` cuyo `Origin` no sea
local — así una pestaña abierta en cualquier otra web no puede hablar con él
mientras lo tienes arrancado, sin excepciones.

La primera versión del marcador Ctrl+S rompía esa regla a propósito: posteaba
la captura directamente desde la pestaña de la web real hacia el servidor
local, protegido por un token en vez de por el origen. Se descartó al
probarlo: Chrome trata ese salto (web pública → dirección local) como acceso a
la red local, un permiso de navegador aparte del CORS normal que no se puede
conceder solo desde el servidor — en la práctica, la petición se bloqueaba con
un fallo de red genérico sin relación con el token ni con el origen.

El marcador ahora **copia la página al portapapeles** en vez de mandarla por
red. No cruza ningún límite de origen ni de red: es una acción local a la
pestaña, iniciada por un clic o un Ctrl+S del usuario. Volver a la pestaña de
PhishLab y pegar el resultado en Importar → Web es un paso más, pero
funciona siempre y no depende de una política del navegador que puede volver
a cambiar. Toda la API sigue exigiendo origen local sin ninguna excepción.

---

## El autopiloto de la extensión hace intentos de login reales

"Capturar flujo automático" (`extension/background.js`, `extension/avanzar.js`)
rellena con datos inventados (`test@dominio.com` / `Test1234!`) cualquier
campo de email/contraseña que encuentre y **envía el formulario**, para poder
avanzar a la siguiente pantalla de un login de varios pasos (Google,
Microsoft...) sin ir pulsando "Capturar paso" a mano en cada una. Es
imprescindible para clonar ese segundo paso con fidelidad, pero implica hacer
peticiones de login reales, con credenciales falsas, contra sistemas de
producción de terceros — no scraping pasivo.

Consecuencias a tener en cuenta si se usa con frecuencia desde la misma IP:

- Puede disparar heurísticas antifraude/antibot del proveedor (CAPTCHA,
  bloqueo temporal, marcado de la IP como sospechosa).
- Es tráfico de automatización contra el login de un tercero, con lo que
  eso implica para sus términos de servicio, aunque el propósito sea
  defensivo y las credenciales sean inventadas.

El autopiloto se detiene solo en cuanto la pantalla capturada ya trae un
campo de contraseña visible — esa es la última captura útil, así que nunca
llega a rellenar ni enviar una contraseña de verdad ni de mentira en esa
pantalla. Si el volumen de capturas lo justifica, prefiere "Capturar paso" a
mano sobre el autopiloto para no generar tráfico de login repetido innecesario.

---

## Quishing (QR): por qué no está

Se evaluó y se descartó a propósito (2026-09-14,
`docs/superpowers/specs/2026-09-10-phishlab-biblioteca-design.md`). Un
código QR solo enseña algo si codifica la URL final con tracking, y esa URL
la resuelve GoPhish en el momento del envío — PhishLab no la conoce en
tiempo de composición. Un QR generado aquí codificaría una URL de mentira: no
sería una señal real que el empleado pudiera aprender a detectar, sino una
falsa. Si algún día GoPhish expone la URL final antes de enviar, esto se
puede reabrir.

---

## Qué no sale de la máquina

`templates/propias/` está en `.gitignore`. Ahí viven las plantillas importadas y
las variantes editadas, que llevan dentro marca y pretextos de un encargo
concreto.

## Logos de marca real en el catálogo

Desde la ampliación de septiembre de 2026 el catálogo dejó de ser genérico:
cada plantilla lleva el logo real de la marca que suplanta (Adobe, DHL,
DocuSign, Dropbox, GitHub, Google, Jira, LinkedIn, Microsoft, Netflix,
PayPal, y las incorporadas después: Amazon, Apple/iCloud, Spotify, Instagram,
BBVA, Bizum, Agencia Tributaria, Seguridad Social, Movistar, Endesa, Correos,
Fortinet), como `<svg>` inline dentro del propio `layout.html` de cada
plantilla — nunca cargado desde el dominio real. Es una decisión deliberada:
un login clonado con el logo de verdad se acerca mucho más a lo que un
empleado recibe en un ataque real que una recreación con CSS.

`assets/img/marcas/*.svg` guarda el logo de las marcas que ya lo tenían así
como fuente de referencia (de ahí sale el `<svg>` que se incrusta en cada
plantilla), pero **no es lo que el navegador carga**: ninguna plantilla lo
referencia por URL, así que editar solo ese fichero no cambia nada hasta que
se vuelve a incrustar a mano en el `layout.html` correspondiente. Los logos
de las marcas incorporadas después van incrustados directamente, sin pasar
por esa carpeta.

Los logos vienen de Wikimedia Commons (logos corporativos de dominio
informativo/baja complejidad) y de Simple Icons (CC0). Ninguno se sirve desde
el dominio de la marca ni hace ninguna petición de red al abrir la plantilla.

Esto es distinto de `{{logoHtml}}`: ese sigue siendo el logo del **cliente**
(tenant), el que se sube al montar cada campaña — nunca el de la marca
suplantada, que ya viene fijo en la plantilla.

**Implicación para la demo pública:** todas las plantillas de marca real
tienen `"demo": false` a propósito — no pueden aparecer en el estático que
genera `npm run build:demo`, porque eso publicaría un generador de páginas de
login de Google/PayPal/Microsoft funcional en un dominio público (ver más
abajo). La demo pública ha quedado casi vacía tras esta ampliación; si se
quiere seguir enseñando la herramienta en el portfolio hace falta retomar un
catálogo `demo:true` con marcas inventadas, separado de este.

---

## La demo pública

`npm run build:demo` produce un estático publicable con dos condiciones:

- Solo entran plantillas marcadas `"demo": true`, todas con marcas inventadas.
- La exportación y la importación están desactivadas, y los formularios de
  credenciales no envían a ninguna parte.

La comprobación de marcas está **por duplicado**: en el linter y en el propio
generador, que se niega a escribir si no pasa. El linter se puede olvidar de
ejecutar; el generador corre justo en el momento en el que un descuido pasaría a
estar publicado.

**No publiques la herramienta completa en internet**, y no la alojes en el mismo
host que sirve las landings de campaña: ese host lo visita gente ajena a la
organización.

---

## Reportar un problema

Si encuentras un fallo de seguridad en la herramienta —algo que permita que
material salga donde no debe, o que una contraseña se guarde cuando no debería—
escribe a **eduardo@eduolihez.com** en lugar de abrir una issue.
