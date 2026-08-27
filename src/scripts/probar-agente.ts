/*
 * Banco de pruebas end-to-end del agente.
 *
 * No modifica el agente: intercepta la salida estándar y lee los
 * eventos que ollama.ts ya emite ([TOOL REQUEST], [REQUEST
 * TELEMETRY]) para verificar qué herramientas se ejecutaron
 * realmente en cada caso.
 *
 * Uso:
 *   npm run probar                    todos los casos
 *   npm run probar -- stock ubicacion sólo esos ids
 *   npm run probar -- --verbose       con los logs del agente
 */

import { responderConAgente } from "../ai/ollama.js";
import { sql } from "../database/db.js";

type Caso = {
  id: string;
  pregunta: string;

  /*
   * Herramientas que la respuesta necesita haber ejecutado para
   * ser correcta. Si falta alguna, el caso falla aunque el modelo
   * haya redactado algo verosímil.
   */
  herramientasEsperadas: string[];
};

const CASOS: Caso[] = [
  {
    id: "sku",
    pregunta: "Busca el producto MED-0081",
    herramientasEsperadas: ["buscar_producto"],
  },
  {
    id: "codigo-barras",
    pregunta: "¿Qué producto tiene el código de barras 7709000000003?",
    herramientasEsperadas: ["buscar_producto"],
  },
  {
    id: "nombre",
    pregunta: "¿Qué presentaciones hay de ibuprofeno?",
    herramientasEsperadas: ["buscar_producto"],
  },
  {
    id: "stock",
    pregunta: "¿Cuánto stock hay de ibuprofeno?",
    herramientasEsperadas: ["buscar_producto", "consultar_stock"],
  },
  {
    id: "ubicacion",
    pregunta: "¿Dónde está el ibuprofeno?",
    herramientasEsperadas: ["buscar_producto", "consultar_ubicacion"],
  },
  {
    id: "ubicacion-explicita",
    pregunta: "¿Dónde está el ibuprofeno de 400 mg en Centro?",
    herramientasEsperadas: ["buscar_producto", "consultar_ubicacion"],
  },
  {
    id: "lotes-producto",
    pregunta: "¿Qué lotes tiene el ibuprofeno de 400 mg?",
    herramientasEsperadas: ["buscar_producto", "consultar_lotes"],
  },
  {
    id: "lotes-por-vencer",
    pregunta: "¿Qué lotes vencen en los próximos 30 días?",
    herramientasEsperadas: ["listar_lotes_por_vencer"],
  },
  {
    id: "stock-bajo",
    pregunta: "¿Qué productos tienen stock bajo?",
    herramientasEsperadas: ["listar_stock_bajo"],
  },
  {
    id: "menos-stock",
    pregunta: "¿Cuál es el producto con menos stock?",
    herramientasEsperadas: ["listar_stock_bajo"],
  },
  {
    id: "mas-vendidos",
    pregunta: "¿Cuáles son los productos más vendidos?",
    herramientasEsperadas: ["consultar_mas_vendidos"],
  },
  {
    id: "inexistente",
    pregunta: "Busca el producto MED-9999",
    herramientasEsperadas: ["buscar_producto"],
  },
];

type Resultado = {
  caso: Caso;
  ok: boolean;
  ms: number;
  texto: string;
  error: string | null;
  herramientas: string[];
  faltantes: string[];
  telemetria: string | null;
};

const TOOL_REQUEST = /\[TOOL REQUEST\] (\w+)/g;
const REQUEST_TELEMETRY = /\[REQUEST TELEMETRY\] (.+)/;

/*
 * Ejecuta el agente capturando su salida. Devolvemos el texto
 * completo para poder extraer las herramientas ejecutadas; en
 * modo verbose además lo dejamos pasar a la terminal.
 */
