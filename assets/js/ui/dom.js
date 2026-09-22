/**
 * Utilidades mínimas de DOM.
 *
 * Todo se construye con createElement y textContent, nunca con innerHTML.
 * En una herramienta que manipula HTML de correos importados de fuera, la
 * diferencia no es estilística: `innerHTML` con el asunto de un `.eml` ajeno
 * es una inyección de script en el propio panel.
 */

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/**
 * Crea un elemento.
 *
 *   el('div.tarjeta', { onclick: f }, ['texto', el('span', 'hijo')])
 *
 * El selector admite `etiqueta.clase1.clase2#id`. Las propiedades que empiezan
 * por `on` se enganchan como escuchadores; `dataset` y `style` se mezclan; el
 * resto se asignan como atributos o propiedades según toque.
 */
export function el(selector, props = {}, hijos = []) {
  const [, etiqueta = 'div', resto = ''] = selector.match(/^([a-z0-9-]*)(.*)$/i) ?? [];
  const nodo = document.createElement(etiqueta || 'div');

  const id = resto.match(/#([\w-]+)/)?.[1];
  if (id) nodo.id = id;

  const clases = [...resto.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  if (clases.length) nodo.classList.add(...clases);

  // Un segundo argumento que sea texto o lista es en realidad el contenido.
  if (typeof props === 'string' || Array.isArray(props) || props instanceof Node) {
    hijos = props;
    props = {};
  }

  for (const [clave, valor] of Object.entries(props)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2), valor);
    } else if (clave === 'dataset') {
      Object.assign(nodo.dataset, valor);
    } else if (clave === 'style') {
      Object.assign(nodo.style, valor);
    } else if (clave === 'texto') {
      nodo.textContent = valor;
    } else if (clave in nodo && clave !== 'list') {
      nodo[clave] = valor;
    } else {
      nodo.setAttribute(clave, valor === true ? '' : valor);
    }
  }

  for (const hijo of [].concat(hijos)) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }

  return nodo;
}

/** Vacía un contenedor y le mete lo que se le pase. */
export function pintarEn(contenedor, ...hijos) {
  contenedor.textContent = '';
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    contenedor.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return contenedor;
}

/** Icono SVG de una sola trazada, del set que usa la barra y los filtros. */
export function icono(nombre, tamano = 15) {
  const TRAZOS = {
    buscar: ['M11 11 15 15', 'M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z'],
    flecha: ['M9.5 4 5 8.5 9.5 13'],
    descargar: ['M8 2v8', 'M4.5 7 8 10.5 11.5 7', 'M2.5 13.5h11'],
    copiar: ['M5.5 5.5h7v7h-7z', 'M3.5 10.5v-7h7'],
    mas: ['M8 3.5v9', 'M3.5 8h9'],
    externo: ['M6.5 3.5h-3v9h9v-3', 'M9 3.5h3.5V7', 'M7 9l5.5-5.5'],
  };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', tamano);
  svg.setAttribute('height', tamano);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of TRAZOS[nombre] ?? []) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

/**
 * Indicador de wizard: Plantilla → Contenido → Marca → Exportar.
 *
 *   pasos(2, [
 *     { etiqueta: 'Plantilla', onclick: () => ir(1) },
 *     { etiqueta: 'Contenido', onclick: () => ir(2) },
 *   ])
 *
 * `activo` es el número de paso actual (1-index). Los pasos anteriores se
 * marcan como hechos; los pasos sin `onclick` no son navegables (por
 * ejemplo, "Exportar" antes de haber elegido una plantilla).
 */
export function pasos(activo, lista) {
  const nodos = lista.flatMap(({ etiqueta, onclick }, i) => {
    const numero = i + 1;
    const estadoPaso = numero < activo ? 'hecho' : numero === activo ? 'activa' : '';
    const boton = el(`button.paso${estadoPaso ? '.' + estadoPaso : ''}`, {
      type: 'button',
      disabled: !onclick,
      onclick,
    }, [
      el('span.paso-punto', { texto: numero < activo ? '✓' : String(numero) }),
      el('span.paso-etiqueta', { texto: etiqueta }),
    ]);
    return i === 0 ? [boton] : [el('span.paso-linea'), boton];
  });
  return el('.pasos', nodos);
}

/** Interruptor con etiqueta y ayuda. Devuelve el <label> ya conectado. */
export function interruptor({ id, etiqueta, ayuda, marcado, gobernado, insignia, alCambiar }) {
  const entrada = el('input', { type: 'checkbox', checked: Boolean(marcado), onchange: (e) => alCambiar(e.target.checked) });
  const texto = el('.texto-interruptor', [
    el('strong', [etiqueta, insignia ? el('span.marca-senal', { texto: insignia }) : null]),
    ayuda ? el('small', { texto: ayuda }) : null,
  ]);
  return el(`label.interruptor${gobernado ? '.gobernado' : ''}`, { for: id }, [entrada, el('span.palanca'), texto]);
}

let temporizadorBrindis = null;

/** Mensaje efímero abajo del todo. */
export function brindis(texto) {
  const caja = $('#brindis');
  if (!caja) return;
  caja.textContent = texto;
  caja.classList.add('visible');
  clearTimeout(temporizadorBrindis);
  temporizadorBrindis = setTimeout(() => caja.classList.remove('visible'), 3000);
}

/**
 * Lista de lo que ha tocado un saneado (de `.eml`, de HTML pegado o de una
 * web clonada). La usan `importar.js` e `importarWeb.js` — es el mismo
 * informe tanto si lo que entra es un correo como una página.
 */
export function informeSaneado(lineas) {
  if (!lineas.length) return el('p.ayuda', { texto: 'No hizo falta tocar nada.' });

  return el('.informe-saneado', lineas.map((l) =>
    el(`.linea-informe.${l.clase ?? 'quitado'}`, [
      el('span.marca', { texto: l.clase ?? 'quitado' }),
      el('span', { texto: l.texto }),
    ])
  ));
}

/** Formatea bytes de forma legible. */
export function peso(texto) {
  const bytes = new Blob([texto]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Convierte un texto cualquiera en un identificador de carpeta. */
export function comoId(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
