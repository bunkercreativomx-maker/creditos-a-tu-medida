// Tests unitarios de los clasificadores deterministas (lib/intenciones.ts y
// lib/agenda.ts): replays de frases reales de producción + variantes humanas.
// Estos son los bloques puros que respaldan al handler (test-turno.mts).
//
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-clasificadores.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import * as A from "@/lib/agenda.ts";
import * as I from "@/lib/intenciones.ts";

test("ubicación: detecta las formas reales de pedir dirección", () => {
  for (const t of [
    "Dónde están ubicados",
    "Si pero no sé dónde estan",
    "Me da la dirección porfavor",
    "A dónde tengo que ir",
    "a donde tengo que ir",
    "dónde los puedo encontrar",
    "como llego a su oficina",
    "me manda la ubicacion?",
    "En qué parte están",
    "pasame la direccion de la oficina",
    "dónde es la cita",
    "tengo que ir a algun lado?",
    "y a dónde tengo que ir",
  ]) assert.equal(I.pideUbicacion(t), true, `ubicación: "${t}"`);
});

test("ubicación: NO confunde con otras intenciones", () => {
  for (const t of [
    "cuánto me prestan",
    "gracias",
    "soy pensionado del imss",
    "10,000 no tengo otro préstamo",
  ]) assert.equal(I.pideUbicacion(t), false, `no ubicación: "${t}"`);
});

test("preguntas de asesor (BLOQUE 8): se escalan, no se contestan", () => {
  for (const t of [
    "Cuánto es lo máximo que prestas",
    "Te sirve mi seguro",
    "cuánto me prestan",
    "que requisitos necesito",
    "cuando me depositan",
    "que tasa manejan",
    "cuánto me descuentan al mes",
    "ya tiene mi solicitud algun avance?",
    "Tengo una duda con mi pago",
    "quiero hablar con una persona",
    "no me han depositado",
    "cuanto tiempo tardan",
  ]) assert.equal(I.esPreguntaDeAsesor(t), true, `asesor: "${t}"`);
});

test("flujo normal NO escala", () => {
  for (const t of [
    "soy pensionado",
    "Imss",
    "10,000 no tengo otro préstamo",
    "José Antonio Hernández Vázquez",
    "A las 10:00",
    "Muchas gracias",
  ]) assert.equal(I.esPreguntaDeAsesor(t), false, `no escalar: "${t}"`);
});

test("pregunta por SU cita", () => {
  for (const t of [
    "Para que día me quedo la cita y a qué hora",
    "cuando es mi cita",
    "a que hora es mi cita",
    "sigue en pie mi cita",
  ]) assert.equal(I.preguntaPorSuCita(t), true, `su cita: "${t}"`);
});

test("quiere agendar (incluye respuestas cortas)", () => {
  for (const t of [
    "Si porfa", "Si por favor", "Claro", "esta bien", "cuando puedo ir", "Quiero ir el jueves",
    "me gustaria ir el sabado", "a las 11 de la mañana", "Otro día el miércoles", "Que día quiere que vaya",
    "10", "el lunes", "manana a las 11", "pasado manana",
  ]) assert.equal(A.pideAgendar(t) || A.pareceHoraODia(t) || I.esAfirmacion(t), true, `agendar: "${t}"`);
});

test("no tiene el identificador a la mano", () => {
  for (const t of ["no lo tengo a la mano", "no me lo sé", "no lo traigo", "luego se lo mando", "no lo llevo"])
    assert.equal(I.noTieneIdentificador(t), true, `no ident: "${t}"`);
  for (const t of ["claro", "si", "sí, por favor", "ok"]) assert.equal(I.esAfirmacion(t), true, `afirmación: "${t}"`);
  assert.equal(I.esAfirmacion("no lo tengo"), false, "'no lo tengo' NO es afirmación");
});

test("extraer hora: sin confundir montos con horas", () => {
  const casos: [string, string | null][] = [
    ["A las 10:00", "10:00"],
    ["10", "10:00"],
    ["a las 11 de la mañana", "11:00"],
    ["a las 5 de la tarde", "17:00"],
    ["a las 2", "14:00"],
    ["4pm", "16:00"],
    ["11 am", "11:00"],
    ["a las 12 del día", "12:00"],
    ["el 14 de septiembre", null],
    ["el 15", null],
    ["15:30", "15:30"],
    ["15,000 pesos para mañana", null],
    ["10000 no tengo otro prestamo", null],
    ["10001988121", null],
  ];
  for (const [t, esp] of casos)
    assert.equal(A.extraerHora(t), esp, `extraerHora("${t}") = ${A.extraerHora(t)} (esp ${esp})`);
});

test("detectar día (sin acentos)", () => {
  assert.equal(A.detectarDia("manana"), A.sumarDiasCalendario(1));
  assert.equal(A.detectarDia("pasado manana"), A.sumarDiasCalendario(2));
  assert.equal(A.detectarDia("el sab"), A.detectarDia("sabado"));
  assert.equal(A.detectarDia("mañana a las 11"), A.sumarDiasCalendario(1));
  assert.equal(A.detectarDia("el miercoles"), A.detectarDia("miercoles"));
});

test("horario hábil: no agenda fuera de horario", () => {
  const lunes = A.proximoLunes();
  assert.equal(A.horaEnHorarioDia(lunes, "17:00"), true, "lunes 17:00 dentro");
  assert.equal(A.horaEnHorarioDia(lunes, "05:00"), false, "lunes 05:00 fuera");
});

test("nombre corto (no repetir nombre completo en cada mensaje)", () => {
  const casos: [string, string][] = [
    ["José Antonio Hernández Vázquez", "José"],
    ["Juan Pérez", "Juan"],
    ["Juan Pérez López", "Juan"],
    ["Ma. de los Angeles Ruiz", "Angeles"],
    ["maria guadalupe lopez", "Maria"],
  ];
  for (const [n, esp] of casos) assert.equal(I.nombreCorto(n), esp, `nombreCorto("${n}")`);
});

test("hora local → UTC (Cd. Juárez, verano UTC-6)", () => {
  assert.equal(A.horaLocalAUtc("2026-09-14", "10:00"), "2026-09-14T16:00:00.000Z");
});