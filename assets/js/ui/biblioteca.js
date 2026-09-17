/**
 * Vista de biblioteca: rejilla de plantillas con buscador y filtros.
 *
 * Las miniaturas no son imágenes generadas: son la plantilla de verdad
 * renderizada dentro de un iframe y escalada con `transform`. Cuesta algo más
 * de CPU al pintar, pero no hay ficheros que regenerar ni miniaturas que se
 * queden desfasadas cuando editas un layout, que es exactamente el problema
 * que tienen todas las bibliotecas de plantillas que se ven por ahí.
 */

import { el, pintarEn, icono, brindis } from './dom.js';
import { estado, actualizar, alternarFavorito, landingsDeCampana } from '../core/estado.js';
import { componer, componerSms } from '../core/componer.js';

const FAMILIAS = {
  microsoft: 'Microsoft / TI',
  recompensa: 'Recompensa',
  rrhh: 'RRHH',
  banca: 'Banca y pagos',
  logistica: 'Logística',
  administracion: 'Administración pública',
  saas: 'SaaS corporativo',
  externos: 'Externos',
  it: 'IT y soporte',
  desarrollo: 'Desarrollo y DevOps',
  entretenimiento: 'Entretenimiento y suscripciones',
  viajes: 'Viajes y desplazamientos',
  actualidad: 'Actualidad y avisos',
};

const CATEGORIAS = {
  'banca-pagos': 'Banca y medios de pago',
  'logistica-administracion': 'Logística y administración',
  'saas-corporativo': 'SaaS y colaboración',
  'interno-rrhh': 'Interno y RRHH',
  formacion: 'Formación',
  'soporte-it': 'Soporte y TI',
  'suscripciones-personales': 'Suscripciones personales',
  'redes-profesionales': 'Redes profesionales',
  'avisos-generales': 'Avisos generales',
};

const CAPTURAS = {
  credenciales: 'Credenciales',
  datos: 'Datos personales',
  click: 'Solo clic',
  ninguna: 'Sin captura',
};

