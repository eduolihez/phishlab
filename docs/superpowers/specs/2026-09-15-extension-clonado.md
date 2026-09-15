# Extensión de captura — sustituye al marcador Ctrl+S

Fecha: 2026-09-15
Estado: implementado, con una revisión sobre la marcha (ver Addendum al final)
Revisa: [2026-09-15-workspace-editor-clonado-design.md](2026-09-15-workspace-editor-clonado-design.md) (introduce el marcador Ctrl+S y `sanearWeb.js`, ver ahí el porqué del salto portapapeles → red y las limitaciones de fidelidad del resolver del servidor).

## Problema

El marcador Ctrl+S resuelve el bloqueo de Private Network Access copiando al
portapapeles en vez de mandar por red (ver `SECURITY.md`), pero eso deja tres
límites que un marcador — código que corre dentro de la pestaña de la web
real, sin privilegios propios — no puede levantar:

1. **Un paso más siempre.** Cada captura exige volver a la pestaña de
   PhishLab y pegar. En un login de varios pasos, eso es pegar una vez por
   pantalla.
2. **Fidelidad limitada en recursos.** El incrustado de imágenes/CSS/fuentes
   que no vinieron ya en el DOM corre por `tools/sanearWeb.js` en el servidor
   (para pegar-URL) o por lo que el propio navegador ya haya resuelto (para el
   marcador) — ninguno de los dos camino tiene las cookies de sesión de la
   pestaña real, así que un recurso protegido por autenticación no se
   incrusta y queda en el informe como "no incrustado".
3. **Shadow DOM cerrado o con estilos encapsulados** no sobrevive a
   `outerHTML`: el marcador captura el árbol pero pierde el CSS que solo vive
   dentro del shadow root si el navegador no lo expone en el HTML plano.

Una extensión de Chrome instalada sí puede levantar los tres: `host_permissions`
concedidos en la instalación permiten hablar con `127.0.0.1` sin que Chrome lo
trate como acceso a red local (ese es justo el permiso que la web pública no
puede obtener, documentado en `SECURITY.md`), y un `fetch` disparado desde el
service worker de la extensión no está sujeto a CORS de la misma forma que uno
disparado desde la página — puede traer un recurso cross-origin con las
cookies de la pestaña (`credentials: 'include'`) sin que el servidor de ese
recurso tenga que cooperar.

## Alcance de esta spec

Sustituir el marcador como camino principal de captura, sin tocar:

- `tools/sanearWeb.js` — se sigue usando tal cual para el saneado final; la
  extensión le ahorra trabajo entregándole recursos ya incrustados, pero no
  cambia su contrato ni su lógica de detección de campos de login.
- El paso manual de fusionar varias capturas de un login multi-paso en una
  sola landing en el editor en vivo — sigue siendo trabajo humano, ver D3.
- El marcador Ctrl+S — se mantiene como camino de reserva (Firefox, o
  cualquiera que no instale la extensión).

## Decisiones

### D1 — Arquitectura de la extensión (Manifest V3)

Vive en `extension/` en la raíz del repo, fuera de `assets/` (no es código que
sirva el servidor local, se carga en el navegador vía "cargar descomprimida").

- **Content script** (`content.js`, inyectado bajo demanda vía
  `chrome.scripting.executeScript` al pulsar "Capturar paso" en el popup, no
  en cada carga de página): serializa el DOM actual a HTML autocontenido.
  Recorre el árbol y, por cada shadow root abierto que encuentra, lo vuelca
  como `<template shadowrootmode="open">…</template>` (soporte nativo de
  Chrome para *declarative shadow DOM* — se reconstruye solo al pegar el HTML
  en cualquier navegador moderno, sin script de rehidratación). Un shadow root
  cerrado no es accesible desde ningún script de página: se anota en el
  informe igual que hoy se anota un recurso no incrustado — nunca en
  silencio. El content script NO hace fetch de nada: solo devuelve el HTML
  serializado más una lista de URLs de recursos vistos (`<img src>`,
  `<link rel=stylesheet href>`, `url(...)` en CSS, `@font-face`).
- **Service worker** (`background.js`): recibe esa lista y hace el fetch real
  de cada recurso, con las mismas cookies que la pestaña
  (`credentials: 'include'`) gracias a `host_permissions`. Cada recurso vuelve
  incrustado como `data:` URI en el HTML antes de que el paso se guarde en el
  array de la sesión de captura. Aplica los mismos topes que
  `crearResolver()` ya aplica hoy en el servidor (tamaño máximo por recurso,
  número máximo de recursos, timeout por petición) — se listan en D5.
- **Popup** (icono de la barra): estado de la sesión de captura en curso —
  "Sin capturar" / "N pasos capturados" — con tres acciones: *Capturar paso*,
  *Enviar a PhishLab*, *Descartar*. El badge del icono refleja el contador de
  pasos.
- **Página de opciones**: dos campos — código de emparejamiento, puerto del
  servidor local (por defecto 8080).

### D2 — Sesión de captura y flujo multi-paso

