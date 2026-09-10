/**
 * Editor de los textos de una plantilla.
 *
 * Cada fragmento se enseña con todas sus variantes por señal, marcando cuál
 * está aplicándose ahora mismo. Editar cambia la previsualización al momento,
 * pero NO toca la plantilla de fábrica: para conservar el cambio hay que
 * guardarlo como plantilla propia, que va a `templates/propias/` y fuera de git.
 *
 * Se hizo así a propósito. Las plantillas de fábrica son la base comparable
 * entre campañas y entre clientes; si editarlas las machacase, la comparación
 * de un año contra otro dejaría de significar nada.
 */

import { el, pintarEn, brindis, comoId } from './dom.js';
import { estado } from '../core/estado.js';
import { olvidar } from '../core/componer.js';
import { guardarPlantilla, hayServidor } from '../core/importar.js';

export function editorDeCopy(meta, ultimo, alCambiar) {
  const raiz = el('.editor-copy');
  let sucio = false;
  let cajaGuardado = null;

  pintar();
  return raiz;

  function pintar() {
    const copyCrudo = ultimo?.copyCrudo;

    if (!copyCrudo) {
      return pintarEn(raiz, el('p.ayuda', { texto: 'Cargando textos…' }));
    }

    const claves = Object.keys(copyCrudo).filter((k) => !k.startsWith('_'));

    pintarEn(raiz,
      el('p.ayuda', {
        style: { margin: '0 0 4px' },
        texto: `${claves.length} fragmentos en ${nombreIdioma(estado.idioma)}. La variante resaltada es la que se está usando con las señales activas.`,
      }),
      ...claves.map((clave) => fragmento(clave, copyCrudo[clave])),
      barraGuardado()
    );
  }

  function fragmento(clave, variantes) {
    const esCadena = typeof variantes === 'string';
    const entradas = esCadena ? [['base', variantes]] : Object.entries(variantes).filter(([k]) => !k.startsWith('_'));
    const aplicada = claveAplicada(entradas.map(([k]) => k));

    return el('.fragmento', [
      el('.cabecera-fragmento', [
        el('span.clave', { texto: clave }),
        el('span.cuenta-variantes', { texto: entradas.length === 1 ? 'constante' : `${entradas.length} variantes` }),
      ]),
      ...entradas.map(([claveVariante, texto]) =>
        el(`.variante${claveVariante === aplicada ? '.aplicada' : ''}`, [
          el('span.clave-variante', {
            texto: claveVariante === 'base'
              ? (esCadena ? 'siempre' : 'base · sin señales')
              : claveVariante.split('+').join(' + '),
          }),
          el('textarea', {
            value: texto,
            rows: Math.min(6, Math.ceil(texto.length / 58) || 1),
            spellcheck: true,
            oninput: (e) => {
              // Se muta el objeto que ya tiene cacheado `componer`, así que la
              // previsualización recoge el cambio sin recargar nada del disco.
              if (esCadena) ultimo.copyCrudo[clave] = e.target.value;
              else ultimo.copyCrudo[clave][claveVariante] = e.target.value;
              sucio = true;
              alCambiar();
              repintarGuardado();
            },
          }),
        ])
      ),
    ]);
  }

  /** Qué variante gana con las señales activas ahora mismo. */
  function claveAplicada(claves) {
    const activas = ultimo?.activas ?? new Set();
    let mejor = null;
    let peso = -1;
    for (const clave of claves) {
      const exigidas = clave === 'base' ? [] : clave.split('+').map((s) => s.trim());
      if (!exigidas.every((s) => activas.has(s))) continue;
      if (exigidas.length > peso) { mejor = clave; peso = exigidas.length; }
    }
    return mejor;
  }

  function barraGuardado() {
    cajaGuardado = el('div', { style: { marginTop: '4px' } });
    repintarGuardado();
    return cajaGuardado;
  }

  function repintarGuardado() {
    if (!cajaGuardado) return;

    if (!sucio) {
      return pintarEn(cajaGuardado, el('p.ayuda', {
        texto: 'Editar aquí no modifica la plantilla de fábrica. Al cambiar algo aparecerá la opción de guardarlo como plantilla propia.',
      }));
    }

    pintarEn(cajaGuardado,
      el('.nota.alerta', [
        el('strong', { texto: 'Cambios sin guardar. ' }),
        hayServidor()
          ? 'Se pierden al recargar la página si no los guardas como plantilla propia.'
          : 'Sin el servidor local no se pueden guardar en disco: arranca con abrir-phishlab.bat o npm run dev.',
      ]),
      hayServidor()
        ? el('button.btn.btn-primario', {
            type: 'button',
            style: { marginTop: '9px', width: '100%', justifyContent: 'center' },
            texto: 'Guardar como plantilla propia',
            onclick: guardar,
          })
        : null
    );
  }

  async function guardar() {
    const sugerido = `${meta.id}-${comoId(estado.marca.empresa || estado.cliente || 'variante')}`;
    const id = prompt('Identificador de la plantilla propia:', sugerido);
    if (!id?.trim()) return;

    const nombre = prompt('Nombre visible:', `${meta.nombre} — ${estado.marca.empresa || 'variante'}`);
    if (!nombre?.trim()) return;

    try {
      await guardarPlantilla({
        id: comoId(id),
        tipo: meta.tipo,
        meta: {
          ...meta,
          nombre: nombre.trim(),
          demo: false,
          origen: {
            tipo: meta.origen?.tipo === 'escrito-a-mano' ? 'derivada' : meta.origen?.tipo ?? 'derivada',
            derivadaDe: meta.id,
            fecha: new Date().toISOString().slice(0, 10),
            autorizacion: estado.expediente || estado.cliente || '(sin expediente)',
            notas: `Variante de «${meta.nombre}» editada para ${estado.marca.empresa || 'un cliente'}.`,
          },
        },
        copy: { [estado.idioma]: ultimo.copyCrudo },
      });

      sucio = false;
      olvidar(meta);
      brindis(`Guardada como plantilla propia «${comoId(id)}». Recarga para verla en la biblioteca.`);
      pintar();
    } catch (e) {
      brindis(`No se pudo guardar: ${e.message}`);
    }
  }
}

const nombreIdioma = (l) => ({ es: 'castellano', ca: 'catalán', en: 'inglés' }[l] ?? l);
