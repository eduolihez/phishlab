# PhishLab

### **[English version](README.en.md)** · [Versión en Español](README.md)

A library of email and landing page templates for **contractually authorized
phishing simulations**, with export ready to import into GoPhish.

You pick a template, set the client's brand, adjust language and signals, and
you get a ZIP with the email HTML, the landing HTML, the training page, and
the GoPhish import instructions.

It doesn't send anything or run campaigns; GoPhish still does that.

---

## Intended use

An internal tool for a cybersecurity team preparing awareness exercises
contracted by the client. Every package it generates includes an
`AUTORIZACION.md` with the pre-flight checklist: signed contract, scope,
execution window, escalation contact, SOC notified, and a data-handling
agreement.

**Don't publish the full tool without a gate in front of it.** It doesn't
store anything sensitive, but it generates phishing material with real
branding. There are two ways to show it off without that risk: a public demo
with made-up brands and no export (see "The public demo" below), and a "lab"
with the full tool behind a login with individual accounts, managed from
`admin.eduolihez.com` (see `docs/EDUOLIHEZ.md`).

**Don't host it on the same server that serves campaign landing pages.**
People outside your organization visit that server.

---

## Getting started

**Double-click `abrir-phishlab.bat`.** It starts the local server and opens
the browser. Keep the black window open while you use it; close it to stop.
To change the port: `abrir-phishlab.bat 8081`.

Manually:

```bash
npm run dev          # node tools/servidor.js 8080
```

**Double-clicking `index.html` doesn't work.** The browser blocks ES modules
and template loading under `file://`, so the page would come up blank. It
needs to be served over HTTP, even if that's just localhost.

Node is required for the local server. Without it (for example with
`python -m http.server`) the library still displays, composes, and exports
just fine, but **you can't import an `.eml` or save your own templates**;
that's handled by the local API. The app detects this at startup and shows it
in the status bar.

For development:

```bash
npm test             # 339 tests, no dependencies
npm run lint         # catalog review
npm run build:demo   # generates the public demo in demo/
npm run build:lab     # generates the lab (full tool) in lab/
```

There's no build step or `node_modules`; the app is plain ES modules the
browser loads as-is.

---

## How it works

### The two namespaces

Both live inside every template's HTML:

| Variable | Who resolves it |
|---|---|
| `{{empresa}}`, `{{importe}}`, `{{saludo}}`… | PhishLab, at export time |
| `{{.FirstName}}`, `{{.URL}}`, `{{.Tracker}}` | **GoPhish**, at send time |

The engine substitutes the first set and leaves the second untouched. Mixing
them up is the expensive mistake: a template exported with `{{.URL}}` already
resolved sends the recipient nowhere, and you won't notice until the whole
campaign has already gone out. Tests guard against this.

The preview's **"sample data"** toggle does substitute the GoPhish ones
(`{{.FirstName}}` → *María*) so you can read the email the way the victim
will see it. Export never does this.

### Signals, not levels

Difficulty isn't a three-position switch; it's the combination of clues left
in place. There are six independent signals:

| Signal | What it measures |
|---|---|
| `urgencia` | Time pressure and threat of consequences |
| `erratas` | Spelling mistakes and missing accents |
| `saludo-generico` | "Dear user" instead of the recipient's name |
| `dominio-ajeno` | Sender on a visibly different domain |
| `enlace-visible` | The raw URL shown, not matching the link text |
| `incoherencia-marca` | Logo, tone, or signature that don't match |

`facil`, `medio`, and `dificil` are **presets** of those signals, defined in
`templates/presets.json`. You can start from one and toggle individual
signals on or off.

This is what changes the report you deliver: instead of "31% fell for it,"
you can say "31% didn't check the sender's domain, and half of those also
missed the urgency cues." The campaign's signal table ships inside each ZIP's
`INSTRUCCIONES.md`.

### Blocks

Each template's layout is annotated with comments:

```html
<!--@bloque:urgencia @senal:urgencia @opcional-->
<tr><td class="aviso">{{urgencia}}</td></tr>
<!--@/bloque-->
```

A block can be toggled from the panel, or driven by a signal. The engine
prunes them **before** substituting variables, and the markers never make it
into the exported HTML: a `<!--@bloque:urgencia-->` in an email's source code
is exactly the kind of trace that gives away that a message is simulation
material.

