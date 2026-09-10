# PhishLab — caso de estudio para el portfolio

Contenido listo para portar a la web. La estructura sigue la de los proyectos
que ya tienes publicados (Blue Team Hub, Password Sentinel): tarjeta en la
rejilla de proyectos, más una página propia.

---

## Tarjeta de proyecto

```
Nombre:       PhishLab
Badge:        Open Source
Descripción:  Biblioteca de plantillas para simulaciones de phishing
              autorizadas. Compone cada correo por bloques y lo calibra por
              señales independientes, así que el informe puede decir qué
              pista se le pasó a cada empleado y no solo cuántos picaron.
Tecnologías:  JavaScript · Node.js · GoPhish · Zero dependencies
Enlaces:      Página del proyecto · Código
```

Con 168 caracteres la descripción encaja en el largo de las que ya tienes.

---

## Página del proyecto

### 01 / El problema

Una campaña de concienciación termina en un porcentaje: *picó el 31% de la
plantilla*. Ese número no dice qué hacer después.

Dos personas que hacen clic en el mismo correo pueden estar fallando por
motivos distintos. Una no miró el dominio del remitente. Otra lo miró, le
pareció raro, y aun así pulsó porque el mensaje decía que la cuenta se
suspendía en dos horas. La formación que necesita cada una no es la misma, y un
porcentaje agregado no las distingue.

La herramienta de la que partía generaba material correcto, pero trataba la
dificultad como un botón de tres posiciones: fácil, medio, difícil. Cada nivel
era un texto distinto escrito a mano. No se podía medir una pista concreta.

### 02 / La decisión de diseño

**La unidad de medida deja de ser el nivel y pasa a ser la señal.**

Hay seis señales independientes que un empleado puede detectar: urgencia,
erratas, saludo genérico, dominio del remitente, enlace que no coincide e
incoherencia de marca. Cada una se enciende y se apaga por separado.

Los tres niveles siguen existiendo, pero como **presets**: combinaciones con
nombre que mantienen la comparación entre campañas de un año y otro. Si quieres
medir una señal concreta, partes del preset difícil y enciendes solo esa: lo
que midas es la exposición a esa pista y a ninguna otra.

Eso obligó a resolver un problema de contenido. Con seis señales hay 64
combinaciones, y escribir 64 versiones de cada correo es inviable. La solución
fue indexar el copy por señal en lugar de por nivel:

```json
{
  "entradilla": {
    "base": "Como parte de la política de credenciales de {{empresa}}...",
    "urgencia": "Tu contraseña caduca en {{dias}} días.",
    "urgencia+erratas": "Su contraseña EXPIRA HOY. Si no la actualiza..."
  }
}
```

Gana la variante cuya clave sea el subconjunto más específico de las señales
activas. Un texto escrito para `urgencia` sirve para las 32 combinaciones que la
incluyen; solo se escribe una variante nueva cuando ese caso concreto merece
otro tono. Tres variantes cubren lo que en el modelo anterior necesitaba tres
plantillas separadas.

### 03 / Bloques dentro del HTML real

El HTML de un correo corporativo son tablas anidadas y hacks de Outlook. Un
generador de bloques tipados habría sido más limpio de programar y habría hecho
imposible el caso de uso principal: importar un correo real y usarlo tal cual.

La solución fue anotar el HTML auténtico con comentarios:

```html
<!--@bloque:urgencia @senal:urgencia @opcional-->
<tr><td class="aviso">{{urgencia}}</td></tr>
<!--@/bloque-->
```

Un bloque se activa a mano desde el panel o lo gobierna una señal. El motor los
poda antes de sustituir variables. Los marcadores nunca sobreviven a la
exportación: un `<!--@bloque:urgencia-->` en el código fuente de un correo es
exactamente el rastro que delata que el mensaje es material de simulación.

Un bloque puede depender de que una señal esté **apagada**. El pie legal
completo es justo lo que un phishing no se molesta en copiar, así que vive con
`@senal:!incoherencia-marca` y desaparece cuando enciendes esa señal.

### 04 / Importar material real

El phishing que de verdad recibe un cliente llega como `.eml`. La herramienta lo
convierte en plantilla con un parser MIME escrito a mano —multipart anidado,
quoted-printable, base64, juegos de caracteres, palabras codificadas RFC 2047—
porque el proyecto no tiene dependencias y esa propiedad valía más que
ahorrarse doscientas líneas.

