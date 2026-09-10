/**
 * PhishLab — orquestador del dashboard.
 *
 * Herramienta interna para preparar material de simulaciones de phishing
 * autorizadas por contrato. No envía nada: genera el HTML que se pega en
 * GoPhish, que es quien ejecuta la campaña.
 */

import { render, conDatosDeEjemplo, variablesGophish, construirContexto } from './core/engine.js';
import { cargarCatalogo, cargarHtml, resolverFragmentos, resolverAsunto } from './core/catalog.js';
import * as marcaLib from './core/brand.js';
import { crearZip, descargar } from './core/zip.js';
import { instrucciones, autorizacion, sugerirRemitente } from './core/gophish.js';
import { construirCampos } from './ui/fields.js';
import { pintar, peso } from './ui/preview.js';

const $ = (sel) => document.querySelector(sel);

const FAMILIAS = {
  recompensa: 'Recompensa',
  microsoft: 'Microsoft / TI',
  rrhh: 'RRHH',
  externos: 'Externos',
};

const EXPLICACION_NIVEL = {
  facil: 'Saludo genérico, urgencia agresiva, dominio remitente visiblemente ajeno y alguna errata. Es el nivel para una primera campaña.',
  medio: 'Nombre del destinatario, urgencia moderada y dominio parecido al real. El punto de comparación habitual entre años.',
  dificil: 'Personalización completa, sin errores y con pretexto coherente. Mide de verdad, y conviene avisar al SOC antes de lanzarlo.',
};

const estado = {
  catalogo: { emails: [], landings: [] },
  emailId: null,
  landingId: null,
  familia: 'todas',
  idioma: 'es',
  nivel: 'medio',
  vista: 'email',
  campos: {},
  marca: { ...marcaLib.MARCA_VACIA },
  cliente: '',
  expediente: '',
  incluirFormativa: true,
  ejemplo: true,
};

const cacheHtml = new Map();
let ultimoRender = { email: '', landing: '', formativa: '', asunto: '' };

// ---------------------------------------------------------------- arranque ---

arrancar().catch((e) => {
  console.error(e);
  $('#estado-vista').textContent = `Error al cargar el catálogo: ${e.message}`;
});

async function arrancar() {
  estado.catalogo = await cargarCatalogo();

  restaurar();
  pintarFiltros();
  pintarCatalogo();
  pintarPresets();
  conectarEventos();

  if (!estado.emailId) estado.emailId = estado.catalogo.emails[0]?.id ?? null;
  if (!estado.landingId) estado.landingId = landingsVisibles()[0]?.id ?? null;

  sincronizarControles();
  await refrescarPlantilla();
}

// ------------------------------------------------------------------ ayudas ---

const metaEmail = () => estado.catalogo.emails.find((m) => m.id === estado.emailId) ?? null;
const metaLanding = () => estado.catalogo.landings.find((m) => m.id === estado.landingId) ?? null;
const metaFormativa = () => estado.catalogo.landings.find((m) => m.formativa) ?? null;
const landingsVisibles = () => estado.catalogo.landings.filter((m) => !m.formativa);

async function htmlDe(meta, idioma) {
  if (!meta) return '';
  const clave = `${meta.id}:${idioma}`;
  if (!cacheHtml.has(clave)) cacheHtml.set(clave, await cargarHtml(meta, idioma));
  return cacheHtml.get(clave);
}

/**
 * Contexto de marca ampliado con los derivados que las plantillas necesitan
 * pero que no tiene sentido pedirle al usuario: el color de hover, el color
 * de texto legible sobre el acento, el año, y el bloque de logo ya resuelto.
 */
