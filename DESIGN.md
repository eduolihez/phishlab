# Design System — PhishLab

## Product Context
- **What this is:** Biblioteca de plantillas de email y landing para simulaciones de phishing autorizadas por contrato, con exportación a GoPhish.
- **Who it's for:** Equipos internos de ciberseguridad (red team / concienciación) preparando ejercicios contratados por un cliente.
- **Space/industry:** Seguridad ofensiva / concienciación, colindante con herramientas de compliance (Vanta) y dev tools serios (Linear).
- **Project type:** Web app / panel de trabajo interno, sin build ni framework (ES modules puros).

## Aesthetic Direction
- **Direction:** Industrial/utilitaria atemperada — oscura, densa en datos, sin decoración. Linear como referencia de restricción y pulido; Vercel como referencia de disciplina tipográfica; Notion como referencia de aire y calma en la jerarquía.
- **Decoration level:** Minimal — tipografía y espaciado hacen la jerarquía, cero iconografía decorativa.
- **Mood:** Debe sentirse como una herramienta de trabajo seria para profesionales de seguridad — nunca como un kit de hacking ni una demo lúdica. Frase ancla: *"herramienta seria, no un juego."*
- **Reference sites:** vercel.com, notion.com, linear.app (capturadas en investigación previa a esta propuesta).

## Typography
- **Display/Hero:** General Sans (600) — títulos de sección, nombre de plantilla en el detalle, hero de biblioteca. Grotesco geométrico con peso propio sin caer en genérico.
- **Body:** Instrument Sans (400/500) — párrafos, descripciones de plantilla, texto de UI general.
- **UI/Labels:** Instrument Sans (600) — botones, nav, labels de formulario.
- **Data/Tables:** Instrument Sans con `font-variant-numeric: tabular-nums` para conteos/métricas.
- **Code:** JetBrains Mono (400/500) — **solo** para código real: variables GoPhish (`{{.URL}}`, `{{.Tracker}}`), fragmentos HTML, slugs de plantilla. Nunca en navegación ni etiquetas de UI generales (ruptura deliberada con la v1, que usaba monoespaciada en todas partes).
- **Loading:** Google Fonts (Instrument Sans, JetBrains Mono) + Fontshare (General Sans) vía `<link>` en `index.html`.
- **Scale:**
  - Display/hero: 40px / 1.1 / -0.01em
  - H1 (sección): 26–28px / 1.2
  - H2 (tarjeta/panel): 18–20px / 1.3
  - H3 (subtítulo): 15–16px / 1.4
  - Body: 15px / 1.6
  - Small / meta: 13px / 1.5
  - Eyebrow / label: 11px / 1.4, uppercase, tracking +0.06em, weight 600
  - Mono / código: 12–13px / 1.7

## Color
- **Approach:** Restringido — 1 acento + neutros, semánticos reservados para estado real (no decorativos).
- **Primary accent:** `#4C7CF3` (azul señal) — interactivo: enlaces activos, botón primario, chip de señal seleccionada. Hover: `#6690F5`. Fondo muted: `#17233F`.
- **Neutrals (dark, por defecto):**
  - Fondo: `#0B0D10`
  - Superficie (tarjetas, header): `#14171C`
  - Superficie elevada (hover, modal): `#1B1F26`
  - Borde: `#262B33`
  - Borde sutil: `#1E222A`
  - Texto primario: `#EDEEF0`
  - Texto secundario: `#9BA1AC`
  - Texto terciario / placeholder: `#6B7280`
- **Neutrals (light, opcional/futuro):**
  - Fondo: `#FAFAF9` · Superficie: `#FFFFFF` · Borde: `#E7E5E2`
  - Texto primario: `#17181A` · Texto secundario: `#5B5E66`
  - Acento ajustado para contraste: `#3D63D1`
- **Semantic:**
  - Detección alta / éxito: `#2FAE66` (muted bg `#14261C`)
  - Detección media / warning: `#D99A3D` (muted bg `#2A2015`)
  - Destructivo / error: `#E5484D` (muted bg `#2B1417`)
  - Info: reutiliza el acento `#4C7CF3`
- **Dark mode:** Es el modo por defecto y el único que se implementa en esta iteración (el gremio de seguridad lo espera; ver "Safe choices"). Los tokens light quedan documentados para una fase futura, no bloquean el trabajo actual.

## Spacing
- **Base unit:** 8px
- **Density:** Cómoda — ni el apiñamiento de terminal de la v1, ni el aire de una landing de marketing.
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid-disciplinado. Biblioteca: sidebar de filtros (220px) + rejilla de tarjetas, y es la portada de la aplicación (v3: ya no hay una vista "Nueva campaña" separada). Workspace de plantilla: dos columnas (panel de 360px + preview) — el panel es **pestañas libres** (Ajustes, Marca, Exportar), no un wizard secuencial: no hay un orden que respetar entre calibrar señales, poner la marca del cliente o exportar, así que forzar pasos solo añadía fricción. La preview es editable al clic en cualquier pestaña.
- **Grid:** Rejilla de tarjetas 2 columnas en desktop estrecho, hasta 3 en pantallas anchas (`repeat(auto-fill, minmax(320px, 1fr))`).
- **Max content width:** 1180px para vistas de contenido; el wizard y el detalle pueden ir a ancho completo del panel.
- **Border radius:** sm `6px` (inputs, badges) · md `10px` (tarjetas) · lg `14px` (paneles, modales) · full `9999px` (pills, avatares). Deliberadamente variado por tipo de componente — nunca un radio uniforme "burbuja" en todo.

