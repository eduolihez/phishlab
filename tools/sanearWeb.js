/**
 * Saneado de una página web completa, para clonarla como landing.
 *
 * Comparte la mecánica de `sanear.js` (fuera scripts, manejadores de evento,
 * enlaces reescritos) pero difiere en un punto central: `sanear.js` CORTA
 * toda imagen remota, porque en un correo ajeno lo remoto es casi siempre un
 * píxel de rastreo de un tercero. Aquí lo remoto es la imagen de la propia
 * página que se está clonando — el logo, el fondo del login — y perderla
 * arruina justo la fidelidad que se busca. Por eso aquí se INTENTA incrustar
 * cada recurso alcanzable como data URI (o como `<style>` inline, si es una
 * hoja de estilos), y solo se corta lo que de verdad no se puede leer,
 * dejándolo dicho en el informe para corregirlo a mano — nunca en silencio:
 * un recurso que sigue pidiendo al dominio real y nadie se entera es
 * exactamente el mismo fallo que el píxel de seguimiento de un correo.
 *
 * Sirve a los dos caminos de entrada por igual (ver `tools/servidor.js`):
 * el marcador captura la página ya renderizada y hace su propio intento de
 * incrustado en el navegador; pegar una URL hace que sea este módulo, desde
 * el servidor, quien va a buscar cada recurso. En ambos casos lo que llega
 * aquí puede traer restos por incrustar, así que el `resolver` se aplica
 * siempre: a veces el servidor alcanza un recurso que el navegador no pudo
 * (una petición cruzada bloqueada por CORS en el navegador no lo está para
 * un `fetch` de servidor a servidor).
 */

import { quitarEtiqueta, ENTIDADES_PELIGROSAS, envolverEnBloque } from './sanear.js';

const RE_LOGIN_EMAIL = /email|correo|identifier|username|usuario|login/i;
const RE_LOGIN_PASSWORD = /pass|clave|contrasena|contraseña/i;

/**
 * @param {string} html
 * @param {{
 *   urlOrigen?: string,
 *   resolver?: (url: string) => Promise<{ contentType: string, base64: string } | null>,
 * }} [opciones]
 * @returns {Promise<{
 *   html: string,
 *   informe: {clase: string, texto: string}[],
 *   camposLogin: Record<'email'|'password', { confianza: 'alta'|'baja'|'no-detectado' }>,
 * }>}
 */
