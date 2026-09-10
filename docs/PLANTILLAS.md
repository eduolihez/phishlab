# Cómo se escribe una plantilla

Todo lo que hay en `templates/` son datos. Añadir una plantilla no toca ni una
línea de la aplicación.

---

## Anatomía

```
templates/emails/banca-cargo-no-reconocido/
  meta.json            metadatos, campos y bloques declarados
  copy/es.json         el copy, en variantes por señal
  copy/ca.json
  copy/en.json
```

Y el layout, que puede ser propio o compartido:

```
templates/layouts/aviso.html    compartido por casi todos los correos
templates/emails/<id>/layout.html   solo si esa plantilla necesita el suyo
```

Una plantilla que declara `"layout": "aviso"` reutiliza el compartido. Veinte
avisos corporativos son la misma maqueta con otro texto: compartirla hace que
arreglar un `<td>` los arregle todos en lugar de uno.

---

## La vía rápida

Escribe un fichero en `catalogo/` y ejecuta el generador. Es lo que se usó para
las once últimas plantillas del catálogo.

```jsonc
// catalogo/mi-familia.json
[{
  "id": "soporte-ticket-cerrado",
  "tipo": "emails",
  "layout": "aviso",
  "nombre": "Soporte · Ticket cerrado",
  "descripcion": "Aviso de cierre de una incidencia que el usuario no recuerda haber abierto.",
  "familia": "saas",
  "categoria": "saas-corporativo",
  "tags": ["soporte", "ticket", "credenciales"],
  "remitente": { "nombre": "Soporte TI", "buzon": "soporte" },
  "campos": [
    { "clave": "ticket", "etiqueta": "Número de ticket", "tipo": "texto", "defecto": "INC-44718" }
  ],
  "copy": {
    "es": { "asunto": { "base": "Tu ticket {{ticket}} se ha cerrado" }, "...": "..." },
    "ca": { "...": "..." },
    "en": { "...": "..." }
  }
}]
```

```bash
node tools/nueva-plantilla.js catalogo/mi-familia.json
npm run lint
```

El generador escribe `meta.json` y los `copy/*.json`, **lee los bloques del
propio layout** (así el meta y el layout no pueden desincronizarse) y regenera
`templates/index.json`. Los textos de relleno que todo correo lleva
(«si el botón no funciona…», el pie automático) se añaden solos.

---

## El copy va por señales

Cada fragmento se escribe con las variantes que necesite:

```json
{
  "entradilla": {
    "base": "Como parte de la política de credenciales de {{empresa}}...",
    "urgencia": "Tu contraseña caduca en {{dias}} días.",
    "urgencia+erratas": "Su contraseña EXPIRA HOY. Si no la actualiza..."
  }
}
```

Reglas:

- **`base`** es el suelo: el texto sin ninguna señal encendida.
- Una clave con `+` exige que **todas** sus señales estén activas.
- Entre las que encajan gana la **más específica** (la que cubre más señales).
- Un fragmento que no cambia entre señales se escribe como cadena suelta:
  `"etiquetaCuenta": "Cuenta"`.

No hace falta escribir una variante por combinación posible. `urgencia` sirve
para cualquier combinación que incluya urgencia, y solo se añade
`urgencia+erratas` cuando ese caso concreto merece un texto distinto.

Las señales válidas son las de `templates/senales.json`. El linter falla si una
variante menciona una que no existe.

---

## Los bloques

Se anotan en el layout con comentarios HTML:

```html
<!--@bloque:urgencia @senal:urgencia-->
<tr><td class="aviso">{{urgencia}}</td></tr>
<!--@/bloque-->
```

| Atributo | Qué hace |
|---|---|
| `@opcional` | Aparece en el panel con un interruptor, encendido por defecto |
| `@senal:urgencia` | Lo gobierna esa señal |
| `@senal:!incoherencia-marca` | Lo gobierna esa señal **al revés**: aparece cuando está apagada |

Sin ninguno de los tres, el bloque está siempre y marcarlo no aporta nada (el
linter lo avisa).

Prioridad al decidir si un bloque se queda: lo que el usuario haya tocado a mano
manda sobre la señal, y la señal manda sobre el valor por defecto.

Los marcadores se limpian al exportar. Nunca salen en el HTML que se pega en
GoPhish.

---

## Escribir un layout propio

Solo si la maqueta no encaja con ninguna de `templates/layouts/`. Reglas que el
linter comprueba:

- **Maquetación por tablas.** Outlook usa el motor de Word: `display:flex`,
  `display:grid` y `position:absolute` los ignora y descoloca el correo.
- **Nada remoto.** Ni `http://`, ni imágenes por `https://`. Todo incrustado en
  base64. Un recurso remoto avisa al servidor de origen cada vez que alguien
  abre el correo, y desaparece el día que ese servidor cambie.
- **`{{.URL}}` y `{{.Tracker}}`** en los correos, literales, sin resolver.
- En landings con `"captura": "credenciales"`, los campos se llaman **`email` y
  `password` exactamente así**: es como GoPhish identifica la contraseña.
- `<html lang="{{idioma}}">`, que el layout es el mismo para los tres idiomas.

Después hay que declarar los bloques en `meta.json`, o usar
`tools/anotar-bloques.js` con su geometría en `tools/bloques.json`.

---

## Variables disponibles

Las aporta la aplicación, no hay que declararlas:

| Variable | Qué trae |
|---|---|
| `{{empresa}}` `{{sector}}` `{{dominio}}` `{{firma}}` | Del panel de marca |
| `{{color}}` `{{colorOscuro}}` `{{colorTexto}}` | Color corporativo y derivados legibles |
| `{{logoHtml}}` | El logo ya resuelto: `<img>` con data URI, o el nombre en texto |
| `{{anio}}` `{{idioma}}` | Año actual e idioma del render |

Más las claves de `campos` que declare la plantilla, y los fragmentos de su
`copy`.

**Los campos son de campaña, no de plantilla.** Si el correo y la landing usan
la misma clave (`importe`, `referencia`), se escribe una vez y sale igual en los
dos. Por eso la landing de canje declara los mismos campos que su correo.

---

## Antes de darla por buena

```bash
npm run lint
```

Comprueba, para cada plantilla y cada combinación de idioma y preset: que no
queda ninguna variable sin valor, que los bloques del layout y del `meta.json`
cuadran, que las señales existen, que el correo tiene enlace y tracker, que la
landing de credenciales conserva los nombres de campo, y que ninguna plantilla
marcada para la demo pública menciona una marca real.

Después, ábrela en la biblioteca y míralas en los tres presets. El linter no
detecta que un texto suene raro.