function contextoMarca() {
  const m = estado.marca;
  const empresa = m.empresa.trim() || 'tu empresa';
  const color = /^#[\da-f]{6}$/i.test(m.color) ? m.color : '#0067b8';
  const dominio = (m.dominio.trim() || 'ejemplo.com').replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const logoHtml = m.logo
    ? `<img src="${m.logo}" alt="${escapar(empresa)}" width="150" style="display:block;border:0;max-width:150px;height:auto;">`
    : `<span style="font-family:Segoe UI,Arial,sans-serif;font-size:19px;font-weight:700;color:${color};">${escapar(empresa)}</span>`;

  return {
    empresa: escapar(empresa),
    sector: escapar(m.sector.trim() || 'tu sector'),
    dominio: escapar(dominio),
    firma: escapar(m.firma.trim() || 'Departamento de Recursos Humanos'),
    color,
    colorOscuro: marcaLib.oscurecer(color),
    colorTexto: marcaLib.textoSobre(color),
    logo: m.logo,
    logoHtml,
    anio: String(new Date().getFullYear()),
  };
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ------------------------------------------------------------------ pintar ---

function pintarFiltros() {
  const cont = $('#filtros-familia');
  cont.textContent = '';
  const familias = ['todas', ...new Set(estado.catalogo.emails.map((m) => m.familia))];
  for (const f of familias) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filtro' + (f === estado.familia ? ' activa' : '');
    b.textContent = f === 'todas' ? 'Todas' : FAMILIAS[f] ?? f;
    b.addEventListener('click', () => {
      estado.familia = f;
      pintarFiltros();
      aplicarFiltro();
    });
    cont.append(b);
  }
}

function pintarCatalogo() {
  tarjetas($('#catalogo-emails'), estado.catalogo.emails, 'email');
  tarjetas($('#catalogo-landings'), landingsVisibles(), 'landing');
  aplicarFiltro();
}

function tarjetas(cont, metas, tipo) {
  cont.textContent = '';
  for (const meta of metas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tarjeta';
    b.dataset.id = meta.id;
    b.dataset.tipo = tipo;
    b.dataset.familia = meta.familia ?? '';

    const n = document.createElement('span');
    n.className = 'tarjeta-nombre';
    n.textContent = meta.nombre;

    const d = document.createElement('span');
    d.className = 'tarjeta-desc';
    d.textContent = meta.descripcion ?? '';

    b.append(n, d);

    if (meta.familia) {
      const f = document.createElement('span');
      f.className = 'tarjeta-familia';
      f.textContent = FAMILIAS[meta.familia] ?? meta.familia;
      b.append(f);
    }

    b.addEventListener('click', async () => {
      if (tipo === 'email') estado.emailId = meta.id;
      else estado.landingId = meta.id;
      estado.vista = tipo;
      marcarSeleccion();
      marcarPestana();
      await refrescarPlantilla();
    });

    cont.append(b);
  }
  marcarSeleccion();
}

function aplicarFiltro() {
  for (const t of document.querySelectorAll('#catalogo-emails .tarjeta')) {
    t.hidden = estado.familia !== 'todas' && t.dataset.familia !== estado.familia;
  }
}

function marcarSeleccion() {
  for (const t of document.querySelectorAll('.tarjeta')) {
    const id = t.dataset.id;
    const activa = t.dataset.tipo === 'email' ? id === estado.emailId : id === estado.landingId;
    t.classList.toggle('activa', activa);
    t.setAttribute('aria-pressed', String(activa));
  }
}

function marcarPestana() {
  for (const p of document.querySelectorAll('.pestana')) {
    p.classList.toggle('activa', p.dataset.vista === estado.vista);
    p.setAttribute('aria-selected', String(p.dataset.vista === estado.vista));
  }
}

function pintarPresets() {
  const sel = $('#sel-preset');
  const actual = sel.value;
  sel.textContent = '';
  const vacio = document.createElement('option');
  vacio.value = '';
  vacio.textContent = '— Preset de cliente —';
  sel.append(vacio);
  for (const nombre of Object.keys(marcaLib.listarPresets()).sort()) {
    const o = document.createElement('option');
    o.value = nombre;
    o.textContent = nombre;
    sel.append(o);
  }
  sel.value = actual;
}

// --------------------------------------------------------------- plantilla ---

