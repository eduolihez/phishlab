/**
 * PhishLab — arranque y enrutado.
 *
 * Herramienta interna para preparar material de simulaciones de phishing
 * autorizadas por contrato. No envía nada: genera el HTML que se pega en
 * GoPhish, que es quien ejecuta la campaña.
 *
 * Este fichero solo carga el catálogo, resuelve en qué modo está corriendo
 * (con servidor local o sin él, herramienta completa o demo pública) y monta
 * las vistas. Toda la lógica vive en `core/` y todo el pintado en `ui/`.
 */

import { $, el, pintarEn } from './ui/dom.js';
import { registrar, arrancarRouter, alNavegar } from './ui/router.js';
import { cargarCatalogo } from './core/catalog.js';
import { estado, actualizar, restaurar } from './core/estado.js';
import { detectarServidor, hayServidor } from './core/importar.js';
import { camposConDefectos } from './core/componer.js';

import { vistaBiblioteca } from './ui/biblioteca.js';
import { vistaDetalle } from './ui/detalle.js';
import { vistaCampana } from './ui/campana.js';
import { vistaImportar } from './ui/importar.js';
import { vistaSenales } from './ui/senales.js';

arrancar().catch((e) => {
  console.error(e);
  pintarEn($('#vista-principal'), el('.pagina', [
    el('.nota.peligro', [
      el('strong', { texto: 'No se pudo cargar el catálogo. ' }),
      el('span', { texto: e.message }),
      el('p', { style: { marginBottom: '0' } }, [
        'Si has abierto ', el('code', { texto: 'index.html' }), ' con doble clic, eso es lo que pasa: ',
        'el navegador bloquea los módulos y el fetch de plantillas bajo file://. ',
        'Arranca con ', el('code', { texto: 'abrir-phishlab.bat' }), '.',
      ]),
    ]),
  ]));
});

async function arrancar() {
  // El modo demo lo marca el generador del estático público. En la herramienta
  // local nunca está puesto.
  estado.modoDemo = document.documentElement.dataset.modo === 'demo';

  const [catalogo] = await Promise.all([cargarCatalogo(), detectarServidor()]);

  estado.catalogo = catalogo;
  estado.conServidor = hayServidor();

  restaurar();
  sanearSeleccion();
  pintarCronica();
  conectarRutas();

  alNavegar(marcarNavegacion);
  await arrancarRouter($('#vista-principal'));
}

/**
 * Una selección guardada puede apuntar a una plantilla que ya no existe: la
 * borraste de `templates/propias/`, o clonaste el repo en otra máquina. Sin
 * esto, la vista de campaña se quedaría medio vacía sin explicar por qué.
 */
function sanearSeleccion() {
  const ids = new Set([...estado.catalogo.emails, ...estado.catalogo.landings].map((m) => m.id));

  if (!ids.has(estado.emailId)) estado.emailId = estado.catalogo.emails[0]?.id ?? null;
  if (!ids.has(estado.landingId)) {
    estado.landingId = estado.catalogo.landings.find((m) => !m.formativa)?.id ?? null;
  }
  if (!ids.has(estado.formativaId)) {
    estado.formativaId = estado.catalogo.landings.find((m) => m.formativa)?.id ?? null;
  }

  for (const id of [estado.emailId, estado.landingId]) {
    const meta = [...estado.catalogo.emails, ...estado.catalogo.landings].find((m) => m.id === id);
    if (meta) estado.campos = camposConDefectos(meta, estado.campos);
  }

  actualizar({});
}

function conectarRutas() {
  registrar('/biblioteca', () => vistaBiblioteca());
  registrar('/plantilla/:tipo/:id', (params) => vistaDetalle(params));
  registrar('/campana', () => vistaCampana());
  registrar('/senales', () => vistaSenales());

  if (estado.modoDemo) {
    registrar('/importar', () => el('.pagina.columna-estrecha', [
      el('.cabecera-pagina', [
        el('.rotulo', { texto: '03 / Entrada' }),
        el('h1', { texto: 'Importar' }),
      ]),
      el('.nota.alerta', [
        el('strong', { texto: 'Desactivado en la demo. ' }),
        'La importación escribe en el disco del equipo que ejecuta la herramienta, así que solo existe en la instalación local.',
      ]),
    ]));
  } else {
    registrar('/importar', () => vistaImportar());
  }
}

/** Pinta el estado del entorno en la barra: modo demo, servidor local, catálogo. */
function pintarCronica() {
  const acciones = $('#acciones-barra');

  if (estado.modoDemo) {
    $('#cinta-demo').hidden = false;
    $('#etiqueta-uso').textContent = 'Demo pública · marcas ficticias';
    pintarEn(acciones,
      el('a.btn.btn-mini', { href: 'https://github.com/eduolihez', target: '_blank', rel: 'noopener', texto: 'Ver el código' })
    );
    return;
  }

  const total = estado.catalogo.emails.length + estado.catalogo.landings.length;

  pintarEn(acciones,
    el('span.pildora', { texto: `${total} plantillas` }),
    el('span.pildora', {
      title: hayServidor()
        ? 'El servidor local está detrás: puedes importar y guardar plantillas propias.'
        : 'Sin servidor local: se puede componer y exportar, pero no importar ni guardar en disco.',
      texto: hayServidor() ? 'servidor local' : 'solo lectura',
      class: hayServidor() ? 'pildora pildora-acento' : 'pildora pildora-alerta',
    }),
    el('a.btn.btn-primario.btn-mini', { href: '#/campana', texto: 'Montar campaña' })
  );
}

function marcarNavegacion(vista) {
  for (const enlace of document.querySelectorAll('.nav-enlace')) {
    const activa = enlace.dataset.vista === vista || (vista === 'plantilla' && enlace.dataset.vista === 'biblioteca');
    enlace.classList.toggle('activa', activa);
  }
}
