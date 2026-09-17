/**
 * Prueba de integración del catálogo.
 *
 * Recorre todas las plantillas reales en los tres idiomas y los tres presets.
 * No comprueba diseño: comprueba que ninguna combinación deja un hueco sin
 * rellenar, un marcador de bloque suelto o un correo sin enlace. Son los tres
 * fallos que solo se ven cuando la campaña ya está enviada.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listarPlantillas, componer, componerSms, presetsCatalogo, senalesCatalogo } from '../tools/render.js';
import { bloquesDeclarados } from '../assets/js/core/engine.js';
import { leerLayout } from '../tools/render.js';

const PLANTILLAS = listarPlantillas();
const IDIOMAS = ['es', 'ca', 'en'];
const PRESETS = presetsCatalogo().map((p) => p.id);

test('el catálogo no está vacío', () => {
  assert.ok(PLANTILLAS.length >= 6, `solo ${PLANTILLAS.length} plantillas`);
});

test('cada señal declarada por un preset existe en el catálogo de señales', () => {
  const conocidas = new Set(senalesCatalogo().map((s) => s.id));
  for (const preset of presetsCatalogo()) {
    for (const id of Object.keys(preset.senales)) {
      assert.ok(conocidas.has(id), `el preset "${preset.id}" usa la señal desconocida "${id}"`);
    }
  }
});

for (const plantilla of PLANTILLAS) {
  // Un sms es texto plano: no hay layout.html ni bloques que cuadrar, así
  // que esas dos pruebas no le aplican — ver tools/render.js#componerSms.
  if (plantilla.tipo !== 'sms') {
    test(`${plantilla.id}: los bloques del layout y del meta.json cuadran`, () => {
      const enLayout = bloquesDeclarados(leerLayout(plantilla.carpeta, plantilla.meta)).map((b) => b.id).sort();
      const enMeta = (plantilla.meta.bloques ?? []).map((b) => b.id).sort();
      assert.deepEqual(
        enLayout,
        enMeta,
        'un bloque en el layout que el meta.json no declara no sale en el panel, y al revés no existe'
      );
    });

    test(`${plantilla.id}: las señales de sus bloques existen`, () => {
      const conocidas = new Set(senalesCatalogo().map((s) => s.id));
      for (const b of plantilla.meta.bloques ?? []) {
        if (!b.senal) continue;
        const id = b.senal.replace(/^!/, '');
        assert.ok(conocidas.has(id), `el bloque "${b.id}" cuelga de la señal desconocida "${id}"`);
      }
    });
  }

  for (const idioma of IDIOMAS) {
    for (const preset of PRESETS) {
      test(`${plantilla.id} · ${idioma}/${preset}`, () => {
        if (plantilla.tipo === 'sms') {
          const r = componerSms(plantilla, { idioma, preset });
          assert.deepEqual(r.faltantes, [], 'saldrían literales como {{hueco}} en el sms enviado');
          assert.doesNotMatch(r.texto, /undefined/, 'un fragmento sin resolver se coló como "undefined"');
          assert.ok(r.texto.length > 0, 'un sms sin cuerpo no sirve de nada');
          return;
        }

        const r = componer(plantilla, { idioma, preset });

        assert.deepEqual(r.faltantes, [], 'saldrían literales como {{hueco}} en el correo enviado');
        assert.doesNotMatch(r.html, /@bloque/, 'marcador de bloque sin limpiar');
        assert.doesNotMatch(r.html, /undefined/, 'un fragmento sin resolver se coló como "undefined"');

        if (plantilla.tipo === 'emails') {
          assert.match(r.html, /\{\{\.URL\}\}/, 'sin {{.URL}} el botón no lleva a la landing');
          assert.ok(r.asunto.length > 0, 'un correo sin asunto no se puede importar en GoPhish');
          assert.doesNotMatch(r.asunto, /\{\{(?!\.)/, 'el asunto lleva una variable nuestra sin resolver');
        }
      });
    }
  }
}

test('las landings de credenciales conservan los nombres de campo que GoPhish espera', () => {
  for (const plantilla of PLANTILLAS.filter((p) => p.meta.captura === 'credenciales')) {
    const { html } = componer(plantilla, { idioma: 'es', preset: 'medio' });
    assert.match(html, /name="email"/, `${plantilla.id}: sin name="email" el resultado no se cruza con el destinatario`);
    assert.match(html, /name="password"/, `${plantilla.id}: con otro nombre, "Capture Passwords" no filtra la contraseña`);
  }
});

test('ninguna plantilla de fábrica se publica en la demo con marca real', () => {
  // El cinturón está en el linter; aquí solo se comprueba que el campo existe,
  // porque una plantilla sin `demo` declarado se colaría por omisión.
  for (const plantilla of PLANTILLAS) {
    assert.equal(typeof plantilla.meta.demo, 'boolean', `${plantilla.id}: falta declarar "demo"`);
  }
});
