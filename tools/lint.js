/**
 * Linter del catálogo de plantillas.
 *
 * Cada regla existe porque el fallo que evita ya se ha visto en plantillas
 * reales. Ejecutar con `npm run lint` antes de dar por buena una plantilla
 * nueva o una importada.
 *
 *   node tools/lint.js              plantillas de fábrica
 *   node tools/lint.js --propias    también las de templates/propias/
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { bloquesDeclarados, variablesGophish } from '../assets/js/core/engine.js';
import { listarPlantillas, componer, senalesCatalogo, presetsCatalogo, leerLayout, leerCopy, TEMPLATES } from './render.js';

const TAMANO_MAXIMO = 400 * 1024;
const IDIOMAS_ESPERADOS = ['es', 'ca', 'en'];

/**
 * Marcas reales que no pueden aparecer en una plantilla marcada `demo: true`.
 *
 * La demo se publica en internet. Una landing de login con la marca de un banco
 * real servida desde un dominio personal no es una demostración: es un kit de
 * phishing alojado, y se lo lleva por delante el dominio entero cuando Safe
 * Browsing lo marque. Para la demo se usan marcas inventadas.
 */
const MARCAS_REALES = [
  'microsoft', 'office 365', 'office365', 'outlook', 'onedrive', 'sharepoint', 'teams', 'azure',
  'google', 'gmail', 'workspace', 'apple', 'icloud', 'amazon', 'paypal', 'netflix', 'spotify',
  'dropbox', 'docusign', 'adobe', 'slack', 'zoom', 'linkedin', 'whatsapp', 'facebook', 'instagram',
  'bbva', 'caixabank', 'la caixa', 'santander', 'sabadell', 'bankinter', 'unicaja', 'ibercaja',
  'openbank', 'revolut', 'bizum', 'correos', 'seur', 'dhl', 'ups', 'fedex', 'mrw', 'glovo',
  'agencia tributaria', 'hacienda', 'seguridad social', 'dgt', 'sepe', 'endesa', 'iberdrola',
  'naturgy', 'movistar', 'vodafone', 'orange', 'jazztel', 'trend micro', 'fortinet',
];

let errores = 0;
let avisos = 0;

const error = (donde, msg) => { console.error(`  ERROR  ${donde}: ${msg}`); errores++; };
const aviso = (donde, msg) => { console.warn(`  aviso  ${donde}: ${msg}`); avisos++; };

const SENALES = new Set(senalesCatalogo().map((s) => s.id));
const PRESETS = presetsCatalogo().map((p) => p.id);

const plantillas = listarPlantillas({ incluirPropias: process.argv.includes('--propias') });

for (const plantilla of plantillas) {
  console.log(`\n${plantilla.tipo}/${plantilla.id}${plantilla.propia ? '  (propia)' : ''}`);
  try {
    revisar(plantilla);
  } catch (e) {
    error(plantilla.id, `no se pudo revisar: ${e.message}`);
  }
}

console.log(`\n${plantillas.length} plantillas · ${errores} errores, ${avisos} avisos`);
process.exit(errores ? 1 : 0);

// ----------------------------------------------------------------------------

