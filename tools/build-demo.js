/**
 * Generador de la demo pública.
 *
 * Produce en `demo/` una copia estática de PhishLab que se puede publicar en
 * internet sin que sea un kit de phishing alojado:
 *
 *   - Solo entran las plantillas marcadas `"demo": true`, que son las que el
 *     linter ha verificado que no mencionan ninguna marca real.
 *   - Se marca el documento como modo demo, y la aplicación esconde entonces
 *     la exportación y la importación.
 *   - Las landings de credenciales salen con el formulario desactivado: en la
 *     herramienta local el `action` vacío lo rellena GoPhish, pero en una
 *     página pública un formulario de contraseña que envía a algún sitio es
 *     exactamente lo que no se puede publicar.
 *
 * Antes de escribir nada se ejecuta la comprobación de marcas. Si falla, no se
 * genera la demo: es preferible quedarse sin demo que publicar la imagen de un
 * banco real en un dominio personal.
 *
 *   node tools/build-demo.js [destino]
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listarPlantillas, leerLayout, leerCopy } from './render.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(RAIZ, 'templates');
const DESTINO = join(RAIZ, process.argv[2] ?? 'demo');

const plantillas = listarPlantillas();
const enDemo = plantillas.filter((p) => p.meta.demo === true);

if (!enDemo.length) {
  console.error('Ninguna plantilla está marcada con "demo": true. No hay nada que publicar.');
  process.exit(1);
}

comprobarMarcas();

// --- estructura ---

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });

cpSync(join(RAIZ, 'assets'), join(DESTINO, 'assets'), { recursive: true });
cpSync(join(TEMPLATES, 'senales.json'), join(DESTINO, 'templates', 'senales.json'), { recursive: true });
cpSync(join(TEMPLATES, 'presets.json'), join(DESTINO, 'templates', 'presets.json'));

// --- plantillas ---

const indice = { _comentario: 'Índice de la demo pública. Generado por tools/build-demo.js.', emails: [], landings: [] };
const layoutsUsados = new Set();

for (const p of enDemo) {
  const destinoPlantilla = join(DESTINO, 'templates', p.tipo, p.id);
  mkdirSync(join(destinoPlantilla, 'copy'), { recursive: true });

  const meta = { ...p.meta };
  writeFileSync(join(destinoPlantilla, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

  for (const lang of p.meta.idiomas) {
    writeFileSync(
      join(destinoPlantilla, 'copy', `${lang}.json`),
      JSON.stringify(leerCopy(p.carpeta, lang), null, 2) + '\n',
      'utf8'
    );
  }

  if (p.meta.layout) {
    layoutsUsados.add(p.meta.layout);
  } else {
    writeFileSync(join(destinoPlantilla, 'layout.html'), desactivarFormularios(leerLayout(p.carpeta, p.meta)), 'utf8');
  }

  indice[p.tipo].push(p.id);
}

mkdirSync(join(DESTINO, 'templates', 'layouts'), { recursive: true });
for (const nombre of layoutsUsados) {
  const layout = readFileSync(join(TEMPLATES, 'layouts', `${nombre}.html`), 'utf8');
  writeFileSync(join(DESTINO, 'templates', 'layouts', `${nombre}.html`), desactivarFormularios(layout), 'utf8');
}

writeFileSync(join(DESTINO, 'templates', 'index.json'), JSON.stringify(indice, null, 2) + '\n', 'utf8');

// --- página ---

const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  .replace('<html lang="es">', '<html lang="es" data-modo="demo">')
  .replace('<meta name="robots" content="noindex, nofollow">',
    '<meta name="robots" content="index, follow">\n<meta name="description" content="PhishLab: biblioteca de plantillas para simulaciones de phishing autorizadas. Demo pública con marcas ficticias.">');

writeFileSync(join(DESTINO, 'index.html'), html, 'utf8');
writeFileSync(join(DESTINO, 'robots.txt'), 'User-agent: *\nAllow: /\n', 'utf8');

// El .nojekyll evita que GitHub Pages se salte las carpetas que empiezan por
// guion bajo; no las hay ahora, pero cuesta un fichero y ahorra un despiste.
writeFileSync(join(DESTINO, '.nojekyll'), '', 'utf8');

console.log(`\nDemo generada en ${DESTINO}`);
console.log(`  ${indice.emails.length} correos, ${indice.landings.length} landings, ${layoutsUsados.size} layouts.`);
console.log(`  ${plantillas.length - enDemo.length} plantillas quedan fuera por no estar marcadas para la demo.`);
console.log('\nPúblicala como estático. No la sirvas desde el mismo host que las landings de campaña.');

// ----------------------------------------------------------------------------

/**
 * En la demo, un formulario de contraseña no puede enviar a ninguna parte.
 *
 * En la herramienta local el `action=""` es correcto: GoPhish lo sustituye por
 * el suyo al importar la landing. Publicado tal cual, ese mismo formulario
 * hace un POST a la propia página, y eso ya se parece demasiado a un
 * formulario de captura real como para dejarlo suelto en internet.
 */
function desactivarFormularios(html) {
  return html
    .replace(/<form\b([^>]*)>/gi, '<form$1 onsubmit="return false;" data-demo="sin-envio">')
    .replace(/\baction=""/gi, 'action="#"');
}

/**
 * Repite la comprobación de marcas del linter antes de escribir nada.
 *
 * Está duplicada a propósito: el linter se puede olvidar de ejecutar, pero
 * esto corre siempre que se genera la demo, que es el momento exacto en el que
 * un descuido pasaría a estar publicado.
 */
function comprobarMarcas() {
  const MARCAS = [
    'microsoft', 'office 365', 'onedrive', 'sharepoint', 'azure', 'gmail', 'icloud', 'amazon',
    'paypal', 'netflix', 'dropbox', 'docusign', 'adobe', 'linkedin', 'whatsapp', 'facebook',
    'bbva', 'caixabank', 'bankinter', 'openbank', 'revolut', 'bizum', 'seur', 'dhl', 'fedex',
    'agencia tributaria', 'seguridad social', 'endesa', 'iberdrola', 'movistar', 'vodafone',
  ];
  const AMBIGUAS = ['Correos', 'Apple', 'Orange', 'Teams', 'Google', 'Slack', 'Zoom', 'Outlook', 'Santander', 'Sabadell', 'Hacienda'];

  const problemas = [];

  for (const p of enDemo) {
    const visible = [
      leerLayout(p.carpeta, p.meta).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '),
      p.meta.nombre, p.meta.descripcion, (p.meta.tags ?? []).join(' '),
      (p.meta.campos ?? []).map((c) => `${c.etiqueta} ${c.defecto ?? ''}`).join(' '),
      ...p.meta.idiomas.map((l) => JSON.stringify(leerCopy(p.carpeta, l))),
    ].join(' ');

    for (const m of MARCAS) {
      if (new RegExp(`\\b${m}\\b`, 'i').test(visible)) problemas.push(`${p.id}: "${m}"`);
    }
    for (const m of AMBIGUAS) {
      if (new RegExp(`\\b${m}\\b`).test(visible)) problemas.push(`${p.id}: "${m}"`);
    }
  }

  if (problemas.length) {
    console.error('\nNo se genera la demo: hay marcas reales en plantillas marcadas para publicar.\n');
    for (const p of problemas) console.error(`  ${p}`);
    console.error('\nQuita la marca o desmarca esas plantillas con "demo": false.');
    process.exit(1);
  }

  console.log(`Comprobación de marcas: ${enDemo.length} plantillas limpias.`);
}
