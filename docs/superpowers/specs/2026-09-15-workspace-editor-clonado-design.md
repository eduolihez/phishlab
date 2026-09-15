# PhishLab v3 — workspace único, editor en vivo y clonado de webs

Fecha: 2026-09-15
Estado: implementado, con una revisión sobre la marcha en D4 (ver Addendum al final)
Revisa: [2026-09-10-phishlab-biblioteca-design.md](2026-09-10-phishlab-biblioteca-design.md) (v2).
Reabre explícitamente dos puntos que esa spec dejaba fuera de alcance:
clonado por URL y edición en línea sobre la preview.

## Problema

La v2 resolvió el modelo de datos (bloques, señales, copy por variante) pero
la interfaz sigue siendo cuatro secciones que se reparten una misma tarea:
`Nueva campaña` elige piezas y exporta, `Biblioteca` las explora, `/plantilla`
las calibra, `Señales` documenta lo que ya se explica en los propios
interruptores. Editar un texto significa bajar a una lista de textareas
separada de la preview que ese texto genera.

Además, todo el catálogo de marca real (Adobe, Google, Microsoft...) está
recreado a mano con CSS aproximado. Para que sirva de verdad en una
simulación tiene que parecerse al pixel a lo que manda la marca de verdad, y
hoy la única puerta de entrada de material real es pegar un `.eml` o HTML
suelto: no hay forma de traer una landing de login real.

El encargo: reducir la app a dos secciones (Biblioteca, Importar), fusionar
todo lo demás en un workspace único con edición visual directa, añadir
clonado de webs reales como landing, y usar esa misma capacidad para acercar
el catálogo actual a sus originales.

## Decisiones

### D1 — La Biblioteca es la portada; `/nueva` y `/senales` desaparecen como rutas

`index.html` pasa a dos enlaces de navegación: Biblioteca, Importar.
`arrancarRouter` cambia su ruta por defecto a `/biblioteca`. Se retiran los
registros de `/nueva` y `/senales` en `app.js`. Todo lo que hacían esas dos
vistas se pliega en el workspace de plantilla (`/plantilla/:tipo/:id`), que
es ahora el único sitio donde se calibra, edita, empareja y exporta.

Descartado: mantener `/senales` como página aparte "por si acaso documenta
algo que no está en la UI". No es así — cada interruptor ya lleva su
`ayuda` inline (`bloqueSenales` en `detalle.js`); duplicarlo en una página
aparte es la clase de sección fantasma que el pedido quiere eliminar.

### D2 — El workspace sustituye wizard + detalle + señales

`assets/js/ui/detalle.js` se reescribe. Deja de ser un wizard de 3 pasos
(Plantilla → Contenido → Marca, con "Exportar" saltando a `/nueva`) y pasa a
pantalla única: preview a la derecha (editable en línea, ver D3), panel de
pestañas a la izquierda:

- **Ajustes** — preset, señales, bloques, campos, idioma. Es la unión de lo
  que hoy son el paso 1 y 2 de `detalle.js`; no cambia su lógica interna,
  solo deja de estar partida en pasos.
- **Marca** — `panelMarca` tal cual existe hoy.
- **Emparejar y exportar** — nuevo. Sustituye a `/nueva`: un buscador
  compacto (mismo patrón que `pasoPieza` en `nuevaCampana.js`, pero como
  widget, no como página) para elegir la pieza pareja — si estás en un
  correo, eliges su landing, y viceversa — más el bloque de expediente
  (cliente, nº expediente), el checklist de página formativa, y los botones
  de exportar: descargar ZIP, copiar HTML del correo, copiar HTML de la
  landing. Toda la lógica de `crearZip`/`instrucciones`/`autorizacion` de
  `nuevaCampana.js` se traslada aquí sin cambios; solo cambia dónde vive.

`assets/js/ui/nuevaCampana.js` y `assets/js/ui/senales.js` se eliminan.
El emparejado reusa el estado existente (`estado.emailId` / `estado.landingId`)
sin campos nuevos: abrir el workspace de una pieza ya la selecciona (como
hoy), y la pestaña "Emparejar" solo deja cambiar la otra mitad del par.

`assets/js/ui/editor.js` (lista de textareas) se elimina; lo sustituye D3.

### D3 — Edición en línea sobre la preview, con protocolo `postMessage`

