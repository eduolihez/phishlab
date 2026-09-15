/**
 * Pestaña "Web" de Importar: clonar una página real como landing.
 *
 * Wizard de 3 pasos, igual que el de correo: Origen → Revisión → Guardar. La
 * revisión aquí añade una pieza que el correo no necesita — qué campos del
 * formulario se han identificado como email y contraseña, con su confianza,
 * porque el linter exige que se llamen exactamente así y una heurística por
 * regex no siempre acierta.
 */

import { el, pintarEn, brindis, comoId, pasos, icono, informeSaneado } from './dom.js';
import { estado } from '../core/estado.js';
import { clonarUrl, clonarHtml, guardarPlantilla, obtenerCodigoEmparejamiento, generarCodigoEmparejamiento, obtenerPendientesExtension } from '../core/importar.js';
import { generarBookmarklet } from '../bookmarklet/capturar.js';

/** El marcador antepone esto al HTML copiado — ver bookmarklet/capturar.js. */
const RE_ORIGEN_PEGADO = /^<!--phishlab-origen:(.*?)-->\r?\n/;

const CONFIANZA = {
  alta: ['alta', 'pildora-ok'],
  baja: ['baja — revísalo', 'pildora-alerta'],
  'no-detectado': ['no detectado', 'pildora-alerta'],
};

