# PhishLab v2 — biblioteca de plantillas

Fecha: 2026-09-10
Estado: aprobado, en implementación

## Problema

PhishLab v1 genera material de simulación correcto pero se comporta como un
formulario, no como una biblioteca. Tres límites concretos:

1. **Cada plantilla son tres HTML monolíticos** (es/ca/en). Nada se puede
   activar, desactivar ni recomponer sin editar HTML a mano.
2. **La dificultad es un bloque cerrado.** `facil`/`medio`/`dificil` recalibran
   la plantilla entera, así que el informe al cliente sabe *cuántos* picaron
   pero no *qué señal* dejaron pasar.
3. **No hay forma de meter material real.** El phishing que de verdad recibe un
   cliente llega como `.eml` y hoy no hay puerta de entrada.

Además el catálogo son 6 plantillas, y el proyecto va a servir de pieza de
portfolio en eduolihez.com, lo que añade un requisito nuevo: enseñarlo sin
publicar un kit de phishing funcional.

## Decisiones

### D1 — Bloques anotados dentro del HTML real

El HTML sigue siendo HTML de correo auténtico (tablas, hacks de Outlook,
material clonado), anotado con comentarios:

```html
<!--@bloque:urgencia @senal:urgencia @opcional-->
<tr><td class="aviso">{{urgencia}}</td></tr>
<!--@/bloque-->
```

Descartadas: bloques tipados en JSON con renderer (imposible importar un
correo real sin reconstruirlo a mano, y obliga a mantener un renderer
compatible con Outlook), y overlay de CSS al exportar (`display:none` no es
fiable entre clientes de correo y depende de clases que cada clon nombra a
su manera).

### D2 — El copy se indexa por señal, no por nivel

```json
{
  "entradilla": {
    "base": "Como parte de la política de credenciales de {{empresa}}...",
    "urgencia": "La contraseña de tu cuenta caduca en {{dias}} días.",
    "urgencia+erratas": "Su contraseña EXPIRA HOY. Si no la actualiza..."
  }
}
```

Gana la variante cuya clave sea el subconjunto más específico de las señales
activas; `base` es el suelo. El contenido de v1 migra sin pérdida:
`dificil`→`base`, `medio`→`urgencia`, `facil`→`urgencia+erratas`.

Los niveles pasan a ser presets de señales, editables en `templates/presets.json`.

### D3 — Servidor local con API, sin dependencias npm

`tools/servidor.js` crece con `/api/*` para parsear `.eml`, sanear HTML pegado
y escribir plantillas en disco. Atado a 127.0.0.1, rechaza Origin no local.
Sin clonado por URL: el material entra como fichero o como HTML pegado.

### D4 — Split público / local

Un repo, dos salidas. `npm run dev` da la herramienta completa.
`npm run build:demo` genera un estático con solo las plantillas marcadas
`demo: true` (marcas ficticias), sin exportación ni importación. El linter
falla si una plantilla `demo:true` menciona una marca real.

## Modelo de datos

```
templates/
  senales.json            catálogo de las 6 señales
  presets.json            facil / medio / dificil como combinaciones
  index.json              índice del catálogo
  emails/<id>/
    meta.json             schema 2
    layout.html           layout único anotado
    copy/{es,ca,en}.json  copy en variantes por señal
  landings/<id>/          igual
  propias/                variantes del usuario (gitignored)
```

### meta.json schema 2

```json
{
  "schema": 2,
  "nombre": "...", "descripcion": "...",
  "familia": "microsoft", "categoria": "saas-corporativo",
  "tags": ["credenciales", "urgencia"],
  "idiomas": ["es", "ca", "en"],
  "captura": "credenciales | click | datos | ninguna",
  "demo": false,
  "origen": { "tipo": "escrito-a-mano | importado-eml | importado-html",
              "fecha": "2026-09-10", "autorizacion": "...", "notas": "..." },
  "remitente": { "nombre": "...", "buzon": "..." },
  "campos": [...],
  "bloques": [
    { "id": "urgencia", "etiqueta": "Bloque de urgencia",
      "opcional": true, "defecto": true, "senal": "urgencia" }
  ]
}
```

### Las seis señales

| id | Qué mide |
|---|---|
| `urgencia` | Presión temporal y amenaza de consecuencia |
| `erratas` | Faltas de ortografía y acentos ausentes |
| `saludo-generico` | "Estimado usuario" en vez del nombre |
| `dominio-ajeno` | Remitente en un dominio visiblemente distinto |
| `enlace-visible` | La URL cruda a la vista, sin coincidir con el texto |
| `incoherencia-marca` | Logo, tono o firma que no cuadran |

## Arquitectura

```
assets/js/core/
  engine.js      render + podar bloques   (existente, +podar)
  senales.js     resolución de señales, presets y variantes de copy   (nuevo)
  catalog.js     carga v2 con compatibilidad v1   (existente, reescrito)
  brand.js       marca y presets de cliente   (existente)
  zip.js         empaquetado   (existente)
  gophish.js     INSTRUCCIONES.md + AUTORIZACION.md   (existente, +señales)
  importar.js    cliente de la API de importación   (nuevo)
assets/js/ui/
  biblioteca.js  rejilla, buscador, filtros   (nuevo)
  detalle.js     preview + paneles de bloques y señales   (nuevo)
  editor.js      edición de copy en vivo   (nuevo)
  router.js      router de hash   (nuevo)
  fields.js      campos dinámicos   (existente)
  preview.js     iframe   (existente)
tools/
  servidor.js    estático + API local   (existente, ampliado)
  eml.js         parser MIME sin dependencias   (nuevo)
  sanear.js      saneado de HTML importado   (nuevo)
  lint.js        linter del catálogo   (existente, ampliado)
  build-demo.js  generador del estático público   (nuevo)
```

### Flujo de render

1. `senales.js` resuelve las señales activas (preset + overrides del usuario).
2. `senales.js` elige la variante de cada fragmento de copy.
3. `engine.podar()` corta los bloques desactivados y los que su señal apaga.
4. `engine.render()` sustituye las variables propias y deja las de GoPhish.

El invariante de v1 se mantiene: la poda ocurre **antes** del render, y
`{{.URL}}`/`{{.Tracker}}` salen literales en la exportación.

## Invariantes protegidos por tests

- Las variables de GoPhish nunca se resuelven al exportar.
- Podar no arrastra `{{.Tracker}}` salvo que se apague ese bloque a propósito.
- Podar deja el HTML con las tablas balanceadas.
- Los campos `email` y `password` conservan su nombre exacto en toda landing
  con captura de credenciales.
- Una plantilla `demo: true` no menciona ninguna marca real.

## Fuera de alcance

Clonado por URL. Envío de campañas (sigue siendo GoPhish). Cuentas de usuario.
Build para la app. Page builder de bloques tipados.
