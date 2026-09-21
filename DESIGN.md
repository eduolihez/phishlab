# Design System — PhishLab

## Product Context
- **What this is:** Biblioteca de plantillas de email y landing para simulaciones de phishing autorizadas por contrato, con exportación a GoPhish.
- **Who it's for:** Equipos internos de ciberseguridad (red team / concienciación) preparando ejercicios contratados por un cliente — y, desde esta versión, también reclutadores y profesionales del sector viendo el proyecto como pieza de portfolio público.
- **Space/industry:** Seguridad ofensiva / concienciación, colindante con herramientas de builder serio (Linear, Vercel, Raycast) más que con SaaS de compliance/RRHH (KnowBe4, Hoxhunt).
- **Project type:** Web app / panel de trabajo interno, sin build ni framework (ES modules puros), con una cara pública añadida (landing/demo).

## Aesthetic Direction
- **Direction:** Brutalmente minimalista con un único acento saturado — tipografía y espaciado hacen toda la jerarquía, cero iconografía decorativa, pero un color de marca que rompe el monocromo en vez de fundirse en él.
- **Decoration level:** Minimal, con una excepción intencional: grano/textura sutilísimo (1–2% opacidad) en superficies grandes del hero/landing, para que el negro no se sienta plano.
- **Mood:** "Esto lo ha construido alguien muy bueno." Debe leerse como una herramienta de builder serio, nunca como un kit de hacking ni un SaaS de compliance genérico.
- **Reference sites:** linear.app, vercel.com, raycast.com (research 2026-09-18; KnowBe4/Hoxhunt evaluados y descartados como referencia — leen como LMS corporativo, no como herramienta técnica).
- **Memorable thing:** El único color que existe en la interfaz es, literalmente, el color de una señal de phishing detectada. Marca y función coinciden.

## Typography
- **Display/Hero:** Bricolage Grotesque (600/700) — grotesco con más carácter que una geométrica genérica, disponible en Google Fonts, evita el "Clash Display sobreusado".
- **Body/UI:** Geist (400/500/600) — tipografía de Vercel, tabular-nums nativo, es la señal visual de "builder tool 2026" que da credibilidad de portfolio.
- **Data/Tables:** Geist con `font-variant-numeric: tabular-nums` para conteos/métricas del informe de resultados.
- **Code:** JetBrains Mono (400/500) — **solo** para código real: variables GoPhish (`{{.URL}}`, `{{.Tracker}}`), fragmentos HTML, slugs de plantilla, marcadores de bloque (`@senal:urgencia`). Nunca en navegación ni etiquetas de UI generales.
- **Loading:** Autoalojadas en `assets/fonts/*.woff2` vía `@font-face`, igual que el sistema anterior — PhishLab no depende de ningún CDN en tiempo de ejecución, ni siquiera para las fuentes (todas las candidatas son libres para autoalojar: Bricolage Grotesque y Geist tienen licencia OFL, JetBrains Mono también).
- **Scale:**
  - Display/hero: clamp(32px, 5vw, 48px) / 1.05 / -0.02em
  - H1 (sección): 24–26px / 1.2 / -0.01em
  - H2 (tarjeta/panel): 18–20px / 1.3
  - H3 (subtítulo): 15–16px / 1.4
  - Body: 15px / 1.6
  - Small / meta: 13px / 1.5
  - Eyebrow / label: 11px / 1.4, uppercase, tracking +0.06–0.08em, weight 600, `--mono`
  - Mono / código: 12–13px / 1.7

## Color
- **Approach:** Restringido — 1 acento + neutros, semánticos reservados para estado real (no decorativos).
- **Primary accent — "señal ámbar":** `#FF7A29` — interactivo: botón primario, chip de señal activa, enlaces activos. Fondo muted: `#3A2412`. No es azul-SaaS-genérico ni violeta-Linear-ya-visto: conecta directamente con el sistema de señales, que es el corazón pedagógico del producto.
- **Neutrals (dark, por defecto):**
  - Fondo: `#0A0A0B` (negro cálido, no azulado)
  - Superficie (tarjetas, header): `#141416`
  - Superficie elevada (hover, modal): `#1C1C1F`
  - Borde: `#28282C`
  - Texto primario: `#F2F2F0`
  - Texto secundario: `#8F8F94`
  - Texto terciario / placeholder: `#5F5F66`
- **Neutrals (light, opcional/futuro):**
  - Fondo: `#FAFAF9` · Superficie: `#FFFFFF` · Superficie elevada: `#F3F2EF` · Borde: `#E4E2DD`
  - Texto primario: `#17181A` · Texto secundario: `#5B5E66`
  - Acento ajustado para contraste: `#D9540E`
- **Semantic:**
  - Detección alta / éxito: `#3DD68C` (muted bg mezcla al 16%)
  - Detección media / warning: `#FFB020` (deliberadamente cercano al acento — refuerza "esto ya es una señal")
  - Destructivo / error: `#F5484D`
  - Info: reutiliza el acento `#FF7A29`
- **Dark mode:** Es el modo por defecto y el único que se implementa en esta iteración (el gremio de seguridad lo espera). Los tokens light quedan documentados para una fase futura, no bloquean el trabajo actual.

