# Del ZIP a la campaña en GoPhish

Cada paquete que genera PhishLab trae su propio `INSTRUCCIONES.md` con los
valores concretos de esa campaña (asunto, remitente sugerido, casillas de
captura). Este documento es el recorrido general, una sola vez.

---

## 1 · Email Template

**Email Templates → New Template**

| Campo | Qué poner |
|---|---|
| Name | `<plantilla> — <cliente> — <calibración>` |
| Subject | El asunto que trae `INSTRUCCIONES.md`, ya resuelto |
| Envelope Sender | El remitente sugerido, o el que hayáis acordado |
| HTML | Botón `<>` (Source) → pega `email.html` entero |

**Add Tracking Image: desmarcado.** Las plantillas ya llevan `{{.Tracker}}`
colocado donde toca; marcarlo añadiría un segundo píxel.

Pega siempre en la vista **Source**. Si pegas en el editor visual, TinyMCE
reescribe el HTML y se lleva por delante los estilos inline que hacen que el
correo aguante en Outlook.

---

## 2 · Landing Page

**Landing Pages → New Page** → botón `<>` (Source) → pega `landing.html`.

### Las dos casillas

| Casilla | Recomendado | Efecto |
|---|---|---|
| Capture Submitted Data | **Marcada** | Registra el evento *Submitted Data* y los campos del formulario |
| Capture Passwords | **Desmarcada** | Descarta el valor de la contraseña antes de guardarlo |

Con esa combinación sabes exactamente quién llegó a enviar el formulario y con
qué usuario, sin acabar con una tabla llena de credenciales reales del cliente.

Márcala solo si el contrato lo exige, y purga los resultados al entregar el
informe.

**Redirect to:** la URL donde publiques `formativa.html`. Sin ella la campaña
mide pero no enseña, y es la página que el cliente enseña a su comité.

### El detalle que se pasa por alto

GoPhish identifica la contraseña por el **nombre del campo**. Las plantillas de
PhishLab lo llaman `password` exactamente por eso. Si editas la landing dentro
de GoPhish y renombras ese campo, *Capture Passwords* deja de reconocerlo y la
contraseña se guarda aunque tengas la casilla desmarcada.

Y aunque no se almacene, la contraseña **viaja** en el cuerpo del POST hasta tu
servidor. Comprueba que el reverse proxy que tengas delante no registra cuerpos
de petición.

---

## 3 · Sending Profile

Nada específico de PhishLab, pero dos cosas que deciden si el correo llega:

- El **Envelope Sender** del perfil y el de la plantilla deben ser coherentes
  entre sí y con el SPF del dominio que uséis. Un desajuste manda la campaña a
  spam y arruina la métrica antes de empezar.
- Manda siempre un **Send Test Email** a tu propio buzón y ábrelo en Outlook de
  escritorio, no solo en el móvil. Es donde se rompe el maquetado.

---

## 4 · Users & Groups

La lista de destinatarios vive aquí, no en PhishLab. Rellena `First Name`,
`Last Name`, `Email` y `Position`: son las variables que resuelven
`{{.FirstName}}`, `{{.LastName}}`, `{{.Email}}` y `{{.Position}}`.

Sin la señal **saludo genérico**, las plantillas usan el nombre de pila. Si la lista viene
con el campo vacío, el correo saldrá con un hueco raro y perderás credibilidad
justo en la calibración donde más importa.

---

## 5 · Antes de lanzar

- [ ] `Send Test Email` recibido y revisado en Outlook de escritorio.
- [ ] El botón del correo lleva a la landing, no a `#`.
- [ ] La landing se ve bien en móvil.
- [ ] El logo del cliente aparece en correo y landing (va incrustado, no enlazado).
- [ ] Casillas de captura como indica `INSTRUCCIONES.md`.
- [ ] *Redirect to* apunta a la página formativa.
- [ ] El proxy delante de GoPhish no registra cuerpos de petición.
- [ ] `AUTORIZACION.md` completo: contrato, alcance, ventana, contacto de
      escalado, SOC avisado y tratamiento de datos acordado.

---

## Al cerrar

- [ ] Resultados exportados para el informe.
- [ ] Destinatarios y credenciales purgados de GoPhish.
- [ ] Landing retirada del servidor público.
- [ ] Página formativa comunicada a todo el personal incluido en el alcance.