/** Se llama al cambiar de plantilla, idioma o nivel: reconstruye campos y asunto. */
async function refrescarPlantilla() {
  const meta = metaEmail();

  if (meta) {
    estado.campos = construirCampos(
      $('#campos-dinamicos'),
      meta.campos ?? [],
      estado.campos,
      () => actualizar()
    );
    $('#f-asunto').value = resolverAsunto(meta, estado.idioma, estado.nivel);
  } else {
    $('#campos-dinamicos').textContent = '';
    $('#f-asunto').value = '';
  }

  $('#ayuda-nivel').textContent = EXPLICACION_NIVEL[estado.nivel] ?? '';
  await actualizar();
}

/** Recalcula los tres HTML y repinta la vista activa. */
async function actualizar() {
  const marca = contextoMarca();
  const faltantes = new Set();

  const componer = async (meta) => {
    if (!meta) return '';
    const crudo = await htmlDe(meta, estado.idioma);
    const fragmentos = resolverFragmentos(meta, estado.idioma, estado.nivel);
    const ctx = construirContexto({ marca, campos: estado.campos, fragmentos });
    const r = render(crudo, ctx);
    r.faltantes.forEach((f) => faltantes.add(f));
    return r.html;
  };

  const [email, landing, formativa] = await Promise.all([
    componer(metaEmail()),
    componer(metaLanding()),
    componer(metaFormativa()),
  ]);

  const asunto = render($('#f-asunto').value, {
    ...marca,
    ...estado.campos,
    ...resolverFragmentos(metaEmail() ?? {}, estado.idioma, estado.nivel),
  }).html;

  ultimoRender = { email, landing, formativa, asunto };

  // El campo del asunto guarda la plantilla cruda; aquí se enseña resuelto,
  // que es lo que acabará leyendo el destinatario en su bandeja.
  $('#vista-asunto').textContent = conDatosDeEjemplo(asunto);
  $('#salida-remitente').textContent = sugerirRemitente(metaEmail(), estado.marca, estado.nivel);
  pintarAvisos([...faltantes]);
  guardar();
  repintarVista();
}

function repintarVista() {
  const html = ultimoRender[estado.vista] ?? '';
  const salida = estado.ejemplo ? conDatosDeEjemplo(html) : html;

  pintar($('#vista'), salida || '<p style="font:14px system-ui;padding:24px;color:#888">Sin plantilla seleccionada.</p>');

  const vars = variablesGophish(html);
  $('#estado-vista').textContent = vars.length
    ? `Variables de GoPhish en el HTML exportado: ${vars.join('  ')}`
    : 'Esta plantilla no usa variables de GoPhish.';
  $('#peso-vista').textContent = html ? peso(html) : '';
}

function pintarAvisos(faltantes) {
  const caja = $('#avisos');
  if (!faltantes.length) {
    caja.hidden = true;
    caja.textContent = '';
    return;
  }
  caja.hidden = false;
  caja.textContent = '';
  const p = document.createElement('p');
  p.style.margin = '0';
  p.textContent = 'Estas variables no tienen valor y saldrán literales en el HTML:';
  const ul = document.createElement('ul');
  for (const f of faltantes) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = `{{${f}}}`;
    li.append(code);
    ul.append(li);
  }
  caja.append(p, ul);
}

// ------------------------------------------------------------------ eventos ---

