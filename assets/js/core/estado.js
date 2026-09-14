/**
 * Estado de la aplicación.
 *
 * Un único objeto vivo con lo que hay elegido ahora mismo, más un mecanismo de
 * suscripción para que las vistas se repinten solas. No hay framework: las
 * vistas leen `estado`, llaman a `actualizar()` y se enteran por `suscribir()`.
 *
 * Lo que se guarda entre sesiones es la configuración de trabajo (marca del
 * cliente, idioma, preset, campos). Lo que NO se guarda nunca es nada que
 * venga de una plantilla importada: ese material vive en disco, bajo
 * `templates/propias/`, y no en el navegador.
 */

import { MARCA_VACIA, guardarEstado, leerEstado } from './brand.js';

const suscriptores = new Set();

export const estado = {
  catalogo: { emails: [], landings: [], senales: [], presets: [] },

  // Selección de campaña
  emailId: null,
  landingId: null,
  formativaId: null,

  idioma: 'es',
  preset: 'medio',

  /** Señales tocadas a mano, por encima del preset. `{}` = tal cual el preset. */
  overridesSenales: {},

  /** Bloques tocados a mano, por plantilla: `{ 'm365-...': { urgencia: false } }`. */
  overridesBloques: {},

  campos: {},
  marca: { ...MARCA_VACIA },

  cliente: '',
  expediente: '',
  incluirFormativa: true,

  // Preferencias de la vista
  ejemplo: true,
  dispositivo: 'escritorio',
  favoritos: [],

  // Filtros de la biblioteca
  busqueda: '',
  filtros: { tipo: 'todos', familia: 'todas', categoria: 'todas', captura: 'todas', marca: 'todas' },

  // Capacidades del entorno, resueltas al arrancar
  conServidor: false,
  modoDemo: false,
};

/** Se suscribe a los cambios. Devuelve la función para darse de baja. */
export function suscribir(fn) {
  suscriptores.add(fn);
  return () => suscriptores.delete(fn);
}

/** Aplica cambios, persiste y avisa a quien escuche. */
export function actualizar(cambios = {}) {
  Object.assign(estado, cambios);
  persistir();
  for (const fn of suscriptores) fn(estado);
}

/** Cambia una señal concreta por encima del preset. */
export function ajustarSenal(id, valor) {
  actualizar({ overridesSenales: { ...estado.overridesSenales, [id]: valor } });
}

/** Vuelve al preset tal cual, tirando los ajustes manuales de señales. */
export function volverAlPreset(preset = estado.preset) {
  actualizar({ preset, overridesSenales: {} });
}

/** Enciende o apaga un bloque de una plantilla concreta. */
export function ajustarBloque(plantillaId, bloqueId, valor) {
  const deLaPlantilla = { ...(estado.overridesBloques[plantillaId] ?? {}), [bloqueId]: valor };
  actualizar({ overridesBloques: { ...estado.overridesBloques, [plantillaId]: deLaPlantilla } });
}

/** Deja los bloques de una plantilla como vengan de fábrica. */
export function reiniciarBloques(plantillaId) {
  const resto = { ...estado.overridesBloques };
  delete resto[plantillaId];
  actualizar({ overridesBloques: resto });
}

export function alternarFavorito(id) {
  const favoritos = estado.favoritos.includes(id)
    ? estado.favoritos.filter((f) => f !== id)
    : [...estado.favoritos, id];
  actualizar({ favoritos });
}

/** Busca una meta por id en cualquiera de las dos listas. */
export function plantilla(id) {
  return [...estado.catalogo.emails, ...estado.catalogo.landings].find((m) => m.id === id) ?? null;
}

export const emailElegido = () => plantilla(estado.emailId);
export const landingElegida = () => plantilla(estado.landingId);
export const formativa = () =>
  plantilla(estado.formativaId) ?? estado.catalogo.landings.find((m) => m.formativa) ?? null;

/** Las landings que no son la página formativa: es material de campaña, no un cebo. */
export const landingsDeCampana = () => estado.catalogo.landings.filter((m) => !m.formativa);

// --------------------------------------------------------------- persistencia ---

function persistir() {
  guardarEstado({
    emailId: estado.emailId,
    landingId: estado.landingId,
    idioma: estado.idioma,
    preset: estado.preset,
    overridesSenales: estado.overridesSenales,
    overridesBloques: estado.overridesBloques,
    marca: estado.marca,
    campos: estado.campos,
    cliente: estado.cliente,
    expediente: estado.expediente,
    incluirFormativa: estado.incluirFormativa,
    ejemplo: estado.ejemplo,
    dispositivo: estado.dispositivo,
    favoritos: estado.favoritos,
  });
}

export function restaurar() {
  const guardado = leerEstado();
  if (!guardado) return;
  Object.assign(estado, {
    emailId: guardado.emailId ?? null,
    landingId: guardado.landingId ?? null,
    idioma: guardado.idioma ?? 'es',
    // Un estado guardado por la versión anterior traía `nivel`, no `preset`.
    // Los nombres coinciden (facil/medio/dificil), así que se reaprovecha.
    preset: guardado.preset ?? guardado.nivel ?? 'medio',
    overridesSenales: guardado.overridesSenales ?? {},
    overridesBloques: guardado.overridesBloques ?? {},
    campos: guardado.campos ?? {},
    cliente: guardado.cliente ?? '',
    expediente: guardado.expediente ?? '',
    incluirFormativa: guardado.incluirFormativa ?? true,
    ejemplo: guardado.ejemplo ?? true,
    dispositivo: guardado.dispositivo ?? 'escritorio',
    favoritos: guardado.favoritos ?? [],
    marca: { ...MARCA_VACIA, ...(guardado.marca ?? {}) },
  });
}
