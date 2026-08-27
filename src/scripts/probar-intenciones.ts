/*
 * Prueba la detección de intención del guard de cierre de turno.
 *
 * Es la pieza de mayor riesgo del guard: un falso positivo fuerza
 * una herramienta que la pregunta no pedía y, si el modelo no la
 * ejecuta, convierte una respuesta correcta en un error. Corre en
 * un segundo y no toca ni el modelo ni la base.
 *
 *   npm run probar:intenciones
 */

import { detectarIntenciones } from "../ai/ollama.js";

type Caso = [pregunta: string, intencionesEsperadas: string[]];

const CASOS: Caso[] = [
  // Deben exigir herramienta.
  ["¿Dónde está el ibuprofeno?", ["ubicación"]],
  ["¿Dónde está el ibuprofeno de 400 mg en Centro?", ["ubicación"]],
  ["¿En qué pasillo está el paracetamol?", ["ubicación"]],
  ["¿En qué bodega está guardado el termómetro?", ["ubicación"]],
  ["¿Cuánto stock hay de ibuprofeno?", ["stock"]],
  ["¿Qué productos tienen stock bajo?", ["stock"]],
  ["¿Cuál es el producto con menos stock?", ["stock"]],
  ["¿Cuántas unidades quedan de acetaminofén?", ["stock"]],
  ["¿Qué productos están agotados?", ["stock"]],
  ["¿Qué lotes vencen en los próximos 30 días?", ["lotes o vencimientos"]],
  ["¿Qué lotes tiene el ibuprofeno de 400 mg?", ["lotes o vencimientos"]],
  ["¿Qué se caduca esta semana?", ["lotes o vencimientos"]],
  ["¿Cuáles son los productos más vendidos?", ["ventas"]],
  ["¿Cómo van las ventas del mes?", ["ventas"]],

  // Varias intenciones a la vez.
  [
    "¿Dónde está el ibuprofeno y cuánto stock hay?",
    ["ubicación", "stock"],
  ],

  // No deben exigir nada: forzarlas sería inventar trabajo.
  ["Busca el producto MED-0081", []],
  ["¿Qué producto tiene el código de barras 7709000000003?", []],
  ["¿Qué presentaciones hay de ibuprofeno?", []],
  ["Busca el producto MED-9999", []],
  ["Hola, ¿qué puedes hacer?", []],
  ["Gracias", []],
  ["¿Cuál es el precio del ibuprofeno?", []],
  ["Explícame qué es el ibuprofeno", []],
  ["¿Qué laboratorio fabrica el paracetamol?", []],
];

let fallos = 0;

for (const [pregunta, esperadas] of CASOS) {
  const obtenidas = detectarIntenciones(pregunta)
    .map((intencion) => intencion.nombre)
    .sort();

  const ok =
    JSON.stringify(obtenidas) === JSON.stringify([...esperadas].sort());

  if (!ok) {
    fallos++;
  }

  console.log(`${ok ? "OK   " : "FALLA"} ${pregunta}`);

  if (!ok) {
    console.log(
      `       esperado: [${esperadas.join(", ")}]  obtenido: [${obtenidas.join(
        ", "
      )}]`
    );
  }
}

console.log(`\n${CASOS.length - fallos}/${CASOS.length} correctos`);

if (fallos > 0) {
  process.exitCode = 1;
}
