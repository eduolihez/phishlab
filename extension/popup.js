const elEstado = document.getElementById('estado');
const elAviso = document.getElementById('aviso');
const campoCodigo = document.getElementById('codigo');
const campoPuerto = document.getElementById('puerto');
const avisoGuardado = document.getElementById('guardado');
const elAjustes = document.getElementById('ajustes');
const btnCapturar = document.getElementById('btn-capturar');
const btnAuto = document.getElementById('btn-auto');
const btnDetener = document.getElementById('btn-detener');
const btnEnviar = document.getElementById('btn-enviar');
const btnDescartar = document.getElementById('btn-descartar');

btnCapturar.addEventListener('click', () => ejecutar({ tipo: 'capturar-paso' }));
btnAuto.addEventListener('click', iniciarAutopiloto);
btnDetener.addEventListener('click', detenerAutopiloto);
btnEnviar.addEventListener('click', () => ejecutar({ tipo: 'enviar-sesion' }));
btnDescartar.addEventListener('click', () => ejecutar({ tipo: 'descartar-sesion' }));

document.getElementById('btn-guardar-ajustes').addEventListener('click', async () => {
  await chrome.storage.local.set({
    codigoPareado: campoCodigo.value.trim(),
    puerto: Number(campoPuerto.value) || 8080,
  });
  avisoGuardado.textContent = 'Guardado.';
  setTimeout(() => { avisoGuardado.textContent = ''; }, 2000);
});

cargarAjustes();
actualizarEstado();

async function cargarAjustes() {
  const { codigoPareado, puerto } = await chrome.storage.local.get(['codigoPareado', 'puerto']);
  if (codigoPareado) campoCodigo.value = codigoPareado;
  else elAjustes.open = true; // sin código todavía: abre los ajustes para que salte a la vista
  if (puerto) campoPuerto.value = puerto;
}

async function iniciarAutopiloto() {
  ponerModoAutopiloto(true);
  // Polling ligero mientras corre: sin esto el texto se queda clavado en
  // "Capturando flujo…" hasta el final entero, sin dar pista de cuántos
  // pasos lleva ya — justo la información que hace falta para decidir
  // cuándo pulsar "Detener".
  const intervalo = setInterval(actualizarEstado, 1000);
  await ejecutar({ tipo: 'capturar-flujo-automatico' }, 'Capturando flujo…');
  clearInterval(intervalo);
  ponerModoAutopiloto(false);
}

async function detenerAutopiloto() {
  btnDetener.disabled = true;
  await chrome.runtime.sendMessage({ tipo: 'detener-flujo-automatico' });
  // btnDetener se vuelve a ocultar cuando iniciarAutopiloto() reciba la
  // respuesta del bucle principal, no aquí: parar es solo avisar, el propio
  // bucle en background.js tarda hasta el final del paso en curso en notarlo.
}

function ponerModoAutopiloto(activo) {
  btnCapturar.disabled = activo;
  btnAuto.disabled = activo;
  btnEnviar.disabled = activo;
  btnDescartar.disabled = activo;
  btnDetener.hidden = !activo;
  btnDetener.disabled = false;
}

async function ejecutar(mensaje, textoEnCurso) {
  elAviso.textContent = '';
  if (textoEnCurso) elEstado.textContent = textoEnCurso;
  const respuesta = await chrome.runtime.sendMessage(mensaje);
  if (respuesta?.error) {
    elAviso.style.color = '#E5484D';
    elAviso.textContent = respuesta.error;
  } else if (mensaje.tipo === 'enviar-sesion') {
    elAviso.style.color = '#3FB950';
    elAviso.textContent = `Enviado (${respuesta.recibidos} paso${respuesta.recibidos === 1 ? '' : 's'}).`;
  }
  await actualizarEstado();
}

async function actualizarEstado() {
  const respuesta = await chrome.runtime.sendMessage({ tipo: 'estado-sesion' });
  const pasos = respuesta?.pasos ?? [];
  elEstado.textContent = pasos.length === 0
    ? 'Sin capturar'
    : `${pasos.length} paso${pasos.length === 1 ? '' : 's'} capturado${pasos.length === 1 ? '' : 's'}`;

  // Cubre el caso de reabrir el popup mientras el autopiloto seguía
  // corriendo desde una apertura anterior — el estado real vive en
  // background.js, no en este popup, que puede haberse cerrado y reabierto.
  ponerModoAutopiloto(Boolean(respuesta?.autopilotoEnMarcha));
}
