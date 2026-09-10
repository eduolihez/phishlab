/**
 * Alta de plantillas sobre un layout compartido.
 *
 * Una plantilla que reutiliza `templates/layouts/aviso.html` es, en realidad,
 * su copy y cuatro metadatos. Este script recibe eso en un JSON y escribe la
 * carpeta entera: `meta.json` con los bloques ya declarados (los lee del propio
 * layout, así no se pueden desincronizar) y un `copy/<idioma>.json` por idioma.
 *
 *   node tools/nueva-plantilla.js catalogo/banca.json
 *
 * El fichero puede traer una plantilla o una lista de ellas.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bloquesDeclarados } from '../assets/js/core/engine.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = join(RAIZ, 'templates');

/**
 * Etiquetas y ayudas de los bloques que traen los layouts compartidos.
 * Viven aquí y no en cada plantilla porque son siempre las mismas: si el
 * bloque `urgencia` se llamase distinto en cada correo, el panel dejaría de
 * ser reconocible al cambiar de plantilla.
 */
const ETIQUETAS = {
  preheader: ['Texto de vista previa', 'La línea que la bandeja enseña junto al asunto. Invisible al abrir el correo.'],
  cabecera: ['Cabecera con logo', null],
  'marca-servicio': ['Marca del servicio', 'Desaparece al encender la señal de incoherencia de marca.'],
  ficha: ['Ficha de datos', 'Las tres filas de dato concreto. Es de donde sale casi toda la credibilidad del pretexto.'],
  urgencia: ['Bloque de urgencia', null],
  'enlace-visible': ['URL en crudo bajo el botón', null],
  pie: ['Pie de firma', null],
  'pie-legal': ['Pie legal completo', null],
  tracker: ['Píxel de seguimiento', 'Sin él pierdes la métrica de apertura. Quítalo solo si el cliente lo prohíbe.'],
  'aviso-sesion': ['Aviso de sesión caducada', 'El pretexto de por qué se pide iniciar sesión otra vez.'],
  'enlaces-ayuda': ['Enlaces de ayuda', 'Crear cuenta y recuperar acceso. Un portal real los tiene.'],
  'campos-extra': ['Campos adicionales', 'Cuantos más datos se piden, más sospechoso y a la vez más "oficial" parece.'],
  'aviso-legal': ['Aviso legal', null],
};

/**
 * Textos de relleno que todo correo corporativo lleva y que casi nunca
 * cambian entre pretextos.
 *
 * Se mezclan por debajo del copy de cada plantilla, que siempre gana. Así los
 * ficheros de catálogo solo llevan lo que distingue a una plantilla de otra,
 * pero el `copy/<idioma>.json` que queda en disco es completo y autónomo: se
 * puede editar el pie de una plantilla sin tocar las otras diecinueve.
 */
const RELLENO = {
  es: {
    textoEnlaceVisible: 'Si el botón no funciona, copia esta dirección en tu navegador:',
    avisoAutomatico: {
      base: 'Mensaje generado automáticamente. Por favor, no respondas a este correo.',
      erratas: 'Mensaje generado automaticamente por el sistema. No responda a este correo.',
    },
    avisoReporte: 'Si crees que este mensaje no es legítimo, repórtalo al equipo de seguridad.',
  },
  ca: {
    textoEnlaceVisible: 'Si el botó no funciona, copia aquesta adreça al teu navegador:',
    avisoAutomatico: {
      base: 'Missatge generat automàticament. Si us plau, no responguis a aquest correu.',
      erratas: 'Missatge generat automaticament pel sistema. No respongui a aquest correu.',
    },
    avisoReporte: 'Si creus que aquest missatge no és legítim, reporta-ho a l’equip de seguretat.',
  },
  en: {
    textoEnlaceVisible: 'If the button does not work, copy this address into your browser:',
    avisoAutomatico: {
      base: 'Automatically generated message. Please do not reply to this email.',
      erratas: 'Message generated automaticaly by the system. Do not reply to this email.',
    },
    avisoReporte: 'If you believe this message is not legitimate, report it to the security team.',
  },
};

const fichero = process.argv[2];
if (!fichero) {
  console.error('Uso: node tools/nueva-plantilla.js <fichero.json>');
  process.exit(1);
}

