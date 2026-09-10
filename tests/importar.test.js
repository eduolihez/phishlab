/**
 * Pruebas del parser de .eml y del saneado.
 *
 * Aquí entra material que viene de fuera, así que las pruebas van sobre lo que
 * de verdad hace daño: un script que sobrevive, un píxel del remitente
 * original que se queda dentro y acaba avisando a un tercero cada vez que un
 * empleado abre la simulación, o un enlace que sigue apuntando al sitio real y
 * deja la campaña sin medir nada.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsearEml } from '../tools/eml.js';
import { sanear } from '../tools/sanear.js';

// -------------------------------------------------------------------- eml ---

/** Monta un .eml con las convenciones que trae un correo corporativo real. */
function construirEml({ asunto, de, partes, boundary = 'FRONTERA_Aa1' }) {
  const cabeza = [
    `From: ${de}`,
    'To: maria.garcia@cliente.example',
    `Subject: ${asunto}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; boundary="${boundary}"`,
    '',
  ];
  const cuerpo = partes.flatMap((p) => [`--${boundary}`, ...p.cabeceras, '', p.cuerpo]);
  return Buffer.from([...cabeza, ...cuerpo, `--${boundary}--`, ''].join('\r\n'), 'latin1');
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('decodifica un asunto RFC 2047 en base64', () => {
  const eml = construirEml({
    asunto: '=?UTF-8?B?U3UgZmFjdHVyYSB5YSBlc3TDoSBhcXXDrQ==?=',
    de: 'Facturacion <facturacion@ejemplo.example>',
    partes: [{ cabeceras: ['Content-Type: text/html; charset=UTF-8'], cuerpo: '<p>hola</p>' }],
  });
  assert.equal(parsearEml(eml).asunto, 'Su factura ya está aquí');
});

test('decodifica un remitente con nombre codificado', () => {
  const eml = construirEml({
    asunto: 'x',
    de: '=?UTF-8?B?RmFjdHVyYWNpw7Nu?= <facturacion@ejemplo.example>',
    partes: [{ cabeceras: ['Content-Type: text/html'], cuerpo: '<p>hola</p>' }],
  });
  const { remitente } = parsearEml(eml);
  assert.equal(remitente.nombre, 'Facturación');
  assert.equal(remitente.direccion, 'facturacion@ejemplo.example');
});

test('el boundary distingue mayúsculas', () => {
  // Bajar el Content-Type entero a minúsculas hacía que "--FRONTERA" no
  // encajase con "--frontera": el multipart se quedaba sin partes y el correo
  // entraba vacío, sin un solo error por consola.
  const eml = construirEml({
    asunto: 'x',
    de: 'a@b.example',
    boundary: 'MiFronteraCoNMayUsculas',
    partes: [{ cabeceras: ['Content-Type: text/html'], cuerpo: '<p>encontrado</p>' }],
  });
  assert.match(parsearEml(eml).html, /encontrado/);
});

test('decodifica una parte en base64', () => {
  const eml = construirEml({
    asunto: 'x',
    de: 'a@b.example',
    partes: [{
      cabeceras: ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64'],
      cuerpo: b64('<p>acentuación completa: ñ á ü</p>'),
    }],
  });
  assert.match(parsearEml(eml).html, /acentuación completa: ñ á ü/);
});

test('decodifica quoted-printable con cortes de línea', () => {
  const eml = construirEml({
    asunto: 'x',
    de: 'a@b.example',
    partes: [{
      cabeceras: ['Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: quoted-printable'],
      cuerpo: '<p>renovaci=C3=B3n pendi=\r\nente</p>',
    }],
  });
  assert.match(parsearEml(eml).html, /renovación pendiente/);
});

test('recoge las imágenes adjuntas por Content-ID', () => {
  const eml = construirEml({
    asunto: 'x',
    de: 'a@b.example',
    partes: [
      { cabeceras: ['Content-Type: text/html'], cuerpo: '<img src="cid:logo@1">' },
      { cabeceras: ['Content-Type: image/png', 'Content-Transfer-Encoding: base64', 'Content-ID: <logo@1>'], cuerpo: b64('PNG') },
    ],
  });
  const { imagenes } = parsearEml(eml);
  assert.ok(imagenes.get('logo@1')?.startsWith('data:image/png;base64,'));
});

test('despliega una cabecera partida en varias líneas', () => {
  const eml = Buffer.from([
    'From: a@b.example',
    'Subject: primera parte',
    ' y continuación',
    'Content-Type: text/html',
    '',
    '<p>x</p>',
  ].join('\r\n'), 'latin1');
  assert.equal(parsearEml(eml).asunto, 'primera parte y continuación');
});

// ----------------------------------------------------------------- sanear ---

const SUCIO = `<html><head>
<link rel="stylesheet" href="https://cdn.ejemplo.example/x.css">
</head><body onload="alert(1)">
<img src="cid:logo1" width="120">
<p>Pulsa <a href="https://portal-real.example/factura/993" onclick="track()">aquí</a>.</p>
<a href="javascript:robar()">y aquí</a>
<a href="#seccion">ancla</a>
<script>console.log('malo')</script>
<img src="https://track.ejemplo.example/px.gif?id=99" width="1" height="1">
</body></html>`;

const saneado = () => sanear(SUCIO, { tipo: 'emails', imagenes: new Map([['logo1', 'data:image/png;base64,AAA']]) });

test('quita los scripts', () => {
  assert.doesNotMatch(saneado().html, /<script/i);
});

test('quita los manejadores de evento', () => {
  const { html } = saneado();
  assert.doesNotMatch(html, /onload=/i);
  assert.doesNotMatch(html, /onclick=/i);
});

test('quita el píxel de seguimiento del remitente original', () => {
  // Es el fallo más caro de todos: si se queda, cada empleado que abra tu
  // simulación se lo está notificando a un tercero.
  assert.doesNotMatch(saneado().html, /track\.ejemplo\.example/);
});

test('incrusta las imágenes que venían adjuntas', () => {
  assert.match(saneado().html, /src="data:image\/png;base64,AAA"/);
});

test('reescribe los enlaces al destino original', () => {
  const { html } = saneado();
  assert.doesNotMatch(html, /portal-real\.example/, 'el botón llevaría al sitio auténtico y la campaña no mediría nada');
  assert.match(html, /\{\{\.URL\}\}/);
});

test('neutraliza un href javascript:', () => {
  assert.doesNotMatch(saneado().html, /javascript:/i);
});

test('deja las anclas internas como estaban', () => {
  assert.match(saneado().html, /href="#seccion"/);
});

test('quita las hojas de estilo externas', () => {
  assert.doesNotMatch(saneado().html, /cdn\.ejemplo\.example/);
});

test('añade el tracker si el correo no lo trae', () => {
  assert.match(saneado().html, /\{\{\.Tracker\}\}/);
});

test('no añade un segundo tracker si ya había uno', () => {
  const { html } = sanear('<html><body><p>x</p>{{.Tracker}}</body></html>', { tipo: 'emails' });
  assert.equal((html.match(/\{\{\.Tracker\}\}/g) ?? []).length, 1);
});

test('envuelve el cuerpo en un bloque para que se pueda podar', () => {
  const { html } = saneado();
  assert.match(html, /<!--@bloque:cuerpo-->/);
  assert.match(html, /<!--@\/bloque-->/);
});

test('el informe dice todo lo que se ha tocado', () => {
  const { informe } = saneado();
  assert.ok(informe.length >= 5, 'importar a ciegas es lo que hace que se cuele un píxel ajeno');
  assert.ok(informe.every((l) => l.clase && l.texto));
});

test('una landing conserva su formulario', () => {
  const { html } = sanear('<html><body><form method="post"><input name="password"></form></body></html>', { tipo: 'landings' });
  assert.match(html, /<form/, 'sin formulario la landing no captura nada');
  assert.match(html, /name="password"/);
});

test('un correo pierde el formulario, que ahí no pinta nada', () => {
  const { html } = sanear('<html><body><form method="post"><input name="x"></form></body></html>', { tipo: 'emails' });
  assert.doesNotMatch(html, /<form/);
});

test('sanear se niega con un cuerpo vacío en vez de reventar más adelante', () => {
  assert.throws(() => sanear(null), TypeError);
  assert.throws(() => sanear('   '), TypeError);
});