A block can also depend on a signal being **off**, with a `!` in front. The
full legal footer is exactly the thing a real phishing email wouldn't bother
copying, so it lives behind `@senal:!incoherencia-marca`.

### SMS templates (smishing)

A third template type, `templates/sms/<id>/`, alongside `emails/` and
`landings/`. An SMS is plain text: no `layout.html` or blocks to manage, just
`meta.json` + `copy/{es,ca,en}.json` with a single `cuerpo` fragment that
varies by signal, same as the rest of the copy.

Self-hosted GoPhish doesn't send SMS, only email over SMTP, so there's no
`{{.URL}}` to resolve. Instead, a free-text `{{enlace}}` field gets filled in
by hand with the URL of the already-published landing page. The workspace
shows the composed text as a phone bubble instead of an iframe, and the
Export tab lets you copy the text or download it as `.txt` to paste into
whatever SMS gateway the team uses.

There's no quishing (QR) support, for a similar reason that's already been
weighed on purpose: a QR code only shows something useful if it encodes the
final tracked URL, and GoPhish resolves that URL at send time, so PhishLab
doesn't know it at composition time. See `SECURITY.md`.

---

## Importing real material

`Import` turns a real email into a template. Two input types: an `.eml`
exported from Outlook or from quarantine, and HTML pasted by hand.

Both go through the same sanitization, which:

- Strips scripts, `<iframe>`, and `onclick` handlers.
- **Cuts remote images**, including the original sender's tracking pixels. If
  those stayed in place, every employee who opened your simulation would be
  notifying a third party.
- Embeds attached images as base64.
- Rewrites links to `{{.URL}}` and inserts `{{.Tracker}}`.

Before saving anything, it shows a report of what got touched. The
**authorization note is mandatory**: the linter won't let an imported
template through without it.

Imported material is saved under `templates/propias/`, which is outside git;
it holds material from a specific engagement.

### Cloning a whole page (the "Web" tab)

The same Import screen has a second tab for turning a real page, typically a
login page, into a landing page, with two ways to bring it in:

- **Ctrl+S bookmarklet.** Drag it to your bookmarks bar once; on the real
  page, already loaded and logged in if needed, click it or use Ctrl+S at any
  point. This even works for a screen that only appears after interacting
  with the page, like a login's second step. It copies the page to the
  clipboard (it doesn't send anything over the network; an earlier attempt
  posted directly to the local server, but Chrome blocks that jump from a
  public site to a local address without explicit browser permission, see
  `SECURITY.md`), so the last step is coming back to this tab and pasting it.
  This is the highest-fidelity option: it captures the page exactly as the
  browser rendered it, JavaScript included.
- **Paste a URL.** The local server does the fetch itself. Simpler, but it
  doesn't work for logins rendered by JavaScript.
- **Capture extension (recommended if you have it installed).** Lives in
  `extension/`, loaded as an unpacked extension
  (`chrome://extensions` → Developer mode → Load unpacked). Unlike the
  bookmarklet, it sends the capture straight to the local server, no
  copy-paste, because an installed extension can request host permission for
  `127.0.0.1` at install time, permission a public website can't get (see
  `SECURITY.md`). It also supports capturing several steps of a login before
  sending them together, and its resource embedding is more faithful than the
  server's: it runs with the tab's own cookies and without a regular fetch's
  CORS restrictions. It needs pairing once by pasting the code generated on
  this same screen into the extension popup. The popup also has a "Capture
  auto flow" button: it fills any email/password field it detects with
  generic data (`test@dominio.com` / `Test1234!`), submits the form, and
  repeats, so you don't have to click "Capture step" by hand on every screen
  of a multi-step login. You can stop it manually at any point with "Stop
  auto flow," and it stops on its own as soon as the captured screen already
  has a visible password field, since that's the last useful capture (from
  there a real campaign would move on to the awareness page), so it never
  fills or submits that one. When several captured steps arrive at once, the
  review marks whichever one has the detected password field as the
  recommended one to export: GoPhish only supports one page per landing, so
  the rest stay for reference only.

