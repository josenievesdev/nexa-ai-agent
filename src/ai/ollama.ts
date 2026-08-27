import "dotenv/config";
import { performance } from "node:perf_hooks";
import { executeTool, toolDefinitions } from "../tools/index.js";

const OLLAMA_HOST =
  process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://127.0.0.1:11434";

const OLLAMA_MODEL =
  process.env.OLLAMA_MODEL ??
  "ministral-3:14b-instruct-2512-q4_K_M";

const KNOWN_TOOL_NAMES: Set<string> = new Set(
  toolDefinitions.map((tool) => tool.function.name)
);

/*
 * Ollama usa num_ctx 4096 por defecto. Con este system prompt
 * (~2000 tokens) más el esquema de herramientas y el resultado de
 * una tool, el modelo choca contra el límite y devuelve
 * done_reason: "length" al escribir la respuesta final.
 *
 * ministral-3:8b admite un contexto mucho mayor, así que lo
 * declaramos de forma explícita. Si la VRAM de la GPU queda corta,
 * se puede bajar con OLLAMA_NUM_CTX.
 */
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 6144);

const MAX_HISTORY_MESSAGES = 12;

/*
 * Contar mensajes no acota nada: una sola respuesta del caso de
 * lotes ocupó 729 tokens, así que doce mensajes de ese tamaño son
 * ~8 700 tokens contra un num_ctx de 6 144. Ollama recorta en
 * silencio desde el principio del prompt, que es justo donde está
 * el system prompt, y el agente pierde sus reglas sin enterarse.
 *
 * El presupuesto se deriva del contexto declarado para que baje
 * solo si alguien baja OLLAMA_NUM_CTX. Una cuarta parte deja
 * espacio al system prompt (~1 040 tok), a las definiciones de
 * herramientas (~1 289 tok), al resultado de las herramientas del
 * turno y a la generación.
 */
const HISTORY_TOKEN_BUDGET = Math.max(
  400,
  Math.floor(OLLAMA_NUM_CTX * 0.25)
);

/*
 * Aproximación deliberadamente conservadora para español: contar
 * tokens de verdad exigiría el tokenizador del modelo, y aquí solo
 * necesitamos un techo.
 */
const CARACTERES_POR_TOKEN = 3.5;

const MAX_HISTORY_CHARS = Math.floor(
  HISTORY_TOKEN_BUDGET * CARACTERES_POR_TOKEN
);

const OLLAMA_MAX_ATTEMPTS = 2;
const OLLAMA_RETRY_DELAY_MS = 500;

/*
 * Sin límite de tiempo, un Ollama que deja de responder cuelga al
 * agente para siempre y retiene la conexión a PostgreSQL.
 *
 * El valor debe ser generoso: la generación legítima más lenta
 * medida fue de 76 s y el arranque en frío del modelo llegó a 69 s,
 * así que un turno real puede pasar de dos minutos. 180 s deja
 * margen sobre eso sin volver el bloqueo indefinido.
 *
 * No se reintenta un timeout: duplicar la espera antes de fallar
 * empeora el peor caso sin arreglar la causa.
 */
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 180000);

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
};

type ToolCall = {
  id?: string;
  function: {
    name: string;
    arguments: unknown;
  };
};

type OllamaResponse = {
  model?: string;
  created_at?: string;

  message?: {
    role?: string;
    content?: string;
    tool_calls?: ToolCall[];
  };

  done?: boolean;
  done_reason?: string;

  total_duration?: number;
  load_duration?: number;

  prompt_eval_count?: number;
  prompt_eval_duration?: number;

  eval_count?: number;
  eval_duration?: number;

  error?: string;
};

