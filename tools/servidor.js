/**
 * Servidor estático mínimo, sin dependencias.
 *
 * Alternativa a `python -m http.server` para equipos donde solo haya Node.
 * Solo sirve ficheros de dentro del proyecto y escucha en 127.0.0.1: esto es
 * una herramienta interna, no tiene por qué ser accesible desde la red.
 *
 *   node tools/servidor.js [puerto]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const PUERTO = Number(process.argv[2]) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const servidor = createServer(async (peticion, respuesta) => {
  try {
    const url = new URL(peticion.url, `http://${peticion.headers.host}`);
    let ruta = decodeURIComponent(url.pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';

    const destino = resolve(join(RAIZ, ruta));

    // Sin esta comprobación, un "../.." serviría cualquier fichero del disco.
    if (destino !== RAIZ && !destino.startsWith(RAIZ + sep)) {
      respuesta.writeHead(403).end('Prohibido');
      return;
    }

    const info = await stat(destino);
    if (!info.isFile()) {
      respuesta.writeHead(404).end('No encontrado');
      return;
    }

    const contenido = await readFile(destino);
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(destino).toLowerCase()] ?? 'application/octet-stream',
      // Sin caché: al editar una plantilla quieres verla al recargar, no
      // pelearte con la versión anterior guardada por el navegador.
      'Cache-Control': 'no-store',
    });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404).end('No encontrado');
  }
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`PhishLab en http://127.0.0.1:${PUERTO}/`);
  console.log('Ctrl+C para parar.');
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} está ocupado. Prueba: node tools/servidor.js 8081`);
    process.exit(1);
  }
  throw e;
});