const contenido = JSON.parse(readFileSync(fichero, 'utf8'));
const plantillas = Array.isArray(contenido) ? contenido : [contenido];

let creadas = 0;
for (const spec of plantillas) {
  if (crear(spec)) creadas++;
}

actualizarIndice();
console.log(`\n${creadas} plantilla(s) escritas. Ejecuta "npm run lint" para revisarlas.`);

// ----------------------------------------------------------------------------

function crear(spec) {
  const obligatorios = ['id', 'tipo', 'nombre', 'familia', 'copy'];
  for (const clave of obligatorios) {
    if (!spec[clave]) {
      console.error(`  ERROR  ${spec.id ?? '(sin id)'}: falta "${clave}"`);
      return false;
    }
  }

  const carpeta = join(TEMPLATES, spec.tipo, spec.id);
  const idiomas = Object.keys(spec.copy);

  // Los bloques se leen del layout: declararlos a mano en cada plantilla
  // acabaría con metas que dicen tener bloques que su layout no tiene.
  const rutaLayout = spec.layout
    ? join(TEMPLATES, 'layouts', `${spec.layout}.html`)
    : join(carpeta, 'layout.html');

  if (!existsSync(rutaLayout)) {
    console.error(`  ERROR  ${spec.id}: no existe el layout ${rutaLayout}`);
    return false;
  }

  const bloques = bloquesDeclarados(readFileSync(rutaLayout, 'utf8')).map((b) => {
    const [etiqueta, ayuda] = ETIQUETAS[b.id] ?? [b.id, null];
    const salida = { id: b.id, etiqueta };
    if (b.senal) salida.senal = b.senal;
    if (b.opcional) { salida.opcional = true; salida.defecto = true; }
    if (ayuda) salida.ayuda = ayuda;
    return salida;
  });

  const meta = {
    schema: 2,
    nombre: spec.nombre,
    descripcion: spec.descripcion ?? '',
    familia: spec.familia,
    categoria: spec.categoria ?? '',
    tags: spec.tags ?? [],
    idiomas,
    demo: spec.demo ?? false,
    origen: spec.origen ?? {
      tipo: 'escrito-a-mano',
      fecha: new Date().toISOString().slice(0, 10),
      notas: 'Pretexto escrito a mano. No es copia de ningún correo real.',
    },
    ...(spec.layout ? { layout: spec.layout } : {}),
    ...(spec.captura !== undefined ? { captura: spec.captura } : {}),
    ...(spec.formativa ? { formativa: true } : {}),
    ...(spec.remitente ? { remitente: spec.remitente } : {}),
    campos: spec.campos ?? [],
    bloques,
  };

  mkdirSync(join(carpeta, 'copy'), { recursive: true });
  writeFileSync(join(carpeta, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');

  for (const [idioma, copy] of Object.entries(spec.copy)) {
    const completo = { ...(RELLENO[idioma] ?? {}), ...copy };
    writeFileSync(join(carpeta, 'copy', `${idioma}.json`), JSON.stringify(completo, null, 2) + '\n', 'utf8');
  }

  console.log(`  ${spec.tipo}/${spec.id}  ${idiomas.join('/')} · ${bloques.length} bloques`);
  return true;
}

/**
 * Regenera `templates/index.json` leyendo el disco.
 *
 * El navegador no puede listar directorios, así que este índice es lo que le
 * dice qué hay. Reconstruirlo entero en vez de parchearlo evita que una
 * carpeta borrada a mano deje una entrada muerta que rompe la carga.
 */
function actualizarIndice() {
  const indice = {
    _comentario:
      'Índice del catálogo. El navegador no puede listar directorios: para añadir una plantilla, crea su carpeta bajo emails/ o landings/ y añade su id aquí. Lo regenera tools/nueva-plantilla.js.',
    emails: [],
    landings: [],
  };

  for (const tipo of ['emails', 'landings']) {
    indice[tipo] = readdirSync(join(TEMPLATES, tipo), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(TEMPLATES, tipo, e.name, 'meta.json')))
      .map((e) => e.name)
      .sort();
  }

  writeFileSync(join(TEMPLATES, 'index.json'), JSON.stringify(indice, null, 2) + '\n', 'utf8');
  console.log(`\nÍndice: ${indice.emails.length} correos, ${indice.landings.length} landings.`);
}