Cada "Capturar paso" añade `{ url, html, timestamp }` al array de la sesión en
curso, guardado en memoria del service worker (no en `chrome.storage`): la
sesión no sobrevive a un reinicio del navegador, a propósito — es tan efímera
como la propia captura, igual que hoy nadie espera que un Ctrl+S sobreviva a
cerrar la pestaña.

"Enviar a PhishLab" manda el array completo en una sola petición. El servidor
saneas cada paso por separado (D4) y devuelve N candidatos independientes — la
extensión no intenta fusionar un login de varios pasos en una sola landing.
Eso sigue siendo trabajo del editor en vivo, sin cambios: la ganancia de esta
spec es no tener que pegar manualmente paso a paso, no resolver la fusión.

### D3 — Emparejamiento

El servidor expone `POST /api/emparejar` (dentro del guardián de origen local
que ya existe: solo la propia pestaña de PhishLab puede pedirlo). Genera un
código aleatorio (ej. 8 caracteres alfanuméricos), lo persiste en `.pareado`
en la raíz del repo (nuevo, añadido a `.gitignore` junto a
`templates/propias/`) y lo devuelve para mostrarlo en Importar → Web con un
botón "Regenerar código" que invalida el anterior.

Ese código se pega una vez en la página de opciones de la extensión. Todas
las peticiones de la extensión llevan la cabecera `X-PhishLab-Pair` con ese
valor.

Esto es una capa de confianza **añadida**, no una relajación de la que ya
existe: `origenLocal()` sigue guardando exactamente lo mismo que guarda hoy
(estáticos, `/api/salud`, `/api/importar/*`, `/api/plantillas`,
`/api/clonar-*`). El nuevo namespace `/api/extension/*` no pasa por
`origenLocal()` en absoluto — un origen `chrome-extension://` no tiene
hostname local y no tiene sentido pedirle que lo finja — pasa por un guardián
distinto que solo comprueba el código. Sin código pareado, todo
`/api/extension/*` responde 401.

### D4 — Endpoints nuevos en `tools/servidor.js`

- `POST /api/emparejar` — genera/regenera el código, lo persiste, lo devuelve.
  Guardado por `origenLocal()`, como el resto de la API existente.
- `POST /api/extension/clonar-flujo` — cuerpo `{ pasos: [{ url, html }] }`.
  Guardado por el código de `.pareado`. Por cada paso llama a
  `sanearWeb(html, { urlOrigen: url, resolver: null })` — `resolver: null`
  porque los recursos ya llegan incrustados desde el service worker de la
  extensión; no hace falta que el servidor intente resolver nada más. Los
  resultados se acumulan en una cola en memoria (`pendientes`, un array
  simple a nivel de módulo — se vacía al leerla, no persiste a disco: es
  bandeja de entrada, no almacén).
- `GET /api/extension/pendientes` — guardado por `origenLocal()` (lo consume
  la propia pestaña de PhishLab, no la extensión). Devuelve la cola completa
  y la vacía.

### D5 — Límites

Los mismos topes que `crearResolver()` aplica hoy (`LIMITE_BYTES` 5MB por
recurso, `MAX_PETICIONES` 60 por página), replicados en el service worker de
la extensión antes de enviar. Se añade un tope nuevo: máximo 8 pasos por
sesión de captura — una sesión que supere eso es probablemente un error de
uso (olvidarse de "Enviar" y seguir pulsando "Capturar"), y evita que un solo
POST se acerque al límite de 25MB de cuerpo que ya tiene el servidor
(`CUERPO_MAXIMO`).

### D6 — UI (`assets/js/ui/importarWeb.js`)

El paso 1 gana una tercera zona junto al marcador y la URL: "Desde la
extensión", con el código de emparejamiento (o un botón "Generar código" si
`.pareado` no existe todavía) y un polling silencioso a
`/api/extension/pendientes` cada 3 segundos mientras esta pantalla está
visible. En cuanto llegan pasos, sustituyen el flujo de pegar y saltan
directos a una lista de revisión por paso, que alimenta el paso 2/3
(revisión/guardar) existente sin cambios en su lógica.

El marcador Ctrl+S no se retira: sigue siendo la zona de reserva para quien no
instale la extensión.

## Fuera de alcance

- Fusión automática de pasos multi-login en una sola landing.
- Firefox (Manifest V3 de Chrome; portar a Firefox sería una spec aparte).
- Persistencia de la sesión de captura entre reinicios del navegador.
- Publicación en Chrome Web Store — se instala como extensión descomprimida,
  igual que hoy se abre PhishLab con `abrir-phishlab.bat`: herramienta interna,
  no producto distribuido.

## Testing

Cobertura `node --test` para lo nuevo en `tools/servidor.js`
(`/api/emparejar`, `/api/extension/clonar-flujo`, `/api/extension/pendientes`,
incluyendo el rechazo con código ausente/incorrecto) y para el cambio de
`sanearWeb(html, { resolver: null })` si introduce alguna rama nueva. La
extensión en sí no tiene un arnés de test equivalente — se valida a mano
contra un par de logins reales multi-paso durante la implementación; esa
validación manual queda como paso explícito del plan, no implícita.

