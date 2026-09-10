/**
 * Referencia de señales y presets.
 *
 * Sirve para dos cosas: consultar qué mide cada señal al preparar una campaña,
 * y tener a mano el texto que se le explica al cliente en el informe. Lo que se
 * lee aquí sale de `templates/senales.json`, el mismo fichero que gobierna la
 * composición, así que no puede quedarse desfasado respecto a lo que hace el
 * motor.
 */

import { el } from './dom.js';
import { estado } from '../core/estado.js';

const PESOS = {
  alta: ['Detección alta', 'pildora-acento'],
  media: ['Detección media', 'pildora-alerta'],
  baja: ['Detección baja', 'pildora-info'],
};

export function vistaSenales() {
  return el('.pagina.columna-estrecha', [
    el('.cabecera-pagina', [
      el('.rotulo', { texto: '04 / Referencia' }),
      el('h1', { texto: 'Señales y niveles' }),
      el('p', {
        texto:
          'La dificultad de una campaña no es un botón de tres posiciones: es la combinación de pistas que se dejan puestas. Separarlas permite que el informe diga qué señal se le pasó a cada persona, y no solo cuántas picaron.',
      }),
    ]),

    el('h2.titulo-bloque', { texto: 'Las seis señales' }),
    ...estado.catalogo.senales.map(tarjetaSenal),

    el('h2.titulo-bloque', { style: { marginTop: '30px' }, texto: 'Los tres presets' }),
    ...estado.catalogo.presets.map(tarjetaPreset),

    el('.nota', { style: { marginTop: '26px' } }, [
      el('strong', { texto: 'Cómo usarlo en el informe. ' }),
      'Si repites el mismo preset entre campañas, la comparación entre años es válida. ',
      'Si quieres medir una señal concreta, deja el preset difícil y enciende solo esa: ',
      'lo que midas es la exposición a esa pista y a ninguna otra.',
    ]),
  ]);
}

function tarjetaSenal(s) {
  const [etiquetaPeso, clasePeso] = PESOS[s.peso] ?? ['', 'pildora'];

  return el('.fragmento', { style: { marginBottom: '12px' } }, [
    el('.cabecera-fragmento', [
      el('span.clave', { texto: s.id }),
      el('span', { texto: s.nombre }),
      el(`span.pildora.${clasePeso}`, { style: { marginLeft: 'auto' }, texto: etiquetaPeso }),
    ]),
    el('.variante', [
      el('p', { style: { margin: '0 0 8px' }, texto: s.descripcion }),
      el('p', { style: { margin: '0', color: 'var(--texto-medio)', fontSize: '12.5px' } }, [
        el('strong', { style: { color: 'var(--texto)' }, texto: 'Qué enseña: ' }),
        s.queEnsena,
      ]),
    ]),
  ]);
}

function tarjetaPreset(p) {
  const encendidas = Object.entries(p.senales).filter(([, v]) => v).map(([id]) => id);

  return el('.fragmento', { style: { marginBottom: '12px' } }, [
    el('.cabecera-fragmento', [
      el('span.clave', { texto: p.id }),
      el('span', { texto: p.nombre }),
      el('span.cuenta-variantes', { texto: `${encendidas.length} de ${Object.keys(p.senales).length} señales` }),
    ]),
    el('.variante', [
      el('p', { style: { margin: '0 0 9px' }, texto: p.descripcion }),
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '5px' } },
        Object.entries(p.senales).map(([id, activa]) =>
          el(`span.pildora${activa ? '.pildora-acento' : ''}`, {
            texto: id,
            style: activa ? {} : { opacity: '0.45' },
          })
        )
      ),
    ]),
  ]);
}
