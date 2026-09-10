/**
 * Pruebas de la poda de bloques.
 *
 * El fallo caro aquí es silencioso en la interfaz y visible en la bandeja del
 * destinatario: un marcador `<!--@bloque:urgencia-->` que sobrevive al export
 * y queda en el código fuente del correo, o un `{{.Tracker}}` que desaparece
 * al podar y deja la campaña sin métrica de apertura.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { podar, bloquesDeclarados, render } from '../assets/js/core/engine.js';

const LAYOUT = [
  '<table>',
  '<!--@bloque:cabecera @opcional-->',
  '  <tr><td>{{logoHtml}}</td></tr>',
  '<!--@/bloque-->',
  '<!--@bloque:urgencia @senal:urgencia-->',
  '  <tr><td>{{urgencia}}</td></tr>',
  '<!--@/bloque-->',
  '  <tr><td>{{cta}}</td></tr>',
  '</table>',
  '<!--@bloque:tracker @opcional-->',
  '{{.Tracker}}',
  '<!--@/bloque-->',
].join('\n');

test('lista los bloques declarados con su señal', () => {
  const b = bloquesDeclarados(LAYOUT);
  assert.deepEqual(b.map((x) => x.id), ['cabecera', 'urgencia', 'tracker']);
  assert.equal(b[1].senal, 'urgencia');
  assert.equal(b[0].opcional, true);
});

test('quita el bloque apagado entero', () => {
  const { html, eliminados } = podar(LAYOUT, new Set(['cabecera', 'tracker']));
  assert.doesNotMatch(html, /\{\{urgencia\}\}/);
  assert.match(html, /\{\{logoHtml\}\}/);
  assert.deepEqual(eliminados, ['urgencia']);
});

test('los marcadores nunca sobreviven al export', () => {
  for (const activos of [new Set(['cabecera', 'urgencia', 'tracker']), new Set(), new Set(['urgencia'])]) {
    const { html } = podar(LAYOUT, activos);
    assert.doesNotMatch(html, /@bloque/, 'un marcador en el fuente delata que el correo es material de simulación');
  }
});

test('el contenido fuera de bloques no se toca nunca', () => {
  const { html } = podar(LAYOUT, new Set());
  assert.match(html, /\{\{cta\}\}/);
  assert.match(html, /<table>/);
});

test('apagar el bloque del tracker es la única forma de perder el píxel', () => {
  assert.match(podar(LAYOUT, new Set(['tracker'])).html, /\{\{\.Tracker\}\}/);
  assert.doesNotMatch(podar(LAYOUT, new Set([])).html, /\{\{\.Tracker\}\}/);
});

test('podar deja las tablas balanceadas', () => {
  const { html } = podar(LAYOUT, new Set(['cabecera']));
  const abre = (html.match(/<tr>/g) || []).length;
  const cierra = (html.match(/<\/tr>/g) || []).length;
  assert.equal(abre, cierra);
});

// ------------------------------------------------------------- anidados ---

const ANIDADO = [
  '<!--@bloque:externo @opcional-->',
  '  A',
  '  <!--@bloque:interno @opcional-->',
  '  B',
  '  <!--@/bloque-->',
  '  C',
  '<!--@/bloque-->',
].join('\n');

test('cortar el bloque de fuera se lleva el de dentro', () => {
  const { html, eliminados } = podar(ANIDADO, new Set(['interno']));
  assert.doesNotMatch(html, /A|B|C/);
  assert.deepEqual(eliminados, ['externo'], 'el interno no se cuenta aparte: ya iba dentro del corte');
});

test('cortar el de dentro deja intacto el de fuera', () => {
  const { html } = podar(ANIDADO, new Set(['externo']));
  assert.match(html, /A/);
  assert.doesNotMatch(html, /B/);
  assert.match(html, /C/);
});

// ------------------------------------------------------- con el resto ---

test('podar antes de render evita avisar de variables que ya no existen', () => {
  const podado = podar(LAYOUT, new Set(['cabecera', 'tracker']));
  const { faltantes } = render(podado.html, { logoHtml: '<img>', cta: 'Pulsa' });
  assert.equal(
    faltantes.includes('urgencia'),
    false,
    'la variable vivía dentro del bloque cortado: avisarla ensuciaría el panel sin motivo'
  );
});

test('un cierre huérfano no rompe la poda', () => {
  const roto = 'antes<!--@/bloque-->despues';
  assert.equal(podar(roto, new Set()).html, 'antesdespues');
});

test('podar acepta una función en vez de un Set', () => {
  const { eliminados } = podar(LAYOUT, (b) => b.id !== 'urgencia');
  assert.deepEqual(eliminados, ['urgencia']);
});

test('podar exige una cadena', () => {
  assert.throws(() => podar(null, new Set()), TypeError);
});