All three go through `tools/sanearWeb.js`, which resembles email sanitization
in the essentials (scripts and handlers out, links to `{{.URL}}`) but differs
on images: instead of cutting them, **it tries to embed them** as data URIs,
since they're the logo and background of the very page being cloned, not a
third party's pixel, and whatever it can't read gets flagged in the report
for manual fixing, never silently. It also detects the form's email and
password fields by heuristic and renames them to exactly `email`/`password`,
with a confidence level (high/low/not detected) shown before saving: the
linter won't let a credentials landing page through if those two fields
aren't there.

Multi-step logins (Google, Microsoft) fall outside a single capture: each
Ctrl+S brings in one screen, and combining two captures into one landing page
is manual work in the live editor afterward.

---

## Live editor

Each template is edited directly on its own preview, with no separate field
list: the text and images shown in the workspace are clickable. Clicking
makes that text editable; leaving the field shows the change immediately in
the same preview.

Underneath, there are two different paths depending on what kind of text it
is:

- **Copy fragment** (`{{entradilla}}`, `{{saludo}}`...): the change is
  written to whichever signal variant was active at that moment; if you edit
  with "urgencia" on, you change that variant, not the "dificil" one. The
  rest of the variants and the signal system stay intact underneath.
- **Any other text or image** (a hand-written label in the layout, or the
  entire body of an imported/cloned template): the change is saved as a
  literal patch on that template, bypassing the variant system.

Editing this way **doesn't modify the factory template**; it's a session
draft, same as always. Keeping it requires "Save as my own template," which
appears as soon as you touch anything. If the change includes standalone text
or images (not just copy fragments), the saved template ends up with that
moment's language and brand locked in; it stops recomposing with a different
brand or preset, because there's no way to undo a standalone piece of text
back into a variable.

---

## Credential capture

Login landing pages use a standard form, with no client-side logic:

```html
<form method="post" action="">
  <input name="email" ...>
  <input name="password" ...>
</form>
```

GoPhish decides what gets stored, via its *Capture Submitted Data* and
*Capture Passwords* checkboxes. Default recommendation: the first checked,
the second **unchecked**; you record who submitted the form and the
username, but the password is discarded before it's written to the database.

**The fields are named exactly `email` and `password` because that's how
GoPhish identifies the password field.** If you rename them while editing a
landing page, *Capture Passwords* stops recognizing it and the password gets
saved even with the checkbox unchecked. The linter checks this on every
template.

Even when it isn't stored, the password **does travel** in the POST body to
your GoPhish server. Make sure whatever reverse proxy sits in front of it
doesn't log request bodies, and purge the results before handing over the
report.

---

## Authorization before export

The Export tab has an interactive checklist with the six boxes from
`AUTORIZACION.md` (contract, scope, window, escalation contact, SOC notified,
data handling). The **Download campaign (.zip)** button stays disabled until
all six are checked; it used to be paper-based, where you could download the
ZIP without actually verifying anything. The `AUTORIZACION.md` that ships in
the ZIP comes with those same boxes already checked.

---

## Results report

`#/informe`, reachable from the button on the Export tab or from the
Library, with no third link cluttering the nav bar (navigation was
deliberately reduced to Library/Import, see `DESIGN.md`).

Besides the usual `INSTRUCCIONES.md`, the exported ZIP includes a
`campana.json` recording which template, preset, and signals it carried.
Upload that file along with the results CSV that GoPhish exports, and
PhishLab calculates, in the browser, the open, click, data-submission, and
report rates, cross-referenced with that specific campaign's signal table, so
you can say "the 34% who submitted data had missed both the urgency cues and
the wrong domain" instead of just "34% fell for it." Nothing gets uploaded to
any server and no individual recipient is stored anywhere, only aggregates;
the report can be downloaded as Markdown.

---

## The public demo

`npm run build:demo` generates a publishable static site in `demo/`:

- Only templates marked `"demo": true` are included.
- Every brand is made up. **The linter fails if a template marked for the
  demo mentions a real brand**, and the generator refuses to write anything
  if that check doesn't pass.
- Export and import are disabled, and credential forms don't submit
  anywhere.

This is what can be shown in a portfolio without publishing an openly hosted
phishing kit. Linked from the project page, indexable.

---

## The lab (full tool, gated)

`npm run build:lab` generates the full tool in `lab/`: the entire catalog,
real branding, forms and export all working. Unlike the demo, it **doesn't**
check for the absence of brands or disable anything; the whole point is to
show the real tool.

