/**
 * Pestaña "Emparejar y exportar" del workspace de plantilla.
 *
 * Sustituye a la vista `/nueva`: antes elegir la pareja (correo↔landing) y
 * exportar el ZIP vivía en una página aparte con su propio wizard; ahora es
 * una pestaña más del workspace de la plantilla que ya tienes abierta. La
 * lógica de composición y empaquetado es la misma de siempre — lo único que
 * cambia es dónde vive.
 */

import { el, pintarEn, brindis, icono } from './dom.js';
import { estado, actualizar, emailElegido, landingElegida, formativa, landingsDeCampana } from '../core/estado.js';
import { componer, componerSms, camposConDefectos } from '../core/componer.js';
import { finalizar } from '../core/edicionInline.js';
import { crearZip, descargar } from '../core/zip.js';
import { instrucciones, autorizacion, CASILLAS_AUTORIZACION } from '../core/gophish.js';
import { variablesGophish } from '../core/engine.js';
import { registrarEvento } from '../core/telemetry.js';

/**
 * @param {object} meta  la plantilla que tiene abierta el workspace
 * @param {() => void} alCambiar  para que el workspace recomponga la preview
 */
export function panelExportar(meta, alCambiar) {
  // Vive dentro del panel lateral de 360px del workspace, junto a Ajustes y
  // Marca: no es la vista `/nueva` a ancho completo de antes, así que no
  // lleva la clase `panel-exportar` (esa sigue reservada a un layout de
  // página entera que ya no existe).
  const raiz = el('.bloque-ajustes');

  if (meta.tipo === 'sms') {
    pintarSms();
    return raiz;
  }

  pintar();
  return raiz;

  /**
   * Un sms no se empareja con un correo ni una landing (GoPhish no lo
   * envía) y no lleva ZIP con instrucciones: solo el texto ya compuesto,
   * listo para copiar o pegar en la pasarela SMS que use el equipo.
   */
  function pintarSms() {
    (async () => {
      const r = await componerSms(meta, estado);
      const tope = meta.caracteres || 160;

      pintarEn(raiz,
        el('h3.titulo-bloque', { texto: 'Exportar' }),
        el('p.ayuda', {
          texto: 'GoPhish no envía SMS: este texto es para pegarlo en la pasarela SMS que use el equipo, o para probarlo manualmente.',
        }),
        el('.campo', [
          el('span.etiqueta', { texto: `Texto compuesto (${r.texto.length} caracteres${r.texto.length > tope ? `, se parte en ${Math.ceil(r.texto.length / tope)} SMS` : ''})` }),
          el('output.salida-mono', { style: { whiteSpace: 'pre-wrap' }, texto: r.texto || '—' }),
        ]),
        el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap', marginTop: '10px' } }, [
          el('button.btn.btn-primario', {
            type: 'button',
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(r.texto);
                brindis('Texto copiado');
                registrarEvento('sms_exportado', { id: meta.id, modo: 'copiar' });
              } catch {
                brindis('El navegador bloqueó el portapapeles; usa la descarga');
              }
            },
          }, [icono('copiar', 14), 'Copiar texto']),
          estado.modoDemo ? null : el('button.btn', {
            type: 'button',
            onclick: () => {
              descargar(new Blob([r.texto], { type: 'text/plain;charset=utf-8' }), `${meta.id}.txt`);
              registrarEvento('sms_exportado', { id: meta.id, modo: 'descarga' });
            },
          }, [icono('descargar', 14), 'Descargar .txt']),
        ])
      );
    })();
  }

  function pintar() {
    const email = emailElegido();
    const landing = landingElegida();
    const esCorreo = meta.tipo === 'emails';

    pintarEn(raiz,
      el('h3.titulo-bloque', { texto: 'Pareja de la campaña' }),
      el('p.ayuda', {
        style: { margin: '0 0 10px' },
        texto: esCorreo
          ? 'Este correo trae al empleado hasta una landing. Elige cuál, o expórtalo solo si aún no la necesitas.'
          : 'Esta landing puede llegar sola en el ZIP, o emparejada con el correo que trae al empleado hasta aquí.',
      }),
      emparejador(esCorreo ? 'landings' : 'emails', esCorreo ? landing : email, esCorreo ? 'landingId' : 'emailId'),

      el('label.casilla', { style: { margin: '14px 0' } }, [
        el('input', {
          type: 'checkbox',
          checked: estado.incluirFormativa,
          onchange: (e) => actualizar({ incluirFormativa: e.target.checked }),
        }),
        el('span', { texto: 'Incluir la página formativa en el ZIP' }),
      ]),

      el('h3.titulo-bloque', { texto: 'Expediente' }),
      el('.dos-columnas', [
        campoExpediente('Cliente', 'cliente', 'Beltrán S.A.'),
        campoExpediente('Nº de expediente', 'expediente', 'AUD-2026-014'),
      ]),
      el('p.ayuda', { texto: 'Se estampan solo en el INSTRUCCIONES.md. Nunca dentro del correo ni de la landing.' }),

      bloqueAutorizacion(),

      el('h3.titulo-bloque', { style: { marginTop: '18px' }, texto: 'Exportar' }),
      seccionDescarga(email, landing),

      el('p.ayuda', { style: { marginTop: '14px' } }, [
        '¿Ya lanzaste esta campaña? ',
        el('a', { href: '#/informe', texto: 'Ver informe de resultados' }),
        ' subiendo el campana.json de este ZIP junto al CSV de GoPhish.',
      ])
    );
  }

  /**
   * Checklist de autorización interactivo. Antes era solo el markdown
   * estático que viajaba en el ZIP (`AUTORIZACION.md`) — ahí se podía
   * "marcar sobre el papel" y descargar igual sin haber comprobado nada de
   * verdad. Ahora las seis casillas obligatorias bloquean el botón de
   * descarga mientras no estén todas marcadas; las cuatro de cierre son solo
   * un recordatorio, no bloquean nada.
   */
  function bloqueAutorizacion() {
    const marcadas = new Set(estado.autorizacionMarcada);

    const alternar = (id, marcado) => {
      const siguiente = marcado ? [...marcadas, id] : [...marcadas].filter((m) => m !== id);
      actualizar({ autorizacionMarcada: siguiente });
      pintar();
    };

    return el('div', { style: { margin: '14px 0' } }, [
      el('h3.titulo-bloque', { texto: 'Autorización' }),
      el('p.ayuda', {
        style: { margin: '0 0 9px' },
        texto: 'Simulación de phishing autorizada por contrato. Estas seis casillas tienen que estar marcadas antes de poder descargar la campaña.',
      }),
      el('.lista-interruptores', CASILLAS_AUTORIZACION.map((c) =>
        el('label.casilla', { style: { display: 'flex', alignItems: 'flex-start', gap: '8px', margin: '0 0 8px' } }, [
          el('input', {
            type: 'checkbox',
            checked: marcadas.has(c.id),
            onchange: (e) => alternar(c.id, e.target.checked),
          }),
          el('span', { texto: c.texto }),
        ])
      )),
    ]);
  }

  function campoExpediente(etiqueta, clave, marcador) {
    return el('.campo', [
      el('label', { for: `exp-${clave}`, texto: etiqueta }),
      el('input', {
        id: `exp-${clave}`,
        type: 'text',
        value: estado[clave],
        placeholder: marcador,
        autocomplete: 'off',
        oninput: (e) => actualizar({ [clave]: e.target.value }),
      }),
    ]);
  }

  function emparejador(tipo, actual, claveEstado) {
    const lista = tipo === 'emails' ? estado.catalogo.emails : landingsDeCampana();

    if (actual) {
      return el('.pieza-emparejada', [
        el('span.pildora.pildora-acento', { texto: tipo === 'emails' ? 'correo' : 'landing' }),
        el('span', { style: { flex: '1' }, texto: actual.nombre }),
        el('a.btn.btn-mini', { href: `#/plantilla/${actual.tipo}/${actual.id}`, texto: 'Abrir' }),
        el('button.btn.btn-mini', {
          type: 'button',
          texto: 'Quitar',
          onclick: () => { actualizar({ [claveEstado]: null }); alCambiar(); pintar(); },
        }),
      ]);
    }

    const buscador = el('input', {
      type: 'search',
      placeholder: tipo === 'emails' ? 'Buscar correo…' : 'Buscar landing…',
      autocomplete: 'off',
    });
    const contenedorLista = el('.lista-selector-piezas');

    const pintarOpciones = () => {
      const q = buscador.value.trim().toLowerCase();
      const filtradas = !q ? lista.slice(0, 8) : lista.filter((m) =>
        [m.nombre, m.descripcion, m.familia, m.empresa].join(' ').toLowerCase().includes(q)
      );
      pintarEn(contenedorLista,
        filtradas.length
          ? filtradas.map((m) => el('button.fila-pieza', {
              type: 'button',
              onclick: () => {
                actualizar({ [claveEstado]: m.id, campos: camposConDefectos(m, estado.campos) });
                registrarEvento('plantilla_elegida', { tipo: m.tipo, id: m.id, familia: m.familia, empresa: m.empresa ?? null });
                alCambiar();
                pintar();
              },
            }, [
              el('span.fila-pieza-nombre', { texto: m.nombre }),
              el('span.fila-pieza-desc', { texto: m.descripcion ?? '' }),
            ]))
          : el('p.ayuda', { texto: 'Nada encaja con esa búsqueda.' })
      );
    };

    buscador.addEventListener('input', pintarOpciones);
    pintarOpciones();

    return el('.emparejador-vacio', [el('.campo', [buscador]), contenedorLista]);
  }

  function seccionDescarga(email, landing) {
    if (!email && !landing) {
      return el('.nota.alerta', 'Elige al menos una pieza (esta plantilla ya cuenta) para poder exportar.');
    }

    if (estado.modoDemo) {
      return el('.nota.alerta', [
        el('strong', { texto: 'Desactivado en la demo. ' }),
        'En la herramienta local, este botón descarga un ZIP con el HTML de cada pieza, las instrucciones de importación y el checklist de autorización.',
      ]);
    }

    const faltan = CASILLAS_AUTORIZACION.filter((c) => !estado.autorizacionMarcada.includes(c.id));

    return el('div', {}, [
      faltan.length ? el('.nota.alerta', { style: { marginBottom: '9px' } }, [
        el('strong', { texto: 'Falta autorización. ' }),
        `Marca las ${faltan.length} casilla${faltan.length === 1 ? '' : 's'} pendiente${faltan.length === 1 ? '' : 's'} de arriba para poder descargar la campaña.`,
      ]) : null,
      el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } }, [
        el('button.btn.btn-primario', {
          type: 'button',
          disabled: faltan.length > 0,
          title: faltan.length ? 'Completa el checklist de autorización primero' : '',
          onclick: () => descargarZip(email, landing),
        }, [icono('descargar', 14), 'Descargar campaña (.zip)']),
        el('button.btn', { type: 'button', onclick: () => copiar(email), disabled: !email }, [icono('copiar', 14), 'Copiar HTML del correo']),
        el('button.btn', { type: 'button', onclick: () => copiar(landing), disabled: !landing }, [icono('copiar', 14), 'Copiar HTML de la landing']),
      ]),
    ]);
  }

  async function piezas(email, landing) {
    const [emailComp, landingComp, formativaComp] = await Promise.all([
      email ? componer(email, estado) : Promise.resolve(null),
      landing ? componer(landing, estado) : Promise.resolve(null),
      estado.incluirFormativa ? componer(formativa(), estado) : Promise.resolve(null),
    ]);
    return {
      email: emailComp && { ...emailComp, html: finalizar(emailComp.html, estado.edicionesCrudas[email.id] ?? {}) },
      landing: landingComp && { ...landingComp, html: finalizar(landingComp.html, estado.edicionesCrudas[landing.id] ?? {}) },
      formativa: formativaComp && finalizar(formativaComp.html, estado.edicionesCrudas[formativa()?.id] ?? {}),
    };
  }

  async function copiar(metaPieza) {
    if (!metaPieza) return brindis('No hay nada que copiar');
    const compuesto = await componer(metaPieza, estado);
    const html = finalizar(compuesto.html, estado.edicionesCrudas[metaPieza.id] ?? {});
    try {
      await navigator.clipboard.writeText(html);
      brindis('HTML copiado — pégalo en GoPhish con el botón <>');
    } catch {
      brindis('El navegador bloqueó el portapapeles; usa la descarga');
    }
  }

  async function descargarZip(metaEmail, metaLanding) {
    const p = await piezas(metaEmail, metaLanding);

    const ficheros = [];
    if (metaEmail) ficheros.push({ nombre: 'email.html', contenido: p.email.html });
    if (metaLanding) ficheros.push({ nombre: 'landing.html', contenido: p.landing.html });
    if (p.formativa) ficheros.push({ nombre: 'formativa.html', contenido: p.formativa });

    ficheros.push({
      nombre: 'INSTRUCCIONES.md',
      contenido: instrucciones({
        email: metaEmail ? { ...metaEmail, variables: variablesGophish(p.email.html) } : null,
        landing: metaLanding,
        asunto: p.email?.asunto ?? '',
        marca: estado.marca,
        idioma: estado.idioma,
        preset: estado.preset,
        senales: p.email?.senales ?? p.landing?.senales ?? {},
        catalogoSenales: estado.catalogo.senales,
        presets: estado.catalogo.presets,
        bloquesQuitados: [...(p.email?.eliminados ?? []), ...(p.landing?.eliminados ?? [])],
        cliente: estado.cliente,
        expediente: estado.expediente,
        incluirFormativa: estado.incluirFormativa && Boolean(p.formativa),
      }),
    });

    ficheros.push({
      nombre: 'AUTORIZACION.md',
      contenido: autorizacion({ cliente: estado.cliente, expediente: estado.expediente, marcadas: estado.autorizacionMarcada }),
    });

    // Máquina-legible, con lo mismo que ya lleva INSTRUCCIONES.md en prosa:
    // permite volver a subir esta misma campaña en #/informe junto al CSV de
    // resultados de GoPhish sin tener que volver a escribir a mano qué
    // señales llevaba. Ver assets/js/core/informe.js.
    ficheros.push({
      nombre: 'campana.json',
      contenido: JSON.stringify({
        version: 1,
        fecha: new Date().toISOString().slice(0, 10),
        emailId: metaEmail?.id ?? null,
        emailNombre: metaEmail?.nombre ?? null,
        landingId: metaLanding?.id ?? null,
        landingNombre: metaLanding?.nombre ?? null,
        idioma: estado.idioma,
        preset: estado.preset,
        senales: p.email?.senales ?? p.landing?.senales ?? {},
        cliente: estado.cliente || null,
        expediente: estado.expediente || null,
      }, null, 2) + '\n',
    });

    const etiqueta = [estado.expediente || estado.cliente || estado.marca.empresa || 'campana', metaEmail?.id ?? metaLanding?.id, estado.idioma, estado.preset]
      .filter(Boolean)
      .join('-')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-');

    descargar(crearZip(ficheros), `${etiqueta}.zip`);
    brindis(`Descargado ${etiqueta}.zip (${ficheros.length} ficheros)`);

    registrarEvento('campana_exportada', {
      emailId: metaEmail?.id ?? null,
      landingId: metaLanding?.id ?? null,
      preset: estado.preset,
      incluirFormativa: estado.incluirFormativa && Boolean(p.formativa),
    });
  }
}
