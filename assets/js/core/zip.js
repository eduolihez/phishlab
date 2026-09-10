/**
 * Generador de ZIP sin dependencias, método STORE (sin comprimir).
 *
 * Se implementa a mano en lugar de traer JSZip por CDN porque el dashboard
 * tiene que funcionar en una red aislada, sin salida a internet.
 *
 * STORE basta: son unos pocos ficheros HTML de pocos KB y el destinatario
 * es el Explorador de Windows, que lo abre igual.
 */

const tablaCrc = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = tablaCrc[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Fecha y hora en el formato MS-DOS que exige la especificación ZIP. */
function fechaDos(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const fecha = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, fecha };
}

class Escritor {
  constructor() {
    this.partes = [];
    this.longitud = 0;
  }
  bytes(u8) {
    this.partes.push(u8);
    this.longitud += u8.length;
  }
  u16(v) {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff]));
  }
  u32(v) {
    this.bytes(new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]));
  }
  blob() {
    return new Blob(this.partes, { type: 'application/zip' });
  }
}

/**
 * @param {Array<{nombre: string, contenido: string}>} ficheros
 * @returns {Blob}
 */
export function crearZip(ficheros) {
  const codificador = new TextEncoder();
  const { hora, fecha } = fechaDos();
  const salida = new Escritor();
  const entradas = [];

  for (const f of ficheros) {
    const nombre = codificador.encode(f.nombre);
    const datos = codificador.encode(f.contenido);
    const crc = crc32(datos);
    const desplazamiento = salida.longitud;

    // Cabecera local
    salida.u32(0x04034b50);
    salida.u16(20); // versión mínima
    salida.u16(0x0800); // nombres en UTF-8
    salida.u16(0); // método STORE
    salida.u16(hora);
    salida.u16(fecha);
    salida.u32(crc);
    salida.u32(datos.length);
    salida.u32(datos.length);
    salida.u16(nombre.length);
    salida.u16(0);
    salida.bytes(nombre);
    salida.bytes(datos);

    entradas.push({ nombre, crc, tam: datos.length, desplazamiento });
  }

  // Directorio central
  const inicioDirectorio = salida.longitud;
  for (const e of entradas) {
    salida.u32(0x02014b50);
    salida.u16(20); // versión que lo creó
    salida.u16(20); // versión mínima
    salida.u16(0x0800);
    salida.u16(0);
    salida.u16(hora);
    salida.u16(fecha);
    salida.u32(e.crc);
    salida.u32(e.tam);
    salida.u32(e.tam);
    salida.u16(e.nombre.length);
    salida.u16(0); // extra
    salida.u16(0); // comentario
    salida.u16(0); // disco
    salida.u16(0); // atributos internos
    salida.u32(0); // atributos externos
    salida.u32(e.desplazamiento);
    salida.bytes(e.nombre);
  }
  const tamDirectorio = salida.longitud - inicioDirectorio;

  // Fin del directorio central
  salida.u32(0x06054b50);
  salida.u16(0);
  salida.u16(0);
  salida.u16(entradas.length);
  salida.u16(entradas.length);
  salida.u32(tamDirectorio);
  salida.u32(inicioDirectorio);
  salida.u16(0);

  return salida.blob();
}

/** Lanza la descarga de un Blob con el nombre indicado. */
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
