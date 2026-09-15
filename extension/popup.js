const elEstado = document.getElementById('estado');
const elAviso = document.getElementById('aviso');
const campoCodigo = document.getElementById('codigo');
const campoPuerto = document.getElementById('puerto');
const avisoGuardado = document.getElementById('guardado');
const elAjustes = document.getElementById('ajustes');

document.getElementById('btn-capturar').addEventListener('click', () => ejecutar({ tipo: 'capturar-paso' }));
document.getElementById('btn-auto').addEventListener('click', () => ejecutar({ tipo: 'capturar-flujo-automatico' }, 'Capturando flujo…'));
document.getElementById('btn-enviar').addEventListener('click', () => ejecutar({ tipo: 'enviar-sesion' }));
document.getElementById('btn-descartar').addEventListener('click', () => ejecutar({ tipo: 'descartar-sesion' }));

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
}
