/**
 * Pruebas del saneado de webs clonadas.
 *
 * A diferencia del saneado de `.eml` (que corta toda imagen remota porque en
 * un correo ajeno eso es casi siempre un píxel de rastreo), aquí lo remoto es
 * el logo o el fondo de la propia página que se clona: el fallo caro es
 * distinto — no perder la imagen en silencio, sino dejar sin avisar un
 * recurso que sigue pidiendo al dominio real. El otro fallo caro es propio de
 * este módulo: que la heurística de campos de login falle callada y la
 * plantilla salga sin `name="password"` exacto, que es como GoPhish lo
 * reconoce.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanearWeb } from '../tools/sanearWeb.js';

const PIXEL_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function resolverDePrueba(alcanzables = {}) {
  return async (url) => {
    if (url in alcanzables) return alcanzables[url];
    return null;
  };
}

const LOGIN_BASICO = `<!doctype html><html><head>
<link rel="stylesheet" href="https://ejemplo.example/estilos.css">
<script>ga('send','pageview')</script>
</head><body onload="track()">
<img src="https://ejemplo.example/logo.png" alt="logo">
<img src="https://cdn.rastreador.example/no-existe.png" alt="roto">
<form action="https://ejemplo.example/login" onsubmit="return validar()">
  <input type="email" name="identifier" autocomplete="username">
  <input type="password" name="pw">
  <button type="submit">Entrar</button>
</form>
<a href="https://ejemplo.example/recuperar">¿Olvidaste tu contraseña?</a>
<a href="#ayuda">Ayuda</a>
</body></html>`;

test('sanearWeb quita scripts y manejadores de evento', async () => {
  const { html } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login' });
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /onload=/i);
  assert.doesNotMatch(html, /onsubmit=/i);
});

test('incrusta la imagen alcanzable y dice cuál no se pudo leer', async () => {
  const resolver = resolverDePrueba({
    'https://ejemplo.example/logo.png': { contentType: 'image/png', base64: PIXEL_PNG_B64 },
  });
  const { html, informe } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login', resolver });

  assert.ok(html.includes(`src="data:image/png;base64,${PIXEL_PNG_B64}"`), 'la imagen alcanzable debería quedar incrustada en base64');
  assert.match(html, /src="https:\/\/cdn\.rastreador\.example\/no-existe\.png"/, 'lo que no se pudo leer se queda como estaba, no se corta en silencio');
  assert.ok(informe.some((l) => l.clase === 'no-incrustado' && l.texto.includes('cdn.rastreador.example')));
});

test('incrusta la hoja de estilos externa como <style> en línea', async () => {
  const resolver = resolverDePrueba({
    'https://ejemplo.example/estilos.css': { contentType: 'text/css', base64: Buffer.from('body{color:red}').toString('base64') },
  });
  const { html } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login', resolver });

  assert.doesNotMatch(html, /<link\b[^>]*stylesheet/i);
  assert.match(html, /<style>body\{color:red\}<\/style>/);
});

test('una hoja de estilos que ya llega como data: URI se conserva tal cual, sin resolver ni recortar', async () => {
  // Así llega desde la extensión: ya incrustó el CSS ella misma (con las
  // cookies de la pestaña, sin CORS) antes de mandarlo al servidor, así que
  // aquí no hay nada que resolver — pero sin este caso, el saneado la
  // trataba como cualquier <link> sin resolver y la borraba entera.
  const conCssIncrustado = `<!doctype html><html><head>
<link rel="stylesheet" href="data:text/css;base64,${Buffer.from('body{color:red}').toString('base64')}">
</head><body>hola</body></html>`;

  const { html } = await sanearWeb(conCssIncrustado, { urlOrigen: 'https://ejemplo.example/login', resolver: null });

  assert.match(html, /<link\b[^>]*rel="stylesheet"[^>]*href="data:text\/css;base64,/, 'el <link> con CSS ya incrustado no debería borrarse');
});

test('reescribe los enlaces al destino original y deja las anclas', async () => {
  const { html } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login' });
  assert.doesNotMatch(html, /ejemplo\.example\/recuperar/);
  assert.match(html, /href="\{\{\.URL\}\}"/);
  assert.match(html, /href="#ayuda"/);
});

test('el formulario queda con method post y action vacía', async () => {
  const { html } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login' });
  assert.match(html, /<form[^>]*method="post"/);
  assert.match(html, /<form[^>]*action=""/);
  assert.doesNotMatch(html, /ejemplo\.example\/login"/);
});

test('detecta los dos campos de login con confianza alta cuando no hay ambigüedad', async () => {
  const { html, camposLogin } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login' });
  assert.equal(camposLogin.email.confianza, 'alta');
  assert.equal(camposLogin.password.confianza, 'alta');
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
});

test('sin ningún candidato de login, lo dice como no detectado en vez de adivinar', async () => {
  const sinFormulario = '<html><body><p>Página sin login</p></body></html>';
  const { camposLogin, informe } = await sanearWeb(sinFormulario, { urlOrigen: 'https://ejemplo.example/' });
  assert.equal(camposLogin.email.confianza, 'no-detectado');
  assert.equal(camposLogin.password.confianza, 'no-detectado');
  assert.ok(informe.some((l) => l.clase === 'no-incrustado' && l.texto.includes('no se pudieron identificar')));
});

test('varios candidatos de password sin pista clara bajan la confianza en vez de fallar', async () => {
  const dosPasswords = `<html><body><form>
    <input type="password" name="pass1">
    <input type="password" name="pass2">
  </form></body></html>`;
  const { camposLogin } = await sanearWeb(dosPasswords, { urlOrigen: 'https://ejemplo.example/' });
  assert.equal(camposLogin.password.confianza, 'baja');
});

test('envuelve el cuerpo entero en un único bloque, como el HTML pegado a mano', async () => {
  const { html } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login' });
  assert.match(html, /<!--@bloque:cuerpo-->/);
  assert.match(html, /<!--@\/bloque-->/);
});

test('sin resolver, ninguna imagen se pierde: se dejan todas como estaban', async () => {
  const { html, informe } = await sanearWeb(LOGIN_BASICO, { urlOrigen: 'https://ejemplo.example/login' });
  assert.match(html, /src="https:\/\/ejemplo\.example\/logo\.png"/);
  assert.ok(informe.some((l) => l.clase === 'no-incrustado'));
});

test('sanearWeb se niega con un cuerpo vacío en vez de reventar más adelante', async () => {
  await assert.rejects(() => sanearWeb(null), TypeError);
  await assert.rejects(() => sanearWeb('   '), TypeError);
});

test('incrusta el <source srcset> de un <picture> con marcador de carga diferida', async () => {
  // Patrón real visto en clonados de sitios con lazy-loading (p.ej. Correos):
  // el <img> de dentro trae un src="data:," vacío a propósito porque el JS
  // real de la página lo rellena leyendo el <source> que corresponda según
  // el viewport. Sin ese JS (que sanearWeb quita), la imagen se queda en
  // blanco si no se resuelve también el <source>, no solo el <img>.
  const conPicture = `<!doctype html><html><body>
<picture>
  <source media="(min-width: 1200px)" srcset="/img/hero-grande.jpg">
  <source media="(max-width: 640px)" srcset="/img/hero-pequena.jpg">
  <img src="data:," alt="hero">
</picture>
</body></html>`;

  const resolver = resolverDePrueba({
    'https://ejemplo.example/img/hero-grande.jpg': { contentType: 'image/jpeg', base64: PIXEL_PNG_B64 },
    'https://ejemplo.example/img/hero-pequena.jpg': { contentType: 'image/jpeg', base64: PIXEL_PNG_B64 },
  });
  const { html, informe } = await sanearWeb(conPicture, { urlOrigen: 'https://ejemplo.example/login', resolver });

  assert.doesNotMatch(html, /srcset="\/img/, 'el srcset relativo original no debería sobrevivir');
  assert.match(html, /srcset="data:image\/jpeg;base64,/, 'el <source> debería quedar incrustado en base64');
  assert.match(html, /<img src="data:image\/jpeg;base64,[^"]*" alt="hero">/, 'el <img> de respaldo, vacío a propósito en el original, también debería rellenarse con un embebido para que nunca se quede en blanco');
  assert.ok(informe.some((l) => l.clase === 'incrustado' && l.texto.includes('picture')));
});
