/**
 * Vista `#/informe`: sube `campana.json` (del ZIP exportado) y el CSV de
 * resultados de GoPhish, y calcula el informe en el navegador.
 *
 * Acceso secundario a propósito — no un tercer enlace en la barra de
 * navegación: la barra se redujo a Biblioteca/Importar el 2026-09-15 (ver
 * DESIGN.md) y esto no justifica revertirlo. Se llega desde el botón "Ver
 * informe de resultados" de la pestaña Exportar, o desde aquí escribiendo
 * la ruta a mano.
 *
 * Nada sube a ningún servidor: los dos ficheros se leen en el navegador y el
 * cálculo entero es local.
 */

import { el, pintarEn, brindis, icono } from './dom.js';
import { estado } from '../core/estado.js';
import { parsearCsvResultados, agregarResultados, informeMarkdown } from '../core/informe.js';
import { descargar } from '../core/zip.js';

export function vistaInforme() {
  const raiz = el('.pagina.columna-estrecha');

  let campana = null;
  let resumen = null;

  pintar();
  return raiz;

  function pintar() {
    pintarEn(raiz,
      el('.cabecera-pagina', [
        el('.rotulo', { texto: 'Informe' }),
        el('h1', { texto: 'Informe de resultados' }),
        el('p', {
          texto: 'Sube el campana.json que trae el ZIP exportado y el CSV de resultados de GoPhish. Todo el cálculo es local: ningún fichero sale de este navegador.',
        }),
      ]),

      entradaCampana(),
      entradaCsv(),

      campana && resumen ? salida() : null
    );
  }

  function entradaCampana() {
    return el('.campo', [
      el('span.etiqueta', { texto: campana ? `campana.json cargado (${campana.emailNombre ?? campana.landingNombre ?? campana.emailId ?? campana.landingId ?? 'sin nombre'})` : '1. campana.json' }),
      zonaFichero({
        accept: 'application/json,.json',
        onFichero: async (fichero) => {
          try {
            campana = JSON.parse(await fichero.text());
            brindis('campana.json cargado');
            pintar();
          } catch (e) {
            brindis(`No se pudo leer campana.json: ${e.message}`);
          }
        },
      }),
    ]);
  }

  function entradaCsv() {
    return el('.campo', [
      el('span.etiqueta', { texto: resumen ? `CSV cargado (${resumen.total} destinatarios)` : '2. CSV de resultados de GoPhish' }),
      zonaFichero({
        accept: 'text/csv,.csv',
        onFichero: async (fichero) => {
          try {
            const filas = parsearCsvResultados(await fichero.text());
            if (!filas.length) return brindis('El CSV no trae ninguna fila reconocible');
            resumen = agregarResultados(filas);
            brindis(`${filas.length} filas procesadas`);
            pintar();
          } catch (e) {
            brindis(`No se pudo leer el CSV: ${e.message}`);
          }
        },
      }),
    ]);
  }

  /** Igual patrón que la zona de logo de marca.js: arrastrar o pulsar para elegir. */
  function zonaFichero({ accept, onFichero }) {
    const entrada = el('input', { type: 'file', accept, hidden: true });
    entrada.addEventListener('change', () => entrada.files[0] && onFichero(entrada.files[0]));

    const zona = el('.soltar-logo', {
      tabindex: '0',
      role: 'button',
      onclick: () => entrada.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } },
      ondragenter: (e) => { e.preventDefault(); zona.classList.add('encima'); },
      ondragover: (e) => { e.preventDefault(); zona.classList.add('encima'); },
      ondragleave: () => zona.classList.remove('encima'),
      ondrop: (e) => {
        e.preventDefault();
        zona.classList.remove('encima');
        const fichero = e.dataTransfer?.files?.[0];
        if (fichero) onFichero(fichero);
      },
    }, [
      el('span', { texto: 'Arrastra el fichero aquí o pulsa para elegirlo' }),
      entrada,
    ]);

    return zona;
  }

  function salida() {
    const md = informeMarkdown({ campana, resumen, catalogoSenales: estado.catalogo.senales });
    const senalesCampana = campana.senales ?? {};
    const encendidas = estado.catalogo.senales.filter((s) => senalesCampana[s.id]);

    return el('div', [
      el('h3.titulo-bloque', { style: { marginTop: '22px' }, texto: 'Tasas' }),
      el('.dos-columnas', [
        tarjetaTasa('Abrieron el correo', resumen.abiertos, resumen.tasas.abiertos),
        tarjetaTasa('Pulsaron el enlace', resumen.clics, resumen.tasas.clics),
        tarjetaTasa('Enviaron datos', resumen.datosEnviados, resumen.tasas.datosEnviados),
        tarjetaTasa('Reportaron el correo', resumen.reportados, resumen.tasas.reportados),
      ]),

      el('h3.titulo-bloque', { style: { marginTop: '18px' }, texto: 'Señales que llevaba esta campaña' }),
      el('.lista-interruptores', estado.catalogo.senales.map((s) =>
        el('.fila-senal-informe', [
          el(`span.pildora${senalesCampana[s.id] ? '.pildora-acento' : ''}`, { texto: s.nombre }),
          el('span.ayuda', { texto: senalesCampana[s.id] ? 'presente' : 'ausente' }),
        ])
      )),
      el('p.ayuda', {
        texto: encendidas.length
          ? `Quien haya enviado datos ha dejado pasar: ${encendidas.map((s) => s.nombre.toLowerCase()).join(', ')}.`
          : 'Esta campaña no llevaba ninguna señal evidente: mide la exposición real, no la detección de pistas.',
      }),

      el('div', { style: { display: 'flex', gap: '9px', marginTop: '16px' } }, [
        el('button.btn.btn-primario', {
          type: 'button',
          onclick: () => {
            descargar(new Blob([md], { type: 'text/markdown;charset=utf-8' }), 'informe-resultados.md');
            brindis('Descargado informe-resultados.md');
          },
        }, [icono('descargar', 14), 'Descargar informe (.md)']),
      ]),

      el('p.ayuda', {
        style: { marginTop: '12px' },
        texto: 'El cálculo se ha hecho en este navegador. Purga el CSV original y los resultados de GoPhish según lo acordado en el tratamiento de datos de la campaña.',
      }),
    ]);
  }

  function tarjetaTasa(etiqueta, n, pct) {
    return el('.campo', [
      el('span.etiqueta', { texto: etiqueta }),
      el('output.salida-mono', { texto: `${n} (${pct}%)` }),
    ]);
  }
}
