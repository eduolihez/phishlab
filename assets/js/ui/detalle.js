/**
 * Vista de detalle de una plantilla.
 *
 * A la izquierda todo lo que se puede tocar (preset, señales, bloques, campos,
 * marca); a la derecha la plantilla compuesta de verdad, no una aproximación.
 * Cada cambio recompone y repinta, con un pequeño retardo para no rehacer el
 * iframe en cada tecla.
 */

import { el, pintarEn, interruptor, brindis, peso, icono } from './dom.js';
import {
  estado,
  actualizar,
  ajustarSenal,
  volverAlPreset,
  ajustarBloque,
  reiniciarBloques,
  plantilla,
  formativa,
} from '../core/estado.js';
import { componer, camposConDefectos } from '../core/componer.js';
import { esPersonalizado, sugerirRemitente } from '../core/senales.js';
import { conDatosDeEjemplo, variablesGophish } from '../core/engine.js';
import { construirCampos } from './fields.js';
import { panelMarca } from './marca.js';
import { editorDeCopy } from './editor.js';

export function vistaDetalle({ id }) {
  const meta = plantilla(id);
  if (!meta) {
    return el('.pagina', [el('.nota.peligro', [el('strong', { texto: 'No existe esa plantilla. ' }), `El id «${id}» no está en el catálogo.`])]);
  }

  // Al abrir una plantilla se selecciona para la campaña y se rellenan sus
  // campos: entrar a mirarla y que luego "Campaña" no sepa nada de ella sería
  // desconcertante.
  const seleccion = meta.tipo === 'emails' ? { emailId: meta.id } : meta.formativa ? { formativaId: meta.id } : { landingId: meta.id };
  Object.assign(estado, seleccion, { campos: camposConDefectos(meta, estado.campos) });

  const marcoVista = el('iframe', {
    title: `Previsualización de ${meta.nombre}`,
    // allow-scripts sin allow-same-origin: el JS de la landing corre (hace
    // falta para ver el segundo paso del login) pero en un origen opaco, y
    // sin allow-forms el formulario no puede enviarse desde aquí.
    sandbox: 'allow-scripts',
  });

  const lienzo = el(`.lienzo${estado.dispositivo === 'movil' ? '.movil' : ''}`, [marcoVista]);
  const estadoVista = el('span', { texto: '' });
  const pesoVista = el('span.peso');
  const panelAjustes = el('.panel-ajustes');
  const cajaAvisos = el('div');

  const raiz = el('.detalle', [
    panelAjustes,
    el('.panel-vista', [barraDeVista(), lienzo, el('.pie-vista', [estadoVista, pesoVista])]),
  ]);

  let temporizador = null;
  let ultimo = null;

  pintarPanel();
  recomponer();

  return raiz;

  // --------------------------------------------------------------------------

  function recomponer(retardo = 60) {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      const r = await componer(meta, estado);
      ultimo = r;

      marcoVista.srcdoc = estado.ejemplo ? conDatosDeEjemplo(r.html) : r.html;

      const vars = variablesGophish(r.html);
      estadoVista.textContent = vars.length
        ? `GoPhish resolverá: ${vars.join('  ')}`
        : 'Esta plantilla no usa variables de GoPhish.';
      pesoVista.textContent = peso(r.html);

      pintarAvisos(r);
      pintarPanel();
    }, retardo);
  }

  function pintarAvisos(r) {
    if (!r.faltantes.length) return pintarEn(cajaAvisos);
    pintarEn(cajaAvisos, el('.avisos', [
      el('p', { style: { margin: '0' }, texto: 'Estas variables no tienen valor y saldrán literales en el HTML:' }),
      el('ul', r.faltantes.map((f) => el('li', [el('code', { texto: `{{${f}}}` })]))),
    ]));
  }

  function barraDeVista() {
    return el('.barra-vista', [
      el('.pestanas', [
        el('span.pildora', { texto: meta.tipo === 'emails' ? 'CORREO' : 'LANDING' }),
        el('span.pildora', { texto: meta.id }),
      ]),
      el('.controles-vista', [
        el('label.conmutador', [
          el('input', {
            type: 'checkbox',
            checked: estado.ejemplo,
            onchange: (e) => { actualizar({ ejemplo: e.target.checked }); recomponer(0); },
          }),
          el('span', { texto: 'Datos de ejemplo' }),
        ]),
        el('.grupo-dispositivo', ['escritorio', 'movil'].map((d) =>
          el(`button.btn-dispositivo${estado.dispositivo === d ? '.activa' : ''}`, {
            type: 'button',
            texto: d === 'movil' ? 'Móvil' : 'Escritorio',
            onclick: () => {
              actualizar({ dispositivo: d });
              lienzo.classList.toggle('movil', d === 'movil');
              pintarPanel();
            },
          })
        )),
        el('button.btn.btn-mini', {
          type: 'button',
          texto: 'Copiar HTML',
          onclick: async () => {
            if (!ultimo) return;
            try {
              await navigator.clipboard.writeText(ultimo.html);
              brindis('HTML copiado — pégalo en GoPhish con el botón <>');
            } catch {
              brindis('El navegador bloqueó el portapapeles; usa la descarga desde Campaña');
            }
          },
        }),
      ]),
    ]);
  }

  // ----------------------------------------------------------------- panel ---

  function pintarPanel() {
    const senalActiva = (id) => ultimo?.activas?.has(id) ?? false;
    const personalizado = esPersonalizado(estado.catalogo.presets, estado.preset, ultimo?.senales ?? {});

    pintarEn(panelAjustes,
      el('a.volver', { href: '#/biblioteca' }, [icono('flecha', 13), 'Biblioteca']),
      el('h2', { style: { margin: '0 0 3px', fontSize: '17px', letterSpacing: '-0.01em' }, texto: meta.nombre }),
      el('p', { style: { margin: '0 0 18px', fontSize: '12.5px', color: 'var(--texto-medio)' }, texto: meta.descripcion ?? '' }),

      origen(),
      cajaAvisos,

      bloqueDificultad(personalizado),
      bloqueSenales(senalActiva),
      bloqueBloques(),
      bloqueCampos(),
      panelMarca(() => recomponer(140)),
      bloqueIdioma(),
      bloqueEditor(),
      bloqueAcciones()
    );
  }

  function origen() {
    if (!meta.origen) return null;
    const linea = [meta.origen.tipo?.replace(/-/g, ' '), meta.origen.fecha].filter(Boolean).join(' · ');
    return el('.bloque-ajustes', [
      el('.nota', [
        el('strong', { texto: 'Origen: ' }), linea,
        meta.origen.autorizacion ? el('div', { style: { marginTop: '5px' }, texto: `Autorización: ${meta.origen.autorizacion}` }) : null,
        meta.origen.notas ? el('div', { style: { marginTop: '5px' }, texto: meta.origen.notas }) : null,
      ]),
    ]);
  }

  function bloqueDificultad(personalizado) {
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Dificultad' }),
      el('.fila-presets', estado.catalogo.presets.map((p) =>
        el(`button.chip-preset${estado.preset === p.id && !personalizado ? '.activa' : ''}`, {
          type: 'button',
          texto: p.nombre,
          title: p.descripcion,
          onclick: () => { volverAlPreset(p.id); recomponer(0); },
        })
      )),
      el('p.ayuda', { texto: estado.catalogo.presets.find((p) => p.id === estado.preset)?.descripcion ?? '' }),
      personalizado
        ? el('p.aviso-personalizado', { texto: `Ajustado a mano sobre «${estado.preset}» — pulsa el preset para volver` })
        : null,
    ]);
  }

  function bloqueSenales(senalActiva) {
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Señales' }),
      el('p.ayuda', {
        style: { margin: '0 0 9px' },
        texto: 'Cada una es una pista que el empleado puede detectar. El informe puede decir qué señal se le pasó, no solo si picó.',
      }),
      el('.lista-interruptores', estado.catalogo.senales.map((s) =>
        interruptor({
          id: `senal-${s.id}`,
          etiqueta: s.nombre,
          ayuda: s.descripcion,
          marcado: senalActiva(s.id),
          alCambiar: (v) => { ajustarSenal(s.id, v); recomponer(0); },
        })
      )),
    ]);
  }

  function bloqueBloques() {
    if (!meta.bloques?.length) return null;
    const overrides = estado.overridesBloques[meta.id] ?? {};

    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Bloques' }),
      el('.lista-interruptores', meta.bloques.map((b) => {
        const gobernado = Boolean(b.senal) && overrides[b.id] === undefined;
        const negada = b.senal?.startsWith('!');
        const nombreSenal = b.senal
          ? estado.catalogo.senales.find((s) => s.id === b.senal.replace(/^!/, ''))?.nombre
          : null;

        return interruptor({
          id: `bloque-${b.id}`,
          etiqueta: b.etiqueta ?? b.id,
          ayuda: b.ayuda,
          insignia: nombreSenal ? (negada ? `sin ${nombreSenal.toLowerCase()}` : nombreSenal.toLowerCase()) : null,
          gobernado,
          marcado: ultimo?.vivos?.has(b.id) ?? false,
          alCambiar: (v) => { ajustarBloque(meta.id, b.id, v); recomponer(0); },
        });
      })),
      Object.keys(overrides).length
        ? el('button.btn.btn-mini', {
            type: 'button',
            style: { marginTop: '8px' },
            texto: 'Volver a los bloques de fábrica',
            onclick: () => { reiniciarBloques(meta.id); recomponer(0); },
          })
        : null,
    ]);
  }

  function bloqueCampos() {
    if (!meta.campos?.length) return null;
    const contenedor = el('div');
    estado.campos = construirCampos(contenedor, meta.campos, estado.campos, () => recomponer(140));
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Campos' }),
      contenedor,
    ]);
  }

  function bloqueIdioma() {
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Idioma' }),
      el('.campo', [
        el('select', {
          onchange: (e) => { actualizar({ idioma: e.target.value }); recomponer(0); },
        }, [
          ['es', 'Castellano'], ['ca', 'Catalán'], ['en', 'Inglés'],
        ].map(([v, t]) => el('option', {
          value: v,
          texto: meta.idiomas.includes(v) ? t : `${t} (no disponible)`,
          selected: estado.idioma === v,
          disabled: !meta.idiomas.includes(v),
        }))),
      ]),
      meta.tipo === 'emails'
        ? el('.campo', [
            el('span.etiqueta', { texto: 'Asunto resuelto' }),
            el('output.salida-mono', { texto: conDatosDeEjemplo(ultimo?.asunto ?? '') || '—' }),
          ])
        : null,
      meta.tipo === 'emails'
        ? el('.campo', [
            el('span.etiqueta', { texto: 'Envelope sender sugerido' }),
            el('output.salida-mono', {
              texto: sugerirRemitente(meta, estado.marca, ultimo?.activas ?? new Set()),
            }),
          ])
        : null,
    ]);
  }

  function bloqueEditor() {
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Textos' }),
      editorDeCopy(meta, ultimo, () => recomponer(0)),
    ]);
  }

  function bloqueAcciones() {
    const pareja = meta.tipo === 'emails' ? plantilla(estado.landingId) : plantilla(estado.emailId);
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Siguiente paso' }),
      el('.nota', [
        'Seleccionada para la campaña actual. ',
        pareja ? `Hace pareja con «${pareja.nombre}». ` : 'Falta elegir la otra mitad. ',
        formativa() ? '' : 'No hay página formativa en el catálogo.',
      ]),
      el('a.btn.btn-primario', {
        href: '#/campana',
        style: { marginTop: '10px', width: '100%', justifyContent: 'center' },
      }, [icono('descargar', 14), 'Ir a montar la campaña']),
    ]);
  }
}
