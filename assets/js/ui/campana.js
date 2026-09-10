/**
 * Vista de campaña: montar el paquete y exportarlo para GoPhish.
 *
 * Es donde se juntan las tres piezas (correo, landing y página formativa) y
 * donde se estampa el cliente y el expediente. Esos dos datos van solo en el
 * INSTRUCCIONES.md: dentro del correo o de la landing serían una pista para
 * cualquiera que mirase el código fuente.
 */

import { el, pintarEn, brindis, icono } from './dom.js';
import {
  estado,
  actualizar,
  emailElegido,
  landingElegida,
  formativa,
  landingsDeCampana,
} from '../core/estado.js';
import { componer } from '../core/componer.js';
import { crearZip, descargar } from '../core/zip.js';
import { instrucciones, autorizacion } from '../core/gophish.js';
import { variablesGophish } from '../core/engine.js';
import { esPersonalizado } from '../core/senales.js';

export function vistaCampana() {
  const raiz = el('.pagina.columna-estrecha');
  const resumen = el('div');

  raiz.append(
    el('.cabecera-pagina', [
      el('.rotulo', { texto: '02 / Paquete' }),
      el('h1', { texto: 'Montar la campaña' }),
      el('p', { texto: 'Elige las tres piezas, rellena el expediente y descarga el ZIP con el HTML y las instrucciones de importación en GoPhish.' }),
    ]),
    resumen
  );

  pintar();
  return raiz;

  function pintar() {
    pintarEn(resumen,
      seccionPiezas(),
      seccionExpediente(),
      seccionSenales(),
      seccionDescarga()
    );
  }

  function seccionPiezas() {
    const selector = (etiqueta, lista, actual, clave, vacio) =>
      el('.campo', [
        el('label', { for: `sel-${clave}`, texto: etiqueta }),
        el('select', {
          id: `sel-${clave}`,
          onchange: (e) => { actualizar({ [clave]: e.target.value || null }); pintar(); },
        }, [
          el('option', { value: '', texto: vacio }),
          ...lista.map((m) => el('option', { value: m.id, texto: m.nombre, selected: actual === m.id })),
        ]),
      ]);

    return el('section', { style: { marginBottom: '26px' } }, [
      el('h2.titulo-bloque', { texto: 'Piezas' }),
      selector('Correo', estado.catalogo.emails, estado.emailId, 'emailId', '— sin correo —'),
      selector('Landing', landingsDeCampana(), estado.landingId, 'landingId', '— sin landing —'),
      el('label.casilla', [
        el('input', {
          type: 'checkbox',
          checked: estado.incluirFormativa,
          onchange: (e) => { actualizar({ incluirFormativa: e.target.checked }); pintar(); },
        }),
        el('span', { texto: 'Incluir la página formativa en el ZIP' }),
      ]),
      el('p.ayuda', {
        style: { marginTop: '-2px' },
        texto: 'La formativa va en el "Redirect to" de GoPhish. Sin ella la campaña mide, pero no enseña, que es la mitad del encargo.',
      }),
    ]);
  }

  function seccionExpediente() {
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

    return el('section', { style: { marginBottom: '26px' } }, [
      el('h2.titulo-bloque', { texto: 'Expediente' }),
      el('.dos-columnas', [campo('Cliente', 'cliente', 'Beltrán S.A.'), campo('Nº de expediente', 'expediente', 'AUD-2026-014')]),
      el('p.ayuda', {
        texto: 'Se estampan solo en el INSTRUCCIONES.md del ZIP. Nunca dentro del correo ni de la landing: quien mirase el código fuente vería el expediente.',
      }),
    ]);
  }

  function seccionSenales() {
    const preset = estado.catalogo.presets.find((p) => p.id === estado.preset);
    const encendidas = estado.catalogo.senales.filter((s) => {
      const base = preset?.senales?.[s.id] ?? false;
      const ajuste = estado.overridesSenales[s.id];
      return ajuste === undefined ? base : ajuste;
    });

    return el('section', { style: { marginBottom: '26px' } }, [
      el('h2.titulo-bloque', { texto: 'Calibración' }),
      el('.nota', [
        el('strong', { texto: `${preset?.nombre ?? estado.preset}` }),
        esPersonalizado(estado.catalogo.presets, estado.preset, Object.fromEntries(
          estado.catalogo.senales.map((s) => [s.id, encendidas.includes(s)])
        )) ? ' (ajustado a mano)' : '',
        el('div', { style: { marginTop: '7px' } }, [
          encendidas.length
            ? `Señales activas: ${encendidas.map((s) => s.nombre.toLowerCase()).join(', ')}.`
            : 'Ninguna señal activa: el correo no lleva ninguna pista evidente.',
        ]),
        el('div', { style: { marginTop: '5px', color: 'var(--texto-suave)' } }, [
          'Esta lista va dentro del INSTRUCCIONES.md para que el informe pueda decir qué señal se le pasó a cada empleado.',
        ]),
      ]),
    ]);
  }

  function seccionDescarga() {
    const email = emailElegido();
    const landing = landingElegida();

    if (!email && !landing) {
      return el('.nota.alerta', 'Elige al menos una pieza para poder exportar.');
    }

    return el('section', [
      el('h2.titulo-bloque', { texto: 'Exportar' }),
      el('div', { style: { display: 'flex', gap: '9px', flexWrap: 'wrap' } }, [
        el('button.btn.btn-primario', { type: 'button', onclick: descargarZip }, [icono('descargar', 14), 'Descargar campaña (.zip)']),
        el('button.btn', { type: 'button', onclick: () => copiar('email'), disabled: !email }, [icono('copiar', 14), 'Copiar HTML del correo']),
        el('button.btn', { type: 'button', onclick: () => copiar('landing'), disabled: !landing }, [icono('copiar', 14), 'Copiar HTML de la landing']),
      ]),
      el('p.ayuda', { texto: 'El ZIP trae el HTML de cada pieza, las instrucciones de importación y el checklist de autorización.' }),
    ]);
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
  }
}
