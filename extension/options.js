const campoCodigo = document.getElementById('codigo');
const campoPuerto = document.getElementById('puerto');
const avisoGuardado = document.getElementById('guardado');

chrome.storage.local.get(['codigoPareado', 'puerto']).then(({ codigoPareado, puerto }) => {
  if (codigoPareado) campoCodigo.value = codigoPareado;
  if (puerto) campoPuerto.value = puerto;
});

document.getElementById('guardar').addEventListener('click', async () => {
  await chrome.storage.local.set({
    codigoPareado: campoCodigo.value.trim(),
    puerto: Number(campoPuerto.value) || 8080,
  });
  avisoGuardado.textContent = 'Guardado.';
  setTimeout(() => { avisoGuardado.textContent = ''; }, 2000);
});
