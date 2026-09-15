/**
 * Content script del autopiloto de captura.
 *
 * Se inyecta después de cada captura, cuando el usuario pulsa "Capturar
 * flujo automático" en el popup en vez de ir pulsando "Capturar paso" a mano
 * en cada pantalla de un login de varios pasos. Rellena con datos genéricos
 * cualquier campo de email/contraseña que detecte (misma heurística que
 * `tools/sanearWeb.js` usa en el servidor para renombrar esos campos a
 * `email`/`password`) y envía el formulario, para que la página real avance
 * a la siguiente pantalla sola.
 *
 * No intenta autenticar de verdad — los datos son inventados a propósito
 * (`test@dominio.com` / `Test1234!`). Sirve para atravesar la validación de
 * "rellena este campo" del lado del cliente que casi todo formulario de
 * login tiene antes de dejar pulsar "Siguiente"; si el sitio valida la
 * cuenta contra su base de datos del lado del servidor, sencillamente no
 * avanzará — este script lo detecta (nada cambia en la página) y
 * `background.js` para el bucle ahí, sin insistir a ciegas.
 */
(function () {
  const EMAIL_GENERICO = 'test@dominio.com';
  const PASSWORD_GENERICO = 'Test1234!';

  const RE_EMAIL = /email|correo|identifier|username|usuario|login/i;
  const RE_PASSWORD = /pass|clave|contrasena|contraseña/i;
  const RE_BOTON_AVANZAR = /iniciar sesión|entrar|acceder|siguiente|continuar|sign in|log in|next|continue/i;

  function esVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const estilo = getComputedStyle(el);
    return estilo.display !== 'none' && estilo.visibility !== 'hidden';
  }

  function rellenar(campo, valor) {
    const prototipo = Object.getPrototypeOf(campo);
    const descriptor = Object.getOwnPropertyDescriptor(prototipo, 'value');
    // Asignar `campo.value` a secas no dispara los listeners de frameworks
    // como React, que interceptan el setter nativo del input — hay que
    // llamar al setter original del prototipo para que el evento 'input'
    // que sigue sí lleve el valor nuevo cuando el framework lo relea.
    descriptor.set.call(campo, valor);
    campo.dispatchEvent(new Event('input', { bubbles: true }));
    campo.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function tieneAlgunaPista(campo, patron) {
    return ['name', 'id', 'autocomplete', 'placeholder']
      .map((attr) => campo.getAttribute(attr) ?? '')
      .some((valor) => patron.test(valor));
  }

  const candidatos = [...document.querySelectorAll('input')].filter(esVisible);

  // `input.type` siempre devuelve una cadena normalizada ('text' si no hay
  // atributo type o si el navegador no reconoce el valor) — nunca undefined.
  const camposPassword = candidatos.filter((c) => c.type === 'password');
  const camposEmail = candidatos.filter((c) => (c.type === 'text' || c.type === 'email')
    && (c.type === 'email' || tieneAlgunaPista(c, RE_EMAIL)));

  let rellenados = 0;
  for (const campo of camposEmail) { rellenar(campo, EMAIL_GENERICO); rellenados++; }
  for (const campo of camposPassword) { rellenar(campo, PASSWORD_GENERICO); rellenados++; }

  if (rellenados === 0) {
    return { avanzado: false, razon: 'sin campos de email/contraseña detectados en esta pantalla' };
  }

  // El botón de envío: dentro del mismo <form> si lo hay, o el botón visible
  // más parecido a "continuar" en toda la página si el sitio no usa <form>
  // (habitual en pantallas montadas con JavaScript puro).
  const formulario = camposPassword[0]?.closest('form') ?? camposEmail[0]?.closest('form');
  const botonesForm = formulario ? [...formulario.querySelectorAll('button, input[type="submit"]')] : [];
  const botonesPagina = [...document.querySelectorAll('button, input[type="submit"]')].filter(esVisible);

  const boton = botonesForm.find(esVisible)
    ?? botonesPagina.find((b) => RE_BOTON_AVANZAR.test(b.textContent || b.value || ''))
    ?? botonesPagina[0];

  if (!boton) {
    if (formulario) {
      formulario.requestSubmit ? formulario.requestSubmit() : formulario.submit();
      return { avanzado: true };
    }
    return { avanzado: false, razon: 'campos rellenados pero no se encontró ningún botón para enviar' };
  }

  boton.click();
  return { avanzado: true };
})();
