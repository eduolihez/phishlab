/**
 * Construye el formulario de campaña a partir del manifiesto de la plantilla.
 *
 * El dashboard no sabe qué campos tiene cada plantilla ni le hace falta:
 * los lee de `meta.campos`. Añadir una plantilla con campos nuevos no
 * obliga a tocar nada de la interfaz.
 */

/**
 * @param {HTMLElement} contenedor
 * @param {Array<object>} definiciones
 * @param {Record<string,string>} valoresPrevios  valores a conservar entre cambios de plantilla
 * @param {() => void} alCambiar
 * @returns {Record<string,string>} objeto vivo con los valores actuales
 */
export function construirCampos(contenedor, definiciones, valoresPrevios, alCambiar) {
  contenedor.textContent = '';
  const valores = {};

  for (const def of definiciones) {
    // Si el usuario ya había escrito algo con ese mismo nombre de campo, se
    // respeta: cambiar de plantilla no debería borrarle el importe escrito.
    valores[def.clave] = valoresPrevios?.[def.clave] ?? def.defecto ?? '';

    const campo = document.createElement('div');
    campo.className = 'campo';

    const etiqueta = document.createElement('label');
    const id = `campo-${def.clave}`;
    etiqueta.htmlFor = id;
    etiqueta.textContent = def.etiqueta;
    campo.append(etiqueta);

    let control;
    if (def.tipo === 'opciones') {
      control = document.createElement('select');
      for (const op of def.opciones ?? []) {
        const o = document.createElement('option');
        o.value = typeof op === 'string' ? op : op.valor;
        o.textContent = typeof op === 'string' ? op : op.texto;
        control.append(o);
      }
    } else {
      control = document.createElement('input');
      control.type = def.tipo === 'numero' ? 'number' : 'text';
      if (def.marcador) control.placeholder = def.marcador;
      control.autocomplete = 'off';
    }
    control.id = id;
    control.value = valores[def.clave];

    control.addEventListener('input', () => {
      valores[def.clave] = control.value;
      alCambiar();
    });
    control.addEventListener('change', () => {
      valores[def.clave] = control.value;
      alCambiar();
    });

    campo.append(control);

    if (def.ayuda) {
      const ayuda = document.createElement('p');
      ayuda.className = 'ayuda';
      ayuda.textContent = def.ayuda;
      campo.append(ayuda);
    }

    contenedor.append(campo);
  }

  return valores;
}