const SYSTEM_PROMPT = `
Eres SIBIA, un asistente empresarial conectado a la base de datos de una farmacia ficticia.

REGLAS:
- Responde siempre en español.
- Los datos de inventario, ubicaciones, lotes, stock y ventas deben salir de las herramientas. No los inventes.
- buscar_producto solamente identifica productos. Su resultado NO contiene información suficiente para responder sobre stock, ubicación, lotes, vencimientos o ventas.
- Si la respuesta requiere ubicación, debes haber ejecutado consultar_ubicacion en la consulta actual antes de responder.
- Si la respuesta requiere stock, debes haber ejecutado consultar_stock o una herramienta que entregue explícitamente stock en la consulta actual antes de responder.
- Si la respuesta requiere información de lotes o vencimientos de un producto, debes haber ejecutado consultar_lotes antes de responder.
- Si la respuesta requiere vencimientos generales, debes haber ejecutado listar_lotes_por_vencer antes de responder.
- Si la respuesta requiere productos con stock bajo, debes haber ejecutado listar_stock_bajo antes de responder.
- Si la respuesta requiere productos más vendidos, debes haber ejecutado consultar_mas_vendidos antes de responder.
- Nunca inventes sucursales, bodegas, ubicaciones, cantidades, lotes, fechas, precios o estadísticas aunque parezcan plausibles.
- Los resultados de las herramientas son la fuente de verdad para los datos empresariales.
- Si todavía no tienes mediante una herramienta los datos necesarios para contestar, utiliza la herramienta correspondiente antes de generar la respuesta final.
- Nunca supongas un producto_id.
- Cuando el usuario mencione un producto por nombre y todavía no conoces su producto_id obtenido mediante herramientas, usa buscar_producto antes de cualquier herramienta que requiera producto_id.
- Cuando la pregunta sea sobre stock, ubicación, lotes, vencimientos o ventas, buscar_producto nunca es la respuesta final: después de identificar el producto debes ejecutar la herramienta que responde esa pregunta antes de contestar.
- Si buscar_producto devuelve varias presentaciones y el usuario no indicó cuál, ejecuta esa herramienta para cada presentación encontrada, como máximo tres, y agrupa los resultados por presentación. No pidas aclaración en ese caso.
- Si el usuario especifica concentración o presentación, elige únicamente el resultado que coincida con ella.
- Para saber dónde está un producto usa consultar_ubicacion.
- Para saber cuánto hay usa consultar_stock.
- Para vencimientos de un producto usa consultar_lotes.
- Para vencimientos generales usa listar_lotes_por_vencer.
- Para faltantes o reabastecimiento general usa listar_stock_bajo.
- Para productos más vendidos usa consultar_mas_vendidos.
- Si una herramienta devuelve un arreglo vacío, explica que no se encontraron datos.
- No menciones nombres internos de herramientas, SQL, IDs internos ni detalles técnicos salvo que el usuario los pida.
- Sé breve, claro y útil.
- Cuando una herramienta devuelve una lista y el usuario solicita la lista completa, incluye todos los resultados recibidos.
- No omitas resultados de una herramienta sin indicarlo explícitamente.
- Si decides resumir una lista larga, indica cuántos resultados existen en total y cuántos estás mostrando.
- No agregues elementos que no aparezcan en los resultados de las herramientas.
- Algunas herramientas devuelven un objeto con resumen, paginacion y la lista de resultados. En ese caso apóyate en el resumen para dar los totales y enumera únicamente los resultados recibidos.
- Cuando paginacion.hay_mas sea true, indícalo al usuario y ofrece mostrar más resultados.
- Si el usuario pide ver más resultados, vuelve a llamar la misma herramienta con offset igual a paginacion.siguiente_offset.
`.trim();

/*
 * C3: el encadenamiento de herramientas no es determinista.
 *
 * Con "¿Dónde está el ibuprofeno?" el modelo identificó el
 * producto, recibió la instrucción de encadenar dentro del payload
 * de buscar_producto, la ignoró y cerró el turno prometiendo un
 * dato que nunca fue a buscar. Con la presentación explícita el
 * mismo flujo sí encadena: el steering mueve la probabilidad, no
 * la fija.
 *
 * Este guard no intenta convencer al modelo: comprueba después de
 * los hechos si la familia de herramientas que la pregunta exigía
 * llegó a ejecutarse, y si no, no acepta la respuesta.
 *
 * La detección es deliberadamente conservadora. Forzar una
 * herramienta de más cuesta una iteración y latencia, así que se
 * exige además que el turno ya haya ejecutado alguna herramienta:
 * una pregunta conversacional o meta no dispara nada y queda
 * exenta.
 */
type IntencionDeDatos = {
  nombre: string;
  patron: RegExp;
  herramientas: string[];
};

const INTENCIONES_DE_DATOS: IntencionDeDatos[] = [
  {
    nombre: "ubicación",
    patron:
      /(d[oó]nde|ubicaci[oó]n|ubicad|pasillo|estante|bodega|localiza)/i,
    herramientas: ["consultar_ubicacion"],
  },
  {
    nombre: "stock",
    patron:
      /(stock|existencias|inventario|agotad|faltante|reabastec|reorden|cu[aá]nt[oa]s? (hay|quedan|unidades|tenemos))/i,
    herramientas: ["consultar_stock", "listar_stock_bajo"],
  },
  {
    nombre: "lotes o vencimientos",
    patron: /(lote|vence|vencen|vencimiento|caduc)/i,
    herramientas: ["consultar_lotes", "listar_lotes_por_vencer"],
  },
  {
    nombre: "ventas",
    patron: /(vendid|ventas|rotaci[oó]n)/i,
    herramientas: ["consultar_mas_vendidos"],
  },
];

export function detectarIntenciones(texto: string): IntencionDeDatos[] {
  return INTENCIONES_DE_DATOS.filter((intencion) =>
    intencion.patron.test(texto)
  );
}

/*
 * La corrección va como mensaje del sistema inyectado justo antes
 * del punto de decisión del modelo. Tres redacciones de reglas en
 * el SYSTEM_PROMPT fallaron antes; lo que funciona en este modelo
 * es la instrucción imperativa y cercana.
 */