La preview sigue en `iframe sandbox="allow-scripts"` sin `allow-same-origin`
— el JS de la landing corre pero no puede tocar el DOM del padre. La edición
en línea respeta esa frontera: es la propia plantilla compuesta la que lleva
inyectado un script pequeño (`assets/js/core/edicionInline.js`, generador de
código) antes de fijarse como `srcdoc`. Ese script:

1. En plantillas estructuradas, `componer()` marca cada fragmento sustituido
   con `data-pl-copy="clave:variante"` (la variante que ganó con las señales
   activas). El script inyectado busca esos nodos y los vuelve editables al
   clic (`contentEditable` puntual, no la página entera).
2. En HTML crudo (importado o clonado, sin copy por señal), el script marca
   cada nodo de texto de primer nivel con `data-pl-raw="<índice>"` la primera
   vez que se pinta, y lo vuelve editable igual.
3. Las imágenes llevan overlay al pasar el ratón con "cambiar imagen"; el
   archivo elegido se incrusta como data URI (misma rutina que ya usa
   `panelMarca` con el logo del cliente).
4. Al perder el foco un nodo editado, el script manda un mensaje al padre:
   `{ tipo: 'pl-texto', copy, raw, texto }` o `{ tipo: 'pl-imagen', copy, raw, dataUri }`
   (`copy` o `raw` según el caso, nunca los dos).

El padre (`assets/js/ui/editorEnVivo.js`, nuevo) escucha `message`, valida
`event.source === marcoVista.contentWindow` (el origen es opaco por el
sandbox, así que se compara la referencia a la ventana, no el string de
origen) y aplica el cambio:

- Con `copy` presente: escribe en `ultimo.copyCrudo[clave][variante]` — el
  mismo objeto que ya muta `editor.js` hoy — y dispara recomponer.
- Con `raw` presente: escribe en un mapa `estado.edicionesCrudas[meta.id][índice]`
  que se aplica como parche de texto sobre el HTML guardado al exportar o
  guardar como plantilla propia.

**Invariante nuevo, con test:** los atributos `data-pl-copy` y `data-pl-raw`,
y el script de edición en línea, se eliminan del HTML en el momento de
exportar o copiar — igual que los marcadores `<!--@bloque-->` de v2, son la
clase de rastro que delata material de simulación si llegan al correo real.

Descartado: un editor de estilos/tipografía/color tipo page-builder. Cuesta
mucho más de construir y el pedido es "editor en vivo" de contenido, no un
diseñador de plantillas nuevas; el color y la tipografía ya los gobierna la
marca del cliente (`panelMarca`) y la plantilla de fábrica.

### D4 — Clonado de webs: marcador Ctrl+S + URL, mismo saneado

Dos entradas, un solo saneado en el servidor:

**Marcador (bookmarklet).** La pestaña "Web" de Importar genera un enlace
`javascript:...` para arrastrar a la barra de marcadores, a partir de un
fuente legible en `assets/js/bookmarklet/capturar.js` (se empaqueta en el
enlace con `encodeURIComponent`, no se mantiene una copia minificada a mano).
En la web real, ya cargada y con el JS ejecutado (login incluido), el
marcador:

1. Intercepta Ctrl+S con `keydown` en `document` (funciona: es JS inyectado
   en esa misma pestaña, no un atajo del navegador) y también responde a un
   clic directo en el marcador.
2. Serializa `document.documentElement.outerHTML`.
3. Intenta inlinar como data URI cada imagen y hoja de estilos alcanzable
   (mismo origen o con CORS abierto); lo que no se puede leer se deja como
   URL absoluta y se marca en el informe (ver más abajo) para corregir a
   mano — igual filosofía que el saneado de `.eml`: nunca cargar en silencio
   desde un tercero, pero tampoco fingir que se ha resuelto algo que no.
4. Quita `<script>`, manejadores inline y píxeles de rastreo conocidos.
5. Manda el resultado por `POST` a `http://127.0.0.1:<puerto>/api/clonar`
   (mismo servidor local, mismo candado a Origin local que ya tiene
   `tools/servidor.js` para el resto de la API) junto con `location.href`.
6. La pestaña muestra un aviso de "capturado, vuelve a PhishLab" con enlace
   de vuelta al informe de revisión.

**URL.** En la pestaña "Web" de Importar, pegar una URL hace que el servidor
local haga el fetch server-side y aplique el mismo saneado. Es el atajo
rápido para páginas estáticas; la propia UI avisa de que no sirve para
logins que se renderizan por JavaScript (la mayoría de los que interesan).