function conectarEventos() {
  // Marca
  enlazar('#f-empresa', 'empresa');
  enlazar('#f-sector', 'sector');
  enlazar('#f-dominio', 'dominio');
  enlazar('#f-firma', 'firma');

  $('#f-color').addEventListener('input', (e) => {
    estado.marca.color = e.target.value;
    $('#f-color-hex').value = e.target.value;
    $('#aviso-color').hidden = true;
    actualizar();
  });

  $('#f-color-hex').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    if (/^#[\da-f]{6}$/i.test(v)) {
      estado.marca.color = v;
      $('#f-color').value = v;
      actualizar();
    }
  });

  conectarLogo();

  // Campaña
  $('#f-idioma').addEventListener('change', async (e) => {
    estado.idioma = e.target.value;
    await refrescarPlantilla();
  });
  $('#f-nivel').addEventListener('change', async (e) => {
    estado.nivel = e.target.value;
    await refrescarPlantilla();
  });
  $('#f-asunto').addEventListener('input', () => actualizar());

  // Exportación
  $('#f-cliente').addEventListener('input', (e) => { estado.cliente = e.target.value; guardar(); });
  $('#f-expediente').addEventListener('input', (e) => { estado.expediente = e.target.value; guardar(); });
  $('#f-formativa').addEventListener('change', (e) => { estado.incluirFormativa = e.target.checked; guardar(); });

  // Vista
  for (const p of document.querySelectorAll('.pestana')) {
    p.addEventListener('click', () => {
      estado.vista = p.dataset.vista;
      marcarPestana();
      repintarVista();
    });
  }
  $('#f-ejemplo').addEventListener('change', (e) => {
    estado.ejemplo = e.target.checked;
    repintarVista();
  });
  for (const b of document.querySelectorAll('.btn-dispositivo')) {
    b.addEventListener('click', () => {
      for (const o of document.querySelectorAll('.btn-dispositivo')) o.classList.toggle('activa', o === b);
      $('#lienzo').classList.toggle('movil', b.dataset.ancho === 'movil');
    });
  }

  // Presets
  $('#sel-preset').addEventListener('change', (e) => {
    const preset = marcaLib.listarPresets()[e.target.value];
    if (!preset) return;
    estado.marca = { ...marcaLib.MARCA_VACIA, ...preset };
    sincronizarControles();
    actualizar();
    brindis(`Preset «${e.target.value}» cargado`);
  });

  $('#btn-guardar-preset').addEventListener('click', () => {
    const sugerido = estado.marca.empresa.trim() || estado.cliente.trim();
    const nombre = prompt('Nombre del preset:', sugerido);
    if (!nombre) return;
    marcaLib.guardarPreset(nombre.trim(), estado.marca);
    pintarPresets();
    $('#sel-preset').value = nombre.trim();
    brindis(`Preset «${nombre.trim()}» guardado`);
  });

  $('#btn-borrar-preset').addEventListener('click', () => {
    const nombre = $('#sel-preset').value;
    if (!nombre) return;
    if (!confirm(`¿Borrar el preset «${nombre}»?`)) return;
    marcaLib.borrarPreset(nombre);
    pintarPresets();
    brindis('Preset borrado');
  });

  // Exportar
  $('#btn-copiar').addEventListener('click', copiarHtml);
  $('#btn-zip').addEventListener('click', descargarZip);
}

function enlazar(sel, clave) {
  const el = $(sel);
  el.addEventListener('input', () => {
    estado.marca[clave] = el.value;
    actualizar();
  });
}

function conectarLogo() {
  const zona = $('#soltar-logo');
  const input = $('#f-logo');

  const aceptar = async (fichero) => {
    if (!fichero) return;
    try {
      const dataUri = await marcaLib.logoADataUri(fichero);
      estado.marca.logo = dataUri;
      mostrarLogo();
      const color = await marcaLib.colorDominante(dataUri);
      if (color) {
        estado.marca.color = color;
        $('#f-color').value = color;
        $('#f-color-hex').value = color;
        $('#aviso-color').hidden = false;
      }
      actualizar();
    } catch (e) {
      brindis(e.message);
    }
  };

  zona.addEventListener('click', () => input.click());
  zona.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => aceptar(input.files[0]));

  for (const ev of ['dragenter', 'dragover']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('encima'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('encima'); });
  }
  zona.addEventListener('drop', (e) => aceptar(e.dataTransfer?.files?.[0]));

  $('#btn-quitar-logo').addEventListener('click', () => {
    estado.marca.logo = '';
    mostrarLogo();
    actualizar();
  });
}

function mostrarLogo() {
  const img = $('#vista-logo');
  const texto = $('#texto-logo');
  const quitar = $('#btn-quitar-logo');
  if (estado.marca.logo) {
    img.src = estado.marca.logo;
    img.hidden = false;
    texto.hidden = true;
    quitar.hidden = false;
  } else {
    img.removeAttribute('src');
    img.hidden = true;
    texto.hidden = false;
    quitar.hidden = true;
  }
}