export function panelImportarWeb() {
  const raiz = el('div');
  const barraPasos = el('div');
  const cuerpo = el('div');
  raiz.append(barraPasos, cuerpo);

  let paso = 1;
  let resultado = null; // { r, procedencia }
  let colaExtension = []; // pasos adicionales capturados en un mismo envío de la extensión, pendientes de revisar
  let intervaloExtension = null;

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

    detenerPollingExtension();

    if (paso === 1) {
      pintarEn(cuerpo, pasoOrigen());
      iniciarPollingExtension();
      return;
    }
    if (paso === 2) return pintarEn(cuerpo, pasoRevision());
    return pintarEn(cuerpo, pasoGuardar());
  }

  function iniciarPollingExtension() {
    intervaloExtension = setInterval(async () => {
      try {
        const { pasos: pendientes } = await obtenerPendientesExtension();
        if (pendientes.length === 0) return;

        detenerPollingExtension();
        colaExtension = pendientes.map((p, i) => ({
          r: p,
          procedencia: p.urlOrigen || `captura de la extensión (paso ${i + 1})`,
          // GoPhish solo admite una página por landing (ver SECURITY.md): de
          // varios pasos capturados, el que trae el campo de contraseña
          // detectado es normalmente el único con sentido para exportar —
          // los anteriores suelen ser solo pantallas previas del login.
          recomendado: (p.camposLogin?.password?.confianza ?? 'no-detectado') !== 'no-detectado',
        }));
        // El recomendado pasa primero a revisión, aunque no sea el primero
        // capturado — es el que de verdad interesa guardar en la mayoría de
        // los casos.
        const indiceRecomendado = colaExtension.findIndex((p) => p.recomendado);
        if (indiceRecomendado > 0) {
          const [preferido] = colaExtension.splice(indiceRecomendado, 1);
          colaExtension.unshift(preferido);
        }
        resultado = colaExtension.shift();
        ir(2);
      } catch {
        // servidor no disponible o sin código generado todavía: se reintenta en el siguiente tick
      }
    }, 3000);
  }

  function detenerPollingExtension() {
    if (intervaloExtension) clearInterval(intervaloExtension);
    intervaloExtension = null;
  }

  // ------------------------------------------------------------- paso 1 ---

  function pasoOrigen() {
    return el('div', [
      el('.nota', { style: { marginBottom: '20px' } }, [
        el('strong', { texto: 'Antes de clonar. ' }),
        'Recrear el login de una marca real para una simulación entra dentro del encargo, pero conviene que quede por escrito de dónde salió: cada plantilla clonada guarda una nota de autorización obligatoria, y el linter no la deja pasar vacía.',
      ]),
      zonaMarcador(),
      el('.separador-o', { texto: 'o desde la extensión' }),
      zonaExtension(),
      el('.separador-o', { texto: 'o pega una URL' }),
      zonaUrl(),
    ]);
  }

  function zonaExtension() {
    const contenido = el('div', { texto: 'Comprobando emparejamiento…' });
    const zona = el('.zona-soltar', [
      el('strong', { texto: 'Extensión de captura.' }),
      contenido,
    ]);

    refrescarExtension();
    return zona;

    async function refrescarExtension() {
      try {
        const { codigo } = await obtenerCodigoEmparejamiento();
        pintarEn(contenido, codigo ? conCodigo(codigo) : sinCodigo());
      } catch {
        pintarEn(contenido, el('p.ayuda', { texto: 'El servidor local no responde: la extensión no puede usarse sin él.' }));
      }
    }

    function sinCodigo() {
      return el('div', [
        el('div', { texto: 'Todavía no hay código de emparejamiento generado.' }),
        el('button.btn.btn-mini', {
          type: 'button',
          style: { marginTop: '8px' },
          texto: 'Generar código',
          onclick: async () => {
            try {
              const { codigo } = await generarCodigoEmparejamiento();
              brindis(`Código generado: ${codigo}. Pégalo en las opciones de la extensión.`);
              await refrescarExtension();
            } catch (err) {
              brindis(`No se pudo generar: ${err.message}`);
            }
          },
        }),
      ]);
    }

    function conCodigo(codigo) {
      return el('div', [
        el('div', { texto: 'Código de emparejamiento (pégalo en las opciones de la extensión):' }),
        el('output.salida-mono', { texto: codigo, style: { display: 'block', margin: '8px 0' } }),
        el('button.btn.btn-mini', {
          type: 'button',
          texto: 'Regenerar código',
          onclick: async () => {
            try {
              const { codigo: nuevo } = await generarCodigoEmparejamiento();
              brindis(`Nuevo código: ${nuevo}. Actualiza las opciones de la extensión.`);
              await refrescarExtension();
            } catch (err) {
              brindis(`No se pudo regenerar: ${err.message}`);
            }
          },
        }),
        el('p.ayuda', { texto: 'Esta pantalla revisa cada pocos segundos si la extensión ha mandado algo. Solo con pulsar "Enviar a PhishLab" en su icono, la captura aparece aquí sola.' }),
      ]);
    }
  }

  function zonaMarcador() {
    const enlace = el('a.btn.btn-primario', {
      href: generarBookmarklet(),
      texto: 'Clonar con PhishLab',
    });

    const area = el('textarea', {
      rows: 4,
      placeholder: 'Pega aquí lo que haya copiado el marcador (Ctrl+V)…',
      style: { width: '100%', marginTop: '10px' },
    });

    return el('.zona-soltar', [
      el('strong', { texto: 'Arrastra este botón a tu barra de marcadores.' }),
      el('div', { style: { margin: '10px 0' } }, [enlace]),
      el('div', {
        texto: 'En la web real —ya cargada, y logueada si hace falta— púlsalo, o usa Ctrl+S en cualquier momento después de pulsarlo una vez. Sirve incluso para una pantalla que solo aparece tras interactuar con la página, como el segundo paso de un login. Copia la página al portapapeles: no manda nada por red, así que no depende de ningún permiso del navegador.',
      }),
      area,
      el('button.btn.btn-mini', {
        type: 'button',
        style: { marginTop: '8px' },
        texto: 'Sanear lo pegado',
        onclick: () => procesarPegado(area.value),
      }),
    ]);
  }

  async function procesarPegado(texto) {
    const coincide = texto.match(RE_ORIGEN_PEGADO);
    const urlOrigen = coincide?.[1] ?? '';
    const html = coincide ? texto.slice(coincide[0].length) : texto;

    if (!html.trim()) return brindis('Pega primero lo que haya copiado el marcador');

    pintarEn(cuerpo, el('.cargando', { texto: 'Saneando…' }));
    try {
      const r = await clonarHtml(html, urlOrigen);
      resultado = { r, procedencia: urlOrigen || 'captura del marcador' };
      ir(2);
    } catch (e) {
      pintarEn(cuerpo, el('.nota.peligro', [el('strong', { texto: 'No se pudo clonar. ' }), e.message]));
    }
  }

  function zonaUrl() {
    const campo = el('input', { type: 'url', placeholder: 'https://ejemplo.com/login', style: { width: '100%' }, autocomplete: 'off' });

    return el('div', [
      el('.campo', [campo]),
      el('button.btn', {
        type: 'button',
        texto: 'Clonar por URL',
        onclick: async () => {
          const url = campo.value.trim();
          if (!url) return brindis('Pega una URL primero');
          pintarEn(cuerpo, el('.cargando', { texto: `Descargando y saneando ${url}…` }));
          try {
            const r = await clonarUrl(url);
            resultado = { r, procedencia: url };
            ir(2);
          } catch (e) {
            pintarEn(cuerpo, el('.nota.peligro', [el('strong', { texto: 'No se pudo clonar. ' }), e.message]));
          }
        },
      }),
      el('p.ayuda', { texto: 'Solo sirve para páginas que no dependen de JavaScript para pintarse: la mayoría de logins modernos necesita el marcador.' }),
    ]);
  }

  // ------------------------------------------------------------- paso 2 ---

  function pasoRevision() {
    const { r } = resultado;

    const marco = el('iframe', {
      title: 'Previsualización de lo clonado',
      sandbox: '',
      style: { width: '100%', height: '420px', border: '1px solid var(--borde)', borderRadius: '8px', background: '#fff' },
    });
    marco.srcdoc = r.html;

    return el('div', [
      r.urlOrigen ? el('.campo', [el('span.etiqueta', { texto: 'Origen' }), el('output.salida-mono', { texto: r.urlOrigen })]) : null,

      colaExtension.length > 0 ? avisoColaExtension() : null,

      el('h2.titulo-bloque', { texto: 'Qué se ha tocado' }),
      informeSaneado(r.informe ?? []),

      el('h2.titulo-bloque', { style: { marginTop: '22px' }, texto: 'Campos de credenciales' }),
      camposLogin(r.camposLogin ?? {}),

      el('h2.titulo-bloque', { style: { marginTop: '22px' }, texto: 'Cómo queda' }),
      marco,

      el('.pie-paso', [
        el('button.btn.btn-mini', { type: 'button', onclick: () => { resultado = null; colaExtension = []; ir(1); } }, ['Empezar de nuevo']),
        el('button.btn.btn-primario.btn-mini', { type: 'button', onclick: () => ir(3) }, ['Siguiente']),
      ]),
    ]);
  }

  function avisoColaExtension() {
    return el('.nota', { style: { marginBottom: '20px' } }, [
      el('strong', { texto: resultado.recomendado ? 'Paso recomendado para exportar. ' : 'Paso de referencia, no el recomendado. ' }),
      resultado.recomendado
        ? `GoPhish solo admite una página por landing. Este paso trae el campo de contraseña detectado, así que es el que normalmente interesa guardar — quedan ${colaExtension.length} paso(s) más en la cola, solo para consultar.`
        : `GoPhish solo admite una página por landing, y este paso no trae contraseña detectada — probablemente sea una pantalla previa del login (el campo de email, por ejemplo). Quedan ${colaExtension.length} paso(s) más en la cola; revisa si alguno trae el campo de contraseña antes de decidir cuál guardar.`,
    ]);
  }

  function camposLogin(campos) {
    const filas = [
      ['email', 'Campo de email / usuario'],
      ['password', 'Campo de contraseña'],
    ].map(([clave, etiqueta]) => {
      const confianza = campos[clave]?.confianza ?? 'no-detectado';
      const [texto, clase] = CONFIANZA[confianza];
      return el('.fragmento', { style: { marginBottom: '8px' } }, [
        el('.cabecera-fragmento', [
          el('span', { texto: etiqueta }),
          el(`span.pildora.${clase}`, { style: { marginLeft: 'auto' }, texto }),
        ]),
      ]);
    });

    return el('div', [
      ...filas,
      el('p.ayuda', {
        texto: 'GoPhish reconoce la contraseña por el nombre exacto del campo — ver SECURITY.md. Si algo salió "no detectado" o "baja", el linter no dejará pasar esta plantilla para captura de credenciales hasta que revises el formulario a mano.',
      }),
    ]);
  }

  // ------------------------------------------------------------- paso 3 ---

  function pasoGuardar() {
    const { r, procedencia } = resultado;

    const campoId = el('input', { type: 'text', value: comoId(procedencia || 'web-clonada'), autocomplete: 'off' });
    const campoNombre = el('input', { type: 'text', value: procedencia, autocomplete: 'off' });
    const campoFamilia = el('input', { type: 'text', value: 'externos', autocomplete: 'off' });
    const campoAutorizacion = el('input', {
      type: 'text',
      value: estado.expediente || estado.cliente || '',
      placeholder: 'AUD-2026-014 · clonado con autorización del cliente el 3/9',
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
        el('p.ayuda', { texto: 'Obligatoria. De dónde sale esta web y bajo qué encargo se ha clonado.' }),
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

            // "credenciales" solo si la heurística encontró de verdad los dos
            // campos: si no, el linter bloquearía esta plantilla por declarar
            // una captura que su formulario no puede cumplir (ver tools/lint.js).
            const detectoLogin = ['email', 'password'].every((c) => (r.camposLogin?.[c]?.confianza ?? 'no-detectado') !== 'no-detectado');

            try {
              await guardarPlantilla({
                id,
                tipo: 'landings',
                layout: r.html,
                meta: {
                  schema: 2,
                  nombre: campoNombre.value.trim() || id,
                  descripcion: `Clonada de ${procedencia}.`,
                  familia: campoFamilia.value.trim() || 'externos',
                  categoria: 'importadas',
                  tags: ['clonada', 'web'],
                  idiomas: [estado.idioma],
                  demo: false,
                  captura: detectoLogin ? 'credenciales' : 'ninguna',
                  campos: [],
                  bloques: [{ id: 'cuerpo', etiqueta: 'Cuerpo clonado', opcional: false }],
                  origen: {
                    tipo: 'clonado-web',
                    urlOrigen: procedencia,
                    fecha: new Date().toISOString().slice(0, 10),
                    autorizacion: autorizacionTexto,
                    notas: `Clonada de ${procedencia}. ${(r.informe ?? []).length} cambios de saneado.`,
                  },
                },
                copy: { [estado.idioma]: {} },
              });

              brindis(`Guardada en templates/propias/landings/${id}. Recarga para verla en la biblioteca.`);
              pintarEn(zonaAviso, el('.nota', { style: { marginTop: '16px' } }, [
                el('strong', { texto: 'Guardada. ' }),
                'Está en la biblioteca al recargar, marcada como clonada. Ábrela para revisar los campos de credenciales y editar el texto en vivo, directamente sobre la preview.',
                colaExtension.length > 0
                  ? el('div', { style: { marginTop: '10px' } }, [
                      el('button.btn.btn-mini', {
                        type: 'button',
                        texto: `Revisar el siguiente paso capturado (quedan ${colaExtension.length})`,
                        onclick: () => { resultado = colaExtension.shift(); ir(2); },
                      }),
                    ])
                  : null,
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