function revisar(plantilla) {
  const { id, tipo, carpeta, meta } = plantilla;

  // --- metadatos ---

  if (meta.schema !== 2) return error(id, 'meta.json no declara "schema": 2');
  if (!meta.nombre) error(id, 'sin "nombre"');
  if (!meta.descripcion) aviso(id, 'sin "descripcion": en la biblioteca la tarjeta sale coja');
  if (!meta.familia) error(id, 'sin "familia"');
  if (!meta.categoria) aviso(id, 'sin "categoria": no aparecerá en los filtros por categoría');
  if (!Array.isArray(meta.tags) || !meta.tags.length) aviso(id, 'sin "tags": no se encontrará por búsqueda');
  if (typeof meta.demo !== 'boolean') error(id, 'sin "demo": una plantilla sin declararlo podría colarse en la demo pública');

  if (!meta.origen?.tipo) {
    error(id, 'sin "origen.tipo": hay que poder saber de dónde salió cada plantilla');
  } else if (meta.origen.tipo.startsWith('importado') && !meta.origen.autorizacion) {
    error(id, 'importada sin "origen.autorizacion": una copia de material real necesita constar bajo qué encargo se hizo');
  }

  if (!Array.isArray(meta.idiomas) || !meta.idiomas.length) return error(id, 'sin "idiomas"');
  for (const lang of IDIOMAS_ESPERADOS) {
    if (!meta.idiomas.includes(lang)) aviso(id, `sin versión en "${lang}"`);
  }

  // --- ficheros ---

  const rutaDelLayout = meta.layout
    ? join(TEMPLATES, 'layouts', `${meta.layout}.html`)
    : join(carpeta, 'layout.html');

  if (!existsSync(rutaDelLayout)) {
    return error(id, meta.layout
      ? `declara el layout compartido "${meta.layout}" y no existe en templates/layouts/`
      : 'falta layout.html');
  }
  for (const lang of meta.idiomas) {
    if (!existsSync(join(carpeta, 'copy', `${lang}.json`))) return error(id, `falta copy/${lang}.json`);
  }

  const layout = leerLayout(carpeta, meta);

  // --- bloques ---

  const abre = (layout.match(/<!--@bloque:/g) || []).length;
  const cierra = (layout.match(/<!--@\/bloque-->/g) || []).length;
  if (abre !== cierra) {
    error(id, `${abre} aperturas de bloque y ${cierra} cierres — la poda cortaría por donde no debe`);
  }

  const enLayout = bloquesDeclarados(layout).map((b) => b.id);
  const enMeta = (meta.bloques ?? []).map((b) => b.id);

  for (const b of enLayout) {
    if (!enMeta.includes(b)) error(id, `el bloque "${b}" está en el layout pero no en meta.json: no saldrá en el panel`);
  }
  for (const b of enMeta) {
    if (!enLayout.includes(b)) error(id, `meta.json declara el bloque "${b}", que no existe en el layout`);
  }
  for (const b of meta.bloques ?? []) {
    if (!b.etiqueta) aviso(id, `el bloque "${b.id}" no tiene etiqueta: en el panel saldrá su id crudo`);
    if (b.senal && !SENALES.has(b.senal.replace(/^!/, ''))) {
      error(id, `el bloque "${b.id}" cuelga de la señal desconocida "${b.senal}"`);
    }
    // El bloque `cuerpo` de una importada es siempre así: entra de una pieza
    // y se trocea después. Avisarlo cada vez sería ruido garantizado.
    const esCuerpoImportado = b.id === 'cuerpo' && meta.origen?.tipo?.startsWith('importado');
    if (!b.senal && !b.opcional && !esCuerpoImportado) {
      aviso(id, `el bloque "${b.id}" no es opcional ni depende de una señal: está siempre, así que marcarlo no aporta`);
    }
  }

  // --- copy ---

  const huecos = [...layout.matchAll(/\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g)].map((m) => m[1]);
  const propiosDeMarca = new Set([
    'empresa', 'sector', 'dominio', 'firma', 'color', 'colorOscuro', 'colorTexto',
    'logo', 'logoHtml', 'anio', 'idioma',
  ]);
  const claveDeCampo = new Set((meta.campos ?? []).map((c) => c.clave));

  for (const lang of meta.idiomas) {
    const copy = leerCopy(carpeta, lang);

    for (const variantes of Object.values(copy)) {
      if (typeof variantes !== 'object' || variantes === null) continue;
      for (const clave of Object.keys(variantes)) {
        if (clave === 'base' || clave.startsWith('_')) continue;
        for (const s of clave.split('+')) {
          if (!SENALES.has(s.trim())) error(`${id}/copy/${lang}`, `variante "${clave}" con señal desconocida "${s.trim()}"`);
        }
      }
    }

    for (const hueco of new Set(huecos)) {
      if (propiosDeMarca.has(hueco) || claveDeCampo.has(hueco)) continue;
      if (copy[hueco] === undefined) {
        error(`${id}/copy/${lang}`, `el layout usa {{${hueco}}} y este idioma no lo tiene`);
      }
    }

    if (tipo === 'emails' && copy.asunto === undefined) {
      error(`${id}/copy/${lang}`, 'sin "asunto": no se puede importar en GoPhish');
    }
  }

  // --- render en todas las combinaciones ---

  for (const lang of meta.idiomas) {
    for (const preset of PRESETS) {
      const r = componer(plantilla, { idioma: lang, preset });
      if (r.faltantes.length) {
        error(`${id} ${lang}/${preset}`, `variables sin valor, saldrían literales: ${r.faltantes.join(', ')}`);
      }
      if (/@bloque/.test(r.html)) {
        error(`${id} ${lang}/${preset}`, 'quedan marcadores de bloque en el HTML exportado');
      }
      revisarHtml(plantilla, `${id} ${lang}/${preset}`, r.html);
    }
  }

  // --- demo ---

  if (meta.demo) revisarDemo(plantilla);

  console.log(`  ok     ${enLayout.length} bloques · ${meta.idiomas.join('/')} · ${(Buffer.byteLength(layout) / 1024).toFixed(1)} KB de layout`);
}