async function ejecutarCapturando(
  pregunta: string,
  verbose: boolean
): Promise<{ texto: string; salida: string; error: string | null }> {
  const original = process.stdout.write.bind(process.stdout);
  const partes: string[] = [];

  process.stdout.write = ((chunk: any, ...resto: any[]): boolean => {
    partes.push(typeof chunk === "string" ? chunk : String(chunk));

    if (verbose) {
      return (original as any)(chunk, ...resto);
    }

    return true;
  }) as typeof process.stdout.write;

  try {
    const respuesta = await responderConAgente(pregunta, []);

    return {
      texto: respuesta.text,
      salida: partes.join(""),
      error: null,
    };
  } catch (error) {
    return {
      texto: "",
      salida: partes.join(""),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    process.stdout.write = original;
  }
}

function herramientasDe(salida: string): string[] {
  const nombres: string[] = [];

  for (const coincidencia of salida.matchAll(TOOL_REQUEST)) {
    nombres.push(coincidencia[1]);
  }

  return nombres;
}

async function correrCaso(caso: Caso, verbose: boolean): Promise<Resultado> {
  const inicio = performance.now();

  const { texto, salida, error } = await ejecutarCapturando(
    caso.pregunta,
    verbose
  );

  const ms = performance.now() - inicio;
  const herramientas = herramientasDe(salida);

  const faltantes = caso.herramientasEsperadas.filter(
    (nombre) => !herramientas.includes(nombre)
  );

  return {
    caso,
    ok: error === null && faltantes.length === 0,
    ms,
    texto,
    error,
    herramientas,
    faltantes,
    telemetria: salida.match(REQUEST_TELEMETRY)?.[1]?.trim() ?? null,
  };
}

function imprimirResultado(resultado: Resultado, indice: number, total: number) {
  const marca = resultado.ok ? "OK  " : "FALLA";

  console.log(
    `\n[${indice}/${total}] ${marca} ${resultado.caso.id} ` +
      `(${(resultado.ms / 1000).toFixed(1)}s)`
  );

  console.log(`  Pregunta:    ${resultado.caso.pregunta}`);

  console.log(
    `  Tools:       ${
      resultado.herramientas.length > 0
        ? resultado.herramientas.join(" → ")
        : "ninguna"
    }`
  );

  if (resultado.faltantes.length > 0) {
    console.log(`  Faltaron:    ${resultado.faltantes.join(", ")}`);
  }

  if (resultado.telemetria) {
    console.log(`  Telemetría:  ${resultado.telemetria}`);
  }

  if (resultado.error) {
    console.log(`  Error:       ${resultado.error}`);
    return;
  }

  const respuesta = resultado.texto.replace(/\s*\n\s*/g, " ").trim();

  console.log(
    `  Respuesta:   ${
      respuesta.length > 300 ? `${respuesta.slice(0, 300)}...` : respuesta
    }`
  );
}

async function main() {
  const argumentos = process.argv.slice(2);
  const verbose = argumentos.includes("--verbose");
  const ids = argumentos.filter((valor) => !valor.startsWith("--"));

  const casos =
    ids.length > 0 ? CASOS.filter((caso) => ids.includes(caso.id)) : CASOS;

  if (casos.length === 0) {
    console.error(
      `Ningún caso coincide. Disponibles: ${CASOS.map((c) => c.id).join(", ")}`
    );

    process.exitCode = 1;
    return;
  }

  console.log(`Ejecutando ${casos.length} caso(s) contra el agente.\n`);

  const inicio = performance.now();
  const resultados: Resultado[] = [];

  for (const [indice, caso] of casos.entries()) {
    const resultado = await correrCaso(caso, verbose);

    resultados.push(resultado);
    imprimirResultado(resultado, indice + 1, casos.length);
  }

  const fallidos = resultados.filter((resultado) => !resultado.ok);
  const totalSegundos = (performance.now() - inicio) / 1000;

  console.log(
    `\n${"=".repeat(60)}\n` +
      `${resultados.length - fallidos.length}/${resultados.length} OK ` +
      `en ${totalSegundos.toFixed(1)}s`
  );

  if (fallidos.length > 0) {
    console.log(
      `Fallaron: ${fallidos.map((resultado) => resultado.caso.id).join(", ")}`
    );

    process.exitCode = 1;
  }
}

await main();
await sql.end({ timeout: 3 }).catch(() => undefined);