**Saneado compartido** — `tools/sanearWeb.js` (nuevo, reutiliza las
funciones ya existentes de `tools/sanear.js` donde aplican): quita scripts,
iframes, manejadores inline y píxeles de rastreo; inlina lo que puede;
detecta por heurística los campos de login (`input[type=email]` o con
`autocomplete=username/email` → `email`; `input[type=password]` → `password`)
y reescribe sus atributos `name`/`id`; reescribe la acción del formulario a
vacío. El linter (`tools/lint.js`) sigue exigiendo esos dos nombres exactos
en toda landing con captura de credenciales, clonada o no.

**Informe antes de guardar** — misma pantalla que hoy usa `importar.js` para
`.eml`, con líneas nuevas: recursos inlinados / recursos que no se pudieron
inlinar (en rojo, seguirán pidiendo al dominio real hasta que se corrijan a
mano) / campos de login detectados y su confianza (alta/baja/no detectado,
con opción de corregir el mapeo ahí mismo antes de que el linter lo
rechace) / scripts y manejadores eliminados. La nota de autorización sigue
siendo obligatoria, igual que en la importación de correo.

Guardar crea la plantilla en `templates/propias/` con
`origen.tipo: "clonado-web"` y `origen.urlOrigen`, y navega directo al
workspace de esa landing para el repaso fino con el editor en línea de D3.

**Fuera de alcance en esta iteración:** logins multi-pantalla (Google,
Microsoft con paso de email y luego contraseña por separado) — cada captura
es una sola pantalla; combinar dos capturas en una landing es trabajo manual
en el editor. Captura de UI muy dependiente de canvas/WebGL. Cuentas de
usuario o colaboración multi-persona sobre el mismo clonado.

### D5 — El clonado también sirve para mejorar el catálogo existente

No es una plantilla nueva por decisión, sino una consecuencia de D4: la
misma tubería de clonado se puede apuntar a las páginas de login reales
(Adobe, DocuSign, Netflix, Microsoft...) para recapturar las landings del
catálogo con más fidelidad que la recreación manual actual, y luego pulirlas
con el editor en línea. Se hace plantilla a plantilla, sin automatizar el
reemplazo del catálogo entero de golpe — cada una necesita revisión de que
el resultado no arrastra nada del dominio real.

## Modelo de datos — cambios sobre v2

`meta.json` — `origen.tipo` gana un valor: `"clonado-web"`. Nuevo campo
opcional `origen.urlOrigen` (string) cuando el origen es un clonado.

Estado en memoria (`core/estado.js`) — nuevo `estado.edicionesCrudas`
(`{ [metaId]: { [índice]: texto } }`) para las plantillas sin copy por
señal. No se toca el resto del esquema de `estado`.

Respuesta del servidor para un clonado (`/api/clonar` y `/api/clonar-url`):

```json
{
  "html": "...",
  "recursosInlinados": ["logo.png", "estilos.css"],
  "recursosNoInlinados": ["https://ejemplo.com/fuente.woff2"],
  "camposLogin": {
    "email": { "selector": "#identifierId", "confianza": "alta" },
    "password": { "selector": null, "confianza": "no-detectado" }
  },
  "scriptsEliminados": 4,
  "urlOrigen": "https://ejemplo.com/login"
}
```

## Arquitectura — ficheros que cambian

```
assets/js/ui/
  detalle.js        reescrito: workspace de pestañas, sin pasos
  editorEnVivo.js    nuevo: escucha postMessage, aplica ediciones
  exportar.js        nuevo: pestaña "Emparejar y exportar" (antes en nuevaCampana.js)
  importarWeb.js      nuevo: pestaña "Web" de Importar (URL + instrucciones del marcador)
  importar.js         ampliado: pasa a tener pestañas Correo / Web
  nuevaCampana.js      eliminado
  senales.js           eliminado
  editor.js            eliminado
assets/js/core/
  edicionInline.js     nuevo: genera el script que se inyecta en el HTML compuesto
  componer.js          ampliado: marca data-pl-copy al sustituir fragmentos
  engine.js            ampliado: quita data-pl-* y el script inyectado al exportar/copiar
assets/js/bookmarklet/
  capturar.js          nuevo: fuente legible del marcador Ctrl+S
tools/
  servidor.js          ampliado: /api/clonar, /api/clonar-url
  sanearWeb.js          nuevo: saneado de páginas completas + heurística de login
  lint.js               sin cambios de fondo (ya exige email/password)
index.html             nav a 2 enlaces (Biblioteca, Importar)
assets/js/app.js       rutas: por defecto /biblioteca; se retiran /nueva y /senales
DESIGN.md              IA y layout del workspace actualizados (ver más abajo)
```

