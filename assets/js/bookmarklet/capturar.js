/**
 * Marcador Ctrl+S: captura la web real, ya cargada y renderizada, y la deja
 * en el portapapeles para pegarla en Importar → Web.
 *
 * Vive como una cadena de texto porque se sirve dentro de un enlace
 * `javascript:` — el marcador que arrastras a la barra — y no hay build que
 * la empaquete de otra forma. `generarBookmarklet()` es lo único que se
 * importa desde `ui/importarWeb.js`; el resto es la fuente en sí, pensada
 * para leerse tal cual correría en la pestaña de la web real.
 *
 * La primera versión de esto mandaba la captura por `POST` directo al
 * servidor local. Se descartó: Chrome trata una petición desde una web
 * pública hacia `127.0.0.1` como acceso a la red local (Private/Local
 * Network Access) y exige un permiso del navegador que no se puede conceder
 * solo desde el servidor — en la práctica, la petición se bloqueaba con un
 * fallo de red genérico sin que hubiera nada que arreglar en el código.
 * Copiar al portapapeles no cruza esa frontera: es una acción local a la
 * pestaña, iniciada por el usuario, sin permisos de red de por medio. Cuesta
 * un paso más (volver a la pestaña de PhishLab y pegar), pero funciona
 * siempre y no depende de una política del navegador que puede cambiar otra
 * vez. El marcador ya no necesita saber en qué puerto corre tu PhishLab ni
 * llevar un token: no habla con ningún servidor.
 *
 * Un solo clic ya copia la página tal como está. Además arma un atajo de
 * Ctrl+S (de ahí el nombre) para volver a capturar sin tener que ir a buscar
 * el marcador otra vez, algo útil en un login de varios pasos: llegas a la
 * pantalla de contraseña y pulsas Ctrl+S ahí, sin recargar nada.
 */

export function generarBookmarklet() {
  return `javascript:${encodeURIComponent(FUENTE)}`;
}

const FUENTE = `(function () {
  var CLASE_AVISO = 'phishlab-aviso-tmp-' + Math.random().toString(36).slice(2);

  function capturar() {
    // Se quita cualquier aviso nuestro ANTES de leer el HTML: si quedara uno
    // en pantalla (el de "armado" del primer clic, o el de "copiada" de un
    // Ctrl+S anterior que todavía no se hubiera desvanecido), se colaría
    // dentro de la propia captura.
    limpiarAvisos();
    try {
      // El origen va como comentario HTML al principio, no como JSON aparte:
      // así lo copiado sigue siendo HTML reconocible si alguien lo abre en un
      // editor de texto, y el paso de pegar en PhishLab solo tiene que
      // quitarle la primera línea.
      var html = '<!--phishlab-origen:' + location.href + '-->\\n<!doctype html>' + document.documentElement.outerHTML;
      copiar(html).then(function (ok) {
        aviso(ok
          ? 'PhishLab: página copiada. Vuelve a la pestaña de PhishLab → Importar → Web y pégala.'
          : 'PhishLab: el navegador no dejó copiar al portapapeles.');
      });
    } catch (e) {
      aviso('PhishLab: error al capturar — ' + e.message);
    }
  }

  function copiar(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto).then(function () { return true; }).catch(function () { return copiarConTextarea(texto); });
    }
    return Promise.resolve(copiarConTextarea(texto));
  }

  function copiarConTextarea(texto) {
    var area = document.createElement('textarea');
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    area.remove();
    return ok;
  }

  function limpiarAvisos() {
    var previos = document.querySelectorAll('.' + CLASE_AVISO);
    for (var i = 0; i < previos.length; i++) previos[i].remove();
  }

  function aviso(texto) {
    limpiarAvisos();
    var d = document.createElement('div');
    d.className = CLASE_AVISO;
    d.textContent = texto;
    d.style.cssText = 'position:fixed;top:12px;right:12px;max-width:320px;z-index:2147483647;background:#14171C;color:#EDEEF0;border:1px solid #262B33;border-radius:8px;padding:10px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 7000);
  }

  // La captura va primero: el aviso de "armado" se pinta DESPUÉS y solo una
  // vez, para que no pueda colarse en la primera captura del clic que lo
  // activa, y para no tapar la confirmación de "copiada" en cada Ctrl+S.
  capturar();

  if (!window.__phishlabArmado__) {
    window.__phishlabArmado__ = true;
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        capturar();
      }
    });
    setTimeout(function () {
      aviso('PhishLab armado: Ctrl+S copia esta página en cualquier momento.');
    }, 1500);
  }
})();`;