## Motion
- **Approach:** Intencional y sobrio — solo transiciones que ayudan a entender un cambio de estado (paso del wizard, hover, apertura de panel). Nada expresivo ni decorativo.
- **Easing:** enter `ease-out` · exit `ease-in` · move `ease-in-out`
- **Duration:** micro `100ms` (hover/focus) · short `180ms` (toggles, chips) · medium `300ms` (paso de wizard, apertura de panel) · long `450ms` (transición de vista completa)

## Component notes específicos de PhishLab
- **Tarjeta de plantilla:** lidera con los chips de **señal** que enseña (urgencia, dominio-ajeno...) antes que con la miniatura; miniatura pasa a apoyo visual secundario. Refuerza el valor real del producto (enseñar a detectar señales) frente a una galería de plantillas genérica.
- **Pestañas del workspace:** reutilizan el mismo componente `.pestana` que ya llevaba la barra de vista (previsualización de escritorio/móvil), en vez de inventar un segundo patrón de pestaña. Libres, no secuenciales: cualquiera se puede abrir en cualquier momento.
- **Edición en línea sobre la preview:** al pasar el ratón, el texto editable lleva un contorno discontinuo en el acento (`rgba(76,124,243,.85)`) y fondo `rgba(76,124,243,.08)`; al entrar en edición, el contorno pasa a sólido. Las imágenes llevan un overlay flotante con un botón "Cambiar imagen", nunca un marco fijo alrededor de la imagen — así no se altera la maquetación de tablas de un correo real. Es la misma paleta de acento que ya usa el resto de la interfaz, no un color nuevo para "modo edición".
- **Informe de saneado/clonado:** mismo componente para `.eml`, HTML pegado y web clonada — líneas con una etiqueta de clase (`quitado`, `reescrito`, `incrustado`, `no-incrustado`) en `--mono`. `no-incrustado` usa la variante roja de `--peligro`: es un recurso que sigue pidiendo al dominio real, la misma gravedad que un píxel de rastreo que no se cortó.
- **Código/variables:** cualquier fragmento HTML o variable GoPhish se muestra en un bloque `.code-preview` con fondo `--bg` y borde `--border`, nunca inline en prosa.

## Safe Choices (categoría — lo que el gremio ya espera)
- Tema oscuro por defecto — herramientas de seguridad/dev lo dan por hecho.
- Sidebar de filtros + rejilla de tarjetas en biblioteca — patrón de catálogo reconocible al instante.
- Badges de dificultad/señal como chips discretos, no iconografía inventada.

## Risks (dónde PhishLab consigue cara propia)
1. **Matar el verde neón + monoespaciada omnipresente de la v1.** Cuesta algo del "cosplay técnico"; gana credibilidad frente a un cliente que evalúa proveedores de simulación de phishing — deja de parecer una herramienta de CTF.
2. ~~Wizard numerado obligatorio para montar campaña, en vez de navegación libre por pestañas.~~ Revisado en v3 (ver Decisions Log 2026-09-15): con solo dos secciones en el nav y todo lo demás plegado en un workspace único, forzar un wizard de 4 pasos para exportar era la misma fricción que se le había quitado a la biblioteca. Las pestañas libres del workspace resuelven el mismo pedido de "sencillo de utilizar" sin bloquear el acceso a marca o exportar mientras se calibra.
3. **Tarjetas de plantilla lideradas por señal, no por miniatura.** Cuesta parecerse menos a una galería de plantillas de email genérica; gana que la UI refuerce el valor pedagógico real del producto.
4. **Editar en línea directamente sobre la preview**, en vez de una lista de campos de texto aparte. Cuesta algo de robustez (depende de `postMessage` entre el iframe y el padre, y de un recorrido del DOM estable entre ediciones — ver la spec del 2026-09-15); gana que editar un correo se sienta como tocar el correo de verdad, no como rellenar un formulario sobre él.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-15 | Workspace único de pestañas libres (Ajustes/Marca/Exportar) sustituye al wizard `/nueva` + detalle en 3 pasos + página `/senales`; Biblioteca pasa a ser la portada | Pedido de reducir la app a "Biblioteca" e "Importar"; ver `docs/superpowers/specs/2026-09-15-workspace-editor-clonado-design.md` |
| 2026-09-15 | Edición en línea sobre la preview (clic para editar texto/imágenes) sustituye a la lista de textareas de v2 | Mismo spec — "editor en vivo" pedido explícitamente, con el sistema de señales intacto por debajo |
| 2026-09-10 | Sistema de diseño inicial creado | Creado por `/design-consultation` a partir del pedido de rediseño "SaaS estilo Notion/Vercel, paso a paso, profesional" y de investigación visual de vercel.com, notion.com y linear.app |
