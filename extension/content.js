/**
 * Content script del marcador de captura de PhishLab.
 *
 * Se inyecta bajo demanda (no vive en cada página) al pulsar "Capturar paso"
 * en el popup. Serializa el DOM actual a HTML autocontenido, incluidos los
 * shadow roots abiertos (como declarative shadow DOM nativo, sin script de
 * rehidratación), pero NO hace ningún fetch: eso lo hace `background.js`,
 * que sí tiene privilegios de red que este script no tiene (cookies
 * cross-origin, sin CORS). Un shadow root cerrado no es alcanzable desde
 * ningún script de página — se marca con una heurística, nunca en silencio,
 * igual que `tools/sanearWeb.js` anota lo que no puede incrustar.
 *
 * Cada recurso detectado (imagen, hoja de estilo, `url(...)` de CSS) se
 * sustituye en el HTML devuelto por un marcador único
 * (`phishlab-recurso-N-xxxxxx`), nunca por la URL original tal cual.
 * `background.js` incrusta cada marcador por su cuenta después. La primera
 * versión de esto dejaba la URL original en el HTML y hacía
 * `html.split(url).join(dataUri)` sobre el documento entero — si dos
 * recursos distintos de la misma página comparten una subcadena (un bundle
 * de CSS compartido entre pasos, o simplemente "style.css" siendo subcadena
 * de "old-style.css"), esa sustitución global corrompía el que no tocaba.
 * Un marcador generado aquí es tan improbable de aparecer por accidente en
 * el resto de la página que ese cruce deja de ser posible.
 */
(function () {
  let contador = 0;
  const mapaRecursos = []; // { marcador, url }

  function marcarRecurso(url) {
    if (!url || /^data:/i.test(url)) return url;
    const marcador = `phishlab-recurso-${contador++}-${Math.random().toString(36).slice(2, 8)}`;
    mapaRecursos.push({ marcador, url });
    return marcador;
  }

  function sustituirUrlsCss(texto) {
    return (texto ?? '').replace(/url\((['"]?)([^'")]+)\1\)/gi, (m, comillas, url) => {
      const marcador = marcarRecurso(url);
      return marcador === url ? m : `url(${comillas}${marcador}${comillas})`;
    });
  }

  function serializarNodo(nodo) {
    if (nodo.nodeType !== Node.ELEMENT_NODE) return nodo.cloneNode(true);
    return serializarElemento(nodo);
  }

  function serializarElemento(nodo) {
    const clon = nodo.cloneNode(false);

    if (nodo.shadowRoot) {
      const plantilla = document.createElement('template');
      plantilla.setAttribute('shadowrootmode', 'open');
      for (const hijo of nodo.shadowRoot.childNodes) {
        plantilla.content.appendChild(serializarNodo(hijo));
      }
      clon.appendChild(plantilla);
    }

    if (nodo.tagName === 'IMG' && nodo.getAttribute('src')) {
      clon.setAttribute('src', marcarRecurso(nodo.getAttribute('src')));
    }
    if (nodo.tagName === 'LINK' && (nodo.getAttribute('rel') || '').includes('stylesheet') && nodo.getAttribute('href')) {
      clon.setAttribute('href', marcarRecurso(nodo.getAttribute('href')));
    }
    if (nodo.hasAttribute('style')) {
      clon.setAttribute('style', sustituirUrlsCss(nodo.getAttribute('style')));
    }

    if (nodo.tagName === 'STYLE') {
      // El texto se sustituye aquí directamente: el recorrido genérico de
      // hijos de más abajo clonaría el nodo de texto tal cual, sin pasar
      // sus url(...) por el marcador.
      clon.textContent = sustituirUrlsCss(nodo.textContent);
    } else {
      for (const hijo of nodo.childNodes) {
        clon.appendChild(serializarNodo(hijo));
      }
    }

    return clon;
  }

  // Heurística de shadow DOM cerrado: un elemento personalizado registrado
  // que no expone `shadowRoot` casi siempre lo tiene, solo que cerrado. No es
  // certeza absoluta (podría no usar shadow DOM en absoluto), por eso se
  // reporta como "posible", para revisar a mano — nunca como un hecho.
  let huboPosibleShadowCerrado = false;
  for (const elemento of document.body.querySelectorAll('*')) {
    const nombre = elemento.tagName.toLowerCase();
    if (nombre.includes('-') && customElements.get(nombre) && elemento.shadowRoot === null) {
      huboPosibleShadowCerrado = true;
      break;
    }
  }

  const raizClonada = serializarElemento(document.documentElement);

  const resultado = {
    html: '<!doctype html>' + raizClonada.outerHTML,
    recursos: mapaRecursos,
    huboPosibleShadowCerrado,
  };

  // El VALOR DE RETORNO de este script es lo que background.js lee primero
  // (`inyeccion[0].result`), pero en páginas que redirigen o se hidratan por
  // JS justo tras la carga (Google, Microsoft, PayPal...) Chrome a veces no
  // entrega ese valor aunque el script termine bien — un fallo conocido de
  // `chrome.scripting.executeScript` en el mundo aislado, no de este código.
  // Mandarlo TAMBIÉN por mensaje es la red de seguridad: background.js
  // escucha este mensaje como respaldo si el valor de retorno no llega.
  try {
    chrome.runtime.sendMessage({ tipo: 'phishlab-captura-resultado', datos: resultado });
  } catch (e) {
    // Sin chrome.runtime (contexto ya invalidado) el valor de retorno sigue
    // siendo el único camino — nada que hacer aquí salvo no reventar.
  }

  return resultado;
})();