export async function sanearWeb(html, { urlOrigen = '', resolver = null } = {}) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new TypeError('sanearWeb() necesita HTML: no hay nada que clonar');
  }

  const informe = [];
  const anotar = (clase, texto) => informe.push({ clase, texto });

  let salida = html;

  // 1. Fuera todo lo ejecutable. El JS de la página real no tiene ningún
  // papel en la landing clonada: como mucho reproduciría su comportamiento
  // (validaciones, animaciones de paso a paso), pero corre en un dominio que
  // ya no es el suyo y puede fallar de formas impredecibles.
  salida = quitarEtiqueta(salida, 'script', (n) => n && anotar('quitado', `${n} bloque(s) <script>`));
  salida = quitarEtiqueta(salida, 'noscript', () => {});
  salida = quitarEtiqueta(salida, 'iframe', (n) => n && anotar('quitado', `${n} <iframe>`));
  salida = quitarEtiqueta(salida, 'object', () => {});
  salida = quitarEtiqueta(salida, 'embed', () => {});

  const manejadores = salida.match(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi) ?? [];
  if (manejadores.length) {
    salida = salida.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    anotar('quitado', `${manejadores.length} manejador(es) de evento (onclick, onload…)`);
  }

  // 2. Hojas de estilo externas: se intentan traer como <style> en línea, no
  // se cortan sin más — son las que dan forma a la página que se clona.
  const noInlinados = [];
  let hojasInlinadas = 0;

  salida = await reemplazarAsync(salida, /<link\b[^>]*\brel=["']?stylesheet[^>]*>/gi, async (etiqueta) => {
    const href = etiqueta.match(/\bhref=["']([^"']+)["']/i)?.[1];
    const absoluta = absolutizar(href, urlOrigen);
    const recurso = absoluta ? await intentarResolver(resolver, absoluta) : null;
    if (recurso && esTexto(recurso.contentType)) {
      hojasInlinadas++;
      return `<style>${Buffer.from(recurso.base64, 'base64').toString('utf8')}</style>`;
    }
    if (absoluta) noInlinados.push(absoluta);
    return '';
  });
  if (hojasInlinadas) anotar('incrustado', `${hojasInlinadas} hoja(s) de estilo incrustada(s) en línea`);

  // 3. Imágenes: se intenta incrustar cada una; lo que no se alcanza se deja
  // como estaba y se avisa, en vez de cortarlo (perderías el logo entero).
  let imagenesInlinadas = 0;

  salida = await reemplazarAsync(salida, /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, async (todo, antes, src, despues) => {
    if (/^data:/i.test(src)) return todo;
    const absoluta = absolutizar(src, urlOrigen);
    const recurso = absoluta ? await intentarResolver(resolver, absoluta) : null;
    if (recurso) {
      imagenesInlinadas++;
      return `${antes}data:${recurso.contentType};base64,${recurso.base64}${despues}`;
    }
    if (absoluta) noInlinados.push(absoluta);
    return todo;
  });
  if (imagenesInlinadas) anotar('incrustado', `${imagenesInlinadas} imagen(es) incrustada(s) en base64`);

  // 4. `url(...)` dentro de <style>: fondos e iconos declarados por CSS,
  // habitual en una pantalla de login moderna.
  let fondosInlinados = 0;
  salida = await reemplazarAsync(salida, /<style\b[^>]*>([\s\S]*?)<\/style>/gi, async (todo, css) => {
    const nuevoCss = await reemplazarAsync(css, /url\((["']?)([^"')]+)\1\)/gi, async (m, _q, url) => {
      if (/^data:/i.test(url)) return m;
      const absoluta = absolutizar(url, urlOrigen);
      const recurso = absoluta ? await intentarResolver(resolver, absoluta) : null;
      if (recurso) { fondosInlinados++; return `url(data:${recurso.contentType};base64,${recurso.base64})`; }
      if (absoluta) noInlinados.push(absoluta);
      return m;
    });
    return todo.replace(css, nuevoCss);
  });
  if (fondosInlinados) anotar('incrustado', `${fondosInlinados} imagen(es) de fondo incrustada(s) desde el CSS`);

  if (noInlinados.length) {
    anotar('no-incrustado', `${noInlinados.length} recurso(s) que no se pudieron leer y siguen pidiendo al dominio real: ${[...new Set(noInlinados)].slice(0, 3).join(', ')}${noInlinados.length > 3 ? '…' : ''}`);
  }

  // 5. Enlaces al destino original → {{.URL}}, igual que en un correo.
  let reescritos = 0;
  let anclas = 0;
  salida = salida.replace(/(<a\b[^>]*\bhref=["'])([^"']*)(["'])/gi, (todo, antes, href, cierra) => {
    if (/^\{\{/.test(href)) return todo;
    if (/^(#|mailto:|tel:)/i.test(href)) { anclas++; return todo; }
    if (ENTIDADES_PELIGROSAS.test(href.trim())) { reescritos++; return `${antes}#${cierra}`; }
    reescritos++;
    return `${antes}{{.URL}}${cierra}`;
  });
  if (reescritos) anotar('reescrito', `${reescritos} enlace(s) apuntando ahora a {{.URL}}`);
  if (anclas) anotar('reescrito', `${anclas} enlace(s) internos o mailto: dejados como estaban`);

  // 6. El formulario de login: acción vacía, y los campos de credenciales
  // renombrados a `email`/`password` exactamente así — es como GoPhish los
  // reconoce (ver SECURITY.md). Si la heurística no encuentra un candidato
  // claro, se deja para corregir a mano antes de guardar; el linter no deja
  // pasar una landing de credenciales sin esos dos nombres.
  const { html: conFormulario, camposLogin, cambios } = repararFormulario(salida);
  salida = conFormulario;
  informe.push(...cambios);

  // 7. Como con un correo pegado a mano: entra de una pieza, en un único
  // bloque `cuerpo`. Trocearla en bloques con sentido es trabajo posterior.
  salida = envolverEnBloque(salida);

  return { html: salida, informe, camposLogin };
}

// ------------------------------------------------------------------ forms ---

function repararFormulario(html) {
  const cambios = [];
  let salida = html;

  if (/<form\b/i.test(salida)) {
    salida = salida.replace(/<form\b([^>]*)>/gi, (todo, attrs) => {
      let nuevos = attrs.replace(/\smethod=["'][^"']*["']/i, '').replace(/\saction=["'][^"']*["']/i, '');
      cambios.push({ clase: 'reescrito', texto: 'formulario reescrito a method="post" action=""' });
      return `<form${nuevos} method="post" action="">`;
    });
  }

  const candidatos = [...salida.matchAll(/<input\b([^>]*)>/gi)].map((m) => ({ todo: m[0], attrs: m[1] }));

  const email = elegirCampo(candidatos, 'email', RE_LOGIN_EMAIL);
  const password = elegirCampo(candidatos, 'password', RE_LOGIN_PASSWORD);

  if (email.candidato) {
    salida = salida.replace(email.candidato.todo, renombrarInput(email.candidato.todo, 'email'));
    cambios.push({ clase: 'reescrito', texto: `campo de email detectado (confianza ${email.confianza}) y renombrado a name="email"` });
  }
  if (password.candidato) {
    salida = salida.replace(password.candidato.todo, renombrarInput(password.candidato.todo, 'password'));
    cambios.push({ clase: 'reescrito', texto: `campo de contraseña detectado (confianza ${password.confianza}) y renombrado a name="password"` });
  }
  if (!email.candidato || !password.candidato) {
    cambios.push({ clase: 'no-incrustado', texto: 'no se pudieron identificar los dos campos de credenciales con seguridad: revísalos en el editor antes de guardar' });
  }

  return {
    html: salida,
    camposLogin: {
      email: { confianza: email.confianza },
      password: { confianza: password.confianza },
    },
    cambios,
  };
}

/**
 * La contraseña casi siempre lleva `type="password"`, así que ese único dato
 * ya basta para confianza alta. El email es más variable — muchos primeros
 * pasos de login usan `type="text"` — así que ahí hace falta además mirar el
 * nombre, el id o el autocomplete en busca de una pista, y solo sobre esos
 * tres atributos: comprobar la etiqueta entera haría que `type="password"`
 * (que contiene literalmente "pass") se colara como pista de sí mismo.
 */
function elegirCampo(candidatos, cual, patronPista) {
  if (cual === 'password') {
    const porTipo = candidatos.filter((c) => /\btype=["']password["']/i.test(c.attrs));
    if (porTipo.length === 1) return { candidato: porTipo[0], confianza: 'alta' };
    if (porTipo.length > 1) return { candidato: porTipo[0], confianza: 'baja' };
    return { candidato: null, confianza: 'no-detectado' };
  }

  const porTipo = candidatos.filter((c) => /\btype=["']email["']/i.test(c.attrs));
  if (porTipo.length === 1) return { candidato: porTipo[0], confianza: 'alta' };

  const esCandidatoTexto = (attrs) => /\btype=["'](email|text)["']/i.test(attrs) || !/\btype=["']/i.test(attrs);
  const conPista = (attrs) => ['name', 'id', 'autocomplete']
    .map((atributo) => attrs.match(new RegExp(`\\b${atributo}=["']([^"']*)["']`, 'i'))?.[1] ?? '')
    .some((valor) => patronPista.test(valor));

  const porPista = candidatos.filter((c) => esCandidatoTexto(c.attrs) && conPista(c.attrs));
  if (porPista.length === 1) return { candidato: porPista[0], confianza: 'alta' };
  if (porPista.length > 1) return { candidato: porPista[0], confianza: 'baja' };

  return { candidato: null, confianza: 'no-detectado' };
}

function renombrarInput(etiqueta, nombre) {
  let salida = etiqueta;
  salida = /\bname=["'][^"']*["']/i.test(salida) ? salida.replace(/\bname=["'][^"']*["']/i, `name="${nombre}"`) : salida.replace(/^<input\b/i, `<input name="${nombre}"`);
  salida = /\bid=["'][^"']*["']/i.test(salida) ? salida.replace(/\bid=["'][^"']*["']/i, `id="${nombre}"`) : salida.replace(/^<input\b/i, `<input id="${nombre}"`);
  return salida;
}

// ---------------------------------------------------------------- recursos ---

function absolutizar(url, base) {
  if (!url || !base) return url || null;
  try {
    return new URL(url, base).href;
  } catch {
    return null;
  }
}

async function intentarResolver(resolver, url) {
  if (!resolver) return null;
  try {
    return await resolver(url);
  } catch {
    return null;
  }
}

const esTexto = (contentType) => /^text\/|javascript|json/.test(contentType ?? '');

/** `String.replace` con un reemplazador async, resolviendo en orden. */
async function reemplazarAsync(texto, patron, reemplazador) {
  const coincidencias = [...texto.matchAll(patron)];
  let salida = texto;
  let desplazamiento = 0;
  for (const m of coincidencias) {
    const nuevo = await reemplazador(...m);
    const inicio = m.index + desplazamiento;
    salida = salida.slice(0, inicio) + nuevo + salida.slice(inicio + m[0].length);
    desplazamiento += nuevo.length - m[0].length;
  }
  return salida;
}
