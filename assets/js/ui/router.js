/**
 * Router de hash.
 *
 * Se usa el hash y no la History API a propósito: PhishLab se abre a veces
 * desde un `file://` o desde una carpeta compartida por IIS sin reescritura de
 * rutas, y ahí `pushState` deja enlaces que al recargar dan 404. Con el hash
 * funciona en cualquier sitio y los enlaces se pueden pegar en un chat.
 */

const rutas = [];
let alCambiarVista = () => {};

/**
 * Registra una ruta.
 *
 *   registrar('/plantilla/:tipo/:id', (params) => nodo)
 *
 * El manejador devuelve el nodo a pintar, o una promesa que lo resuelva.
 */
export function registrar(patron, manejador) {
  const claves = [];
  const expresion = new RegExp(
    '^' + patron.replace(/:([\w]+)/g, (_, clave) => {
      claves.push(clave);
      return '([^/]+)';
    }) + '$'
  );
  rutas.push({ expresion, claves, manejador, patron });
}

/** Se llama en cada navegación con el nombre de la vista, para marcar el menú. */
export function alNavegar(fn) {
  alCambiarVista = fn;
}

export function arrancarRouter(contenedor, rutaPorDefecto = '/biblioteca') {
  const resolver = async () => {
    const camino = decodeURIComponent(location.hash.replace(/^#/, '')) || rutaPorDefecto;

    for (const { expresion, claves, manejador, patron } of rutas) {
      const encaje = camino.match(expresion);
      if (!encaje) continue;

      const params = Object.fromEntries(claves.map((c, i) => [c, encaje[i + 1]]));
      alCambiarVista(patron.split('/')[1], params);

      contenedor.textContent = '';
      try {
        const nodo = await manejador(params);
        contenedor.textContent = '';
        if (nodo) contenedor.append(nodo);
        // Al cambiar de vista se vuelve arriba: sin esto, entrar en una
        // plantilla desde el final de la rejilla te deja a media página.
        window.scrollTo(0, 0);
      } catch (e) {
        console.error(e);
        contenedor.append(errorVisible(e));
      }
      return;
    }

    location.hash = `#${rutaPorDefecto}`;
  };

  window.addEventListener('hashchange', resolver);
  return resolver();
}

export function ir(camino) {
  location.hash = `#${camino}`;
}

function errorVisible(e) {
  const caja = document.createElement('div');
  caja.className = 'pagina';
  const nota = document.createElement('div');
  nota.className = 'nota peligro';
  const titulo = document.createElement('strong');
  titulo.textContent = 'No se pudo pintar esta vista. ';
  const detalle = document.createElement('span');
  detalle.textContent = e.message;
  nota.append(titulo, detalle);
  caja.append(nota);
  return caja;
}
