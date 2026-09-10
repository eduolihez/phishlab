/**
 * Migración de plantillas v1 (un HTML por idioma) a v2 (un layout + copy).
 *
 * Los tres HTML de una plantilla v1 son el mismo diseño con el texto cambiado,
 * así que la extracción se puede hacer sola: para cada línea que difiere entre
 * idiomas se calcula el prefijo y el sufijo comunes, y lo que queda en medio es
 * el fragmento de copy.
 *
 *   node tools/migrar-v2.js <carpeta> --listar
 *       Enseña los fragmentos detectados con un nombre propuesto.
 *
 *   node tools/migrar-v2.js <carpeta> --nombres nombres.json
 *       Genera layout.html y copy/{es,ca,en}.json usando esos nombres.
 *
 * Los marcadores de bloque se añaden a mano después: dónde empieza y acaba un
 * bloque es una decisión de diseño, no algo que se pueda deducir del texto.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const IDIOMAS = ['es', 'ca', 'en'];
const NIVEL_A_SENAL = { dificil: 'base', medio: 'urgencia', facil: 'urgencia+erratas' };

const carpeta = process.argv[2];
if (!carpeta) {
  console.error('Uso: node tools/migrar-v2.js <carpeta> [--listar | --nombres fichero.json]');
  process.exit(1);
}

const htmls = Object.fromEntries(
  IDIOMAS.map((l) => [l, normalizar(readFileSync(join(carpeta, `${l}.html`), 'utf8').split('\n'))])
);

/**
 * Junta las líneas de continuación de un párrafo con la que lo abre.
 *
 * Un párrafo escrito en tres líneas de fuente produciría tres fragmentos de
 * copy partidos a mitad de frase, imposibles de traducir o de editar por
 * separado. Uniéndolos antes de extraer, cada párrafo sale como un fragmento
 * entero. Dentro de <style> y <script> no se toca nada: ahí los saltos de
 * línea son del código, no del texto.
 */
function normalizar(lineas) {
  const salida = [];
  let dentroDeCodigo = false;

  for (const linea of lineas) {
    const t = linea.trim();
    if (/<(style|script)\b/i.test(t)) dentroDeCodigo = true;
    const cierraCodigo = /<\/(style|script)>/i.test(t);

    const continuacion =
      !dentroDeCodigo && t && !t.includes('<') && !t.includes('>') && salida.length > 0;

    if (continuacion) salida[salida.length - 1] += ' ' + t;
    else salida.push(linea);

    if (cierraCodigo) dentroDeCodigo = false;
  }

  return salida;
}
const meta = JSON.parse(readFileSync(join(carpeta, 'meta.json'), 'utf8'));

const trozos = extraer(htmls);

if (process.argv.includes('--listar')) {
  console.log(`${trozos.length} fragmentos de texto detectados en ${carpeta}:\n`);
  trozos.forEach((t, i) => {
    console.log(`${String(i).padStart(3)}  ${t.sugerido}`);
    console.log(`     es: ${recortar(t.textos.es)}`);
    console.log(`     en: ${recortar(t.textos.en)}`);
  });
  console.log('\nEscribe un JSON con la lista de nombres en orden y pásalo con --nombres.');
  process.exit(0);
}

const iNombres = process.argv.indexOf('--nombres');
if (iNombres === -1) {
  console.error('Falta --listar o --nombres fichero.json');
  process.exit(1);
}

const nombres = JSON.parse(readFileSync(process.argv[iNombres + 1], 'utf8'));
if (nombres.length !== trozos.length) {
  console.error(`El fichero trae ${nombres.length} nombres y hacen falta ${trozos.length}.`);
  process.exit(1);
}

generar(trozos, nombres);

// ---------------------------------------------------------------- extraer ---

/**
 * Localiza las líneas que difieren entre idiomas y aísla el texto variable
 * recortando el prefijo y el sufijo que comparten los tres.
 */
function extraer(htmls) {
  const base = htmls.es;
  const salida = [];

  for (let i = 0; i < base.length; i++) {
    const lineas = IDIOMAS.map((l) => htmls[l][i] ?? '');
    if (lineas.every((l) => l === lineas[0])) continue;

    const { prefijo, sufijo } = ajustar(comun(lineas, 'inicio'), comun(lineas, 'final'));

    const textos = {};
    IDIOMAS.forEach((l, n) => {
      textos[l] = lineas[n].slice(prefijo.length, lineas[n].length - sufijo.length);
    });

    // `lang="es"` no es copy: es el idioma del documento, y en v2 lo aporta
    // el contexto de render como {{idioma}}.
    if (prefijo.trimStart().startsWith('<html lang=')) {
      salida.push({ linea: i, prefijo, sufijo, textos, sugerido: 'idioma', esIdioma: true });
      continue;
    }

    salida.push({ linea: i, prefijo, sufijo, textos, sugerido: proponerNombre(prefijo, textos.es) });
  }

  return salida;
}

/**
 * Estira el trozo variable hasta la frontera del nodo de texto.
 *
 * El prefijo común entre "Referencia" y "Reference" es "Refer", y quedarse ahí
 * dejaría un fragmento llamado "encia" dentro del layout. Retrocediendo hasta
 * el último `>` (fin de etiqueta) o `"` (inicio de valor de atributo), o hasta
 * el final de la indentación si no hay ninguno, el fragmento acaba siendo el
 * texto entero que se lee en pantalla, que es lo que se quiere poder editar.
 */
