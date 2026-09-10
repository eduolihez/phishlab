/**
 * Marca del cliente: logo, color y presets.
 *
 * El logo se incrusta como data URI. Esa es la diferencia con las plantillas
 * heredadas, que apuntaban a imágenes por http:// y se rompían en cuanto el
 * servidor de origen cambiaba, o peor, avisaban al dominio real de que
 * alguien estaba abriendo el correo.
 */

const CLAVE_PRESETS = 'phishlab.presets';
const CLAVE_ESTADO = 'phishlab.estado';

export const MARCA_VACIA = {
  empresa: '',
  sector: '',
  dominio: '',
  color: '#0067b8',
  logo: '',
  firma: '',
};

/**
 * Lee un fichero de imagen y lo devuelve como data URI, redimensionado si hace
 * falta. Un logo corporativo de 2 MB inflaría cada correo enviado.
 * @param {File} fichero
 * @returns {Promise<string>}
 */
export function logoADataUri(fichero, anchoMaximo = 320) {
  return new Promise((resolve, reject) => {
    if (!fichero.type.startsWith('image/')) {
      reject(new Error('El fichero no es una imagen'));
      return;
    }
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer el fichero'));
    lector.onload = () => {
      const origen = String(lector.result);
      // El SVG se deja tal cual: es vectorial y ya pesa poco.
      if (fichero.type === 'image/svg+xml') {
        resolve(origen);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
      img.onload = () => {
        if (img.width <= anchoMaximo) {
          resolve(origen);
          return;
        }
        const escala = anchoMaximo / img.width;
        const lienzo = document.createElement('canvas');
        lienzo.width = anchoMaximo;
        lienzo.height = Math.round(img.height * escala);
        const ctx = lienzo.getContext('2d');
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolve(lienzo.toDataURL('image/png'));
      };
      img.src = origen;
    };
    lector.readAsDataURL(fichero);
  });
}

/**
 * Extrae el color dominante de un logo para proponerlo como color corporativo.
 * Ignora píxeles transparentes, casi blancos y casi negros: el color de marca
 * nunca es el fondo ni el texto.
 * @param {string} dataUri
 * @returns {Promise<string|null>} color en formato #rrggbb
 */
export function colorDominante(dataUri) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const lienzo = document.createElement('canvas');
        const lado = 60;
        lienzo.width = lado;
        lienzo.height = lado;
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, lado, lado);
        const { data } = ctx.getImageData(0, 0, lado, lado);

        const cubos = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
          if (a < 200) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max > 240 && min > 240) continue; // casi blanco
          if (max < 40) continue; // casi negro
          if (max - min < 20) continue; // gris sin identidad
          const clave = `${r >> 4},${g >> 4},${b >> 4}`;
          const acc = cubos.get(clave) ?? { r: 0, g: 0, b: 0, n: 0 };
          acc.r += r;
          acc.g += g;
          acc.b += b;
          acc.n++;
          cubos.set(clave, acc);
        }
        if (!cubos.size) {
          resolve(null);
          return;
        }
        const mejor = [...cubos.values()].sort((a, b) => b.n - a.n)[0];
        resolve(aHex(mejor.r / mejor.n, mejor.g / mejor.n, mejor.b / mejor.n));
      } catch {
        resolve(null); // getImageData puede fallar; no es motivo para romper el flujo
      }
    };
    img.src = dataUri;
  });
}

function aHex(r, g, b) {
  const c = (v) => Math.round(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Oscurece un color para estados hover y bordes. */
export function oscurecer(hex, factor = 0.82) {
  const m = /^#?([\da-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return aHex(((n >> 16) & 255) * factor, ((n >> 8) & 255) * factor, (n & 255) * factor);
}

/** Elige texto negro o blanco según el contraste con el fondo. */
export function textoSobre(hex) {
  const m = /^#?([\da-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#ffffff';
}

// --- Presets de cliente -----------------------------------------------------

export function listarPresets() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PRESETS) || '{}');
  } catch {
    return {};
  }
}

export function guardarPreset(nombre, marca) {
  const presets = listarPresets();
  presets[nombre] = { ...marca };
  localStorage.setItem(CLAVE_PRESETS, JSON.stringify(presets));
}

export function borrarPreset(nombre) {
  const presets = listarPresets();
  delete presets[nombre];
  localStorage.setItem(CLAVE_PRESETS, JSON.stringify(presets));
}

export function guardarEstado(estado) {
  try {
    localStorage.setItem(CLAVE_ESTADO, JSON.stringify(estado));
  } catch {
    /* cuota llena por un logo grande: no es motivo para interrumpir el trabajo */
  }
}

export function leerEstado() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null');
  } catch {
    return null;
  }
}
