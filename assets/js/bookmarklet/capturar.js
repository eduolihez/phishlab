/**
 * Marcador Ctrl+S: captura la web real, ya cargada y renderizada, y la manda
 * al servidor local de PhishLab para clonarla como landing.
 *
 * Vive como una cadena de texto porque se sirve dentro de un enlace
 * `javascript:` — el marcador que arrastras a la barra — y no hay build que
 * la empaquete de otra forma. `generarBookmarklet()` es lo único que se
 * importa desde `ui/importarWeb.js`; el resto es la fuente en sí, pensada
 * para leerse tal cual correría en la pestaña de la web real.
 *
 * Un solo clic ya captura la página tal como está. Además arma un atajo de
 * Ctrl+S (de ahí el nombre) para volver a capturar sin tener que ir a buscar
 * el marcador otra vez, algo útil en un login de varios pasos: llegas a la
 * pantalla de contraseña y pulsas Ctrl+S ahí, sin recargar nada.
 *
 * El token va en el propio marcador (se genera con el de esta instalación en
 * el momento de arrastrarlo) porque el Origin de esta petición nunca va a ser
 * local: es la pestaña de otro dominio la que manda el POST. Ver
 * `tools/servidor.js` para la otra mitad de esta comprobación.
 */

export function generarBookmarklet(origenServidor, token) {
  const fuente = FUENTE
    .replace('__ORIGEN__', JSON.stringify(origenServidor))
    .replace('__TOKEN__', JSON.stringify(token));
  return `javascript:${encodeURIComponent(fuente)}`;
}

const FUENTE = `(function () {
  var ORIGEN = __ORIGEN__;
  var TOKEN = __TOKEN__;

  function capturar() {
    try {
      var html = '<!doctype html>' + document.documentElement.outerHTML;
      fetch(ORIGEN + '/api/clonar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: html, urlOrigen: location.href, token: TOKEN })
      }).then(function (r) {
        aviso(r.ok ? 'PhishLab: capturado. Vuelve a la pestaña de PhishLab.' : 'PhishLab: fallo al capturar (' + r.status + ').');
      }).catch(function () {
        aviso('PhishLab: no se pudo contactar con el servidor local. ¿Está arrancado?');
      });
    } catch (e) {
      aviso('PhishLab: error al capturar — ' + e.message);
    }
  }

  function aviso(texto) {
    var d = document.createElement('div');
    d.textContent = texto;
    d.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;background:#14171C;color:#EDEEF0;border:1px solid #262B33;border-radius:8px;padding:10px 14px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 6000);
  }

  if (!window.__phishlabArmado__) {
    window.__phishlabArmado__ = true;
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        capturar();
      }
    });
    aviso('PhishLab armado: Ctrl+S captura esta página en cualquier momento.');
  }

  capturar();
})();`;
