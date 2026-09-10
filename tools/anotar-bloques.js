/**
 * Inserta los marcadores de bloque en un layout ya migrado.
 *
 * Dónde empieza y acaba un bloque es una decisión de diseño, así que va escrita
 * a mano en `tools/bloques.json`: para cada bloque, la expresión que localiza
 * su primera línea y la que localiza la última. El script solo coloca los
 * comentarios, comprueba que quedan balanceados y no pisa un layout ya anotado.
 *
 *   node tools/anotar-bloques.js            todas las plantillas
 *   node tools/anotar-bloques.js <id>       solo esa
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const specs = JSON.parse(readFileSync(join(RAIZ, 'tools', 'bloques.json'), 'utf8'));

const soloEste = process.argv[2];
let total = 0;

for (const [ruta, bloques] of Object.entries(specs)) {
  if (ruta.startsWith('_')) continue; // comentarios del fichero
  if (soloEste && !ruta.includes(soloEste)) continue;
  anotar(join(RAIZ, ruta, 'layout.html'), bloques, ruta);
  total++;
}

console.log(`\n${total} layout(s) anotados.`);

function anotar(fichero, bloques, ruta) {
  const original = readFileSync(fichero, 'utf8');

  if (original.includes('<!--@bloque:')) {
    console.log(`${ruta}: ya estaba anotado, se deja como está.`);
    return;
  }

  const lineas = original.split('\n');
  const inserciones = [];

  for (const b of bloques) {
    // `tras` desambigua cuando el inicio del bloque es una línea que se repite
    // (un `<div class="campo">` entre otros diez iguales): primero se localiza
    // el ancla, y el inicio se busca a partir de ahí.
    const ancla = b.tras ? buscar(lineas, b.tras, 0) : -1;
    if (b.tras && ancla === -1) {
      console.error(`  ERROR ${ruta}/${b.id}: no encuentra el ancla /${b.tras}/`);
      continue;
    }
    const desde = buscar(lineas, b.inicio, ancla + 1);
    if (desde === -1) {
      console.error(`  ERROR ${ruta}/${b.id}: no encuentra el inicio /${b.inicio}/`);
      continue;
    }
    const hasta = b.fin ? buscar(lineas, b.fin, desde + 1) : desde;
    if (hasta === -1) {
      console.error(`  ERROR ${ruta}/${b.id}: no encuentra el fin /${b.fin}/ tras la línea ${desde + 1}`);
      continue;
    }

    const attrs = [b.senal ? `@senal:${b.senal}` : '', b.opcional ? '@opcional' : '']
      .filter(Boolean)
      .join(' ');
    const sangria = lineas[desde].match(/^\s*/)[0];

    inserciones.push({ linea: desde, texto: `${sangria}<!--@bloque:${b.id}${attrs ? ' ' + attrs : ''}-->`, orden: 0 });
    inserciones.push({ linea: hasta + 1, texto: `${sangria}<!--@/bloque-->`, orden: 1 });
  }

  // De abajo arriba, para que los índices ya calculados sigan valiendo.
  inserciones.sort((a, b) => b.linea - a.linea || b.orden - a.orden);
  for (const ins of inserciones) lineas.splice(ins.linea, 0, ins.texto);

  const salida = lineas.join('\n');
  const abre = (salida.match(/<!--@bloque:/g) || []).length;
  const cierra = (salida.match(/<!--@\/bloque-->/g) || []).length;
  if (abre !== cierra) {
    console.error(`  ERROR ${ruta}: ${abre} aperturas y ${cierra} cierres, no se escribe.`);
    return;
  }

  writeFileSync(fichero, salida, 'utf8');
  console.log(`${ruta}: ${abre} bloques anotados.`);
}

function buscar(lineas, patron, desde) {
  const re = new RegExp(patron);
  for (let i = desde; i < lineas.length; i++) if (re.test(lineas[i])) return i;
  return -1;
}
