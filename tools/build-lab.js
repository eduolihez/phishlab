/**
 * Generador de la demo "lab": la herramienta completa (todas las plantillas,
 * marca real incluida, formularios y exportación funcionando) como sitio
 * estático, pensada para publicarse SOLO detrás de un muro de acceso
 * (lab.eduolihez.com, protegido con HTTP Basic Auth — ver CLOUDFLARE.md y
 * docs/EDUOLIHEZ.md). A diferencia de `build-demo.js`:
 *
 *   - Entran TODAS las plantillas, no solo las marcadas "demo": true.
 *   - No se desactivan los formularios ni se comprueba ausencia de marcas:
 *     el propósito de este build es precisamente enseñar la herramienta con
 *     marca real a quien tenga la contraseña.
 *   - `data-modo="lab"`, no "demo": la interfaz no muestra el rótulo "Demo
 *     pública · marcas ficticias" (sería falso), y noindex/nofollow se deja
 *     como viene por defecto en index.html en vez de invertirlo a index/follow.
 *   - Import y guardado de plantillas propias siguen desactivados: necesitan
 *     el servidor Node local, que no corre en producción.
 *
 * Publicar esto en abierto, sin el muro de acceso delante, sería exactamente
 * lo que README.md y docs/EDUOLIHEZ.md dicen que no hay que hacer. Este
 * script no comprueba eso por ti — el muro de acceso lo pone el hosting.
 *
 *   node tools/build-lab.js [destino]
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listarPlantillas, leerLayout, leerCopy } from './render.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(RAIZ, 'templates');
const DESTINO = join(RAIZ, process.argv[2] ?? 'lab');

const plantillas = listarPlantillas();

if (!plantillas.length) {
  console.error('No hay plantillas en el catálogo. No hay nada que publicar.');
  process.exit(1);
}

rmSync(DESTINO, { recursive: true, force: true });
mkdirSync(DESTINO, { recursive: true });

cpSync(join(RAIZ, 'assets'), join(DESTINO, 'assets'), { recursive: true });
cpSync(join(TEMPLATES, 'senales.json'), join(DESTINO, 'templates', 'senales.json'), { recursive: true });
cpSync(join(TEMPLATES, 'presets.json'), join(DESTINO, 'templates', 'presets.json'));

const indice = { _comentario: 'Índice del build lab (acceso restringido). Generado por tools/build-lab.js.', emails: [], landings: [] };
const layoutsUsados = new Set();

for (const p of plantillas) {
  const destinoPlantilla = join(DESTINO, 'templates', p.tipo, p.id);
  mkdirSync(join(destinoPlantilla, 'copy'), { recursive: true });

  writeFileSync(join(destinoPlantilla, 'meta.json'), JSON.stringify(p.meta, null, 2) + '\n', 'utf8');

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
    writeFileSync(join(destinoPlantilla, 'layout.html'), leerLayout(p.carpeta, p.meta), 'utf8');
  }

  indice[p.tipo].push(p.id);
}

mkdirSync(join(DESTINO, 'templates', 'layouts'), { recursive: true });
for (const nombre of layoutsUsados) {
  cpSync(join(TEMPLATES, 'layouts', `${nombre}.html`), join(DESTINO, 'templates', 'layouts', `${nombre}.html`));
}

writeFileSync(join(DESTINO, 'templates', 'index.json'), JSON.stringify(indice, null, 2) + '\n', 'utf8');

const html = readFileSync(join(RAIZ, 'index.html'), 'utf8')
  .replace('<html lang="es">', '<html lang="es" data-modo="lab">');

writeFileSync(join(DESTINO, 'index.html'), html, 'utf8');
writeFileSync(join(DESTINO, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
writeFileSync(join(DESTINO, '.nojekyll'), '', 'utf8');

console.log(`\nBuild lab generado en ${DESTINO}`);
console.log(`  ${indice.emails.length} correos, ${indice.landings.length} landings, ${layoutsUsados.size} layouts — catálogo completo, marca real.`);
console.log('\nNO lo publiques sin el muro de acceso delante (ver CLOUDFLARE.md, lab.eduolihez.com).');
