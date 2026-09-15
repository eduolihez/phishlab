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
 */
(function () {
  const recursos = [];

  function verRecurso(url) {
    if (!url || /^data:/i.test(url)) return;
    recursos.push(url);
  }

  function extraerUrlsCss(texto) {
    const encontradas = [];
    const patron = /url\((['"]?)([^'")]+)\1\)/gi;
    let m;
    while ((m = patron.exec(texto ?? ''))) encontradas.push(m[2]);
    return encontradas;
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

    if (nodo.tagName === 'IMG' && nodo.getAttribute('src')) verRecurso(nodo.getAttribute('src'));
    if (nodo.tagName === 'LINK' && (nodo.getAttribute('rel') || '').includes('stylesheet')) {
      verRecurso(nodo.getAttribute('href'));
    }
    if (nodo.tagName === 'STYLE') {
      for (const url of extraerUrlsCss(nodo.textContent)) verRecurso(url);
    }
    if (nodo.hasAttribute('style')) {
      for (const url of extraerUrlsCss(nodo.getAttribute('style'))) verRecurso(url);
    }

    for (const hijo of nodo.childNodes) {
      clon.appendChild(serializarNodo(hijo));
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

  return {
    html: '<!doctype html>' + raizClonada.outerHTML,
    recursos: [...new Set(recursos)],
    huboPosibleShadowCerrado,
  };
})();