export function vistaBiblioteca() {
  const raiz = el('.pagina');

  const rejilla = el('.rejilla-plantillas');
  const resumen = el('.resumen-resultados');
  const lateral = el('.filtros-lateral');

  const buscador = el('.buscador', [
    icono('buscar'),
    el('input', {
      type: 'search',
      placeholder: 'Buscar por nombre, pretexto, marca o etiqueta…',
      value: estado.busqueda,
      oninput: (e) => {
        estado.busqueda = e.target.value;
        repintar();
      },
    }),
  ]);

  raiz.append(
    el('.cabecera-pagina', [
      el('.rotulo', { texto: '01 / Catálogo' }),
      el('h1', { texto: 'Biblioteca de plantillas' }),
      el('p', {
        texto:
          'Correos y páginas de aterrizaje para simulaciones autorizadas. Cada plantilla se compone por bloques y se calibra por señales, así que la misma base sirve para una campaña de línea base y para una que mida de verdad.',
      }),
      el('a.btn.btn-mini', { href: '#/informe', style: { marginTop: '4px' }, texto: 'Ver informe de resultados de una campaña →' }),
    ]),
    el('.biblioteca', [lateral, el('div', [el('.barra-busqueda', [buscador]), resumen, rejilla])])
  );

  repintar();
  return raiz;

  // --------------------------------------------------------------------------

  function repintar() {
    pintarEn(lateral, ...panelesDeFiltro());
    const visibles = filtrar();

    resumen.textContent = visibles.length
      ? `${visibles.length} plantilla${visibles.length === 1 ? '' : 's'} de ${todas().length}`
      : '';

    pintarEn(
      rejilla,
      visibles.length
        ? visibles.map(tarjeta)
        : el('.vacio', [
            el('p', { texto: 'Ninguna plantilla encaja con esos filtros.' }),
            el('button.btn.btn-mini', {
              texto: 'Quitar filtros',
              onclick: () => {
                estado.busqueda = '';
                actualizar({ filtros: { tipo: 'todos', familia: 'todas', categoria: 'todas', captura: 'todas' } });
                repintar();
              },
            }),
          ])
    );
  }

  function todas() {
    return [
      ...estado.catalogo.emails,
      ...landingsDeCampana(),
      ...estado.catalogo.landings.filter((m) => m.formativa),
      ...(estado.catalogo.sms ?? []),
    ];
  }

  function filtrar() {
    const { tipo, familia, categoria, captura, marca } = estado.filtros;
    const busqueda = estado.busqueda.trim().toLowerCase();

    return todas().filter((m) => {
      if (tipo === 'emails' && m.tipo !== 'emails') return false;
      if (tipo === 'landings' && m.tipo !== 'landings') return false;
      if (tipo === 'sms' && m.tipo !== 'sms') return false;
      if (tipo === 'favoritos' && !estado.favoritos.includes(m.id)) return false;
      if (tipo === 'propias' && !m.propia) return false;
      if (familia !== 'todas' && m.familia !== familia) return false;
      if (categoria !== 'todas' && m.categoria !== categoria) return false;
      if (captura !== 'todas' && (m.captura ?? 'ninguna') !== captura) return false;
      if (marca === 'generica' && m.empresa) return false;
      if (marca !== 'todas' && marca !== 'generica' && m.empresa !== marca) return false;

      if (!busqueda) return true;
      const heno = [m.nombre, m.descripcion, m.familia, m.categoria, m.empresa, m.id, ...(m.tags ?? [])]
        .join(' ')
        .toLowerCase();
      // Todas las palabras tienen que aparecer: buscar "banca credenciales"
      // debe dar las de banca CON captura, no la unión de las dos cosas.
      return busqueda.split(/\s+/).every((palabra) => heno.includes(palabra));
    });
  }

  function panelesDeFiltro() {
    const lista = todas();
    const cuenta = (fn) => lista.filter(fn).length;

    return [
      grupo('Tipo', 'tipo', [
        ['todos', 'Todas', lista.length],
        ['emails', 'Correos', cuenta((m) => m.tipo === 'emails')],
        ['landings', 'Landings', cuenta((m) => m.tipo === 'landings')],
        ['sms', 'SMS', cuenta((m) => m.tipo === 'sms')],
        ['favoritos', 'Favoritas', estado.favoritos.length],
        ['propias', 'Propias', cuenta((m) => m.propia)],
      ]),
      grupo('Compañía', 'marca', [
        ['todas', 'Todas', lista.length],
        ['generica', 'Genéricas (marca propia)', cuenta((m) => !m.empresa)],
        ...[...new Set(lista.map((m) => m.empresa).filter(Boolean))].sort().map((e) => [
          e,
          e,
          cuenta((m) => m.empresa === e),
        ]),
      ]),
      grupo('Categoría', 'categoria', [
        ['todas', 'Todas', lista.length],
        ...[...new Set(lista.map((m) => m.categoria).filter(Boolean))].sort().map((c) => [
          c,
          CATEGORIAS[c] ?? c,
          cuenta((m) => m.categoria === c),
        ]),
      ]),
      grupo('Familia', 'familia', [
        ['todas', 'Todas', lista.length],
        ...[...new Set(lista.map((m) => m.familia).filter(Boolean))].sort().map((f) => [
          f,
          FAMILIAS[f] ?? f,
          cuenta((m) => m.familia === f),
        ]),
      ]),
      grupo('Qué captura', 'captura', [
        ['todas', 'Todo', lista.length],
        ...[...new Set(lista.map((m) => m.captura ?? 'ninguna'))].sort().map((c) => [
          c,
          CAPTURAS[c] ?? c,
          cuenta((m) => (m.captura ?? 'ninguna') === c),
        ]),
      ]),
    ];
  }

  function grupo(titulo, clave, opciones) {
    // La primera opción ("Todas") se queda siempre; las demás solo si tienen
    // algo detrás. Un filtro que da cero resultados es ruido en el panel.
    const visibles = opciones.filter(([valor, , n], i) => i === 0 || n > 0 || estado.filtros[clave] === valor);

    return el('.grupo-filtro', [
      el('h3', { texto: titulo }),
      el(
        '.lista-filtro',
        visibles.map(([valor, etiqueta, n]) =>
            el(`button.opcion-filtro${estado.filtros[clave] === valor ? '.activa' : ''}`, {
              type: 'button',
              onclick: () => {
                actualizar({ filtros: { ...estado.filtros, [clave]: valor } });
                repintar();
              },
            }, [etiqueta, el('span.cuenta', { texto: String(n) })])
          )
      ),
    ]);
  }

  function tarjeta(meta) {
    const miniatura = el('.miniatura', [el('.miniatura-vacia', { texto: 'componiendo…' })]);

    // La miniatura se compone cuando la tarjeta entra en pantalla. Con 40
    // plantillas, renderizarlas todas al cargar bloquea el hilo casi un
    // segundo; así solo se paga lo que se mira.
    observador.observe(miniatura);
    miniatura._meta = meta;

    const abrir = () => { location.hash = `#/plantilla/${meta.tipo}/${meta.id}`; };
    const esFavorita = estado.favoritos.includes(meta.id);
    const senales = senalesDe(meta).slice(0, 3);

    // La tarjeta es un div y no un button porque lleva dentro el botón de
    // favorita, y un button anidado en otro no es HTML válido: el navegador
    // parte el árbol y la tarjeta deja de responder al clic.
    return el('.tarjeta-plantilla', {
      role: 'button',
      tabindex: '0',
      onclick: abrir,
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
      },
    }, [
      // Las señales que enseña la plantilla van primero: es lo que distingue
      // a PhishLab de una galería de plantillas de email genérica.
      el('.senales-tarjeta', [
        ...(senales.length
          ? senales.map((s) => el('span.pildora.pildora-acento', { texto: s.nombre }))
          : [el('span.pildora', { texto: 'sin señal marcada' })]),
        el(`span.pildora${meta.tipo === 'emails' ? '' : '.pildora-info'}`, {
          style: { marginLeft: 'auto' },
          texto: meta.tipo === 'emails' ? 'correo' : meta.tipo === 'sms' ? 'sms' : meta.formativa ? 'formativa' : 'landing',
        }),
      ]),
      miniatura,
      el('.cuerpo-tarjeta', [
        el('.titulo-tarjeta', { texto: meta.nombre }),
        el('.desc-tarjeta', { texto: meta.descripcion ?? '' }),
        el('.pies-tarjeta', [
          meta.captura === 'credenciales' ? el('span.pildora.pildora-alerta', { texto: 'credenciales' }) : null,
          meta.propia ? el('span.pildora.pildora-ok', { texto: 'propia' }) : null,
          meta.origen?.tipo?.startsWith('importado') ? el('span.pildora.pildora-ok', { texto: 'importada' }) : null,
          el('span.pildora', { texto: (meta.idiomas ?? []).join(' · ') }),
          el('button.btn.btn-icono', {
            type: 'button',
            title: esFavorita ? 'Quitar de favoritas' : 'Marcar como favorita',
            'aria-pressed': String(esFavorita),
            style: { marginLeft: 'auto', color: esFavorita ? 'var(--acento)' : 'var(--texto-suave)' },
            texto: esFavorita ? '★' : '☆',
            onclick: (e) => {
              e.stopPropagation();
              alternarFavorito(meta.id);
              brindis(esFavorita ? 'Quitada de favoritas' : `«${meta.nombre}» en favoritas`);
              repintar();
            },
          }),
        ]),
      ]),
    ]);
  }

  /** Señales que una plantilla puede enseñar, según los bloques que declara. */
  function senalesDe(meta) {
    const ids = [...new Set((meta.bloques ?? []).map((b) => b.senal).filter(Boolean).map((s) => s.replace(/^!/, '')))];
    return ids
      .map((id) => estado.catalogo.senales.find((s) => s.id === id))
      .filter(Boolean);
  }
}

