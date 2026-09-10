/**
 * Pipeline de render del lado de Node.
 *
 * El dashboard carga las plantillas con `fetch`; el linter, los tests y el
 * generador de la demo las cargan del disco. La lógica de composición es la
 * misma y vive en `assets/js/core/`: aquí solo está la parte de leer ficheros.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, podar, construirContexto } from '../assets/js/core/engine.js';
import { resolverSenales, activas, resolverCopy, bloquesActivos } from '../assets/js/core/senales.js';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES = join(RAIZ, 'templates');

export const leerJson = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

export const senalesCatalogo = () => leerJson(join(TEMPLATES, 'senales.json')).senales;
export const presetsCatalogo = () => leerJson(join(TEMPLATES, 'presets.json')).presets;

/** Todas las plantillas del índice, con su meta y su ruta en disco. */
export function listarPlantillas({ incluirPropias = false } = {}) {
  const indice = leerJson(join(TEMPLATES, 'index.json'));
  const salida = [];

  for (const tipo of ['emails', 'landings']) {
    for (const id of indice[tipo] ?? []) {
      const carpeta = join(TEMPLATES, tipo, id);
      salida.push({ id, tipo, carpeta, meta: leerJson(join(carpeta, 'meta.json')), propia: false });
    }
  }

  const carpetaPropias = join(TEMPLATES, 'propias');
  if (incluirPropias && existsSync(carpetaPropias)) {
    for (const tipo of ['emails', 'landings']) {
      const dir = join(carpetaPropias, tipo);
      if (!existsSync(dir)) continue;
      for (const id of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
        const carpeta = join(dir, id);
        salida.push({ id, tipo, carpeta, meta: leerJson(join(carpeta, 'meta.json')), propia: true });
      }
    }
  }

  return salida;
}

/**
 * Layout de una plantilla: el suyo propio, o el compartido que declare en
 * `meta.layout`. Ver el comentario de rutaLayout() en core/catalog.js.
 */
export function leerLayout(carpeta, meta) {
  const ruta = meta?.layout
    ? join(TEMPLATES, 'layouts', `${meta.layout}.html`)
    : join(carpeta, 'layout.html');
  return readFileSync(ruta, 'utf8');
}
export const leerCopy = (carpeta, idioma) => leerJson(join(carpeta, 'copy', `${idioma}.json`));

/** Marca de relleno para linter y tests: valores plausibles, nada real. */
export const MARCA_PRUEBA = {
  empresa: 'Contoso Industrial',
  sector: 'distribución industrial',
  dominio: 'contoso.example',
  firma: 'Departamento de Recursos Humanos',
  color: '#0067b8',
  colorOscuro: '#00559a',
  colorTexto: '#ffffff',
  logo: '',
  logoHtml: '<span>Contoso Industrial</span>',
  anio: '2026',
};

/**
 * Compone una plantilla entera: elige copy por señales, poda bloques y
 * sustituye variables. Devuelve también lo que se ha quedado por el camino,
 * que es lo que el linter necesita para avisar.
 *
 * @returns {{ html: string, asunto: string, faltantes: string[], eliminados: string[], senales: Record<string,boolean> }}
 */
export function componer(plantilla, { idioma = 'es', preset = 'medio', overridesSenales = {}, overridesBloques = {}, marca = MARCA_PRUEBA, campos } = {}) {
  const presets = presetsCatalogo();
  const senales = resolverSenales(presets, preset, overridesSenales);
  const activasSet = activas(senales);

  const copy = resolverCopy(leerCopy(plantilla.carpeta, idioma), activasSet);
  const vivos = bloquesActivos(plantilla.meta.bloques ?? [], activasSet, overridesBloques);

  const valores = campos ?? Object.fromEntries(
    (plantilla.meta.campos ?? []).map((c) => [c.clave, c.defecto ?? ''])
  );

  const podado = podar(leerLayout(plantilla.carpeta, plantilla.meta), vivos);
  const ctx = construirContexto({
    marca: { ...marca, idioma },
    campos: valores,
    fragmentos: copy,
  });

  const salida = render(podado.html, ctx);
  const asunto = render(copy.asunto ?? '', ctx).html;

  return {
    html: salida.html,
    asunto,
    faltantes: salida.faltantes,
    eliminados: podado.eliminados,
    senales,
  };
}