function correccionDeCierre(faltantes: IntencionDeDatos[]): string {
  const familias = faltantes
    .map(
      (intencion) =>
        `${intencion.nombre} (${intencion.herramientas.join(" o ")})`
    )
    .join("; ");

  return [
    "NO HAS RESPONDIDO LA PREGUNTA.",
    `La consulta del usuario requiere datos de ${familias},`,
    "y en este turno no ejecutaste ninguna de esas herramientas.",
    "Está prohibido responder sin ese dato y está prohibido pedir aclaración.",
    "Ejecuta ahora la herramienta correspondiente, usando el producto_id que ya obtuviste,",
    "y responde después únicamente con lo que devuelva.",
  ].join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type JsonObject = Record<string, unknown>;

/*
 * Longitud máxima de contenido sobre la que intentamos recuperar
 * una llamada textual. Evita escanear respuestas enormes.
 */
const MAX_RECOVERABLE_CONTENT_LENGTH = 20000;

/*
 * Separadores que el modelo puede escribir entre el nombre de la
 * herramienta y su objeto JSON de argumentos:
 *
 *   buscar_producto{"sku":"MED-0081"}
 *   buscar_producto [ARGS]{"sku":"MED-0081"}
 *   buscar_producto: {"sku":"MED-0081"}
 *   buscar_producto({"sku":"MED-0081"})
 */
const TOOL_ARGS_SEPARATOR = /^(?:\[ARGS\]|[\s:=(])*/;

/*
 * Lee un objeto JSON balanceado a partir de `start`.
 *
 * No usamos una expresión regular codiciosa porque los argumentos
 * pueden contener llaves dentro de cadenas. Recorremos el texto
 * contando llaves, respetando cadenas y escapes, y validamos el
 * resultado con JSON.parse. Nunca se evalúa código.
 */
function readJsonObject(
  text: string,
  start: number
): { raw: string; value: JsonObject } | null {
  if (text[start] !== "{") {
    return null;
  }

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = start; index < text.length; index++) {
    const char = text[index];

    if (insideString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        insideString = false;
      }

      continue;
    }

    if (char === '"') {
      insideString = true;
      continue;
    }

    if (char === "{") {
      depth++;
      continue;
    }

    if (char !== "}") {
      continue;
    }

    depth--;

    if (depth > 0) {
      continue;
    }

    const raw = text.slice(start, index + 1);

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return { raw, value: parsed as JsonObject };
  }

  return null;
}

/*
 * Un nombre de herramienta solamente es válido si no está pegado a
 * otro identificador. Sí aceptamos prefijos de espacio de nombres
 * que algunos modelos inventan (`azienda_buscar_producto`,
 * `functions.buscar_producto`) porque el nombre real sigue siendo
 * exactamente el de una herramienta declarada.
 */
function hasValidToolNameBoundary(content: string, index: number): boolean {
  if (index === 0) {
    return true;
  }

  return !/[A-Za-z0-9]/.test(content[index - 1]);
}

type ToolCallCandidate = {
  start: number;
  end: number;
  toolCall: ToolCall;
};

function findToolCallCandidates(content: string): ToolCallCandidate[] {
  const candidates: ToolCallCandidate[] = [];

  for (const toolName of KNOWN_TOOL_NAMES) {
    let searchFrom = 0;

    while (searchFrom < content.length) {
      const index = content.indexOf(toolName, searchFrom);

      if (index === -1) {
        break;
      }

      const afterName = index + toolName.length;
      searchFrom = afterName;

      if (!hasValidToolNameBoundary(content, index)) {
        continue;
      }

      const separator =
        content.slice(afterName).match(TOOL_ARGS_SEPARATOR)?.[0] ?? "";

      const jsonStart = afterName + separator.length;
      const parsed = readJsonObject(content, jsonStart);

      if (!parsed) {
        continue;
      }

      candidates.push({
        start: index,
        end: jsonStart + parsed.raw.length,

        toolCall: {
          function: {
            name: toolName,
            arguments: parsed.value,
          },
        },
      });
    }
  }

  return candidates.sort((first, second) => first.start - second.start);
}

function dedupeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const seen = new Set<string>();
  const unique: ToolCall[] = [];

  for (const toolCall of toolCalls) {
    const name = toolCall.function?.name;

    if (!name) {
      /*
       * Lo dejamos pasar para que el flujo principal lo reporte
       * como tool_call inválido en lugar de ocultarlo aquí.
       */
      unique.push(toolCall);
      continue;
    }

    const key = claveDeHerramienta(name, toolCall.function.arguments);

    if (seen.has(key)) {
      console.warn(
        `\n[TOOL CALL DUPLICADO] Se descartó una llamada repetida a ${name}.`
      );

      continue;
    }

    seen.add(key);
    unique.push(toolCall);
  }

  return unique;
}

/*
 * Compatibilidad defensiva para casos donde el modelo escribe la
 * llamada como texto plano y Ollama no la expone en
 * message.tool_calls.
 *
 * Formatos reconocidos (con o sin texto alrededor):
 *
 *   listar_lotes_por_vencer[ARGS]{"dias":30}
 *   [TOOL_CALLS]listar_lotes_por_vencer[ARGS]{"dias":30}
 *   azienda_buscar_producto{"nombre":"ibuprofeno"}
 *   Voy a consultar. buscar_producto: {"sku":"MED-0081"}
 *
 * Seguridad: el nombre debe existir en toolDefinitions y los
 * argumentos deben ser un objeto JSON válido. Cualquier otra cosa
 * se descarta.
 */
export function recoverToolCallsFromContent(content: string): ToolCall[] {
  const trimmed = content.trim();

  if (!trimmed || trimmed.length > MAX_RECOVERABLE_CONTENT_LENGTH) {
    return [];
  }

  const candidates = findToolCallCandidates(trimmed);

  const recovered: ToolCall[] = [];
  let consumedUntil = 0;

  for (const candidate of candidates) {
    /*
     * Ignoramos coincidencias que caen dentro de una llamada ya
     * recuperada, por ejemplo un nombre de herramienta escrito
     * dentro de los argumentos de otra.
     */
    if (candidate.start < consumedUntil) {
      continue;
    }

    consumedUntil = candidate.end;
    recovered.push(candidate.toolCall);
  }

  return dedupeToolCalls(recovered);
}

