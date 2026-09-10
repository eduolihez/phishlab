/**
 * Composición de una plantilla en el navegador.
 *
 * Es el mismo pipeline que usan el linter y los tests desde Node
 * (`tools/render.js`): elegir copy por señales, podar bloques y sustituir
 * variables, en ese orden. Aquí además hay caché, porque la previsualización
 * se recompone en cada tecla que se escribe en el panel.
 */

import { render, podar, construirContexto } from './engine.js';
import { cargarLayout, cargarCopy } from './catalog.js';
import { resolverSenales, activas, resolverCopy, bloquesActivos } from './senales.js';
import { oscurecer, textoSobre } from './brand.js';

const cacheLayout = new Map();
const cacheCopy = new Map();

async function layoutDe(meta) {
  if (!cacheLayout.has(meta.ruta)) cacheLayout.set(meta.ruta, await cargarLayout(meta));
  return cacheLayout.get(meta.ruta);
}

async function copyDe(meta, idioma) {
  const clave = `${meta.ruta}:${idioma}`;
  if (!cacheCopy.has(clave)) cacheCopy.set(clave, await cargarCopy(meta, idioma));
  return cacheCopy.get(clave);
}

/** Tira la caché de una plantilla. Se llama al guardar una edición. */
export function olvidar(meta) {
  cacheLayout.delete(meta.ruta);
  for (const clave of [...cacheCopy.keys()]) {
    if (clave.startsWith(`${meta.ruta}:`)) cacheCopy.delete(clave);
  }
}

/**
 * Contexto de marca ampliado con los derivados que las plantillas necesitan
 * pero que no tiene sentido pedirle al usuario: el color de hover, el color de
 * texto legible sobre el acento, el año y el bloque de logo ya resuelto.
 */
export function contextoMarca(marca, idioma) {
  const empresa = marca.empresa.trim() || 'tu empresa';
  const color = /^#[\da-f]{6}$/i.test(marca.color) ? marca.color : '#0067b8';
  const dominio = (marca.dominio.trim() || 'ejemplo.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

  const logoHtml = marca.logo
    ? `<img src="${marca.logo}" alt="${escapar(empresa)}" width="150" style="display:block;border:0;max-width:150px;height:auto;">`
    : `<span style="font-family:Segoe UI,Arial,sans-serif;font-size:19px;font-weight:700;color:${color};">${escapar(empresa)}</span>`;

  return {
    empresa: escapar(empresa),
    sector: escapar(marca.sector.trim() || 'tu sector'),
    dominio: escapar(dominio),
    firma: escapar(marca.firma.trim() || 'Departamento de Recursos Humanos'),
    color,
    colorOscuro: oscurecer(color),
    colorTexto: textoSobre(color),
    logo: marca.logo,
    logoHtml,
    anio: String(new Date().getFullYear()),
    idioma,
  };
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * Compone una plantilla entera.
 *
 * @returns {Promise<{html: string, asunto: string, faltantes: string[],
 *                    eliminados: string[], copy: object, senales: object,
 *                    activas: Set<string>, vivos: Set<string>}>}
 */
export async function componer(meta, estado) {
  if (!meta) {
    return { html: '', asunto: '', faltantes: [], eliminados: [], copy: {}, senales: {}, activas: new Set(), vivos: new Set() };
  }

  const senales = resolverSenales(estado.catalogo.presets, estado.preset, estado.overridesSenales);
  const senalesActivas = activas(senales);

  const [layout, copyCrudo] = await Promise.all([layoutDe(meta), copyDe(meta, estado.idioma)]);

  const copy = resolverCopy(copyCrudo, senalesActivas);
  const vivos = bloquesActivos(meta.bloques, senalesActivas, estado.overridesBloques[meta.id] ?? {});

  const podado = podar(layout, vivos);
  const ctx = construirContexto({
    marca: contextoMarca(estado.marca, estado.idioma),
    campos: estado.campos,
    fragmentos: copy,
  });

  const salida = render(podado.html, ctx);

  return {
    html: salida.html,
    asunto: render(copy.asunto ?? '', ctx).html,
    faltantes: salida.faltantes,
    eliminados: podado.eliminados,
    copy,
    copyCrudo,
    senales,
    activas: senalesActivas,
    vivos,
  };
}

/**
 * Valores por defecto de los campos de una plantilla, sin pisar lo que el
 * usuario ya haya escrito con esa misma clave. Los campos son de campaña: el
 * importe se escribe una vez y sirve para el correo y para la landing.
 */
export function camposConDefectos(meta, camposActuales = {}) {
  const salida = { ...camposActuales };
  for (const campo of meta?.campos ?? []) {
    if (salida[campo.clave] === undefined || salida[campo.clave] === '') {
      salida[campo.clave] = campo.defecto ?? '';
    }
  }
  return salida;
}
