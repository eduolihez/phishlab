/**
 * Pruebas del informe de resultados: el parser de CSV y el agregado de
 * tasas. Nada de red ni de disco — es el mismo cálculo que corre en el
 * navegador en `ui/informe.js`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parsearCsvResultados, agregarResultados, informeMarkdown } from '../assets/js/core/informe.js';

test('parsearCsvResultados lee cabecera y filas, respetando comillas con comas', () => {
  const csv = [
    'First Name,Last Name,Email,Status,Reported',
    '"García, María",Pérez,maria@ejemplo.com,Clicked Link,false',
    'Juan,López,juan@ejemplo.com,Email Sent,false',
  ].join('\n');

  const filas = parsearCsvResultados(csv);
  assert.equal(filas.length, 2);
  assert.equal(filas[0]['first name'], 'García, María');
  assert.equal(filas[0].status, 'Clicked Link');
  assert.equal(filas[1].email, 'juan@ejemplo.com');
});

test('parsearCsvResultados con CSV vacío o solo cabecera devuelve []', () => {
  assert.deepEqual(parsearCsvResultados(''), []);
  assert.deepEqual(parsearCsvResultados('First Name,Email,Status'), []);
});

test('agregarResultados clasifica por el estado más avanzado alcanzado', () => {
  const filas = parsearCsvResultados([
    'Email,Status,Reported',
    'a@ejemplo.com,Email Sent,false',
    'b@ejemplo.com,Email Opened,false',
    'c@ejemplo.com,Clicked Link,false',
    'd@ejemplo.com,Submitted Data,false',
    'e@ejemplo.com,Email Sent,true',
  ].join('\n'));

  const r = agregarResultados(filas);

  assert.equal(r.total, 5);
  // Abierto cuenta a partir de "abrió, clicó o envió datos": b, c, d.
  assert.equal(r.abiertos, 3);
  // Clic cuenta a partir de "clicó o envió datos": c, d.
  assert.equal(r.clics, 2);
  // Envió datos: solo d.
  assert.equal(r.datosEnviados, 1);
  // Reportado: solo e (reported=true), aunque no llegó a abrir.
  assert.equal(r.reportados, 1);

  assert.equal(r.tasas.abiertos, 60);
  assert.equal(r.tasas.clics, 40);
  assert.equal(r.tasas.datosEnviados, 20);
  assert.equal(r.tasas.reportados, 20);
});

test('agregarResultados con 0 filas no divide por cero', () => {
  const r = agregarResultados([]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.tasas, { abiertos: 0, clics: 0, datosEnviados: 0, reportados: 0 });
});

test('informeMarkdown incluye las tasas y la tabla de señales de la campaña', () => {
  const filas = parsearCsvResultados(['Email,Status', 'a@ejemplo.com,Clicked Link'].join('\n'));
  const resumen = agregarResultados(filas);
  const campana = {
    fecha: '2026-09-17',
    cliente: 'Beltrán S.A.',
    emailNombre: 'BBVA · Acceso sospechoso',
    senales: { urgencia: true, erratas: false },
  };
  const catalogoSenales = [
    { id: 'urgencia', nombre: 'Urgencia' },
    { id: 'erratas', nombre: 'Erratas y acentos' },
  ];

  const md = informeMarkdown({ campana, resumen, catalogoSenales });

  assert.match(md, /Beltrán S\.A\./);
  assert.match(md, /BBVA · Acceso sospechoso/);
  assert.match(md, /Pulsaron el enlace \| 1 \| 100%/);
  assert.match(md, /\*\*urgencia\*\*/);
  assert.doesNotMatch(md, /a@ejemplo\.com/, 'el informe no debe llevar ningún destinatario individual');
});