export function looksLikeMalformedToolCall(content: string): boolean {
  if (content.includes("[ARGS]") || content.includes("[TOOL_CALLS]")) {
    return true;
  }

  for (const toolName of KNOWN_TOOL_NAMES) {
    let searchFrom = 0;

    while (searchFrom < content.length) {
      const index = content.indexOf(toolName, searchFrom);

      if (index === -1) {
        break;
      }

      const afterName = index + toolName.length;
      searchFrom = afterName;

      if (!hasValidToolNameBoundary(content, index)) {
        continue;
      }

      const rest = content.slice(afterName).trimStart();

      if (rest.startsWith("{") || rest.startsWith("(")) {
        return true;
      }
    }
  }

  return false;
}

/*
 * El historial crece indefinidamente entre turnos y termina
 * empujando al modelo contra el límite de contexto, que es una de
 * las causas de done_reason: "length".
 *
 * Conservamos las últimas conversaciones completas y siempre
 * empezamos en un mensaje de usuario para no dejar una respuesta
 * del assistant sin su pregunta.
 */
function limitHistory(history: Message[]): Message[] {
  const conservados: Message[] = [];
  let caracteres = 0;

  /*
   * Recorremos del mensaje más reciente hacia atrás. El más
   * reciente entra siempre: dejar el turno sin su propia respuesta
   * rompe la conversación más de lo que ahorra.
   */
  for (let indice = history.length - 1; indice >= 0; indice--) {
    const mensaje = history[indice];

    if (conservados.length >= MAX_HISTORY_MESSAGES) {
      break;
    }

    if (
      conservados.length > 0 &&
      caracteres + mensaje.content.length > MAX_HISTORY_CHARS
    ) {
      break;
    }

    conservados.unshift(mensaje);
    caracteres += mensaje.content.length;
  }

  /*
   * Siempre empezamos en un mensaje de usuario para no dejar una
   * respuesta del assistant sin la pregunta que la originó.
   */
  const primerUsuario = conservados.findIndex(
    (mensaje) => mensaje.role === "user"
  );

  const resultado =
    primerUsuario > 0 ? conservados.slice(primerUsuario) : conservados;

  if (resultado.length < history.length) {
    const conservadosChars = resultado.reduce(
      (suma, mensaje) => suma + mensaje.content.length,
      0
    );

    console.log(
      `\n[HISTORY TRIM] ${history.length} → ${resultado.length} mensajes, ` +
        `${conservadosChars} caracteres (~${Math.round(
          conservadosChars / CARACTERES_POR_TOKEN
        )} tok, presupuesto ${HISTORY_TOKEN_BUDGET} tok)`
    );
  }

  return resultado;
}

/*
 * Ollama reporta las duraciones en nanosegundos y no deriva
 * ninguna velocidad. Sin separar carga, evaluación del prompt y
 * generación, dos consultas con tiempos muy distintos parecen
 * inexplicables: la diferencia entre 6,7 s y 59,5 s para la misma
 * pregunta está entera en load_duration, no en el modelo ni en la
 * base de datos.
 */
const NS_POR_MS = 1_000_000;
const NS_POR_S = 1_000_000_000;

type Telemetria = {
  total_ms: number | null;
  carga_ms: number | null;
  prompt_eval_ms: number | null;
  generacion_ms: number | null;
  overhead_ms: number | null;

  prompt_tokens: number | null;
  tokens_generados: number | null;

  prompt_tokens_por_segundo: number | null;
  tokens_por_segundo: number | null;
};

function nsAMs(nanosegundos: number | undefined): number | null {
  if (typeof nanosegundos !== "number" || !Number.isFinite(nanosegundos)) {
    return null;
  }

  return Math.round(nanosegundos / NS_POR_MS);
}

function porSegundo(
  tokens: number | undefined,
  nanosegundos: number | undefined
): number | null {
  if (typeof tokens !== "number" || !Number.isFinite(tokens)) {
    return null;
  }

  if (
    typeof nanosegundos !== "number" ||
    !Number.isFinite(nanosegundos) ||
    nanosegundos <= 0
  ) {
    return null;
  }

  return Number(((tokens * NS_POR_S) / nanosegundos).toFixed(1));
}

function extraerTelemetria(response: OllamaResponse): Telemetria {
  const totalMs = nsAMs(response.total_duration);
  const cargaMs = nsAMs(response.load_duration);
  const promptEvalMs = nsAMs(response.prompt_eval_duration);
  const generacionMs = nsAMs(response.eval_duration);

  /*
   * Lo que el total no explica: transporte, tokenización y
   * cualquier espera fuera de las tres fases medidas.
   */
  const overheadMs =
    totalMs === null ||
    cargaMs === null ||
    promptEvalMs === null ||
    generacionMs === null
      ? null
      : Math.max(0, totalMs - cargaMs - promptEvalMs - generacionMs);

  return {
    total_ms: totalMs,
    carga_ms: cargaMs,
    prompt_eval_ms: promptEvalMs,
    generacion_ms: generacionMs,
    overhead_ms: overheadMs,

    prompt_tokens: response.prompt_eval_count ?? null,
    tokens_generados: response.eval_count ?? null,

    prompt_tokens_por_segundo: porSegundo(
      response.prompt_eval_count,
      response.prompt_eval_duration
    ),

    tokens_por_segundo: porSegundo(
      response.eval_count,
      response.eval_duration
    ),
  };
}

