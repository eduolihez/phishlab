/**
 * Linter del catálogo de plantillas.
 *
 * Cada regla existe porque el fallo que evita ya se ha visto en plantillas
 * reales. Ejecutar con `npm run lint` antes de dar por buena una plantilla nueva.
 *
 *   node tools/lint.js
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(RAIZ, 'templates');

const TAMANO_MAXIMO = 200 * 1024;
const IDIOMAS_ESPERADOS = ['es', 'ca', 'en'];
const NIVELES = ['facil', 'medio', 'dificil'];

let errores = 0;
let avisos = 0;

const error = (donde, msg) => { console.error(`  ERROR  ${donde}: ${msg}`); errores++; };
const aviso = (donde, msg) => { console.warn(`  aviso  ${donde}: ${msg}`); avisos++; };

const indice = JSON.parse(readFileSync(join(TEMPLATES, 'index.json'), 'utf8'));

for (const tipo of ['emails', 'landings']) {
  for (const id of indice[tipo]) {
    revisar(tipo, id);
  }
}

console.log(`\n${errores} errores, ${avisos} avisos`);
process.exit(errores ? 1 : 0);

function revisar(tipo, id) {
  const carpeta = join(TEMPLATES, tipo, id);
  const rutaMeta = join(carpeta, 'meta.json');

  console.log(`\n${tipo}/${id}`);

  if (!existsSync(rutaMeta)) {
    error(id, 'falta meta.json');
    return;
  }

  let meta;
  try {
    meta = JSON.parse(readFileSync(rutaMeta, 'utf8'));
  } catch (e) {
    error(`${id}/meta.json`, `JSON inválido: ${e.message}`);
    return;
  }

  if (!meta.nombre) error(id, 'meta.json sin "nombre"');
  if (!Array.isArray(meta.idiomas) || !meta.idiomas.length) {
    error(id, 'meta.json sin "idiomas"');
    return;
  }

  for (const lang of IDIOMAS_ESPERADOS) {
    if (!meta.idiomas.includes(lang)) aviso(id, `sin versión en "${lang}"`);
  }

  // Los fragmentos deben existir para cada idioma declarado y cada nivel: si
  // falta uno, el dashboard cae a otro idioma en silencio y la campaña sale
  // en el idioma equivocado.
  for (const lang of meta.idiomas) {
    for (const nivel of NIVELES) {
      if (!meta.fragmentos?.[lang]?.[nivel]) {
        error(id, `faltan fragmentos para ${lang}/${nivel}`);
      }
    }
    if (tipo === 'emails' && !meta.asunto?.[lang]) {
      error(id, `falta el asunto en "${lang}"`);
    }
  }

  for (const lang of meta.idiomas) {
    const ruta = join(carpeta, `${lang}.html`);
    if (!existsSync(ruta)) {
      error(id, `falta ${lang}.html`);
      continue;
    }
    revisarHtml(tipo, `${id}/${lang}.html`, readFileSync(ruta, 'utf8'), meta);
  }
}

function revisarHtml(tipo, donde, html, meta) {
  const bytes = Buffer.byteLength(html);

  // Un fichero enorme casi siempre significa "guardar página como" en lugar de
  // plantilla escrita: base64 gigante, HTML de volcado, imposible de mantener.
  if (bytes > TAMANO_MAXIMO) {
    error(donde, `${(bytes / 1024).toFixed(0)} KB — parece un volcado de sitio real, no una plantilla`);
  }

  // Un recurso por http:// se rompe, o peor: avisa al dominio real de que
  // alguien está abriendo el correo.
  const inseguros = html.match(/(?:src|href)="http:\/\/[^"]+"/g);
  if (inseguros) {
    error(donde, `${inseguros.length} recurso(s) por http:// — deben ir incrustados: ${inseguros[0].slice(0, 60)}`);
  }

  // Un recurso remoto por https tampoco vale en un email: revela la apertura
  // a un tercero y desaparece cuando ese servidor cambie.
  const remotos = (html.match(/(?:src)="https:\/\/[^"]+"/g) || []).length;
  if (remotos) {
    aviso(donde, `${remotos} imagen(es) remota(s) por https — mejor incrustadas en base64`);
  }

  if (tipo === 'emails') {
    if (!html.includes('{{.Tracker}}')) {
      error(donde, 'sin {{.Tracker}} — pierdes la métrica de apertura');
    }
    if (!html.includes('{{.URL}}')) {
      error(donde, 'sin {{.URL}} — el enlace no llevará a la landing');
    }

    // Outlook usa el motor de Word: ignora estas propiedades y descoloca el correo.
    for (const prop of ['display:flex', 'display:grid', 'position:absolute', 'position:fixed']) {
      if (html.replace(/\s/g, '').includes(prop)) {
        error(donde, `usa "${prop}", que Outlook ignora`);
      }
    }
    if (!/<table/i.test(html)) {
      error(donde, 'sin maquetación por tablas — no sobrevivirá a Outlook');
    }
  }

  if (tipo === 'landings' && meta.captura === 'credenciales') {
    // El punto crítico: GoPhish reconoce la contraseña por el nombre del campo.
    // Con otro nombre, "Capture Passwords" no la filtra y se guarda igual
    // aunque tengas la casilla desmarcada.
    if (!/<form[^>]+method="post"/i.test(html)) {
      error(donde, 'el formulario no usa method="post" — GoPhish no capturará nada');
    }
    if (!/name="password"/.test(html)) {
      error(donde, 'sin campo name="password" exacto — "Capture Passwords" no lo reconocerá');
    }
    if (!/name="email"/.test(html)) {
      error(donde, 'sin campo name="email" exacto — el resultado no se podrá cruzar con el destinatario');
    }
  }

  if (tipo === 'landings' && meta.captura && !/<form[^>]+method="post"/i.test(html)) {
    error(donde, 'declara captura pero no tiene formulario POST');
  }

  console.log(`  ok     ${donde}  ${(bytes / 1024).toFixed(1)} KB`);
}
