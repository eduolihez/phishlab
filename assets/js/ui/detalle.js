/**
 * Workspace de una plantilla.
 *
 * Es la única pantalla donde se calibra, se edita, se marca y se exporta una
 * plantilla: sustituye a lo que en v2 eran tres sitios distintos (el wizard
 * `/nueva`, este mismo detalle en tres pasos, y la página de referencia
 * `/senales`). A la izquierda tres pestañas — Ajustes, Marca, Exportar — que
 * no son un wizard secuencial: se puede saltar entre ellas libremente porque
 * no hay un orden que respetar. A la derecha, siempre visible sea cual sea la
 * pestaña activa, la plantilla compuesta de verdad, editable al clic.
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
} from '../core/estado.js';
import { componer, componerSms, camposConDefectos } from '../core/componer.js';
import { esPersonalizado, sugerirRemitente } from '../core/senales.js';
import { conDatosDeEjemplo, variablesGophish } from '../core/engine.js';
import { paraEditar } from '../core/edicionInline.js';
import { construirCampos } from './fields.js';
import { panelMarca } from './marca.js';
import { panelExportar } from './exportar.js';
import { activarEdicionEnVivo } from './editorEnVivo.js';
import { bandejaPreview } from './bandejaPreview.js';

const PESTANAS = [
  { id: 'ajustes', etiqueta: 'Ajustes' },
  { id: 'marca', etiqueta: 'Marca' },
  { id: 'exportar', etiqueta: 'Exportar' },
];

export function vistaDetalle({ id }) {
  const meta = plantilla(id);
  if (!meta) {
    return el('.pagina', [el('.nota.peligro', [el('strong', { texto: 'No existe esa plantilla. ' }), `El id «${id}» no está en el catálogo.`])]);
  }

  // Al abrir una plantilla se selecciona para la campaña y se rellenan sus
  // campos: entrar a mirarla y que luego "Exportar" no sepa nada de ella
  // sería desconcertante.
  // Un sms no se empareja con nada (no hay landing que pasar de correo a
  // SMS con GoPhish, que no envía SMS): abrirlo no toca la selección de
  // campaña de correo/landing, solo rellena sus propios campos.
  const esSms = meta.tipo === 'sms';
  const seleccion = esSms ? {} : meta.tipo === 'emails' ? { emailId: meta.id } : meta.formativa ? { formativaId: meta.id } : { landingId: meta.id };
  Object.assign(estado, seleccion, { campos: camposConDefectos(meta, estado.campos) });

  // Un sms es texto plano: no hay HTML que renderizar en un iframe, así que
  // la preview es directamente el texto compuesto. Tampoco hay edición en
  // línea sobre la preview (no hay DOM en el que hacer clic) — se edita
  // desde el bloque «Campos» de siempre, como el resto de variables.
  const marcoVista = esSms ? null : el('iframe', {
    title: `Previsualización de ${meta.nombre}`,
    // allow-scripts sin allow-same-origin: el JS de la landing corre (hace
    // falta para ver el segundo paso del login, y para el propio script de
    // edición en línea) pero en un origen opaco, y sin allow-forms el
    // formulario no puede enviarse desde aquí.
    sandbox: 'allow-scripts',
  });
  const cajaTextoSms = esSms ? el('.preview-sms') : null;

  const lienzo = el(`.lienzo${estado.dispositivo === 'movil' ? '.movil' : ''}`, [esSms ? cajaTextoSms : marcoVista]);
  const estadoVista = el('span', { texto: '' });
  const pesoVista = el('span.peso');
  const panelAjustes = el('.panel-ajustes');
  const cajaAvisos = el('div');
  const cajaGuardado = el('div', { style: { margin: '0 0 20px' } });
  // Solo los correos tienen bandeja: una landing o un sms no se «abren»
  // desde una bandeja de entrada.
  const cajaBandeja = meta.tipo === 'emails' ? el('div') : null;

  const raiz = el('.detalle', [
    el('.detalle-cuerpo', [
      panelAjustes,
      el('.panel-vista', [barraDeVista(), cajaBandeja, lienzo, el('.pie-vista', [estadoVista, pesoVista])]),
    ]),
  ]);

  let pestanaActual = 'ajustes';
  let temporizador = null;
  let ultimo = null;

  const { barraGuardado } = esSms
    ? { barraGuardado: () => null }
    : activarEdicionEnVivo({ marco: marcoVista, meta, obtenerUltimo: () => ultimo, recomponer });
  pintarEn(cajaGuardado, barraGuardado());

  pintarPanel();
  recomponer();

  return raiz;

  // --------------------------------------------------------------------------

  function recomponer(retardo = 60) {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      if (esSms) {
        const r = await componerSms(meta, estado);
        ultimo = r;
        pintarEn(cajaTextoSms, el('.telefono-sms', [el('.burbuja-sms', { texto: r.texto })]));
        const tope = meta.caracteres || 160;
        estadoVista.textContent = `${r.texto.length} caracteres` + (r.texto.length > tope ? ` — se partirá en ${Math.ceil(r.texto.length / tope)} SMS` : '');
        pesoVista.textContent = '';
        pintarAvisos(r);
        if (pestanaActual === 'ajustes') pintarPanel();
        return;
      }

      const r = await componer(meta, estado);
      ultimo = r;

      const base = estado.ejemplo ? conDatosDeEjemplo(r.html) : r.html;
      marcoVista.srcdoc = paraEditar(base, estado.edicionesCrudas[meta.id] ?? {});

      if (cajaBandeja) {
        pintarEn(cajaBandeja, bandejaPreview({
          remitente: sugerirRemitente(meta, estado.marca, r.activas ?? new Set()),
          asunto: conDatosDeEjemplo(r.asunto ?? ''),
          preheader: conDatosDeEjemplo(r.preheader ?? ''),
          empresa: estado.marca.empresa,
        }));
      }

      const vars = variablesGophish(r.html);
      estadoVista.textContent = vars.length
        ? `GoPhish resolverá: ${vars.join('  ')}`
        : 'Esta plantilla no usa variables de GoPhish.';
      pesoVista.textContent = peso(r.html);

      pintarAvisos(r);
      if (pestanaActual === 'ajustes') pintarPanel();
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
        el('span.pildora', { texto: meta.tipo === 'emails' ? 'CORREO' : meta.tipo === 'sms' ? 'SMS' : 'LANDING' }),
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
            },
          })
        )),
        esSms ? null : el('button.btn.btn-mini', {
          type: 'button',
          title: 'Abrir en una pestaña nueva, a tamaño completo — lo que vería quien la reciba',
          onclick: abrirEnPestanaNueva,
        }, [icono('externo', 13), 'Ver completa']),
      ]),
    ]);
  }

  /**
   * El panel de preview vive en un iframe de ancho limitado (940px como
   * mucho) dentro del workspace: suficiente para calibrar, pero no para
   * juzgar la fidelidad real de un clonado — layouts pensados a ancho de
   * escritorio completo, imágenes de fondo con `position:fixed`, etc. se
   * pueden ver recortados o vacíos ahí sin que la plantilla tenga ningún
   * problema real. Abrir el mismo HTML compuesto en una pestaña sin ese
   * límite es la única forma de ver exactamente lo que vería quien la
   * reciba. Se abre el HTML "puro" (sin el script de edición en línea que
   * sí lleva el iframe del workspace) porque el objetivo es ver la landing
   * como destinatario, no como editor.
   */
  function abrirEnPestanaNueva() {
    if (!ultimo?.html) return;
    const html = estado.ejemplo ? conDatosDeEjemplo(ultimo.html) : ultimo.html;
    // window.open('', '_blank') + document.write, no una blob: URL: es el
    // patrón que funciona igual en todos los navegadores sin depender de
    // cómo cada uno resuelve el esquema blob: en una pestaña nueva.
    const ventana = window.open('', '_blank');
    if (!ventana) { brindis('El navegador bloqueó la ventana emergente'); return; }
    ventana.document.open();
    ventana.document.write(html);
    ventana.document.close();
  }

  // ----------------------------------------------------------------- panel ---

  function cambiarPestana(id) {
    pestanaActual = id;
    pintarPanel();
  }

  function pintarPanel() {
    const senalActiva = (id) => ultimo?.activas?.has(id) ?? false;
    const personalizado = esPersonalizado(estado.catalogo.presets, estado.preset, ultimo?.senales ?? {});

    const contenidoDePestana = {
      ajustes: () => [origen(), bloqueDificultad(personalizado), bloqueSenales(senalActiva), bloqueBloques(), bloqueCampos(), bloqueIdioma()],
      marca: () => [panelMarca(() => recomponer(140))],
      exportar: () => [panelExportar(meta, () => recomponer(140))],
    }[pestanaActual]();

    pintarEn(panelAjustes,
      el('a.volver', { href: '#/biblioteca' }, [icono('flecha', 13), 'Biblioteca']),
      el('h2.titulo-detalle', { texto: meta.nombre }),
      el('p.desc-detalle', { texto: meta.descripcion ?? '' }),
      cajaGuardado,
      cajaAvisos,
      el('.pestanas.pestanas-panel', PESTANAS.map((p) =>
        el(`button.pestana${pestanaActual === p.id ? '.activa' : ''}`, {
          type: 'button',
          texto: p.etiqueta,
          onclick: () => cambiarPestana(p.id),
        })
      )),
      ...contenidoDePestana
    );
  }

  function origen() {
    if (!meta.origen) return null;
    const linea = [meta.origen.tipo?.replace(/-/g, ' '), meta.origen.fecha].filter(Boolean).join(' · ');
    return el('.bloque-ajustes', [
      el('.nota', [
        el('strong', { texto: 'Origen: ' }), linea,
        meta.origen.urlOrigen ? el('div', { style: { marginTop: '5px' }, texto: `Clonado de: ${meta.origen.urlOrigen}` }) : null,
        meta.origen.autorizacion ? el('div', { style: { marginTop: '5px' }, texto: `Autorización: ${meta.origen.autorizacion}` }) : null,
        meta.origen.notas ? el('div', { style: { marginTop: '5px' }, texto: meta.origen.notas }) : null,
      ]),
    ]);
  }

  function bloqueDificultad(personalizado) {
    return el('.bloque-ajustes', [
      el('h3.titulo-bloque', { texto: 'Dificultad' }),
      el('.fila-presets', [
        ...estado.catalogo.presets.map((p) =>
          el(`button.chip-preset${estado.preset === p.id && !personalizado ? '.activa' : ''}`, {
            type: 'button',
            texto: p.nombre,
            title: p.descripcion,
            onclick: () => { volverAlPreset(p.id); recomponer(0); },
          })
        ),
        el(`button.chip-preset${personalizado ? '.activa' : ''}`, {
          type: 'button',
          texto: 'Custom',
          disabled: !personalizado,
          title: personalizado
            ? 'Combinación de señales que no coincide con ningún preset de fábrica'
            : 'Cambia una señal suelta abajo para entrar en modo Custom',
          onclick: () => {},
        }),
      ]),
      el('p.ayuda', {
        texto: personalizado
          ? `Ajustado a mano sobre «${estado.catalogo.presets.find((p) => p.id === estado.preset)?.nombre ?? estado.preset}». Pulsa un preset para volver a una combinación de fábrica.`
          : estado.catalogo.presets.find((p) => p.id === estado.preset)?.descripcion ?? '',
      }),
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
}