## Spacing
- **Base unit:** 8px
- **Density:** Cómoda — se mantiene del sistema anterior, ya validada.
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Híbrido. Workspace (Biblioteca, editor, exportar) sigue grid-disciplinado: sidebar de señales (220px) + rejilla de tarjetas. La cara pública (landing/demo del portfolio) se permite una composición editorial — hero grande con tesis visual, no un dashboard desde el segundo cero.
- **Grid:** Rejilla de tarjetas 2 columnas en desktop estrecho, hasta 3 en pantallas anchas (`repeat(auto-fill, minmax(200px, 1fr))`).
- **Max content width:** 1180px para vistas de contenido; el workspace puede ir a ancho completo del panel.
- **Border radius:** sm `6px` (inputs, badges) · md `10px` (tarjetas) · lg `14px` (paneles, modales, app-frame) · full `9999px` (pills, chips). Deliberadamente variado por tipo de componente.

## Motion
- **Approach:** Intencional, con física de resorte (spring) en apertura de paneles/modales — no solo `ease-out` lineal. Es más caro de implementar pero es la diferencia entre "se mueve" y "se siente premium".
- **Easing:** enter `spring(stiffness: 300, damping: 26)` o aproximación CSS `cubic-bezier(.34, 1.4, .64, 1)` · exit `ease-in` · move `ease-in-out`
- **Duration:** micro `100ms` (hover/focus) · short `180ms` (toggles, chips) · medium `300ms` (apertura de panel, con spring) · long `450ms` (transición de vista completa)

## Component notes específicos de PhishLab
- **Tarjeta de plantilla:** lidera con los chips de **señal** que enseña (urgencia, dominio-ajeno...) antes que con la miniatura; miniatura pasa a apoyo visual secundario. Refuerza el valor real del producto (enseñar a detectar señales) frente a una galería de plantillas genérica.
- **Sidebar de la Biblioteca:** agrupa por señal primero, tipo (email/landing/sms) después — nunca por marca. La marca es un detalle de la tarjeta, no un eje de navegación.
- **Pestañas del workspace:** reutilizan el mismo componente `.pestana` que ya llevaba la barra de vista (previsualización de escritorio/móvil). Libres, no secuenciales: cualquiera se puede abrir en cualquier momento.
- **Edición en línea sobre la preview:** al pasar el ratón, el texto editable lleva un contorno discontinuo en el acento ámbar (`rgba(255,122,41,.85)`) y fondo `rgba(255,122,41,.08)`; al entrar en edición, el contorno pasa a sólido. Las imágenes llevan un overlay flotante con un botón "Cambiar imagen", nunca un marco fijo alrededor de la imagen.
- **Informe de saneado/clonado:** mismo componente para `.eml`, HTML pegado y web clonada — líneas con una etiqueta de clase (`quitado`, `reescrito`, `incrustado`, `no-incrustado`) en `--mono`. `no-incrustado` usa la variante roja de `--peligro`.
- **Código/variables:** cualquier fragmento HTML o variable GoPhish se muestra en un bloque `.code-preview` con fondo `--fondo` y borde `--borde`, nunca inline en prosa.
- **Landing/demo pública:** hero con textura de grano sutil (radial-gradient + SVG noise a mix-blend-mode overlay, opacidad ~5%), eyebrow en `--mono` con un punto ámbar animado, CTA dual (explorar biblioteca / pedir acceso al lab).

## Safe Choices (categoría — lo que el gremio ya espera)
- Tema oscuro por defecto — herramientas de seguridad/dev lo dan por hecho.
- Sidebar de filtros + rejilla de tarjetas en biblioteca — patrón de catálogo reconocible al instante.
- Badges de dificultad/señal como chips discretos, no iconografía inventada.

## Risks (dónde PhishLab consigue cara propia)
1. **Acento ámbar de señal, no azul/violeta genérico.** Cuesta parecer menos "SaaS estándar" al primer vistazo; gana una identidad de marca atada literalmente al producto (el color es una señal, no una decisión arbitraria de branding).
2. **Motion con física de resorte.** Cuesta más esfuerzo de implementación que transiciones lineales; gana la sensación "pulido caro" que separa un portfolio piece de una herramienta interna cualquiera.
3. **Landing pública editorial vs. workspace grid.** Cuesta mantener dos lenguajes de layout coherentes entre sí; gana que la demo pública se sienta como landing de producto real, vendible a reclutadores, en vez de abrir directamente en una tabla de datos.
4. ~~Matar el verde neón + monoespaciada omnipresente de la v1.~~ Decisión heredada de v3, sigue vigente: cero verde neón, cero "cosplay técnico" de CTF.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-18 | Rediseño completo desde cero (v4): acento ámbar de señal, Bricolage Grotesque + Geist, layout híbrido grid/editorial, motion con spring | Pedido explícito de "lavado de cara desde 0" al convertir el proyecto también en pieza de portfolio público; ver preview en `docs/superpowers/specs/2026-09-18-rediseno-v4-design.md` |
| 2026-09-15 | Workspace único de pestañas libres (Ajustes/Marca/Exportar) sustituye al wizard `/nueva` + detalle en 3 pasos + página `/senales`; Biblioteca pasa a ser la portada | Pedido de reducir la app a "Biblioteca" e "Importar"; ver `docs/superpowers/specs/2026-09-15-workspace-editor-clonado-design.md` |
| 2026-09-15 | Edición en línea sobre la preview (clic para editar texto/imágenes) sustituye a la lista de textareas de v2 | Mismo spec — "editor en vivo" pedido explícitamente, con el sistema de señales intacto por debajo |
| 2026-09-10 | Sistema de diseño inicial creado (v3) | Creado por `/design-consultation` a partir del pedido de rediseño "SaaS estilo Notion/Vercel, paso a paso, profesional" y de investigación visual de vercel.com, notion.com y linear.app |
