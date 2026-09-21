/**
 * Edición en línea sobre la preview.
 *
 * La preview sigue en `iframe sandbox="allow-scripts"` sin `allow-same-origin`
 * (ver `detalle.js`): el JS que corre ahí dentro no puede tocar
 * el DOM del padre. Por eso la edición no se hace "desde fuera" manipulando el
 * iframe, sino AL REVÉS: es el propio HTML compuesto el que lleva inyectado un
 * script pequeño que hace los nodos editables y avisa al padre por
 * `postMessage` cuando algo cambia. El padre escucha, escribe el cambio donde
 * corresponda y vuelve a componer.
 *
 * Dos clases de texto conviven en el mismo documento:
 *
 *   - Fragmentos de copy (`{{entradilla}}`...): `engine.render()` ya los deja
 *     marcados con `data-pl-copy="clave"` al sustituirlos (ver engine.js). Un
 *     cambio ahí se escribe en la variante de señal que estuviera activa.
 *   - Cualquier otro texto visible, sea de una plantilla de fábrica (un
 *     botón con la etiqueta escrita a mano en el layout) o de HTML crudo
 *     importado/clonado: se numera aquí mismo, en el mismo recorrido tanto si
 *     se va a pintar como si se va a exportar, para que el índice de un nodo
 *     signifique siempre lo mismo. Un cambio ahí se guarda como parche
 *     literal, sin pasar por el sistema de señales.
 *
 * Las imágenes no se envuelven en ningún elemento nuevo: un correo de tablas
 * espera que sus `<img>` midan y floten exactamente como se declaró, y meter
 * un `<span>` alrededor puede descuadrar precisamente el maquetado que
 * `tools/lint.js` comprueba. El "cambiar imagen" se resuelve con un overlay
 * flotante posicionado por JS sobre el `<img>`, nunca con un envoltorio.
 */

const ATRIBUTO_COPY = 'data-pl-copy';
const ATRIBUTO_RAW = 'data-pl-raw';
const ATRIBUTO_IMG = 'data-pl-img';

const VARIABLE_GOPHISH = /^\{\{\s*\.\w+\s*\}\}$/;
const ETIQUETAS_OPACAS = new Set(['SCRIPT', 'STYLE', 'TITLE', 'TEXTAREA']);

/**
 * Numera el texto y las imágenes editables de un HTML ya compuesto, y aplica
 * los parches guardados de una sesión de edición anterior.
 *
 * Se hace SIEMPRE con el mismo recorrido, tanto para la preview editable como
 * para el HTML final de exportación (con `limpio: true`): si el recorrido
 * cambiase entre los dos casos, un índice guardado en un modo apuntaría a un
 * nodo distinto en el otro.
 *
 * @param {string} html
 * @param {Record<string,string>} parches  `raw:<n>` -> texto, `img:<n>` -> data URI
 * @param {{ limpio?: boolean }} [opciones]  `limpio`: quita todo rastro del
 *   editor (atributos y envoltorios) en vez de dejarlo listo para inyectar
 *   el script. Es lo que se usa al exportar o copiar HTML: el resultado tiene
 *   que ser idéntico a lo que salía antes de que existiera el editor en línea.
 * @returns {string}
 */
export function numerarYParchear(html, parches = {}, { limpio = false } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc.body) return html;

  let n = 0;
  for (const nodo of nodosDeTextoEditables(doc)) {
    const clave = `raw:${n++}`;
    const span = doc.createElement('span');
    span.setAttribute(ATRIBUTO_RAW, clave);
    nodo.parentNode.insertBefore(span, nodo);
    span.appendChild(nodo);
    if (parches[clave] !== undefined) span.textContent = parches[clave];
  }

  let m = 0;
  for (const img of doc.body.querySelectorAll('img')) {
    const clave = `img:${m++}`;
    img.setAttribute(ATRIBUTO_IMG, clave);
    if (parches[clave] !== undefined) img.setAttribute('src', parches[clave]);
  }

  if (limpio) limpiar(doc);

  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

/** Deja el HTML final de exportación/copia sin ni un rastro del editor. */
export function finalizar(html, parches = {}) {
  return numerarYParchear(html, parches, { limpio: true });
}

/** Deja el HTML listo para pintarse como preview editable. */
export function paraEditar(html, parches = {}) {
  return inyectarScript(numerarYParchear(html, parches, { limpio: false }));
}

function limpiar(doc) {
  // Los <span> que solo existen para llevar el índice se desenvuelven: su
  // texto se queda, la etiqueta desaparece. Uno con data-pl-copy que además
  // acabase teniendo data-pl-raw (raro, pero posible si un fragmento de copy
  // es el único contenido de su nodo) se desenvuelve igual, una sola vez.
  for (const span of [...doc.querySelectorAll(`[${ATRIBUTO_RAW}], [${ATRIBUTO_COPY}]`)]) {
    span.replaceWith(...span.childNodes);
  }
  for (const img of doc.querySelectorAll(`[${ATRIBUTO_IMG}]`)) {
    img.removeAttribute(ATRIBUTO_IMG);
  }
}

