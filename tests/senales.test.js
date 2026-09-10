/**
 * Pruebas de la resolución por señales.
 *
 * Lo que se blinda aquí es lo que decide qué texto acaba en el correo que
 * recibe un empleado. Un fallo de especificidad no rompe nada visible: la
 * campaña sale, se envía, y solo al leer los resultados se descubre que el
 * nivel difícil llevaba el texto con erratas del nivel fácil.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolverSenales,
  activas,
  esPersonalizado,
  elegirVariante,
  resolverCopy,
  bloquesActivos,
  sugerirRemitente,
} from '../assets/js/core/senales.js';

const PRESETS = [
  { id: 'facil', senales: { urgencia: true, erratas: true, 'saludo-generico': true, 'dominio-ajeno': true } },
  { id: 'medio', senales: { urgencia: true, erratas: false, 'saludo-generico': false, 'dominio-ajeno': true } },
  { id: 'dificil', senales: { urgencia: false, erratas: false, 'saludo-generico': false, 'dominio-ajeno': false } },
];

// ------------------------------------------------------------- presets ---

test('un preset define las señales activas', () => {
  const s = resolverSenales(PRESETS, 'medio');
  assert.equal(s.urgencia, true);
  assert.equal(s.erratas, false);
});

test('los ajustes manuales pisan al preset', () => {
  const s = resolverSenales(PRESETS, 'dificil', { urgencia: true });
  assert.equal(s.urgencia, true, 'se puede pedir urgencia sobre un correo por lo demás impecable');
  assert.equal(s['dominio-ajeno'], false);
});

test('un preset desconocido cae al primero en vez de dejarlo todo apagado', () => {
  const s = resolverSenales(PRESETS, 'inventado');
  assert.deepEqual(s, PRESETS[0].senales);
});

test('detecta cuándo te has apartado del preset', () => {
  assert.equal(esPersonalizado(PRESETS, 'medio', resolverSenales(PRESETS, 'medio')), false);
  assert.equal(esPersonalizado(PRESETS, 'medio', resolverSenales(PRESETS, 'medio', { erratas: true })), true);
});

// ------------------------------------------------------------ variantes ---

const VARIANTES = {
  base: 'sin señales',
  urgencia: 'con urgencia',
  'urgencia+erratas': 'con urgencia y erratas',
};

test('gana la variante más específica que encaje', () => {
  assert.equal(elegirVariante(VARIANTES, new Set(['urgencia', 'erratas'])), 'con urgencia y erratas');
});

test('una variante no entra si le falta alguna de sus señales', () => {
  assert.equal(
    elegirVariante(VARIANTES, new Set(['erratas'])),
    'sin señales',
    'urgencia+erratas exige las dos, y con solo erratas no hay nada más específico que base'
  );
});

test('sin ninguna señal se usa base', () => {
  assert.equal(elegirVariante(VARIANTES, new Set()), 'sin señales');
});

test('las señales de más no estorban', () => {
  assert.equal(elegirVariante(VARIANTES, new Set(['urgencia', 'dominio-ajeno'])), 'con urgencia');
});

test('un fragmento constante se escribe como cadena suelta', () => {
  assert.equal(elegirVariante('Cuenta', new Set(['urgencia'])), 'Cuenta');
});

test('un fragmento sin base ni variante aplicable devuelve cadena vacía, no undefined', () => {
  assert.equal(
    elegirVariante({ urgencia: 'solo con urgencia' }, new Set()),
    '',
    'undefined haría que render() dejase el hueco {{x}} visible en el correo'
  );
});

test('las claves con guion bajo son comentarios del JSON, no copy', () => {
  const copy = resolverCopy({ _comentario: 'esto no es copy', saludo: 'Hola' }, new Set());
  assert.deepEqual(Object.keys(copy), ['saludo']);
});

// -------------------------------------------------------------- bloques ---

const BLOQUES = [
  { id: 'cabecera', opcional: true, defecto: true },
  { id: 'oculto-por-defecto', opcional: true, defecto: false },
  { id: 'urgencia', senal: 'urgencia' },
  { id: 'pie-legal', senal: '!incoherencia-marca' },
  { id: 'fijo' },
];

test('un bloque gobernado por una señal aparece solo con ella', () => {
  assert.equal(bloquesActivos(BLOQUES, new Set(['urgencia']), {}).has('urgencia'), true);
  assert.equal(bloquesActivos(BLOQUES, new Set(), {}).has('urgencia'), false);
});

test('una señal negada invierte el bloque', () => {
  assert.equal(bloquesActivos(BLOQUES, new Set(), {}).has('pie-legal'), true);
  assert.equal(
    bloquesActivos(BLOQUES, new Set(['incoherencia-marca']), {}).has('pie-legal'),
    false,
    'el pie legal completo es justo lo que una campaña real no copia'
  );
});

test('un bloque sin señal ni "opcional" está siempre', () => {
  assert.equal(bloquesActivos(BLOQUES, new Set(), {}).has('fijo'), true);
});

test('defecto false lo deja apagado hasta que lo enciendes', () => {
  assert.equal(bloquesActivos(BLOQUES, new Set(), {}).has('oculto-por-defecto'), false);
  assert.equal(bloquesActivos(BLOQUES, new Set(), { 'oculto-por-defecto': true }).has('oculto-por-defecto'), true);
});

test('lo que tocas a mano manda sobre la señal', () => {
  const vivos = bloquesActivos(BLOQUES, new Set(['urgencia']), { urgencia: false });
  assert.equal(vivos.has('urgencia'), false, 'poder forzarlo es el sentido del panel de bloques');
});

// ------------------------------------------------------------ remitente ---

const MARCA = { dominio: 'beltran.es' };
const META = { remitente: { nombre: 'Soporte TI', buzon: 'soporte' } };

test('sin señal de dominio el remitente usa el dominio real', () => {
  assert.equal(sugerirRemitente(META, MARCA, new Set()), 'Soporte TI <soporte@beltran.es>');
});

test('con dominio ajeno y erratas el dominio es descaradamente otro', () => {
  const r = sugerirRemitente(META, MARCA, new Set(['dominio-ajeno', 'erratas']));
  assert.match(r, /\.net>$/);
  assert.doesNotMatch(r, /@beltran\.es>/);
});

test('con dominio ajeno a secas es un lookalike plausible', () => {
  const r = sugerirRemitente(META, MARCA, new Set(['dominio-ajeno']));
  assert.equal(r, 'Soporte TI <soporte@beltran-soporte.es>');
});

test('un dominio sin punto no rompe la sugerencia', () => {
  const r = sugerirRemitente(META, { dominio: 'intranet' }, new Set(['dominio-ajeno']));
  assert.match(r, /^Soporte TI <soporte@/);
});

// ---------------------------------------------------------------- varios ---

test('activas() devuelve solo las encendidas', () => {
  assert.deepEqual([...activas({ a: true, b: false, c: true })], ['a', 'c']);
});