function enSegundos(milisegundos: number | null): string {
  if (milisegundos === null) {
    return "?";
  }

  return `${(milisegundos / 1000).toFixed(1)}s`;
}

function formatearTelemetria(telemetria: Telemetria): string {
  const prompt =
    `prompt ${telemetria.prompt_tokens ?? "?"} tok / ` +
    `${enSegundos(telemetria.prompt_eval_ms)} @ ` +
    `${telemetria.prompt_tokens_por_segundo ?? "?"} tok/s`;

  const generacion =
    `generacion ${telemetria.tokens_generados ?? "?"} tok / ` +
    `${enSegundos(telemetria.generacion_ms)} @ ` +
    `${telemetria.tokens_por_segundo ?? "?"} tok/s`;

  return [
    `total ${enSegundos(telemetria.total_ms)}`,
    `carga ${enSegundos(telemetria.carga_ms)}`,
    prompt,
    generacion,
    `overhead ${enSegundos(telemetria.overhead_ms)}`,
  ].join(" | ");
}

/*
 * Un turno del agente puede costar varias llamadas al modelo. El
 * usuario percibe la suma, no cada iteración, así que acumulamos
 * las fases para poder atribuir el tiempo total del turno.
 */
type TelemetriaTurno = {
  llamadas: number;
  carga_ms: number;
  prompt_eval_ms: number;
  generacion_ms: number;
  prompt_tokens: number;
  tokens_generados: number;
};

function nuevaTelemetriaTurno(): TelemetriaTurno {
  return {
    llamadas: 0,
    carga_ms: 0,
    prompt_eval_ms: 0,
    generacion_ms: 0,
    prompt_tokens: 0,
    tokens_generados: 0,
  };
}

function acumularTelemetria(
  turno: TelemetriaTurno,
  telemetria: Telemetria
): void {
  turno.llamadas++;
  turno.carga_ms += telemetria.carga_ms ?? 0;
  turno.prompt_eval_ms += telemetria.prompt_eval_ms ?? 0;
  turno.generacion_ms += telemetria.generacion_ms ?? 0;
  turno.prompt_tokens += telemetria.prompt_tokens ?? 0;
  turno.tokens_generados += telemetria.tokens_generados ?? 0;
}

function formatearTelemetriaTurno(turno: TelemetriaTurno): string {
  const generacionSegundos = turno.generacion_ms / 1000;

  const velocidad =
    generacionSegundos > 0
      ? (turno.tokens_generados / generacionSegundos).toFixed(1)
      : "?";

  return [
    `${turno.llamadas} llamada(s)`,
    `carga ${enSegundos(turno.carga_ms)}`,
    `prompt ${turno.prompt_tokens} tok / ${enSegundos(turno.prompt_eval_ms)}`,
    `generacion ${turno.tokens_generados} tok / ` +
      `${enSegundos(turno.generacion_ms)} @ ${velocidad} tok/s`,
  ].join(" | ");
}

/*
 * La clave debe identificar la consulta, no su redacción. El
 * modelo alterna entre {producto_id: 6} y {producto_id: 6,
 * sucursal: null}, y entre "Centro" y "centro": con
 * JSON.stringify crudo eso son llamadas distintas y el caché no
 * atrapa nada.
 *
 * Normalizamos como ya hace el SQL: sin campos vacíos, claves
 * ordenadas y texto comparado sin mayúsculas ni espacios.
 */
function claveDeHerramienta(nombre: string, argumentos: unknown): string {
  const args =
    argumentos && typeof argumentos === "object" && !Array.isArray(argumentos)
      ? (argumentos as JsonObject)
      : {};

  const normalizados = Object.entries(args)
    .filter(
      ([, valor]) => valor !== null && valor !== undefined && valor !== ""
    )
    .map(
      ([clave, valor]) =>
        [
          clave,
          typeof valor === "string" ? valor.trim().toLowerCase() : valor,
        ] as const
    )
    .sort(([primera], [segunda]) => primera.localeCompare(segunda));

  return `${nombre}:${JSON.stringify(normalizados)}`;
}

/*
 * Reusar el resultado en silencio evitaría la consulta repetida
 * pero no el bucle: el modelo volvería a pedir lo mismo. El aviso
 * va dentro del payload porque es donde este modelo sí atiende las
 * instrucciones, como ya se comprobó con siguiente_paso.
 */
const AVISO_HERRAMIENTA_REPETIDA =
  "Ya ejecutaste esta herramienta con estos mismos argumentos en este turno. " +
  "No vuelvas a llamarla: responde ahora usando este resultado.";

function conAvisoDeRepeticion(resultado: unknown): JsonObject {
  if (Array.isArray(resultado)) {
    return {
      aviso: AVISO_HERRAMIENTA_REPETIDA,
      resultados: resultado,
    };
  }

  if (resultado && typeof resultado === "object") {
    return {
      aviso: AVISO_HERRAMIENTA_REPETIDA,
      ...(resultado as JsonObject),
    };
  }

  return {
    aviso: AVISO_HERRAMIENTA_REPETIDA,
    resultado,
  };
}