function ajustar(prefijo, sufijo) {
  const corte = Math.max(prefijo.lastIndexOf('>'), prefijo.lastIndexOf('"'));
  const nuevoPrefijo = corte >= 0 ? prefijo.slice(0, corte + 1) : prefijo.match(/^\s*/)[0];

  const fronteras = [sufijo.indexOf('<'), sufijo.indexOf('"')].filter((i) => i >= 0);
  const nuevoSufijo = fronteras.length ? sufijo.slice(Math.min(...fronteras)) : '';

  return { prefijo: nuevoPrefijo, sufijo: nuevoSufijo };
}

function comun(cadenas, extremo) {
  const orden = extremo === 'inicio' ? (s) => s : (s) => [...s].reverse().join('');
  const [primera, ...resto] = cadenas.map(orden);
  let n = 0;
  while (n < primera.length && resto.every((s) => s[n] === primera[n])) n++;
  const trozo = primera.slice(0, n);
  return extremo === 'inicio' ? trozo : [...trozo].reverse().join('');
}

/** Nombre propuesto a partir del id, la clase o la etiqueta que envuelve al texto. */
function proponerNombre(prefijo, texto) {
  const id = prefijo.match(/id="([\w-]+)"[^<]*$/)?.[1];
  const clase = prefijo.match(/class="([\w-]+)"[^<]*$/)?.[1];
  const etiqueta = prefijo.match(/<(\w+)[^<>]*>\s*$/)?.[1];
  const base = id ?? clase ?? etiqueta ?? 'texto';
  const palabras = texto.replace(/<[^>]*>/g, ' ').trim().split(/\s+/).slice(0, 2).join('-');
  return camel(`${base}-${palabras}`.slice(0, 40));
}

function camel(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''));
}

function recortar(s) {
  return s.length > 90 ? s.slice(0, 90) + '…' : s;
}

// ---------------------------------------------------------------- generar ---

function generar(trozos, nombres) {
  // Layout: el HTML castellano con cada texto variable sustituido por su hueco.
  const layout = [...htmls.es];
  trozos.forEach((t, i) => {
    const nombre = nombres[i];
    layout[t.linea] = t.prefijo + (nombre === null ? t.textos.es : `{{${nombre}}}`) + t.sufijo;
  });
  writeFileSync(join(carpeta, 'layout.html'), layout.join('\n'), 'utf8');

  // Copy: los textos extraídos como constantes, más los fragmentos de v1
  // reindexados de nivel a señal.
  mkdirSync(join(carpeta, 'copy'), { recursive: true });

  for (const lang of IDIOMAS) {
    const copy = {};

    if (meta.asunto?.[lang]) copy.asunto = porSenal(meta.asunto[lang]);

    for (const [nivel, clave] of Object.entries(NIVEL_A_SENAL)) {
      const frag = meta.fragmentos?.[lang]?.[nivel];
      if (!frag) continue;
      for (const [k, v] of Object.entries(frag)) {
        copy[k] = copy[k] ?? {};
        copy[k][clave] = v;
      }
    }
    for (const k of Object.keys(copy)) copy[k] = limpiar(copy[k]);

    // En v1 el saludo genérico venía pegado al nivel fácil. Como señal es
    // independiente: se puede querer "Estimado usuario" en un correo por lo
    // demás impecable, que es justo el caso que más cuesta detectar.
    if (copy.saludo && typeof copy.saludo === 'object') {
      const generico = copy.saludo['urgencia+erratas'] ?? copy.saludo.urgencia;
      if (generico !== undefined && generico !== copy.saludo.base) {
        copy.saludo = { base: copy.saludo.base, 'saludo-generico': generico };
      }
    }

    trozos.forEach((t, i) => {
      const nombre = nombres[i];
      if (nombre === null || t.esIdioma) return;
      copy[nombre] = t.textos[lang];
    });

    writeFileSync(join(carpeta, 'copy', `${lang}.json`), JSON.stringify(copy, null, 2) + '\n', 'utf8');
  }

  console.log(`${carpeta}: layout.html + copy/{es,ca,en}.json generados.`);
  console.log('Falta añadir a mano los marcadores de bloque y la lista "bloques" del meta.json.');
}

function porSenal(porNivel) {
  return limpiar(Object.fromEntries(
    Object.entries(NIVEL_A_SENAL)
      .filter(([nivel]) => porNivel[nivel] !== undefined)
      .map(([nivel, clave]) => [clave, porNivel[nivel]])
  ));
}

/**
 * Quita las variantes que repiten lo que ya dice una menos específica: si el
 * texto con urgencia es idéntico al base, la variante sobra y solo estorba al
 * editarla. Un fragmento que acaba con una sola variante se colapsa a cadena.
 */
function limpiar(variantes) {
  const orden = ['base', 'urgencia', 'urgencia+erratas'];
  const salida = {};
  let anterior;
  for (const clave of orden) {
    if (variantes[clave] === undefined) continue;
    if (variantes[clave] === anterior) continue;
    salida[clave] = variantes[clave];
    anterior = variantes[clave];
  }
  const claves = Object.keys(salida);
  if (claves.length === 1 && claves[0] === 'base') return salida.base;
  return salida;
}
