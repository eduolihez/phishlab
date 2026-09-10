/**
 * Pruebas del motor de plantillas.
 *
 * Se ejecutan con `node --test tests/` — sin dependencias. La aplicación no
 * necesita Node para funcionar; esto es solo para desarrollar.
 *
 * Lo que se prueba aquí es lo que falla en silencio: si el motor se come una
 * variable de GoPhish, la campaña sale con el botón roto y no te enteras hasta
 * haber enviado 400 correos.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  render,
  conDatosDeEjemplo,
  variablesGophish,
  construirContexto,
} from '../assets/js/core/engine.js';

test('sustituye nuestras variables', () => {
  const { html } = render('<p>Hola desde {{empresa}}</p>', { empresa: 'ACME' });
  assert.equal(html, '<p>Hola desde ACME</p>');
});

test('deja intactas las variables de GoPhish', () => {
  const entrada = '<a href="{{.URL}}">{{.FirstName}} {{.LastName}}</a>{{.Tracker}}';
  const { html } = render(entrada, { URL: 'NO', FirstName: 'NO' });
  assert.equal(html, entrada, 'GoPhish resuelve las suyas en el envío, no nosotros');
});

test('convive con ambos espacios de nombres en la misma línea', () => {
  const { html } = render('Hola {{.FirstName}}, {{empresa}} te saluda', { empresa: 'ACME' });
  assert.equal(html, 'Hola {{.FirstName}}, ACME te saluda');
});

test('tolera espacios dentro de las llaves de GoPhish', () => {
  const entrada = '<a href="{{ .URL }}">ir</a>';
  const { html } = render(entrada, {});
  assert.equal(html, entrada);
});

// Esta es la regresión que apareció en la primera prueba en navegador: los
// fragmentos de copy son a su vez plantillas, y con una sola pasada el correo
// salía con "{{anios}}" y "{{empresa}}" literales en el cuerpo.
test('resuelve variables anidadas dentro de los fragmentos', () => {
  const ctx = {
    empresa: 'Beltrán',
    anios: '5',
    importe: '100 €',
    entradilla: 'Por tus {{anios}} años en {{empresa}}: {{importe}}',
  };
  const { html, faltantes } = render('<p>{{entradilla}}</p>', ctx);
  assert.equal(html, '<p>Por tus 5 años en Beltrán: 100 €</p>');
  assert.deepEqual(faltantes, []);
});

test('no entra en bucle si dos fragmentos se referencian entre sí', () => {
  const ctx = { a: '{{b}}', b: '{{a}}' };
  const { html } = render('{{a}}', ctx);
  assert.ok(typeof html === 'string', 'debe terminar, aunque el resultado no sirva');
});

test('la cadena vacía es un valor deliberado, no una variable ausente', () => {
  // El nivel difícil de la landing de Microsoft no lleva aviso: debe quedar
  // vacío, no imprimir "{{aviso}}" en la página que ve la víctima.
  const { html, faltantes } = render('<p class="aviso">{{aviso}}</p>', { aviso: '' });
  assert.equal(html, '<p class="aviso"></p>');
  assert.deepEqual(faltantes, []);
});

test('avisa de las variables que no existen y las deja visibles', () => {
  const { html, faltantes } = render('<p>{{noExiste}}</p>', {});
  assert.equal(html, '<p>{{noExiste}}</p>', 'mejor un hueco evidente que una frase rota');
  assert.deepEqual(faltantes, ['noExiste']);
});

test('los datos de ejemplo son solo para la vista previa', () => {
  const entrada = 'Hola {{.FirstName}}, entra en {{.URL}}';
  assert.equal(conDatosDeEjemplo(entrada), 'Hola María, entra en #');
  assert.equal(render(entrada, {}).html, entrada, 'la exportación nunca los aplica');
});

test('el píxel de seguimiento desaparece en la vista previa', () => {
  assert.equal(conDatosDeEjemplo('<p>fin</p>{{.Tracker}}'), '<p>fin</p>');
});

test('lista las variables de GoPhish sin repetir', () => {
  const vars = variablesGophish('{{.URL}} {{.URL}} {{ .Tracker }} {{empresa}}');
  assert.deepEqual(vars.sort(), ['{{.Tracker}}', '{{.URL}}']);
});

test('los campos de campaña pisan a los fragmentos, y estos a la marca', () => {
  const ctx = construirContexto({
    marca: { valor: 'marca', empresa: 'ACME' },
    fragmentos: { valor: 'fragmento' },
    campos: { valor: 'campo' },
  });
  assert.equal(ctx.valor, 'campo');
  assert.equal(ctx.empresa, 'ACME');
});

test('rechaza entradas que no sean cadenas', () => {
  assert.throws(() => render(null, {}), TypeError);
});