function logOllamaResponse(response: OllamaResponse) {
  const content = response.message?.content ?? "";
  const toolCalls = response.message?.tool_calls ?? [];
  const telemetria = extraerTelemetria(response);

  console.log("\n[OLLAMA RESPONSE]");

  console.log(
    JSON.stringify(
      {
        model: response.model,
        done: response.done,
        done_reason: response.done_reason,
        error: response.error,

        content_length: content.length,
        content_preview:
          content.length > 500
            ? `${content.slice(0, 500)}...`
            : content,

        tool_calls: toolCalls,

        telemetria,
      },
      null,
      2
    )
  );

  console.log(`\n[OLLAMA TELEMETRY] ${formatearTelemetria(telemetria)}`);
}

/*
 * Reenviar la misma petición ante done_reason: "length" no cambia
 * nada. En la corrida donde ocurrió, el modelo generó exactamente
 * 789 tokens las dos veces: el reintento solo duplicó la espera.
 *
 * El segundo intento cambia la petición, no solo la repite.
 */
const INSTRUCCION_BREVEDAD = [
  "La respuesta anterior se cortó por límite de tokens.",
  "Responde ahora de forma mucho más breve.",
  "Usa los totales del campo resumen de las herramientas en lugar de enumerar registros.",
  "No reproduzcas tablas ni listas largas y no repitas datos ya entregados.",
  "Máximo diez líneas.",
].join(" ");

async function callOllama(messages: Message[]): Promise<OllamaResponse> {
  let sawTruncatedResponse = false;
  let pedirBrevedad = false;

  for (let attempt = 1; attempt <= OLLAMA_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(
        `\n[OLLAMA RETRY] Intento ${attempt}/${OLLAMA_MAX_ATTEMPTS}` +
          (pedirBrevedad ? " con instrucción de brevedad" : "")
      );
    }

    const mensajesEnviados: Message[] = pedirBrevedad
      ? [...messages, { role: "system", content: INSTRUCCION_BREVEDAD }]
      : messages;

    /*
     * El controlador cubre la petición y también la lectura del
     * cuerpo: una conexión que se queda a medio responder es tan
     * bloqueante como una que nunca contesta.
     */
    const controlador = new AbortController();

    const temporizador = setTimeout(() => {
      controlador.abort();
    }, OLLAMA_TIMEOUT_MS);

    let response: Response;
    let rawText: string;

    try {
      response = await fetch(`${OLLAMA_HOST}/api/chat`, {
        method: "POST",

        headers: {
          "content-type": "application/json",
        },

        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: mensajesEnviados,
          tools: toolDefinitions,
          stream: false,
          think: false,

          options: {
            num_ctx: OLLAMA_NUM_CTX,
          },
        }),

        signal: controlador.signal,
      });

      rawText = await response.text();
    } catch (error) {
      if (controlador.signal.aborted) {
        console.error("\n[OLLAMA TIMEOUT]");

        console.error(
          `No hubo respuesta en ${OLLAMA_TIMEOUT_MS} ms (modelo ${OLLAMA_MODEL}).`
        );

        const limite =
          OLLAMA_TIMEOUT_MS >= 1000
            ? `${(OLLAMA_TIMEOUT_MS / 1000).toFixed(0)} s`
            : `${OLLAMA_TIMEOUT_MS} ms`;

        throw new Error(
          `Ollama no respondió en ${limite}. ` +
            "Verifica que el servicio esté activo y que el modelo quepa en la GPU. " +
            "Si el arranque en frío es legítimamente más lento, sube OLLAMA_TIMEOUT_MS."
        );
      }

      console.error("\n[OLLAMA NETWORK ERROR]");
      console.error(error instanceof Error ? error.message : error);

      throw new Error(
        "No fue posible comunicarse con Ollama en " +
          `${OLLAMA_HOST}: ` +
          (error instanceof Error ? error.message : "error desconocido.")
      );
    } finally {
      clearTimeout(temporizador);
    }

    if (!response.ok) {
      console.error("\n[OLLAMA HTTP ERROR]");
      console.error(`Status: ${response.status}`);
      console.error(rawText || response.statusText);

      throw new Error(
        `Ollama respondió HTTP ${response.status}: ${
          rawText || response.statusText
        }`
      );
    }

    let parsed: OllamaResponse;

    try {
      parsed = JSON.parse(rawText) as OllamaResponse;
    } catch {
      console.error("\n[OLLAMA INVALID JSON]");
      console.error(rawText);

      throw new Error(
        "Ollama respondió correctamente por HTTP, pero la respuesta no era JSON válido."
      );
    }

    logOllamaResponse(parsed);

    /*
     * Ollama puede responder HTTP 200 y reportar el fallo dentro
     * del cuerpo. Si no lo propagamos aquí, el error real queda
     * oculto detrás de "respuesta incompleta".
     */
    if (parsed.error) {
      throw new Error("Ollama reportó un error: " + parsed.error);
    }

    const truncatedResponse = parsed.done_reason === "length";
    const incompleteResponse =
      parsed.done !== true || !parsed.message || truncatedResponse;

    if (truncatedResponse) {
      sawTruncatedResponse = true;
    }

    if (!incompleteResponse) {
      return parsed;
    }

    console.warn("\n[OLLAMA INCOMPLETE RESPONSE]");
    console.warn("Cuerpo recibido: " + rawText.slice(0, 500));
    console.warn(
      truncatedResponse
        ? `Ollama truncó la respuesta por límite de tokens en el intento ${attempt}/${OLLAMA_MAX_ATTEMPTS}.`
        : `Ollama devolvió una respuesta incompleta en el intento ${attempt}/${OLLAMA_MAX_ATTEMPTS}.`
    );

    if (attempt < OLLAMA_MAX_ATTEMPTS) {
      if (truncatedResponse) {
        pedirBrevedad = true;

        console.warn(
          `Reintentando en ${OLLAMA_RETRY_DELAY_MS} ms con instrucción de brevedad ` +
            "en lugar de repetir la misma petición..."
        );
      } else {
        console.warn(`Reintentando en ${OLLAMA_RETRY_DELAY_MS} ms...`);
      }

      await sleep(OLLAMA_RETRY_DELAY_MS);
      continue;
    }

    if (sawTruncatedResponse) {
      throw new Error(
        `Ollama truncó la respuesta por límite de tokens en los ${OLLAMA_MAX_ATTEMPTS} intentos, ` +
          "incluso pidiendo una respuesta más breve. " +
          "La respuesta incompleta NO fue procesada ni guardada en el historial. " +
          `Reduce el volumen de datos de la consulta o sube OLLAMA_NUM_CTX (actual: ${OLLAMA_NUM_CTX}).`
      );
    }

    throw new Error(
      `Ollama devolvió una respuesta incompleta después de ${OLLAMA_MAX_ATTEMPTS} intentos. ` +
        "La respuesta NO fue procesada ni guardada en el historial."
    );
  }

  throw new Error("No fue posible obtener una respuesta válida de Ollama.");
}

