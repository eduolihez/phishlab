# Añadir una plantilla

Todo lo que hay bajo `templates/` son datos. El dashboard construye el
formulario, el catálogo y la vista previa leyendo los manifiestos, así que
añadir una plantilla nueva no toca ni una línea de código.

## Los tres pasos

1. Crea la carpeta `templates/emails/<id>/` (o `templates/landings/<id>/`).
2. Escribe dentro `meta.json`, `es.html`, `ca.html` y `en.html`.
3. Añade el `<id>` a la lista correspondiente de `templates/index.json`.

El navegador no puede listar directorios: por eso hace falta el índice. Si te
olvidas de ese tercer paso, la plantilla simplemente no aparece.

Después, `npm run lint`.

---

## meta.json

```jsonc
{
  "nombre": "Tarjeta regalo por antigüedad",       // lo que se ve en la tarjeta
  "descripcion": "Reconocimiento por los años…",   // dos líneas, para elegir de un vistazo
  "familia": "recompensa",                          // recompensa | microsoft | rrhh | externos
  "idiomas": ["es", "ca", "en"],
  "remitente": { "nombre": "Recursos Humanos", "buzon": "beneficios" },

  // Solo en landings con formulario:
  //   "credenciales" -> tiene campo de contraseña (el linter exige name="password")
  //   "datos"        -> formulario sin contraseña
  //   null / ausente -> sin formulario
  "captura": "credenciales",

  // Solo en la página formativa, para que no salga en la rejilla de landings:
  "formativa": true,

  // Los campos del paso 3 del dashboard. El formulario se construye solo.
  "campos": [
    { "clave": "importe", "etiqueta": "Importe", "tipo": "texto", "defecto": "100 €",
      "ayuda": "Aparece bajo el campo. Explica el porqué, no lo obvio." }
  ],

  "asunto": {                                        // solo emails
    "es": { "facil": "…", "medio": "…", "dificil": "…" }
  },

  "fragmentos": {
    "es": {
      "facil":   { "saludo": "…", "entradilla": "…", "urgencia": "…", "cta": "…", "cierre": "…" },
      "medio":   { },
      "dificil": { }
    }
  }
}
```

`tipo` acepta `texto`, `numero` y `opciones` (con un array `opciones`).

Los tres niveles deben existir para cada idioma declarado. Si falta uno, el
dashboard cae a otro en silencio y la campaña sale mal calibrada — por eso el
linter lo trata como error, no como aviso.

---

## Los fragmentos son plantillas a su vez

Un fragmento puede contener variables, y se resuelven:

```json
"entradilla": "Por tus {{anios}} años en {{empresa}}, una tarjeta de {{importe}}."
```

Aquí es donde se teje el nombre del cliente dentro del texto, que es lo que
hace creíble el correo. El motor hace pasadas sucesivas hasta que no queda nada
por sustituir (tope de 6, para cortar cualquier ciclo).

---

## Variables disponibles en el HTML

**De la marca**, siempre presentes:

| Variable | Qué es |
|---|---|
| `{{empresa}}` | Nombre del cliente |
| `{{sector}}` | Sector, para el copy |
| `{{dominio}}` | Dominio corporativo |
| `{{firma}}` | Firma o departamento emisor |
| `{{color}}` | Color corporativo en hex |
| `{{colorOscuro}}` | El mismo, oscurecido, para hover y bordes |
| `{{colorTexto}}` | Negro o blanco, el que contraste con `{{color}}` |
| `{{logoHtml}}` | Bloque de logo ya resuelto: `<img>` si lo hay, si no el nombre en texto |
| `{{anio}}` | Año actual |

Usa `{{logoHtml}}` en lugar de montar el `<img>` a mano: así la plantilla
funciona igual cuando el cliente no ha dado logo.

**De GoPhish**, que se dejan literales: `{{.FirstName}}`, `{{.LastName}}`,
`{{.Email}}`, `{{.Position}}`, `{{.From}}`, `{{.URL}}`, `{{.BaseURL}}`,
`{{.RId}}`, `{{.Tracker}}`.

---

## Reglas que aplica el linter

Cada una existe porque el fallo que evita ya se ha visto en plantillas reales.

**En todas**

- Más de 200 KB — es un volcado de sitio real, no una plantilla escrita.
- Cualquier `src` o `href` por `http://` — se rompe, o avisa al dominio real de
  que alguien está abriendo el correo.
- Imágenes remotas por `https` — aviso: mejor incrustadas en base64.

**En correos**

- Sin `{{.Tracker}}` — pierdes la métrica de apertura.
- Sin `{{.URL}}` — el enlace no lleva a la landing.
- `display:flex`, `display:grid`, `position:absolute` o `position:fixed` —
  Outlook usa el motor de Word y los ignora, descolocando el correo.
- Sin maquetación por tablas — no sobrevive a Outlook.

**En landings con `"captura": "credenciales"`**

- Sin `method="post"` — GoPhish no captura nada.
- Sin `name="password"` exacto — *Capture Passwords* no lo reconoce y la
  contraseña se guarda aunque tengas la casilla desmarcada.
- Sin `name="email"` exacto — el resultado no se puede cruzar con el destinatario.

---

## Cómo escribir un correo que aguante Outlook

Copia el esqueleto de `templates/emails/tarjeta-regalo-antiguedad/es.html`. Lo
que importa:

- Tablas anidadas con `role="presentation"`, ancho fijo de 600 px.
- Todos los estilos **inline**. El bloque `<style>` es solo mejora progresiva
  para el móvil: si Outlook lo ignora, el correo sigue leyéndose.
- Botones como `<td bgcolor>` con un `<a>` dentro con `padding`, nunca un
  `<button>`.
- Iconos y logotipos dibujados con tablas o CSS cuando se pueda, en lugar de
  imágenes. La marca de cuatro cuadros de Microsoft en `m365-caducidad-password`
  es un ejemplo: cero peticiones a servidores ajenos.
- Preencabezado oculto al principio del `<body>`: es lo que se lee en la
  bandeja junto al asunto, y casi nadie lo aprovecha.
