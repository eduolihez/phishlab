import { telemetriaActiva, activarTelemetria } from './telemetry.js';

const campoCodigo = document.getElementById('codigo');
const campoPuerto = document.getElementById('puerto');
const campoTelemetria = document.getElementById('telemetria');
const avisoGuardado = document.getElementById('guardado');

chrome.storage.local.get(['codigoPareado', 'puerto']).then(({ codigoPareado, puerto }) => {
  if (codigoPareado) campoCodigo.value = codigoPareado;
  if (puerto) campoPuerto.value = puerto;
});
telemetriaActiva().then((activa) => { campoTelemetria.checked = activa; });

document.getElementById('guardar').addEventListener('click', async () => {
  await chrome.storage.local.set({
    codigoPareado: campoCodigo.value.trim(),
    puerto: Number(campoPuerto.value) || 8080,
  });
  await activarTelemetria(campoTelemetria.checked);
  avisoGuardado.textContent = 'Guardado.';
  setTimeout(() => { avisoGuardado.textContent = ''; }, 2000);
});
