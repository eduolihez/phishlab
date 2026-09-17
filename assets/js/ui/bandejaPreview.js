/**
 * Vista previa de bandeja de entrada.
 *
 * Buena parte de las señales que se piden detectar (remitente, asunto
 * genérico, urgencia en el propio asunto) se juzgan en la bandeja, antes de
 * abrir el correo — no dentro de él. Sin esto solo se podía juzgar el correo
 * ya abierto, que es la mitad de la decisión real de un empleado.
 *
 * Solo lectura: reutiliza lo que `componer()` ya calculó (asunto, preheader,
 * remitente sugerido), no hace ninguna composición propia.
 */

import { el } from './dom.js';

/**
 * @param {{ remitente: string, asunto: string, preheader: string, empresa: string }} datos
 */
export function bandejaPreview({ remitente, asunto, preheader, empresa }) {
  const [nombreRemitente] = (remitente || '').split('<');
  const iniciales = inicialesDe(nombreRemitente || empresa || '?');

  return el('.bandeja-preview', [
    el('.bandeja-fila', [
      el('.bandeja-avatar', { texto: iniciales }),
      el('.bandeja-cuerpo', [
        el('.bandeja-cabecera', [
          el('span.bandeja-remitente', { texto: (nombreRemitente || 'Remitente').trim() || 'Remitente' }),
          el('span.bandeja-hora', { texto: 'ahora' }),
        ]),
        el('.bandeja-asunto', { texto: asunto || '(sin asunto)' }),
        el('.bandeja-preheader', { texto: preheader || '' }),
      ]),
    ]),
    el('p.bandeja-nota', {
      texto: 'Así se ve en la bandeja antes de abrirlo: remitente, asunto y preheader son donde se juzgan la mitad de las señales (saludo genérico, urgencia, dominio ajeno).',
    }),
  ]);
}

function inicialesDe(texto) {
  const limpio = texto.replace(/[^\p{L}\s]/gu, '').trim();
  if (!limpio) return '?';
  const partes = limpio.split(/\s+/);
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}