/** Vuelca el estado a los controles. Se usa al restaurar y al cargar un preset. */
function sincronizarControles() {
  $('#f-empresa').value = estado.marca.empresa;
  $('#f-sector').value = estado.marca.sector;
  $('#f-dominio').value = estado.marca.dominio;
  $('#f-firma').value = estado.marca.firma;
  $('#f-color').value = estado.marca.color;
  $('#f-color-hex').value = estado.marca.color;
  $('#f-idioma').value = estado.idioma;
  $('#f-nivel').value = estado.nivel;
  $('#f-cliente').value = estado.cliente;
  $('#f-expediente').value = estado.expediente;
  $('#f-formativa').checked = estado.incluirFormativa;
  $('#f-ejemplo').checked = estado.ejemplo;
  mostrarLogo();
  marcarSeleccion();
  marcarPestana();
}

// ---------------------------------------------------------------- exportar ---

async function copiarHtml() {
  const html = ultimoRender[estado.vista];
  if (!html) { brindis('No hay nada que copiar en esta pestaña'); return; }
  try {
    await navigator.clipboard.writeText(html);
    brindis('HTML copiado — pégalo en GoPhish con el botón <>');
  } catch {
    brindis('El navegador bloqueó el portapapeles; usa la descarga');
  }
}

function descargarZip() {
  const email = metaEmail();
  const landing = metaLanding();
  if (!email && !landing) { brindis('Elige al menos una plantilla'); return; }

  const ficheros = [];
  if (email) ficheros.push({ nombre: 'email.html', contenido: ultimoRender.email });
  if (landing) ficheros.push({ nombre: 'landing.html', contenido: ultimoRender.landing });
  if (estado.incluirFormativa && ultimoRender.formativa) {
    ficheros.push({ nombre: 'formativa.html', contenido: ultimoRender.formativa });
  }

  ficheros.push({
    nombre: 'INSTRUCCIONES.md',
    contenido: instrucciones({
      email: email ? { ...email, variables: variablesGophish(ultimoRender.email) } : null,
      landing,
      asunto: ultimoRender.asunto,
      marca: estado.marca,
      idioma: estado.idioma,
      nivel: estado.nivel,
      cliente: estado.cliente,
      expediente: estado.expediente,
      incluirFormativa: estado.incluirFormativa,
    }),
  });

  ficheros.push({
    nombre: 'AUTORIZACION.md',
    contenido: autorizacion({ cliente: estado.cliente, expediente: estado.expediente }),
  });

  const etiqueta = [
    estado.expediente || estado.cliente || estado.marca.empresa || 'campana',
    email?.id ?? landing?.id,
    estado.idioma,
    estado.nivel,
  ]
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-');

  descargar(crearZip(ficheros), `${etiqueta}.zip`);
  brindis(`Descargado ${etiqueta}.zip (${ficheros.length} ficheros)`);
}

// ------------------------------------------------------------- persistencia ---

function guardar() {
  marcaLib.guardarEstado({
    emailId: estado.emailId,
    landingId: estado.landingId,
    idioma: estado.idioma,
    nivel: estado.nivel,
    marca: estado.marca,
    campos: estado.campos,
    cliente: estado.cliente,
    expediente: estado.expediente,
    incluirFormativa: estado.incluirFormativa,
  });
}

function restaurar() {
  const guardado = marcaLib.leerEstado();
  if (!guardado) return;
  Object.assign(estado, {
    emailId: guardado.emailId ?? null,
    landingId: guardado.landingId ?? null,
    idioma: guardado.idioma ?? 'es',
    nivel: guardado.nivel ?? 'medio',
    campos: guardado.campos ?? {},
    cliente: guardado.cliente ?? '',
    expediente: guardado.expediente ?? '',
    incluirFormativa: guardado.incluirFormativa ?? true,
    marca: { ...marcaLib.MARCA_VACIA, ...(guardado.marca ?? {}) },
  });
}

// ------------------------------------------------------------------ brindis ---

let tempBrindis = null;
function brindis(texto) {
  const el = $('#brindis');
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(tempBrindis);
  tempBrindis = setTimeout(() => el.classList.remove('visible'), 2600);
}