function nodosDeTextoEditables(doc) {
  const marcha = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(nodo) {
      const texto = nodo.nodeValue;
      if (!texto || !texto.trim()) return NodeFilter.FILTER_REJECT;
      if (VARIABLE_GOPHISH.test(texto.trim())) return NodeFilter.FILTER_REJECT;

      for (let padre = nodo.parentElement; padre; padre = padre.parentElement) {
        if (ETIQUETAS_OPACAS.has(padre.tagName)) return NodeFilter.FILTER_REJECT;
        if (padre.hasAttribute(ATRIBUTO_COPY)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodos = [];
  let nodo;
  while ((nodo = marcha.nextNode())) nodos.push(nodo);
  return nodos;
}

// -------------------------------------------------------- script inyectado ---

/**
 * Envuelve el HTML con el script de edición justo antes de `</body>`.
 * Si no hay `</body>` (HTML crudo a medio sanear) se añade al final.
 */
function inyectarScript(html) {
  const bloque = `<style>${ESTILOS}</style><script>${SCRIPT}<\/script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${bloque}</body>`) : `${html}${bloque}`;
}

const ESTILOS = `
[data-pl-copy], [data-pl-raw] { cursor: text; border-radius: 2px; outline-offset: 1px; }
[data-pl-copy]:hover, [data-pl-raw]:hover { outline: 1.5px dashed rgba(255,122,41,.85); background: rgba(255,122,41,.08); }
[data-pl-copy][contenteditable="true"], [data-pl-raw][contenteditable="true"] { outline: 1.5px solid #FF7A29; background: rgba(255,122,41,.12); }
#pl-overlay-img { position: absolute; z-index: 2147483647; display: none; pointer-events: none; outline: 1.5px dashed rgba(255,122,41,.85); outline-offset: -1.5px; }
#pl-overlay-img button { position: absolute; bottom: 4px; right: 4px; pointer-events: auto; border: 0; border-radius: 4px; padding: 3px 7px; font: 600 11px system-ui, sans-serif; color: #140900; background: #FF7A29; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.4); }
`;

/**
 * Fuente del script inyectado. Vive como cadena porque se sirve dentro de
 * `srcdoc`, no como fichero aparte: no hay build que lo empaquete.
 */
const SCRIPT = `(function () {
  var ACTIVO = 'pl-activo';
  var original = null;

  function activar(nodo) {
    if (nodo.isContentEditable) return;
    original = nodo.textContent;
    nodo.contentEditable = 'true';
    nodo.classList.add(ACTIVO);
    nodo.focus();
    var rango = document.createRange();
    rango.selectNodeContents(nodo);
    var seleccion = window.getSelection();
    seleccion.removeAllRanges();
    seleccion.addRange(rango);
  }

  function confirmar(nodo) {
    nodo.contentEditable = 'false';
    nodo.classList.remove(ACTIVO);
    if (nodo.textContent === original) return;
    var clave = nodo.getAttribute('data-pl-copy');
    var tipo = clave ? 'texto-copy' : 'texto-raw';
    if (!clave) clave = nodo.getAttribute('data-pl-raw');
    enviar({ tipo: tipo, clave: clave, valor: nodo.textContent });
  }

  function cancelar(nodo) {
    nodo.textContent = original;
    nodo.contentEditable = 'false';
    nodo.classList.remove(ACTIVO);
  }

  document.addEventListener('click', function (e) {
    var nodo = e.target.closest('[data-pl-copy], [data-pl-raw]');
    if (nodo) { e.preventDefault(); activar(nodo); }
  });

  document.addEventListener('focusout', function (e) {
    var nodo = e.target.closest('[data-pl-copy], [data-pl-raw]');
    if (nodo && nodo.isContentEditable) confirmar(nodo);
  });

  document.addEventListener('keydown', function (e) {
    var nodo = e.target.closest('[data-pl-copy], [data-pl-raw]');
    if (!nodo || !nodo.isContentEditable) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); nodo.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); cancelar(nodo); }
  });

  // ---- imágenes: overlay flotante, sin envolver el <img> ----

  var overlay = document.createElement('div');
  overlay.id = 'pl-overlay-img';
  var boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Cambiar imagen';
  overlay.appendChild(boton);
  document.body.appendChild(overlay);

  var entrada = document.createElement('input');
  entrada.type = 'file';
  entrada.accept = 'image/*';
  entrada.style.display = 'none';
  document.body.appendChild(entrada);

  var imagenActiva = null;

  function situarOverlay(img) {
    var r = img.getBoundingClientRect();
    overlay.style.top = (r.top + window.scrollY) + 'px';
    overlay.style.left = (r.left + window.scrollX) + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    overlay.style.display = 'block';
  }

  document.addEventListener('mouseover', function (e) {
    var img = e.target.closest('img[data-pl-img]');
    if (img) { imagenActiva = img; situarOverlay(img); }
  });
  document.addEventListener('scroll', function () { if (imagenActiva) situarOverlay(imagenActiva); }, true);
  overlay.addEventListener('mouseleave', function () { overlay.style.display = 'none'; imagenActiva = null; });

  boton.addEventListener('click', function () { if (imagenActiva) entrada.click(); });

  entrada.addEventListener('change', function () {
    var fichero = entrada.files[0];
    if (!fichero || !imagenActiva) return;
    var lector = new FileReader();
    lector.onload = function () {
      imagenActiva.setAttribute('src', String(lector.result));
      enviar({ tipo: 'imagen', clave: imagenActiva.getAttribute('data-pl-img'), valor: String(lector.result) });
    };
    lector.readAsDataURL(fichero);
  });

  function enviar(datos) {
    window.parent.postMessage(Object.assign({ pl: true }, datos), '*');
  }
})();`;