## Flujo de edición en línea (resumen)

1. `componer()` resuelve señales, poda bloques, sustituye variables y marca
   `data-pl-copy`/dejar `data-pl-raw` pendiente de asignar en cliente.
2. `edicionInline.js` envuelve el HTML con el script de edición antes de
   fijar `srcdoc`.
3. Clic en un nodo → editable → blur → `postMessage` al padre.
4. `editorEnVivo.js` aplica el cambio sobre `ultimo.copyCrudo` o
   `estado.edicionesCrudas` y dispara `recomponer()`.
5. Al exportar/copiar, `engine.js` limpia `data-pl-*` y el script inyectado
   antes de escribir el fichero final — el HTML que sale nunca lleva rastro
   del editor.

## Invariantes protegidos por tests (nuevos, sobre los de v2)

- `data-pl-copy`, `data-pl-raw` y el script de edición en línea no aparecen
  en el HTML exportado ni en "Copiar HTML".
- `sanearWeb.js` quita scripts, iframes y manejadores inline de una página
  completa igual que `sanear.js` lo hace con un `.eml`.
- Los campos de login detectados por heurística, si se aceptan, terminan
  con `name`/`id` exactamente `email` y `password`.
- Un recurso que no se pudo inlinar nunca se elimina en silencio: aparece
  en `recursosNoInlinados` o el guardado se bloquea hasta decidir.
- `/nueva` y `/senales` ya no son rutas registradas; `/biblioteca` es la
  ruta por defecto.

## Fuera de alcance

Editor de estilos tipo page-builder (color/tipografía/espaciado/mover
bloques). Captura de logins multi-pantalla en un solo clonado. Clonado de
contenido canvas/WebGL. Cuentas de usuario. Automatizar el reemplazo de las
22 plantillas existentes de una tacada (D5 es plantilla a plantilla, con
revisión).

## Actualización pendiente de `DESIGN.md`

Sustituir en "Layout" la línea de "Montar campaña: wizard lineal de 4
pasos" por la descripción del workspace de pestañas de D2. Añadir nota de
componente para el afordance de edición en línea (contorno al pasar el
ratón + cursor de texto + lápiz pequeño en imágenes) y para la pantalla de
informe de clonado (reusa `.avisos`/`.nota`, con la variante roja para
recursos no inlinados). Entrada nueva en el log de decisiones con fecha
2026-09-15 referenciando esta spec.

## Addendum (mismo día) — D4 revisado: el marcador copia, no postea

D4 diseñaba el marcador para postear la captura directamente a
`http://127.0.0.1:<puerto>/api/clonar`, protegido por un token de sesión en
vez de por el origen. Al probarlo contra una web real se confirmó con la
consola del navegador que Chrome bloquea ese salto (origen público → dirección
local) como **Private Network Access / Local Network Access**: un permiso de
navegador aparte del CORS normal que no se puede conceder solo desde
cabeceras del servidor. El error observado fue textual: *"Permission was
denied for this request to access the `loopback` address space."* — no
relacionado con el token ni con el origen, así que no había nada que arreglar
en ese diseño; el mecanismo de transporte era el problema.

Se descarta el POST directo. El marcador ahora **copia la página al
portapapeles** (`navigator.clipboard.writeText`, con `execCommand('copy')`
como respaldo) anteponiendo `<!--phishlab-origen:URL-->` al HTML capturado.
Importar → Web gana una caja de "pegar lo capturado" que separa ese
comentario y llama a un nuevo endpoint local, `/api/clonar-html` — mismo
saneado (`sanearWeb.js`), sin fetch de por medio. Se retiran `TOKEN_CLONADO`,
`/api/clonar`, `/api/clonar/pendiente` y el preflight CORS: ya no hace falta
ninguna excepción a "toda la API exige origen local", que vuelve a ser una
regla sin excepciones.

Costo: un paso más (volver a la pestaña y pegar, en vez de una captura
totalmente automática). Gana: no depende de una política de navegador en
evolución activa, y quita superficie de ataque (sin token, sin CORS abierto a
ningún origen) sin perder nada de fidelidad — la página sigue capturándose tal
como la renderizó el navegador real.
