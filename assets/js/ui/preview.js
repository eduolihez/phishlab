/**
 * Previsualización en iframe.
 *
 * Se usa `srcdoc` con el atributo `sandbox` puesto: la landing lleva un
 * formulario y JavaScript propio, y no queremos que se envíe nada ni que
 * el script de la plantilla toque el dashboard mientras se previsualiza.
 */

let temporizador = null;

/**
 * @param {HTMLIFrameElement} marco
 * @param {string} html
 * @param {number} retardo  ms de espera para no repintar en cada tecla
 */
export function pintar(marco, html, retardo = 90) {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    marco.srcdoc = html;
  }, retardo);
}

/** Devuelve el peso del HTML en formato legible. */
export function peso(html) {
  const bytes = new Blob([html]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