function revisarHtml(plantilla, donde, html) {
  const { tipo, meta } = plantilla;
  const bytes = Buffer.byteLength(html);

  if (bytes > TAMANO_MAXIMO) {
    error(donde, `${(bytes / 1024).toFixed(0)} KB — demasiado para un correo; revisa las imágenes incrustadas`);
  }

  // Un recurso por http:// se rompe o, peor, avisa al dominio real de que
  // alguien está abriendo el correo.
  const inseguros = html.match(/(?:src|href)="http:\/\/[^"]+"/g);
  if (inseguros) error(donde, `${inseguros.length} recurso(s) por http://: ${inseguros[0].slice(0, 60)}`);

  const remotos = (html.match(/src="https:\/\/[^"]+"/g) || []).length;
  if (remotos) aviso(donde, `${remotos} imagen(es) remota(s) — mejor incrustadas en base64`);

  if (tipo === 'emails') {
    if (!html.includes('{{.Tracker}}')) aviso(donde, 'sin {{.Tracker}}: pierdes la métrica de apertura');
    if (!html.includes('{{.URL}}')) error(donde, 'sin {{.URL}}: el enlace no llevará a la landing');

    // En una plantilla escrita por nosotros, maquetar sin tablas es un error
    // que se arregla. En una importada es simplemente cómo la escribió el
    // remitente original: no se puede "arreglar" sin rehacerla entera, y
    // presumiblemente se veía bien en los buzones a los que llegó. Se avisa,
    // pero no se bloquea.
    const importada = meta.origen?.tipo?.startsWith('importado');
    const decir = importada ? aviso : error;

    // Outlook usa el motor de Word: ignora estas propiedades y descoloca el correo.
    for (const prop of ['display:flex', 'display:grid', 'position:absolute', 'position:fixed']) {
      if (html.replace(/\s/g, '').includes(prop)) decir(donde, `usa "${prop}", que Outlook ignora`);
    }
    if (!/<table/i.test(html)) decir(donde, 'sin maquetación por tablas: no sobrevivirá a Outlook');

    const vars = variablesGophish(html);
    const desconocidas = vars.filter((v) => !/^\{\{\.(FirstName|LastName|Position|Email|From|URL|BaseURL|TrackingURL|RId|Tracker)\}\}$/.test(v));
    if (desconocidas.length) aviso(donde, `variables de GoPhish que no reconozco: ${desconocidas.join(' ')}`);
  }

  if (tipo === 'landings' && meta.captura === 'credenciales') {
    // El punto crítico: GoPhish reconoce la contraseña por el nombre del campo.
    // Con otro nombre, "Capture Passwords" no la filtra y se guarda igual
    // aunque tengas la casilla desmarcada.
    if (!/<form[^>]+method="post"/i.test(html)) error(donde, 'el formulario no usa method="post": GoPhish no capturará nada');
    if (!/name="password"/.test(html)) error(donde, 'sin campo name="password" exacto: "Capture Passwords" no lo reconocerá');
    if (!/name="email"/.test(html)) error(donde, 'sin campo name="email" exacto: el resultado no se podrá cruzar con el destinatario');
  }

  if (tipo === 'landings' && meta.captura && meta.captura !== 'ninguna' && !/<form[^>]+method="post"/i.test(html)) {
    error(donde, 'declara captura pero no tiene formulario POST');
  }
}

/**
 * Una plantilla marcada para la demo pública no puede llevar marca real dentro.
 * Es la regla que impide que un despiste acabe publicado en internet.
 */
function revisarDemo(plantilla) {
  const { id, carpeta, meta } = plantilla;
  const textos = [
    leerLayout(carpeta, meta),
    JSON.stringify(meta),
    ...meta.idiomas.map((l) => JSON.stringify(leerCopy(carpeta, l))),
  ].join(' ').toLowerCase();

  for (const marca of MARCAS_REALES) {
    if (textos.includes(marca)) {
      error(`${id} (demo)`, `marcada como demo pública y menciona "${marca}" — usa una marca inventada`);
    }
  }

  if (meta.captura === 'credenciales') {
    aviso(`${id} (demo)`, 'landing de credenciales en la demo pública: comprueba que el formulario no envía a ningún sitio');
  }
}
