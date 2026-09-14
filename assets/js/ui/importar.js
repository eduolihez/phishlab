/**
 * Vista de importación: convertir material real en plantilla.
 *
 * Wizard de 3 pasos: Origen (traes el .eml o pegas HTML) → Revisión (qué se
 * ha tocado y cómo queda) → Guardar (metadatos y alta en el catálogo). Antes
 * era una página única de arriba abajo; separarla en pasos deja claro en cuál
 * estás y evita que el informe de saneado se pierda entre el formulario de
 * origen y el de guardado.
 *
 * Ese informe no es decoración. Al clonar un correo real te llevas por delante
 * los píxeles de seguimiento del remitente original, y si no te enteras acabas
 * lanzando una campaña que notifica a un tercero cada vez que un empleado tuyo
 * abre el mensaje.
 */

import { el, pintarEn, brindis, comoId, pasos, icono } from './dom.js';
import { estado } from '../core/estado.js';
import { importarEml, importarHtml, guardarPlantilla, hayServidor } from '../core/importar.js';

export function vistaImportar() {
  const raiz = el('.pagina.columna-estrecha');
  const barraPasos = el('div');
  const cuerpo = el('div');

  raiz.append(
    barraPasos,
    el('.cabecera-pagina', [
      el('.rotulo', { texto: '03 / Entrada' }),
      el('h1', { texto: 'Importar un correo o una página' }),
      el('p', { texto: 'Trae material real y conviértelo en plantilla reutilizable. El HTML se limpia, los enlaces se reescriben a {{.URL}} y las imágenes se incrustan.' }),
    ]),
    cuerpo
  );

  if (!hayServidor()) {
    raiz.append(
      el('.nota.alerta', [
        el('strong', { texto: 'Hace falta el servidor local. ' }),
        'Parsear un .eml y escribir en templates/ no se puede hacer desde el navegador. ',
        'Arranca con ', el('code', { texto: 'abrir-phishlab.bat' }), ' o ', el('code', { texto: 'npm run dev' }),
        ' y vuelve a esta pantalla.',
      ])
    );
    return raiz;
  }

  // Estado propio de este wizard: qué se ha importado y en qué paso está.
  // No vive en `estado` global porque es un borrador de un solo uso, no
  // configuración de campaña.
  let paso = 1;
  let resultado = null; // { r, tipo, procedencia }

  pintar();
  return raiz;

  // --------------------------------------------------------------------------

  function ir(n) {
    paso = n;
    pintar();
  }

  function pintar() {
    pintarEn(barraPasos, pasos(paso, [
      { etiqueta: 'Origen', onclick: () => ir(1) },
      { etiqueta: 'Revisión', onclick: resultado ? () => ir(2) : undefined },
      { etiqueta: 'Guardar', onclick: resultado ? () => ir(3) : undefined },
    ]));

    if (paso === 1) return pintarEn(cuerpo, pasoOrigen());
    if (paso === 2) return pintarEn(cuerpo, pasoRevision());
    return pintarEn(cuerpo, pasoGuardar());
  }

  // ------------------------------------------------------------- paso 1 ---

  function pasoOrigen() {
    return el('div', [
      avisoAutorizacion(),
      zonaEml(),
      el('.separador-o', { texto: 'o pega el HTML' }),
      zonaHtml(),
    ]);
  }

  function avisoAutorizacion() {
    return el('.nota', { style: { marginBottom: '20px' } }, [
      el('strong', { texto: 'Antes de importar. ' }),
      'Copiar el formato de un correo legítimo para una simulación entra dentro del encargo, pero conviene que quede por escrito de dónde salió: ',
      'cada plantilla importada guarda una nota de autorización obligatoria, y el linter no la deja pasar vacía.',
    ]);
  }

  function zonaEml() {
    const entrada = el('input', { type: 'file', accept: '.eml,.msg,message/rfc822', hidden: true });

    const procesar = async (fichero) => {
      if (!fichero) return;
      pintarEn(cuerpo, el('.cargando', { texto: `Parseando ${fichero.name}…` }));
      try {
        const r = await importarEml(fichero);
        resultado = { r, tipo: 'emails', procedencia: fichero.name };
        ir(2);
      } catch (e) {
        pintarEn(cuerpo, el('.nota.peligro', [el('strong', { texto: 'No se pudo importar. ' }), e.message]));
      }
    };

    entrada.addEventListener('change', () => procesar(entrada.files[0]));

    const zona = el('.zona-soltar', {
      tabindex: '0',
      role: 'button',
      onclick: () => entrada.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } },
      ondragover: (e) => { e.preventDefault(); zona.classList.add('encima'); },
      ondragleave: () => zona.classList.remove('encima'),
      ondrop: (e) => { e.preventDefault(); zona.classList.remove('encima'); procesar(e.dataTransfer?.files?.[0]); },
    }, [
      el('strong', { texto: 'Arrastra aquí un .eml' }),
      el('div', { texto: 'En Outlook: arrastra el correo al escritorio, o Archivo → Guardar como → Formato .eml' }),
      entrada,
    ]);

    return zona;
  }

  function zonaHtml() {
    const area = el('textarea', {
      rows: 8,
      placeholder: 'Pega aquí el HTML del correo o de la página. En Gmail: los tres puntos → Mostrar original. En el navegador: Ctrl+U y copia todo.',
      style: { width: '100%' },
    });

    const tipo = el('select', {}, [
      el('option', { value: 'emails', texto: 'Es un correo' }),
      el('option', { value: 'landings', texto: 'Es una página de aterrizaje' }),
    ]);

    return el('div', [
      el('.campo', [area]),
      el('div', { style: { display: 'flex', gap: '9px', alignItems: 'center' } }, [
        tipo,
        el('button.btn.btn-primario', {
          type: 'button',
          texto: 'Sanear e importar',
          onclick: async () => {
            const html = area.value.trim();
            if (!html) return brindis('Pega algo de HTML primero');
            pintarEn(cuerpo, el('.cargando', { texto: 'Saneando…' }));
            try {
              const r = await importarHtml(html, { tipo: tipo.value });
              resultado = { r, tipo: tipo.value, procedencia: 'HTML pegado' };
              ir(2);
            } catch (e) {
              pintarEn(cuerpo, el('.nota.peligro', [el('strong', { texto: 'No se pudo importar. ' }), e.message]));
            }
          },
        }),
      ]),
    ]);
  }

  // ------------------------------------------------------------- paso 2 ---

  function pasoRevision() {
    const { r } = resultado;

    const marco = el('iframe', {
      title: 'Previsualización de lo importado',
      sandbox: '',
      style: { width: '100%', height: '420px', border: '1px solid var(--borde)', borderRadius: '8px', background: '#fff' },
    });
    marco.srcdoc = r.html;

    return el('div', [
      r.asunto ? el('.campo', [el('span.etiqueta', { texto: 'Asunto detectado' }), el('output.salida-mono', { texto: r.asunto })]) : null,
      r.remitente?.direccion
        ? el('.campo', [el('span.etiqueta', { texto: 'Remitente original' }), el('output.salida-mono', { texto: `${r.remitente.nombre ?? ''} <${r.remitente.direccion}>` })])
        : null,

      el('h2.titulo-bloque', { texto: 'Qué se ha tocado' }),
      informe(r.informe ?? []),

      el('h2.titulo-bloque', { style: { marginTop: '22px' }, texto: 'Cómo queda' }),
      marco,

      el('.pie-paso', [
        el('button.btn.btn-mini', { type: 'button', onclick: () => { resultado = null; ir(1); } }, ['Empezar de nuevo']),
        el('button.btn.btn-primario.btn-mini', { type: 'button', onclick: () => ir(3) }, ['Siguiente']),
      ]),
    ]);
  }

  function informe(lineas) {
    if (!lineas.length) return el('p.ayuda', { texto: 'No hizo falta tocar nada.' });

    return el('.informe-saneado', lineas.map((l) =>
      el(`.linea-informe.${l.clase ?? 'quitado'}`, [
        el('span.marca', { texto: l.clase ?? 'quitado' }),
        el('span', { texto: l.texto }),
      ])
    ));
  }

  // ------------------------------------------------------------- paso 3 ---

  function pasoGuardar() {
    const { r, tipo, procedencia } = resultado;

    const campoId = el('input', { type: 'text', value: comoId(r.asunto || procedencia || 'importada'), autocomplete: 'off' });
    const campoNombre = el('input', { type: 'text', value: r.asunto || procedencia, autocomplete: 'off' });
    const campoFamilia = el('input', { type: 'text', value: 'externos', autocomplete: 'off' });
    const campoAutorizacion = el('input', {
      type: 'text',
      value: estado.expediente || estado.cliente || '',
      placeholder: 'AUD-2026-014 · correo recibido por el cliente el 3/9',
      autocomplete: 'off',
    });

    const zonaAviso = el('div');

    return el('div', [
      el('.campo', [el('label', { texto: 'Identificador' }), campoId, el('p.ayuda', { texto: 'Será el nombre de la carpeta bajo templates/propias/.' })]),
      el('.campo', [el('label', { texto: 'Nombre visible' }), campoNombre]),
      el('.campo', [el('label', { texto: 'Familia' }), campoFamilia]),
      el('.campo', [
        el('label', { texto: 'Nota de autorización' }),
        campoAutorizacion,
        el('p.ayuda', { texto: 'Obligatoria. De dónde sale este material y bajo qué encargo se ha copiado.' }),
      ]),

      zonaAviso,

      el('.pie-paso', [
        el('button.btn.btn-mini', { type: 'button', onclick: () => ir(2) }, [icono('flecha', 12), 'Anterior']),
        el('button.btn.btn-primario', {
          type: 'button',
          texto: 'Guardar como plantilla propia',
          onclick: async () => {
            const autorizacionTexto = campoAutorizacion.value.trim();
            if (!autorizacionTexto) return brindis('La nota de autorización es obligatoria');

            const id = comoId(campoId.value);
            if (!id) return brindis('Hace falta un identificador');

            try {
              await guardarPlantilla({
                id,
                tipo,
                layout: r.html,
                meta: {
                  schema: 2,
                  nombre: campoNombre.value.trim() || id,
                  descripcion: `Importada de ${procedencia}.`,
                  familia: campoFamilia.value.trim() || 'externos',
                  categoria: 'importadas',
                  tags: ['importada'],
                  idiomas: [estado.idioma],
                  demo: false,
                  captura: tipo === 'landings' ? 'credenciales' : undefined,
                  remitente: r.remitente?.direccion
                    ? { nombre: r.remitente.nombre ?? 'Notificaciones', buzon: r.remitente.direccion.split('@')[0] }
                    : undefined,
                  campos: [],
                  bloques: [{ id: 'cuerpo', etiqueta: 'Cuerpo importado', opcional: false }],
                  origen: {
                    tipo: procedencia.endsWith('.eml') ? 'importado-eml' : 'importado-html',
                    fecha: new Date().toISOString().slice(0, 10),
                    autorizacion: autorizacionTexto,
                    notas: `Importado de ${procedencia}. ${(r.informe ?? []).length} cambios de saneado.`,
                  },
                },
                copy: { [estado.idioma]: { asunto: r.asunto ?? '' } },
              });

              brindis(`Guardada en templates/propias/${tipo}/${id}. Recarga para verla en la biblioteca.`);
              pintarEn(zonaAviso, el('.nota', { style: { marginTop: '16px' } }, [
                el('strong', { texto: 'Guardada. ' }),
                'Está en la biblioteca al recargar, marcada como importada. ',
                'Entra en ella para trocear el cuerpo en bloques y añadir los otros idiomas.',
              ]));
            } catch (e) {
              brindis(`No se pudo guardar: ${e.message}`);
            }
          },
        }),
      ]),
    ]);
  }
}
