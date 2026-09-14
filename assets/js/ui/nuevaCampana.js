/**
 * Nueva campaña: el punto de entrada de la aplicación.
 *
 * Wizard de 3 pasos que sustituye a "elige de una rejilla enorme y luego
 * busca dónde exportar": Correo (elige y calibra) → Landing (elige y
 * calibra) → Exportar. Cada paso enseña la previsualización en vivo al lado,
 * así no hace falta saltar de pantalla para ver el resultado de un cambio.
 *
 * La Biblioteca sigue existiendo aparte para explorar y comparar el
 * catálogo entero; esta vista es la ruta rápida para montar una campaña.
 */

import { el, pintarEn, brindis, icono, pasos, interruptor } from './dom.js';
import {
  estado,
  actualizar,
  ajustarSenal,
  volverAlPreset,
  emailElegido,
  landingElegida,
  formativa,
  landingsDeCampana,
} from '../core/estado.js';
import { componer, camposConDefectos } from '../core/componer.js';
import { crearZip, descargar } from '../core/zip.js';
import { instrucciones, autorizacion } from '../core/gophish.js';
import { variablesGophish } from '../core/engine.js';
import { esPersonalizado } from '../core/senales.js';
import { registrarEvento } from '../core/telemetry.js';

export function vistaNuevaCampana() {
  const raiz = el('.detalle');
  const barraPasos = el('div');
  const cuerpo = el('.detalle-cuerpo');

  raiz.append(barraPasos, cuerpo);

  let paso = emailElegido() ? (landingElegida() ? 3 : 2) : 1;
  let temporizador = null;

  pintar();
  return raiz;

  // --------------------------------------------------------------------------

  function ir(n) {
    paso = n;
    pintar();
  }

  function pintar() {
    pintarEn(barraPasos, pasos(paso, [
      { etiqueta: 'Correo', onclick: () => ir(1) },
      { etiqueta: 'Landing', onclick: emailElegido() ? () => ir(2) : undefined },
      { etiqueta: 'Exportar', onclick: (emailElegido() || landingElegida()) ? () => ir(3) : undefined },
    ]));

    if (paso === 1) return pintarEn(cuerpo, pasoPieza('emails', estado.emailId, 'emailId', 'correo'));
    if (paso === 2) return pintarEn(cuerpo, pasoPieza('landings', estado.landingId, 'landingId', 'landing'));
    return pintarEn(cuerpo, pasoExportar());
  }

  // --------------------------------------------------------------- picker ---

  function pasoPieza(tipo, idActual, claveEstado, nombreSingular) {
    const lista = tipo === 'emails' ? estado.catalogo.emails : landingsDeCampana();
    const meta = lista.find((m) => m.id === idActual) ?? null;

    const buscador = el('input', {
      type: 'search',
      placeholder: `Buscar ${nombreSingular}...`,
      value: estado.busqueda,
      oninput: (e) => { estado.busqueda = e.target.value; pintarLista(); },
    });

    const contenedorLista = el('.lista-selector-piezas');
    const panelDerecho = el('.panel-vista');

    const izquierda = el('.panel-ajustes', [
      el('h2.titulo-detalle', { texto: tipo === 'emails' ? 'Elige el correo' : 'Elige la landing' }),
      el('p.desc-detalle', {
        texto: tipo === 'emails'
          ? 'El correo es el gancho: lo que trae al empleado hasta la landing.'
          : 'La landing es donde se mide de verdad: clic, credenciales o datos.',
      }),
      buscador,
      contenedorLista,
    ]);

    pintarLista();
    pintarDerecha();

    return [izquierda, panelDerecho];

    function pintarLista() {
      const q = estado.busqueda.trim().toLowerCase();
      const filtradas = !q ? lista : lista.filter((m) =>
        [m.nombre, m.descripcion, m.familia, m.empresa, ...(m.tags ?? [])].join(' ').toLowerCase().includes(q)
      );

      pintarEn(contenedorLista,
        filtradas.length
          ? filtradas.map(filaPieza)
          : el('p.ayuda', { texto: 'Nada encaja con esa búsqueda.' })
      );
    }

    function filaPieza(m) {
      const activa = m.id === idActual;
      return el(`button.fila-pieza${activa ? '.activa' : ''}`, {
        type: 'button',
        onclick: () => {
          actualizar({ [claveEstado]: m.id, campos: camposConDefectos(m, estado.campos) });
          registrarEvento('plantilla_elegida', { tipo: m.tipo, id: m.id, familia: m.familia, empresa: m.empresa ?? null });
          pintarLista();
          pintarDerecha();
          pintarEn(barraPasos, pasos(paso, [
            { etiqueta: 'Correo', onclick: () => ir(1) },
            { etiqueta: 'Landing', onclick: emailElegido() ? () => ir(2) : undefined },
            { etiqueta: 'Exportar', onclick: (emailElegido() || landingElegida()) ? () => ir(3) : undefined },
          ]));
        },
      }, [
        el('span.fila-pieza-nombre', { texto: m.nombre }),
        el('span.fila-pieza-desc', { texto: m.descripcion ?? '' }),
      ]);
    }

    function pintarDerecha() {
      const actual = lista.find((m) => m.id === (claveEstado === 'emailId' ? estado.emailId : estado.landingId)) ?? null;

      if (!actual) {
        return pintarEn(panelDerecho, el('.vacio', { style: { margin: '40px' } }, [
          el('p', { texto: `Elige un ${nombreSingular} de la lista para verlo aquí y calibrarlo.` }),
        ]));
      }

      const marco = el('iframe', {
        title: `Previsualización de ${actual.nombre}`,
        sandbox: 'allow-scripts',
        style: { width: '100%', maxWidth: '760px', height: '100%', minHeight: '460px', border: '1px solid var(--borde)', borderRadius: 'var(--r)', background: '#fff' },
      });

      pintarEn(panelDerecho,
        el('.barra-vista', [
          el('.pestanas', [el('span.pildora', { texto: actual.nombre })]),
        ]),
        el('.lienzo', [marco]),
        el('.pie-vista-piezas', [panelCalibracionRapida(actual, () => recomponer())]),
      );

      recomponer();

      function recomponer() {
        clearTimeout(temporizador);
        temporizador = setTimeout(async () => {
          const r = await componer(actual, estado);
          marco.srcdoc = r.html;
        }, 60);
      }
    }
  }

  /** Ajuste rápido de dificultad y señales, sin salir del picker. */
  function panelCalibracionRapida(meta, alCambiar) {
    const personalizado = esPersonalizado(estado.catalogo.presets, estado.preset, estado.overridesSenales);

    return el('.calibracion-rapida', [
      el('.fila-presets', [
        ...estado.catalogo.presets.map((p) =>
          el(`button.chip-preset${estado.preset === p.id && !personalizado ? '.activa' : ''}`, {
            type: 'button',
            texto: p.nombre,
            title: p.descripcion,
            onclick: () => { volverAlPreset(p.id); alCambiar(); },
          })
        ),
        el(`button.chip-preset${personalizado ? '.activa' : ''}`, {
          type: 'button',
          texto: 'Custom',
          disabled: !personalizado,
          onclick: () => {},
        }),
      ]),
      el('.lista-interruptores.lista-interruptores-compacta', estado.catalogo.senales.map((s) =>
        interruptor({
          id: `rapido-${s.id}`,
          etiqueta: s.nombre,
          marcado: resolverSenal(s.id),
          alCambiar: (v) => { ajustarSenal(s.id, v); alCambiar(); },
        })
      )),
      el('a.enlace-avanzado', {
        href: `#/plantilla/${meta.tipo}/${meta.id}`,
        texto: 'Personalización avanzada (bloques, marca, textos) →',
      }),
    ]);
  }

  function resolverSenal(id) {
    const preset = estado.catalogo.presets.find((p) => p.id === estado.preset);
    const base = preset?.senales?.[id] ?? false;
    const ajuste = estado.overridesSenales[id];
    return ajuste === undefined ? base : ajuste;
  }

  // ------------------------------------------------------------- exportar ---

  function pasoExportar() {
    const email = emailElegido();
    const landing = landingElegida();

    const campo = (etiqueta, clave, marcador) =>
      el('.campo', [
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

    const preset = estado.catalogo.presets.find((p) => p.id === estado.preset);
    const encendidas = estado.catalogo.senales.filter((s) => resolverSenal(s.id));

    return el('.panel-ajustes.panel-exportar', [
      el('h2.titulo-detalle', { texto: 'Exportar la campaña' }),
      el('p.desc-detalle', { texto: 'Rellena el expediente y descarga el ZIP con el HTML, las instrucciones de importación y el checklist de autorización.' }),

      !email && !landing ? el('.nota.alerta', 'Vuelve a los pasos anteriores y elige al menos una pieza.') : null,

      el('.bloque-ajustes', [
        el('h3.titulo-bloque', { texto: 'Piezas elegidas' }),
        el('.nota', [
          email ? el('div', { texto: `Correo: ${email.nombre}` }) : el('div', { texto: 'Correo: — sin elegir —' }),
          landing ? el('div', { style: { marginTop: '4px' }, texto: `Landing: ${landing.nombre}` }) : el('div', { style: { marginTop: '4px' }, texto: 'Landing: — sin elegir —' }),
        ]),
        el('label.casilla', { style: { marginTop: '10px' } }, [
          el('input', {
            type: 'checkbox',
            checked: estado.incluirFormativa,
            onchange: (e) => actualizar({ incluirFormativa: e.target.checked }),
          }),
          el('span', { texto: 'Incluir la página formativa en el ZIP' }),
        ]),
      ]),

      el('.bloque-ajustes', [
        el('h3.titulo-bloque', { texto: 'Expediente' }),
        el('.dos-columnas', [campo('Cliente', 'cliente', 'Beltrán S.A.'), campo('Nº de expediente', 'expediente', 'AUD-2026-014')]),
        el('p.ayuda', { texto: 'Se estampan solo en el INSTRUCCIONES.md. Nunca dentro del correo ni de la landing.' }),
      ]),

      el('.bloque-ajustes', [
        el('h3.titulo-bloque', { texto: 'Calibración' }),
        el('.nota', [
          el('strong', { texto: `${preset?.nombre ?? estado.preset}` }),
          esPersonalizado(estado.catalogo.presets, estado.preset, estado.overridesSenales) ? ' (ajustado a mano)' : '',
          el('div', { style: { marginTop: '7px' } }, [
            encendidas.length
              ? `Señales activas: ${encendidas.map((s) => s.nombre.toLowerCase()).join(', ')}.`
              : 'Ninguna señal activa: el correo no lleva ninguna pista evidente.',
          ]),
        ]),
      ]),

      seccionDescarga(),
    ]);

    function seccionDescarga() {
      if (!email && !landing) return null;

      if (estado.modoDemo) {
        return el('.bloque-ajustes', [
          el('h3.titulo-bloque', { texto: 'Exportar' }),
          el('.nota.alerta', [
            el('strong', { texto: 'Desactivado en la demo. ' }),
            'En la herramienta local, este botón descarga un ZIP con el HTML de cada pieza, las instrucciones de importación y el checklist de autorización.',
          ]),
        ]);
      }

      return el('.bloque-ajustes', [
        el('h3.titulo-bloque', { texto: 'Exportar' }),
        el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } }, [
          el('button.btn.btn-primario', { type: 'button', onclick: descargarZip }, [icono('descargar', 14), 'Descargar campaña (.zip)']),
          el('button.btn', { type: 'button', onclick: () => copiar('email'), disabled: !email }, [icono('copiar', 14), 'Copiar HTML del correo']),
          el('button.btn', { type: 'button', onclick: () => copiar('landing'), disabled: !landing }, [icono('copiar', 14), 'Copiar HTML de la landing']),
        ]),
      ]);
    }
  }

  async function piezas() {
    const [email, landing, formativaHtml] = await Promise.all([
      componer(emailElegido(), estado),
      componer(landingElegida(), estado),
      estado.incluirFormativa ? componer(formativa(), estado) : Promise.resolve(null),
    ]);
    return { email, landing, formativa: formativaHtml };
  }

  async function copiar(cual) {
    const p = await piezas();
    const html = p[cual]?.html;
    if (!html) return brindis('No hay nada que copiar');
    try {
      await navigator.clipboard.writeText(html);
      brindis('HTML copiado — pégalo en GoPhish con el botón <>');
    } catch {
      brindis('El navegador bloqueó el portapapeles; usa la descarga');
    }
  }

  async function descargarZip() {
    const metaEmail = emailElegido();
    const metaLanding = landingElegida();
    const p = await piezas();

    const ficheros = [];
    if (metaEmail) ficheros.push({ nombre: 'email.html', contenido: p.email.html });
    if (metaLanding) ficheros.push({ nombre: 'landing.html', contenido: p.landing.html });
    if (p.formativa?.html) ficheros.push({ nombre: 'formativa.html', contenido: p.formativa.html });

    ficheros.push({
      nombre: 'INSTRUCCIONES.md',
      contenido: instrucciones({
        email: metaEmail ? { ...metaEmail, variables: variablesGophish(p.email.html) } : null,
        landing: metaLanding,
        asunto: p.email.asunto,
        marca: estado.marca,
        idioma: estado.idioma,
        preset: estado.preset,
        senales: p.email.senales ?? p.landing?.senales ?? {},
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
      contenido: autorizacion({ cliente: estado.cliente, expediente: estado.expediente }),
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

    // Sin cliente/expediente/marca: solo lo que tiene sentido comparar entre
    // instalaciones (qué plantillas y qué calibración, no de quién es el encargo).
    registrarEvento('campana_exportada', {
      emailId: metaEmail?.id ?? null,
      landingId: metaLanding?.id ?? null,
      preset: estado.preset,
      incluirFormativa: estado.incluirFormativa && Boolean(p.formativa),
    });
  }
}
