/**
 * Puente entre la preview editable y el estado de la plantilla.
 *
 * El HTML que se pinta en el iframe lleva su propio script inyectado
 * (`core/edicionInline.js`) que hace el texto y las imágenes clicables y
 * manda el cambio por `postMessage`. Este módulo escucha esos mensajes y
 * decide dónde escribirlos: si el nodo venía de un fragmento de copy
 * (`data-pl-copy`), en la variante de señal que estuviera activa — igual que
 * hacía el editor de texto de v2, solo que disparado por el clic en la
 * preview y no por una lista de textareas aparte. Si era texto o imagen
 * suelta, en `estado.edicionesCrudas`.
 *
 * Solo hace falta UN listener de `message` para toda la aplicación: en vez de
 * enganchar y desenganchar uno por cada plantilla que se abre —el router no
 * da un gancho de "al salir de esta vista" del que colgarse—, hay un único
 * listener de por vida que consulta cuál es la plantilla activa ahora mismo.
 * Abrir otra plantilla simplemente reemplaza esa referencia.
 */

import { el, pintarEn, brindis, comoId } from './dom.js';
import { estado } from '../core/estado.js';
import { olvidar } from '../core/componer.js';
import { finalizar } from '../core/edicionInline.js';
import { guardarPlantilla, hayServidor } from '../core/importar.js';

let activo = null;

window.addEventListener('message', (evento) => {
  if (!activo || !evento.data?.pl || evento.source !== activo.marco.contentWindow) return;

  const { tipo, clave, valor } = evento.data;
  const ultimo = activo.obtenerUltimo();
  if (!ultimo) return;

  if (tipo === 'texto-copy') escribirCopy(ultimo, clave, valor);
  else if (tipo === 'texto-raw' || tipo === 'imagen') escribirCrudo(activo.meta.id, clave, valor);
  else return;

  activo.sucio = true;
  activo.repintarBarra();
  activo.recomponer(0);
});

/**
 * Marca qué plantilla es la que está escuchando ahora mismo. Se llama una vez
 * al montar el workspace de una plantilla.
 *
 * @returns {{ barraGuardado: () => Node }}
 */
export function activarEdicionEnVivo({ marco, meta, obtenerUltimo, recomponer }) {
  activo = { marco, meta, obtenerUltimo, recomponer, sucio: false, repintarBarra: () => {} };
  const referencia = activo;

  return { barraGuardado: () => construirBarra(referencia) };
}

function escribirCopy(ultimo, clave, valor) {
  const variantes = ultimo.copyCrudo?.[clave];
  if (variantes === undefined) return;
  if (typeof variantes === 'string') {
    ultimo.copyCrudo[clave] = valor;
    return;
  }
  const claves = Object.keys(variantes).filter((k) => !k.startsWith('_'));
  const activa = varianteActiva(claves, ultimo.activas ?? new Set()) ?? 'base';
  variantes[activa] = valor;
}

/** Misma regla que `senales.elegirVariante`: gana la más específica que cumplan las señales activas. */
function varianteActiva(claves, activas) {
  let mejor = null;
  let peso = -1;
  for (const clave of claves) {
    const exigidas = clave === 'base' ? [] : clave.split('+').map((s) => s.trim());
    if (!exigidas.every((s) => activas.has(s))) continue;
    if (exigidas.length > peso) { mejor = clave; peso = exigidas.length; }
  }
  return mejor;
}

function escribirCrudo(metaId, clave, valor) {
  estado.edicionesCrudas[metaId] = { ...(estado.edicionesCrudas[metaId] ?? {}), [clave]: valor };
}

// ------------------------------------------------------------- guardado ---

function construirBarra(referencia) {
  const raiz = el('div');
  referencia.repintarBarra = () => pintar(raiz, referencia);
  pintar(raiz, referencia);
  return raiz;
}

function pintar(raiz, referencia) {
  if (!referencia.sucio) {
    return pintarEn(raiz, el('p.ayuda', {
      texto: 'Editar un texto o una imagen aquí no modifica la plantilla de fábrica. En cuanto toques algo aparece la opción de guardarlo como plantilla propia.',
    }));
  }

  const parches = estado.edicionesCrudas[referencia.meta.id] ?? {};
  const hayParches = Object.keys(parches).length > 0;

  pintarEn(raiz,
    el('.nota.alerta', [
      el('strong', { texto: 'Cambios sin guardar. ' }),
      hayServidor()
        ? 'Se pierden al recargar la página si no los guardas como plantilla propia.'
        : 'Sin el servidor local no se pueden guardar en disco: arranca con abrir-phishlab.bat o npm run dev.',
      hayParches
        ? el('div', {
            style: { marginTop: '6px' },
            texto: 'Incluye texto o imágenes fuera del sistema de señales: al guardar, esta variante queda fijada en el idioma y la marca de ahora mismo.',
          })
        : null,
    ]),
    hayServidor()
      ? el('button.btn.btn-primario', {
          type: 'button',
          style: { marginTop: '9px', width: '100%', justifyContent: 'center' },
          texto: 'Guardar como plantilla propia',
          onclick: () => guardar(referencia),
        })
      : null
  );
}

async function guardar(referencia) {
  const { meta, obtenerUltimo } = referencia;
  const ultimo = obtenerUltimo();
  if (!ultimo) return;

  const sugerido = `${meta.id}-${comoId(estado.marca.empresa || estado.cliente || 'variante')}`;
  const id = prompt('Identificador de la plantilla propia:', sugerido);
  if (!id?.trim()) return;

  const nombre = prompt('Nombre visible:', `${meta.nombre} — ${estado.marca.empresa || 'variante'}`);
  if (!nombre?.trim()) return;

  const parches = estado.edicionesCrudas[meta.id] ?? {};
  const hayParches = Object.keys(parches).length > 0;

  try {
    await guardarPlantilla({
      id: comoId(id),
      tipo: meta.tipo,
      meta: {
        ...meta,
        nombre: nombre.trim(),
        demo: false,
        origen: {
          tipo: meta.origen?.tipo === 'escrito-a-mano' ? 'derivada' : (meta.origen?.tipo ?? 'derivada'),
          derivadaDe: meta.id,
          fecha: new Date().toISOString().slice(0, 10),
          autorizacion: estado.expediente || estado.cliente || '(sin expediente)',
          notas: hayParches
            ? `Variante de «${meta.nombre}» con texto o imágenes editadas a mano para ${estado.marca.empresa || 'un cliente'}. Layout fijado en «${estado.idioma}»: no se recompone con otra marca o señales.`
            : `Variante de «${meta.nombre}» editada para ${estado.marca.empresa || 'un cliente'}.`,
        },
      },
      // Sin parches crudos, el layout de fábrica no se toca (igual que
      // siempre): solo cambia el copy, y la plantilla derivada conserva su
      // parametrización por marca y señales. Con parches, no hay forma de
      // "deshacer" el texto/imagen suelto de vuelta a {{clave}} — se guarda
      // el HTML ya compuesto y limpio, y esa variante queda fija.
      layout: hayParches ? finalizar(ultimo.html, parches) : undefined,
      copy: { [estado.idioma]: ultimo.copyCrudo },
    });

    referencia.sucio = false;
    delete estado.edicionesCrudas[meta.id];
    olvidar(meta);
    brindis(`Guardada como plantilla propia «${comoId(id)}». Recarga para verla en la biblioteca.`);
    referencia.repintarBarra();
  } catch (e) {
    brindis(`No se pudo guardar: ${e.message}`);
  }
}
