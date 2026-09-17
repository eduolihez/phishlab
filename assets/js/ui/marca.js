/**
 * Panel de marca del cliente.
 *
 * El logo se incrusta como data URI, nunca como enlace: un `<img src="https://
 * cliente.com/logo.png">` dentro del correo avisa al servidor del cliente cada
 * vez que alguien abre el mensaje, y deja de verse el día que muevan el fichero.
 */

import { el, pintarEn, brindis } from './dom.js';
import { estado, actualizar } from '../core/estado.js';
import * as marcaLib from '../core/brand.js';

export function panelMarca(alCambiar) {
  const raiz = el('.bloque-ajustes');
  pintar();
  return raiz;

  function pintar() {
    pintarEn(raiz,
      el('h3.titulo-bloque', { texto: 'Marca del cliente' }),
      selectorPresets(),
      campoTexto('Nombre de la empresa', 'empresa', 'Ferretería Industrial Beltrán',
        'Se usa dentro del texto, no solo en la cabecera: «Por tu trabajo en…».'),
      el('.dos-columnas', [
        campoTexto('Sector', 'sector', 'distribución industrial'),
        campoTexto('Dominio', 'dominio', 'beltran.es'),
      ]),
      zonaLogo(),
      selectorColor(),
      campoTexto('Firma / pie', 'firma', 'Departamento de Recursos Humanos')
    );
  }

  function campoTexto(etiqueta, clave, marcador, ayuda) {
    return el('.campo', [
      el('label', { for: `marca-${clave}`, texto: etiqueta }),
      el('input', {
        id: `marca-${clave}`,
        type: 'text',
        value: estado.marca[clave] ?? '',
        placeholder: marcador,
        autocomplete: 'off',
        oninput: (e) => {
          estado.marca[clave] = e.target.value;
          actualizar({});
          alCambiar();
        },
      }),
      ayuda ? el('p.ayuda', { texto: ayuda }) : null,
    ]);
  }

  function selectorPresets() {
    const nombres = Object.keys(marcaLib.listarPresets()).sort();
    const seleccion = el('select', {
      style: { flex: '1' },
      'aria-label': 'Preset de cliente',
      onchange: (e) => {
        const preset = marcaLib.listarPresets()[e.target.value];
        if (!preset) return;
        actualizar({ marca: { ...marcaLib.MARCA_VACIA, ...preset } });
        pintar();
        alCambiar();
        brindis(`Preset «${e.target.value}» cargado`);
      },
    }, [
      el('option', { value: '', texto: '— Preset de cliente —' }),
      ...nombres.map((n) => el('option', { value: n, texto: n })),
    ]);

    return el('.fila-presets', [
      seleccion,
      el('button.btn.btn-mini', {
        type: 'button',
        texto: 'Guardar',
        onclick: () => {
          const sugerido = estado.marca.empresa.trim() || estado.cliente.trim();
          const nombre = prompt('Nombre del preset:', sugerido);
          if (!nombre?.trim()) return;
          marcaLib.guardarPreset(nombre.trim(), estado.marca);
          pintar();
          brindis(`Preset «${nombre.trim()}» guardado`);
        },
      }),
      nombres.length ? el('button.btn.btn-mini', {
        type: 'button',
        texto: 'Borrar',
        onclick: () => {
          // No se lee `seleccion.value`: elegir una opción ya dispara su
          // propio `onchange` (carga el preset y repinta este panel entero),
          // así que en el momento del clic el <select> siempre ha vuelto al
          // blanco. Se pregunta el nombre en vez de depender del desplegable.
          const nombre = prompt('Nombre del preset a borrar:', nombres[0]);
          if (!nombre?.trim()) return;
          if (!nombres.includes(nombre.trim())) return brindis(`No hay ningún preset «${nombre.trim()}»`);
          if (!confirm(`¿Borrar el preset «${nombre.trim()}»? No se puede deshacer.`)) return;
          marcaLib.borrarPreset(nombre.trim());
          pintar();
          brindis(`Preset «${nombre.trim()}» borrado`);
        },
      }) : null,
    ]);
  }

  function zonaLogo() {
    const vista = el('img', { alt: '', hidden: !estado.marca.logo });
    if (estado.marca.logo) vista.src = estado.marca.logo;

    const entrada = el('input', { type: 'file', accept: 'image/*', hidden: true });

    const aceptar = async (fichero) => {
      if (!fichero) return;
      try {
        estado.marca.logo = await marcaLib.logoADataUri(fichero);
        const color = await marcaLib.colorDominante(estado.marca.logo);
        if (color) estado.marca.color = color;
        actualizar({});
        pintar();
        alCambiar();
        brindis(color ? 'Logo cargado, color extraído del propio logo' : 'Logo cargado');
      } catch (e) {
        brindis(e.message);
      }
    };

    entrada.addEventListener('change', () => aceptar(entrada.files[0]));

    const zona = el('.soltar-logo', {
      tabindex: '0',
      role: 'button',
      onclick: () => entrada.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } },
      ondragenter: (e) => { e.preventDefault(); zona.classList.add('encima'); },
      ondragover: (e) => { e.preventDefault(); zona.classList.add('encima'); },
      ondragleave: () => zona.classList.remove('encima'),
      ondrop: (e) => { e.preventDefault(); zona.classList.remove('encima'); aceptar(e.dataTransfer?.files?.[0]); },
    }, [
      vista,
      estado.marca.logo ? null : el('span', { texto: 'Arrastra el logo aquí o pulsa para elegirlo' }),
      entrada,
    ]);

    return el('.campo', [
      el('span.etiqueta', { texto: 'Logo' }),
      zona,
      el('p.ayuda', { texto: 'Se incrusta como data URI: no depende de ningún servidor externo ni avisa al cliente de cada apertura.' }),
      estado.marca.logo
        ? el('button.btn.btn-mini', {
            type: 'button',
            style: { marginTop: '6px' },
            texto: 'Quitar logo',
            onclick: () => { estado.marca.logo = ''; actualizar({}); pintar(); alCambiar(); },
          })
        : null,
    ]);
  }

  function selectorColor() {
    const hex = el('input', {
      type: 'text',
      value: estado.marca.color,
      spellcheck: false,
      'aria-label': 'Color en hexadecimal',
      oninput: (e) => {
        const v = e.target.value.trim();
        if (!/^#[\da-f]{6}$/i.test(v)) return;
        estado.marca.color = v;
        selector.value = v;
        actualizar({});
        alCambiar();
      },
    });

    const selector = el('input', {
      type: 'color',
      value: estado.marca.color,
      'aria-label': 'Color corporativo',
      oninput: (e) => {
        estado.marca.color = e.target.value;
        hex.value = e.target.value;
        actualizar({});
        alCambiar();
      },
    });

    return el('.campo', [
      el('span.etiqueta', { texto: 'Color corporativo' }),
      el('.fila-color', [selector, hex]),
    ]);
  }
}
