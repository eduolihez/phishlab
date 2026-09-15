const elEstado = document.getElementById('estado');
const elAviso = document.getElementById('aviso');

document.getElementById('btn-capturar').addEventListener('click', () => ejecutar({ tipo: 'capturar-paso' }));
document.getElementById('btn-enviar').addEventListener('click', () => ejecutar({ tipo: 'enviar-sesion' }));
document.getElementById('btn-descartar').addEventListener('click', () => ejecutar({ tipo: 'descartar-sesion' }));

actualizarEstado();

async function ejecutar(mensaje) {
  elAviso.textContent = '';
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