/**
 * Compone la miniatura de una tarjeta cuando aparece en pantalla.
 * Es un único observador compartido, no uno por tarjeta.
 */
const observador = new IntersectionObserver(
  (entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      observador.unobserve(entrada.target);
      pintarMiniatura(entrada.target);
    }
  },
  { rootMargin: '200px' }
);

async function pintarMiniatura(contenedor) {
  const meta = contenedor._meta;
  try {
    if (meta.tipo === 'sms') {
      // Un sms es texto plano: no hay nada que renderizar en un iframe,
      // así que la miniatura es el propio texto compuesto.
      const { texto } = await componerSms(meta, estado);
      pintarEn(contenedor, el('.miniatura-sms', { texto }));
      return;
    }

    const { html } = await componer(meta, estado);
    const marco = el('iframe', {
      title: `Vista previa de ${meta.nombre}`,
      // Sin allow-scripts: en una miniatura no hace falta que el JS de la
      // landing funcione, y así 40 iframes no ejecutan 40 scripts.
      sandbox: '',
      loading: 'lazy',
    });
    pintarEn(contenedor, marco);
    marco.srcdoc = html;
  } catch (e) {
    pintarEn(contenedor, el('.miniatura-vacia', { texto: 'no se pudo componer' }));
    console.error(`[${meta.id}] miniatura:`, e);
  }
}