Lo interesante no es el parser, es el saneado. Al clonar un correo real te
llevas por delante los píxeles de seguimiento del remitente original. Si se
quedan dentro, cada empleado que abra tu simulación se lo está notificando a un
tercero. El importador los corta, incrusta en base64 las imágenes que venían
adjuntas, reescribe los enlaces a `{{.URL}}` y **enseña un informe de todo lo
que ha tocado antes de guardar nada**.

### 05 / El problema del escaparate

Este proyecto tenía un conflicto: es una herramienta que genera material de
phishing y a la vez una pieza de portfolio.

Publicar la herramienta completa habría sido publicar un kit de phishing
alojado. Un dominio personal con landings de login funcionales dura lo que tarda
Google Safe Browsing en marcarlo, y se lleva por delante el resto del sitio.

La solución fue separar las salidas. `npm run build:demo` genera un estático con
solo las plantillas cuya marca es inventada, sin exportación, sin importación y
con los formularios de credenciales desactivados. La herramienta completa se
queda en local.

El cinturón de seguridad está por duplicado: el linter falla si una plantilla
marcada para publicar menciona una marca real, y el generador repite la
comprobación y se niega a escribir. El linter se puede olvidar de ejecutar; el
generador corre justo en el momento en el que un descuido pasaría a estar
publicado.

Afinar esa lista tuvo su gracia: buscar marcas sin distinguir mayúsculas casa
con `-apple-system` en la pila de tipografías, con el `xmlns` de VML que
menciona a Microsoft en todo correo compatible con Outlook, y con «correos»,
que en español es el plural de correo. Un linter con ruido acaba siendo un
linter que nadie mira, así que las marcas cuyo nombre es también palabra
corriente se comprueban respetando su capitalización.

### 06 / Lo que hay dentro

- **Sin dependencias y sin build.** Módulos ES que el navegador carga tal cual.
  Se copia a una carpeta compartida y se abre.
- **Servidor local en Node** atado a `127.0.0.1`, que rechaza cualquier Origin
  que no sea local, para lo único que el navegador no puede hacer: parsear un
  `.eml` y escribir en disco.
- **259 pruebas** sobre lo que falla en silencio: que las variables de GoPhish
  nunca se resuelvan al exportar, que podar no se lleve el píxel de métrica por
  delante, que los campos `email` y `password` conserven su nombre exacto (es
  como GoPhish identifica la contraseña; si se renombran, se guarda aunque la
  casilla esté desmarcada).
- **Linter del catálogo** que recorre cada plantilla en tres idiomas y tres
  presets buscando huecos sin rellenar, bloques descuadrados y CSS que Outlook
  ignora.
- **17 plantillas** en cinco categorías, en castellano, catalán e inglés.

### 07 / Qué me llevo

Que la decisión que más valor añadió no fue técnica. Cambiar «nivel» por
«señal» no era más difícil de programar, pero cambia lo que el cliente recibe al
final: en vez de un porcentaje, un desglose de qué pista concreta se le pasó a
cada persona. La arquitectura vino detrás de esa decisión, no al revés.

Y que la parte incómoda del proyecto —que sea material ofensivo con marca de
clientes dentro— no se resuelve ignorándola. Se resuelve decidiendo, por
escrito y con un linter que lo comprueba, qué sale de la máquina y qué no.

---

## Capturas sugeridas

| Fichero | Qué enseña |
|---|---|
| `biblioteca.png` | La rejilla con las previsualizaciones en vivo y los filtros |
| `detalle-medio.png` | Panel de señales con el correo compuesto al lado |
| `detalle-facil.png` | El mismo correo con todas las señales encendidas |
| `senales.png` | La referencia de las seis señales y los tres presets |

Las dos de detalle en pareja son la mejor manera de contar la idea sin
explicarla: el mismo correo, dos calibraciones, diferencias visibles.

---

## Aviso para la página

Conviene que la página del proyecto lleve una nota visible:

> Herramienta interna para simulaciones de phishing **autorizadas por
> contrato**. Cada paquete que genera incluye el checklist de autorización
> previa. La demo pública usa marcas inventadas y tiene la exportación
> desactivada.

No es paja legal: es parte de lo que demuestra el proyecto.