export async function responderConAgente(
  userText: string,
  history: Message[] = []
): Promise<{ text: string; history: Message[] }> {
  console.log("\n[USER]");
  console.log(userText);

  const requestStart = performance.now();
  const telemetriaTurno = nuevaTelemetriaTurno();

  /*
   * Vive un solo turno a propósito: entre turnos los datos pueden
   * haber cambiado y reusarlos sería contaminar el contexto.
   */
  const cacheHerramientas = new Map<string, unknown>();

  /*
   * Guard de cierre de turno (C3). Las intenciones se leen solo de
   * la pregunta actual: el historial no obliga a nada.
   */
  const intencionesDelTurno = detectarIntenciones(userText);
  const herramientasEjecutadas = new Set<string>();
  let correccionDeCierreAplicada = false;

  if (intencionesDelTurno.length > 0) {
    console.log(
      `\n[TURN GUARD] Intención detectada: ${intencionesDelTurno
        .map((intencion) => intencion.nombre)
        .join(", ")}`
    );
  }

  const messages: Message[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...history,
    {
      role: "user",
      content: userText,
    },
  ];

  for (let iteration = 0; iteration < 8; iteration++) {
    const modelStart = performance.now();

    const response = await callOllama(messages);

    const modelElapsed = performance.now() - modelStart;

    acumularTelemetria(telemetriaTurno, extraerTelemetria(response));

    console.log(
      `\n[MODEL] Iteración ${iteration + 1}: ${modelElapsed.toFixed(0)} ms`
    );

    if (response.error) {
      throw new Error(response.error);
    }

    const assistantMessage = response.message;

    if (!assistantMessage) {
      throw new Error("Ollama no devolvió un mensaje.");
    }

    let content = assistantMessage.content?.trim() ?? "";
    let toolCalls = assistantMessage.tool_calls ?? [];

    /*
     * Algunos modelos con formato Mistral generan la llamada de
     * herramienta como texto aunque Ollama no la exponga en
     * message.tool_calls.
     *
     * Si dentro del contenido aparece una herramienta conocida
     * seguida de argumentos JSON válidos, recuperamos la llamada
     * de forma determinista.
     */
    if (toolCalls.length > 0) {
      toolCalls = dedupeToolCalls(toolCalls);
    } else if (content.length > 0) {
      const recoveredToolCalls = recoverToolCallsFromContent(content);

      if (recoveredToolCalls.length > 0) {
        console.warn("\n[TOOL CALL RECOVERED]");
        console.warn(
          `Se recuperaron ${recoveredToolCalls.length} llamada(s) textual(es): ` +
            recoveredToolCalls
              .map((toolCall) => toolCall.function.name)
              .join(", ")
        );

        toolCalls = recoveredToolCalls;

        /*
         * El texto que acompaña a la llamada es narración del
         * modelo, no una respuesta final: no debe llegar al
         * usuario ni al historial.
         */
        content = "";
      } else if (looksLikeMalformedToolCall(content)) {
        throw new Error(
          "Ollama devolvió texto con apariencia de tool_call, pero no fue posible validarlo de forma segura. " +
            "La respuesta NO fue mostrada al usuario ni guardada en el historial."
        );
      }
    }

    /*
     * IMPORTANTE:
     *
     * Antes NEXA convertía:
     *
     * content vacío + 0 tool_calls
     *
     * en:
     *
     * "Sin respuesta."
     *
     * Eso ocultaba errores reales de integración y además podía
     * contaminar el historial.
     *
     * Ahora lo consideramos una anomalía explícita.
     */
    if (toolCalls.length === 0 && content.length === 0) {
      throw new Error(
        "Ollama devolvió una respuesta vacía sin tool_calls. " +
          "La respuesta NO fue guardada en el historial."
      );
    }

    /*
     * Si existen tool calls, sí necesitamos guardar el mensaje
     * del assistant porque forma parte del protocolo de tools
     * que se enviará nuevamente a Ollama.
     */
    if (toolCalls.length > 0) {
      messages.push({
        role: "assistant",
        content,
        tool_calls: toolCalls,
      });
    }

    /*
     * No hay tool calls y sí existe contenido:
     * tenemos una respuesta final válida.
     */
    if (toolCalls.length === 0) {
      /*
       * Antes de aceptar la respuesta, comprobamos que la evidencia
       * que la pregunta exigía se haya buscado de verdad.
       *
       * Solo actuamos si el turno ya ejecutó alguna herramienta:
       * sin eso no hay contexto de producto y forzar una llamada
       * sería inventar trabajo.
       */
      const faltantes = intencionesDelTurno.filter(
        (intencion) =>
          !intencion.herramientas.some((herramienta) =>
            herramientasEjecutadas.has(herramienta)
          )
      );

      if (faltantes.length > 0 && herramientasEjecutadas.size > 0) {
        const familias = faltantes
          .map((intencion) => intencion.nombre)
          .join(", ");

        if (!correccionDeCierreAplicada) {
          correccionDeCierreAplicada = true;

          console.warn(
            `\n[TURN GUARD] Respuesta final rechazada: la pregunta requiere ${familias} ` +
              `y solo se ejecutó ${[...herramientasEjecutadas].join(", ")}. ` +
              "Reinyectando corrección (único reintento)."
          );

          messages.push({
            role: "system",
            content: correccionDeCierre(faltantes),
          });

          continue;
        }

        throw new Error(
          `El agente cerró el turno sin obtener los datos de ${familias} que la pregunta requería, ` +
            "incluso después de una corrección explícita. " +
            "La respuesta NO fue mostrada al usuario ni guardada en el historial."
        );
      }

      const totalElapsed = performance.now() - requestStart;

      console.log(
        `\n[REQUEST COMPLETE] ${totalElapsed.toFixed(0)} ms`
      );

      console.log(
        `[REQUEST TELEMETRY] ${formatearTelemetriaTurno(telemetriaTurno)}`
      );

      messages.push({
        role: "assistant",
        content,
      });

      const cleanHistory = messages
        .slice(1)
        .filter((message) => {
          /*
           * Nunca persistimos resultados internos de tools.
           */
          if (message.role === "tool") {
            return false;
          }

          /*
           * Ni las correcciones que el guard de cierre inyecta:
           * son andamiaje de este turno, no conversación.
           */
          if (message.role === "system") {
            return false;
          }

          /*
           * Tampoco persistimos mensajes intermedios del
           * assistant que únicamente contenían tool_calls.
           */
          if (
            message.role === "assistant" &&
            message.tool_calls &&
            message.tool_calls.length > 0
          ) {
            return false;
          }

          /*
           * Y nunca guardamos mensajes assistant vacíos.
           */
          if (
            message.role === "assistant" &&
            message.content.trim().length === 0
          ) {
            return false;
          }

          return true;
        });

      return {
        text: content,
        history: limitHistory(cleanHistory),
      };
    }

    /*
     * Ejecutamos las herramientas solicitadas.
     */
    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;

      if (!toolName) {
        throw new Error(
          "Ollama devolvió un tool_call sin nombre de herramienta."
        );
      }

      herramientasEjecutadas.add(toolName);

      console.log(`\n[TOOL REQUEST] ${toolName}`);

      console.log(
        JSON.stringify(
          toolCall.function.arguments ?? {},
          null,
          2
        )
      );

      const clave = claveDeHerramienta(
        toolName,
        toolCall.function.arguments
      );

      /*
       * La deduplicación solo cubría un mismo mensaje del modelo.
       * Entre iteraciones, repetir la llamada volvía a consultar
       * PostgreSQL y a pagar otra llamada al modelo, hasta agotar
       * las ocho iteraciones.
       */
      if (cacheHerramientas.has(clave)) {
        console.warn(
          `\n[TOOL CACHE HIT] ${toolName}: se reutiliza el resultado ya obtenido en este turno.`
        );

        messages.push({
          role: "tool",
          tool_name: toolName,
          content: JSON.stringify(
            conAvisoDeRepeticion(cacheHerramientas.get(clave))
          ),
        });

        continue;
      }

      const toolStart = performance.now();

      let result: unknown;

      try {
        result = await executeTool(
          toolName,
          toolCall.function.arguments
        );
      } catch (error) {
        result = {
          error:
            error instanceof Error
              ? error.message
              : "Error desconocido ejecutando la herramienta.",
        };
      }

      const toolElapsed = performance.now() - toolStart;

      cacheHerramientas.set(clave, result);

      console.log(
        `\n[TOOL RESPONSE] ${toolName}: ${toolElapsed.toFixed(0)} ms`
      );

      console.log(
        JSON.stringify(result, null, 2)
      );

      messages.push({
        role: "tool",
        tool_name: toolName,
        content: JSON.stringify(result),
      });
    }
  }

  throw new Error(
    "El agente superó el máximo de iteraciones sin producir una respuesta final."
  );
}