## Addendum — primera prueba real y tres correcciones

La primera prueba en un Chrome real reventó al primer "Capturar paso" con
`Session storage quota bytes exceeded`. La causa no era un caso límite: D2
proponía `chrome.storage.session` para la sesión de captura, y esa API tiene
un tope duro de 10MB que **ningún permiso puede levantar** —
`unlimitedStorage` (que sí quita el tope de `storage.local`) no se aplica a
`storage.session`, algo que esta spec no verificó antes de proponerlo. Una
sola página con una imagen de fondo incrustada en base64 ya se come ese
tope. Corrección: la sesión pasa a `chrome.storage.local` +
`unlimitedStorage` en el manifest, vaciándose a mano en
`chrome.runtime.onStartup` para conservar la intención original (no
sobrevive a un reinicio del navegador).

De paso, dos mejoras que no estaban en el diseño original:

- **Incrustado de recursos en paralelo** (tope de 6 a la vez, timeout de 8s
  por recurso) en vez de uno a uno sin límite — un solo recurso lento podía
  colgar toda la captura antes.
- **Autopiloto de flujo** (`extension/avanzar.js` + `capturarFlujoAutomatico`
  en `background.js`): rellena con datos genéricos (`test@dominio.com` /
  `Test1234!`) los campos de email/contraseña que detecta con la misma
  heurística que usa `tools/sanearWeb.js`, envía el formulario, espera, y
  repite — pensado para no tener que ir pulsando "Capturar paso" a mano en
  cada pantalla de un login de Google/Microsoft. No autentica de verdad: si
  el sitio valida la cuenta contra su base de datos y no avanza, el
  autopiloto simplemente para ahí y entrega lo que ya haya capturado.
- **Código de emparejamiento editable desde el popup**, no solo desde la
  página de Opciones — D6 lo daba por hecho en Opciones sin más
  justificación; en la práctica hacía falta un salto extra para algo que se
  usa en el arranque de cada sesión de captura.
- **Recomendación de exportación en la revisión**: cuando llegan varios
  pasos, se marca cuál trae el campo de contraseña detectado — GoPhish solo
  admite una página por landing (D2 ya lo decía, pero no lo reflejaba en la
  UI), así que el resto de pasos son solo de referencia.

## Addendum 2 — primer uso real contra un login de verdad

Tres correcciones más, esta vez a partir de un error real (`Error: cuerpo
demasiado grande`, con su traza completa) en vez de una suposición:

- **`CUERPO_MAXIMO` se quedaba corto de verdad.** 25MB bastaba para un `.eml`
  o un HTML pegado a mano, pero un envío de `/api/extension/clonar-flujo`
  puede traer varios pasos con recursos incrustados en base64 cada uno — un
  login real con un par de imágenes de fondo ya lo superaba. Sube a 200MB
  para ese canal, que es máquina-a-máquina en local y no tiene el mismo coste
  que aceptar cuerpos grandes de la red pública.
- **El autopiloto no se podía parar.** `capturarFlujoAutomatico()` corría de
  un tirón dentro de un único mensaje; no había forma de interrumpirlo desde
  el popup una vez lanzado. Se añade una bandera de módulo
  (`autopilotoEnMarcha`) que un mensaje corto y aparte
  (`detener-flujo-automatico`) puede apagar, comprobada entre cada paso del
  bucle — el popup añade un botón "Detener" con polling cada segundo para ver
  cuántos pasos lleva capturados mientras decide si parar.
- **El autopiloto debía parar en la contraseña, no seguir de largo.** Antes
  intentaba rellenar y enviar cualquier formulario que encontrara, incluida
  la pantalla de contraseña — pero esa es la última captura útil: en una
  campaña real, de ahí el flujo pasa a la página de concienciación. Enviar
  una contraseña inventada contra el sitio real no aporta nada a la captura y
  cruza una línea innecesaria. Ahora, en cuanto la pantalla recién capturada
  ya trae un campo de contraseña visible, el bucle para ahí sin rellenarlo.

## Addendum 3 — el CSS se capturaba bien y se tiraba después

D4 decía "`resolver: null` porque los recursos ya llegan incrustados: si un
recurso no llegó incrustado, `sanearWeb` ya lo anota como no incrustado" —
cierto para imágenes, falso para hojas de estilo. `sanearWeb.js` saneaba
`<link rel="stylesheet">` intentando resolverlo contra `resolver` sin
comprobar antes si el `href` ya era un `data:` URI (la rama de imágenes sí
hacía esa comprobación); con `resolver: null`, la resolución nunca podía
tener éxito, así que la etiqueta se borraba entera — un CSS que la extensión
había incrustado correctamente con las cookies de la pestaña acababa tirado
en el propio saneado del servidor. Arreglado con la misma comprobación que ya
tenía la rama de imágenes: si el `href` ya es `data:`, se deja la etiqueta
tal cual.