That's why it's never published without a gate in front of it. The reference
deployment (`lab.eduolihez.com`, login with individual accounts managed from
`admin.eduolihez.com`) is documented in `docs/EDUOLIHEZ.md`. No public link
from anywhere; credentials are shared directly with whoever requests them.

---

## Structure

```
index.html                 App shell (nav: Biblioteca · Importar)
assets/css/                Styles, no CDN
assets/js/core/            engine · senales · catalog · componer · edicionInline · brand · zip · gophish · informe · importar · estado
assets/js/ui/              router · biblioteca · detalle · exportar · editorEnVivo · importar · importarWeb · informe · bandejaPreview · marca · fields · dom
assets/js/bookmarklet/     capturar.js — source of the Ctrl+S cloning bookmarklet
templates/senales.json     The six signals
templates/presets.json     facil / medio / dificil as signal combinations
templates/index.json       Catalog index
templates/layouts/         Shared layouts (notice, login), not used yet by any factory template
templates/emails/<id>/     meta.json + copy/{es,ca,en}.json  (+ its own layout.html if not shared)
templates/landings/<id>/   Same
templates/sms/<id>/        meta.json + copy/{es,ca,en}.json — no layout.html, an sms is plain text
templates/propias/         Imported, cloned, and custom variants. Outside git.
catalogo/                  Template registration files for tools/nueva-plantilla.js
tests/                     node --test (see npm test for the current count)
extension/                 MV3 capture extension (replaces the bookmarklet for cloning sites)
tools/servidor.js          Local server + import and cloning API
tools/eml.js               Dependency-free .eml parser
tools/sanear.js            Sanitization of imported HTML
tools/sanearWeb.js         Sanitization of a fully cloned page (embeds assets, detects login)
tools/lint.js              Catalog linter
tools/nueva-plantilla.js   Registers templates from a JSON file
tools/build-demo.js        Public demo generator
tools/build-lab.js         Lab generator (full tool, gated)
tools/migrar-v2.js         Migrates v1 templates to v2
docs/                      GOPHISH.md · PLANTILLAS.md
docs/superpowers/specs/    Design specs (v2: data model · v3: workspace, live editor, cloning)
```

The app has two sections in the nav: **Biblioteca** (home, browse, calibrate,
live-edit, and export each template from a single workspace) and **Importar**
(bring in real material, from email or a whole webpage). Building a campaign
isn't a separate screen anymore; it happens from the "Exportar" tab of the
template's own workspace.

Everything under `templates/` is data: adding a template doesn't touch a
single line of the app. See `docs/PLANTILLAS.md`.

---

## Current catalog

40 factory templates (24 emails + 11 landing pages + 5 SMS), all real-brand
except the training page, in Spanish, Catalan, and English.

**Emails** — Adobe (document to sign), Agencia Tributaria (pending refund),
Amazon (pending refund), BBVA (suspicious access), Bizum (pending money),
Correos (held package), El Corte Inglés (gift card for employees), DHL
(package in customs), DocuSign (document to sign), Dropbox (shared document),
Endesa (service cutoff), Fortinet (expired security license), GitHub (new
login), Google (activity verification), iCloud (backup full), Instagram
(account flagged for violation), Jira (password reset), LinkedIn (pending
message), Microsoft 365 (password expiring), Movistar (unpaid bill), Netflix
(payment problem), PayPal (suspicious activity), Seguridad Social (pending
notification), Spotify (payment declined).

**Landing pages** — the same brands, as login or verification: Adobe,
DocuSign, Dropbox, GitHub, Google, Jira (via Atlassian), LinkedIn, Microsoft,
Netflix, PayPal. The 12 email templates added in the Spanish expansion don't
have a matching landing page yet; use the closest generic one (Microsoft,
PayPal…) until a dedicated one gets written.

**SMS (smishing)** — WhatsApp (access verification), Bizum (money received),
Correos (held package), Glovo (order issue), a generic BBVA-style bank
(access alert).

**Training** — a post-click awareness page, unbranded.

Each brand's logo lives embedded as an inline `<svg>` in that template's own
`layout.html`; see `SECURITY.md` for where it comes from and why it's no
longer a base64 `<img>`. `{{logoHtml}}` is still separate: it's the
**client's** (tenant's) logo, uploaded when setting up the campaign, not the
impersonated brand's.
