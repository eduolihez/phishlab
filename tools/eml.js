/**
 * Parser de `.eml` sin dependencias.
 *
 * Cubre lo que trae un correo corporativo real: multipart anidado, cabeceras
 * plegadas en varias líneas, `quoted-printable`, `base64`, juegos de
 * caracteres que no son UTF-8 y palabras codificadas RFC 2047 en el asunto
 * (`=?UTF-8?B?...?=`). No pretende ser un cliente de correo: pretende sacar el
 * HTML, el asunto, el remitente y los adjuntos en línea.
 *
 * Se escribió a mano en vez de tirar de `mailparser` para que PhishLab siga
 * sin `node_modules`: es una herramienta que se copia a una carpeta compartida
 * y se abre, y esa propiedad vale más que ahorrarse estas doscientas líneas.
 */

import { TextDecoder } from 'node:util';

/**
 * @param {Buffer} buffer  contenido crudo del .eml
 * @returns {{asunto: string, remitente: {nombre: string|null, direccion: string|null},
 *            fecha: string|null, html: string|null, texto: string|null,
 *            imagenes: Map<string,string>}}
 */
export function parsearEml(buffer) {
  const parte = parsearParte(buffer);
  const imagenes = new Map();
  const cuerpos = { html: null, texto: null };

  recorrer(parte, imagenes, cuerpos);

  const de = parsearDireccion(parte.cabeceras.from ?? '');

  return {
    asunto: decodificarCabecera(parte.cabeceras.subject ?? ''),
    remitente: de,
    fecha: parte.cabeceras.date ?? null,
    html: cuerpos.html,
    texto: cuerpos.texto,
    imagenes,
  };
}

// ------------------------------------------------------------------ partes ---

function parsearParte(buffer) {
  const corte = encontrarSeparador(buffer);
  const crudoCabeceras = buffer.subarray(0, corte.fin).toString('latin1');
  const cuerpo = buffer.subarray(corte.inicioCuerpo);

  return { cabeceras: parsearCabeceras(crudoCabeceras), cuerpo };
}

/** La línea en blanco que separa cabeceras de cuerpo, con CRLF o solo LF. */
function encontrarSeparador(buffer) {
  const dobleCrlf = buffer.indexOf('\r\n\r\n');
  const dobleLf = buffer.indexOf('\n\n');

  if (dobleCrlf !== -1 && (dobleLf === -1 || dobleCrlf < dobleLf)) {
    return { fin: dobleCrlf, inicioCuerpo: dobleCrlf + 4 };
  }
  if (dobleLf !== -1) return { fin: dobleLf, inicioCuerpo: dobleLf + 2 };
  return { fin: buffer.length, inicioCuerpo: buffer.length };
}

function parsearCabeceras(texto) {
  const cabeceras = {};
  // Una cabecera larga se pliega en varias líneas, y las continuaciones
  // empiezan por espacio o tabulador. Sin desplegarlas, un Content-Type con
  // boundary largo se parte y el multipart no se reconoce.
  const lineas = texto.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);

  for (const linea of lineas) {
    const encaje = linea.match(/^([\w-]+):\s*(.*)$/);
    if (!encaje) continue;
    cabeceras[encaje[1].toLowerCase()] = encaje[2];
  }

  return cabeceras;
}

function recorrer(parte, imagenes, cuerpos) {
  // El valor crudo se conserva porque el boundary distingue mayúsculas: pasarlo
  // entero a minúsculas hace que `--FRONTERA` no encaje con `--frontera` y el
  // multipart se quede sin partes, sin dar ningún error.
  const crudoTipo = parte.cabeceras['content-type'] ?? 'text/plain';
  const tipo = crudoTipo.toLowerCase();

  if (tipo.startsWith('multipart/')) {
    const boundary = crudoTipo.match(/boundary="?([^";]+)"?/i)?.[1]?.trim();
    if (!boundary) return;

    for (const trozo of partir(parte.cuerpo, boundary)) {
      recorrer(parsearParte(trozo), imagenes, cuerpos);
    }
    return;
  }

  const contenido = decodificar(parte);

  if (tipo.startsWith('text/html') && cuerpos.html === null) {
    cuerpos.html = contenido.toString('utf8');
    return;
  }
  if (tipo.startsWith('text/plain') && cuerpos.texto === null) {
    cuerpos.texto = contenido.toString('utf8');
    return;
  }

  // Imagen en línea: se guarda por Content-ID para que el saneador la incruste
  // donde el HTML la referencia con cid:.
  if (tipo.startsWith('image/')) {
    const id = (parte.cabeceras['content-id'] ?? '').replace(/^<|>$/g, '').trim();
    if (!id) return;
    const mime = tipo.split(';')[0].trim();
    imagenes.set(id, `data:${mime};base64,${contenido.toString('base64')}`);
  }
}

