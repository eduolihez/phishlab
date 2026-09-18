# Rediseño v4 de interfaz — Spec de diseño

## Contexto

PhishLab pasa a tener doble propósito: herramienta interna de simulación de
phishing y pieza de portfolio público (ver decisión de hacer el repo público,
sub-proyecto aparte). El usuario pidió un "lavado de cara desde 0" de
interfaz y galería. `DESIGN.md` ya se reescribió (v4, 2026-09-18) con la
propuesta completa: acento ámbar de señal, tipografía Bricolage Grotesque +
Geist + JetBrains Mono, layout híbrido, motion con spring. Este spec cubre
**cómo aplicar ese sistema al código existente**, no vuelve a discutir la
dirección visual.

**Fuera de alcance de este spec** (sub-proyectos separados, ver decisión de
troceo 2026-09-18):
- La landing/demo pública de marketing (hero editorial, CTA "pedir acceso al
  lab") — depende de decisiones aún no tomadas sobre el flujo de acceso al
  lab y de qué contenido lleva la demo pública. Se especificará cuando ese
  sub-proyecto se aborde.
- Cualquier cambio a `extension/`, `tools/servidor.js` o el flujo de clonado
  — no forma parte de un lavado de cara visual.
- Publicación del repo en GitHub — sub-proyecto aparte.

## Qué cambia

### 1. Tipografía autoalojada

`assets/fonts/` gana dos ficheros `.woff2` nuevos (con licencia libre para
autoalojar, igual que los tres actuales):
- `bricolage-grotesque-600.woff2` (weight 600) y `bricolage-grotesque-700.woff2`
  (weight 700) — o un único variable-font si el subset cabe razonablemente.
- `geist-400.woff2`, `geist-500.woff2`, `geist-600.woff2` (o variable font
  equivalente).

`jetbrains-mono.woff2` se mantiene sin cambios — ya cumplía su función.

`general-sans-600.woff2` e `instrument-sans.woff2` se retiran de
`assets/css/app.css` (las `@font-face` y las variables `--display`/`--sans`
que las referencian) una vez migrado. Los ficheros `.woff2` viejos se
eliminan del repo (`assets/fonts/`, y de `demo/` y `lab/` tras el próximo
`npm run build:demo` / `npm run build:lab`).

### 2. Tokens CSS (`assets/css/app.css`, bloque `:root`)

Reemplazo 1:1 de valores, sin tocar los *nombres* de variable (evita romper
cualquier otro fichero CSS/JS que las use inline vía `style.setProperty` si
lo hubiera):

| Variable | Valor v3 (actual) | Valor v4 (nuevo) |
|---|---|---|
| `--fondo` | `#0b0d10` | `#0a0a0b` |
| `--panel` | `#14171c` | `#141416` |
| `--elevado` | `#1b1f26` | `#1c1c1f` |
| `--borde` | `#262b33` | `#28282c` |
| `--borde-suave` | `#1e222a` | `#202024` |
| `--texto` | `#edeef0` | `#f2f2f0` |
| `--texto-medio` | `#9ba1ac` | `#8f8f94` |
| `--texto-suave` | `#6b7280` | `#5f5f66` |
| `--acento` | `#4c7cf3` | `#ff7a29` |
| `--acento-oscuro` | `#6690f5` | `#ff8f4d` |
| `--acento-fondo` | `rgba(76,124,243,.12)` | `rgba(255,122,41,.12)` |
| `--acento-borde` | `rgba(76,124,243,.38)` | `rgba(255,122,41,.38)` |
| `--peligro` | `#e5484d` | `#f5484d` (sin cambio real) |
| `--alerta` | `#d99a3d` | `#ffb020` |
| `--ok` | `#2fae66` | `#3dd68c` |
| `--display` | `'General Sans', 'Instrument Sans', ...` | `'Bricolage Grotesque', 'Geist', -apple-system, ...` |
| `--sans` | `'Instrument Sans', ...` | `'Geist', -apple-system, ...` |
| `--mono` | (sin cambio) | (sin cambio) |

Se añaden dos variables nuevas usadas por el motion (punto 4):
- `--resorte: cubic-bezier(.34, 1.4, .64, 1);` (aproximación CSS de spring)
- `--acento-rgb: 255, 122, 41;` (para componer `rgba()` donde haga falta sin
  repetir el valor hex)

Contraste: `#f2f2f0` sobre `#0a0a0b` y `#ff7a29` sobre `#0a0a0b`/`#141416` se
verifican con una herramienta de contraste antes de cerrar la tarea — deben
cumplir AA para texto normal (4.5:1) y AA para elementos interactivos grandes
(3:1). Si `--acento` no llega a 3:1 sobre `--fondo` para texto de botón, el
texto del botón primario usa un tono casi negro (`#140900`) en vez de blanco,
igual que ya proponía el preview.

### 3. Nada cambia en la estructura de componentes

La revisión del código (`biblioteca.js`) confirma que las tarjetas de
plantilla **ya** llevan los chips de señal antes de la miniatura
(`.senales-tarjeta` va antes de `.miniatura` en el DOM) — es una decisión de
v3 que sigue vigente, no hace falta tocar el JS de `biblioteca.js`,
`detalle.js`, `editorEnVivo.js` ni `exportar.js`. El lavado de cara es un
cambio de **tokens y reglas CSS**, no de estructura ni de comportamiento.

Excepción: los nombres de clase `.pildora-acento`, `.pildora-alerta`,
`.pildora-ok` no cambian — ya son semánticos y siguen aplicando.

### 4. Motion — física de resorte

Confirmado en el código actual: `.modal` (línea ~995 de `assets/css/app.css`)
y `.panel-ajustes` (línea ~496) no tienen hoy ninguna animación de entrada —
aparecen de golpe. Esto es una adición, no un cambio de easing existente. Se
añade una regla `@keyframes entrada-resorte` (escala 0.96→1 + opacidad 0→1)
aplicada como `animation: entrada-resorte 300ms var(--resorte);` a `.modal`
y a `.panel-ajustes` cuando se monta. Duración `300ms` (medium, ya
documentado en DESIGN.md). Los toggles/chips (`100ms`/`180ms`, si ya usan
`transition`) no cambian — el spring solo se nota en movimientos con
recorrido, no en micro-interacciones.

`prefers-reduced-motion: reduce` — comprobar que ya existe una regla que
desactiva transiciones (si no existe, añadirla: es un gap de accesibilidad
independiente de este rediseño, pero se corrige de paso porque toca el mismo
bloque de reglas).

### 5. Grano de fondo (opcional, evaluar en implementación)

DESIGN.md documenta una textura de grano sutil para superficies grandes en
la landing pública — **no aplica al workspace/Biblioteca**, que se queda con
fondo sólido (`--fondo`) sin textura: es una herramienta de trabajo densa en
datos, el grano decorativo solo tiene sentido en la cara pública que queda
fuera de alcance de este spec. Se documenta aquí para que quien implemente
la landing más adelante sepa que no debe añadirse aquí.

## Testing

- `npm test` debe seguir en verde (las 339 pruebas actuales no tocan CSS,
  pero sí generan HTML de plantillas — confirmar que ninguna prueba hace
  snapshot de valores de color/fuente que ahora cambian).
- `npm run lint` (linter del catálogo) no debería verse afectado — no toca
  plantillas de contenido, solo CSS/fuentes de la shell de la app.
- Verificación manual: abrir `abrir-phishlab.bat`, comprobar en Biblioteca,
  detalle de plantilla, editor en vivo y exportar que:
  - El acento ámbar sustituye al azul en todos los estados interactivos
    (foco, hover, chip activo, botón primario).
  - Las fuentes cargan sin parpadeo (FOUT) y sin petición de red externa
    (comprobar en la pestaña Network del navegador que no hay peticiones a
    `fonts.googleapis.com` ni `fonts.gstatic.com`).
  - El contraste de texto secundario sobre fondo sigue siendo legible.
  - Los paneles/modales abren con el rebote de spring, no de golpe ni con
    ease lineal.
- Regresión visual: no hay suite de capturas automatizada en este proyecto;
  la verificación es manual guiada por la checklist anterior.

## Riesgos y mitigación

- **Contraste del ámbar sobre negro cálido** puede rozar el límite AA en
  texto pequeño — mitigado reservando el acento para elementos grandes/
  interactivos (botones, chips, bordes de foco) y no para párrafos de texto,
  igual que ya hacía el azul en v3.
- **Peso de fuentes nuevas**: Bricolage Grotesque + Geist en varios pesos
  puede pesar más que General Sans + Instrument Sans si no se suben como
  variable fonts. Mitigación: preferir un único fichero variable-font por
  familia si el subset lo permite, igual que ya se hace con JetBrains Mono
  (`400 600` en un solo `@font-face`).