function partir(cuerpo, boundary) {
  const marca = Buffer.from(`--${boundary}`);
  const trozos = [];
  let posicion = cuerpo.indexOf(marca);

  while (posicion !== -1) {
    const inicio = posicion + marca.length;
    // `--boundary--` cierra el multipart: lo que venga detrás es epílogo.
    if (cuerpo.subarray(inicio, inicio + 2).toString() === '--') break;

    const siguiente = cuerpo.indexOf(marca, inicio);
    const fin = siguiente === -1 ? cuerpo.length : siguiente;
    const trozo = cuerpo.subarray(inicio, fin);

    // Quitar el salto de línea que sigue al boundary.
    const desplazamiento = trozo[0] === 0x0d && trozo[1] === 0x0a ? 2 : trozo[0] === 0x0a ? 1 : 0;
    trozos.push(trozo.subarray(desplazamiento));

    if (siguiente === -1) break;
    posicion = siguiente;
  }

  return trozos;
}

// -------------------------------------------------------------- decodificar ---

function decodificar(parte) {
  const codificacion = (parte.cabeceras['content-transfer-encoding'] ?? '7bit').toLowerCase().trim();
  const juego = (parte.cabeceras['content-type'] ?? '').match(/charset="?([\w-]+)"?/i)?.[1];

  let bytes;
  if (codificacion === 'base64') {
    bytes = Buffer.from(parte.cuerpo.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  } else if (codificacion === 'quoted-printable') {
    bytes = decodificarQuotedPrintable(parte.cuerpo.toString('latin1'));
  } else {
    bytes = parte.cuerpo;
  }

  return recodificar(bytes, juego);
}

/** Pasa a UTF-8 lo que venga en otro juego de caracteres. */
function recodificar(bytes, juego) {
  if (!juego || /^utf-?8$/i.test(juego)) return bytes;
  try {
    return Buffer.from(new TextDecoder(juego).decode(bytes), 'utf8');
  } catch {
    // Un juego que Node no conozca: mejor latin1 que devolver bytes crudos,
    // que dejarían el correo lleno de rombos.
    return Buffer.from(bytes.toString('latin1'), 'utf8');
  }
}

function decodificarQuotedPrintable(texto) {
  const sinCortes = texto.replace(/=\r?\n/g, '');
  const salida = [];

  for (let i = 0; i < sinCortes.length; i++) {
    if (sinCortes[i] === '=' && /^[0-9a-f]{2}$/i.test(sinCortes.substr(i + 1, 2))) {
      salida.push(parseInt(sinCortes.substr(i + 1, 2), 16));
      i += 2;
    } else {
      salida.push(sinCortes.charCodeAt(i) & 0xff);
    }
  }

  return Buffer.from(salida);
}

/** Palabras codificadas RFC 2047: `=?UTF-8?B?...?=` o `=?ISO-8859-1?Q?...?=`. */
function decodificarCabecera(valor) {
  return valor
    .replace(/=\?([\w-]+)\?([BbQq])\?([^?]*)\?=/g, (todo, juego, modo, datos) => {
      try {
        const bytes = modo.toUpperCase() === 'B'
          ? Buffer.from(datos, 'base64')
          : decodificarQuotedPrintable(datos.replace(/_/g, ' '));
        return recodificar(bytes, juego).toString('utf8');
      } catch {
        return todo;
      }
    })
    // Dos palabras codificadas seguidas se separan por espacio, que no forma
    // parte del texto: `=?..?= =?..?=` es una sola palabra partida.
    .replace(/\?=\s+=\?/g, '?==?')
    .trim();
}

function parsearDireccion(cabecera) {
  const decodificada = decodificarCabecera(cabecera);
  const conNombre = decodificada.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);

  if (conNombre) {
    return { nombre: conNombre[1].trim() || null, direccion: conNombre[2].trim() };
  }
  const suelta = decodificada.match(/[\w.+-]+@[\w.-]+/);
  return { nombre: null, direccion: suelta ? suelta[0] : null };
}
