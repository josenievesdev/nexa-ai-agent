import "dotenv/config";
import { performance } from "node:perf_hooks";
import { executeTool, toolDefinitions } from "../tools/index.js";

const OLLAMA_HOST =
  process.env.OLLAMA_HOST?.replace(/\/$/, "") ?? "http://127.0.0.1:11434";

const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

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
  message?: {
    role?: string;
    content?: string;
    tool_calls?: ToolCall[];
  };
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
- Cuando el usuario mencione un producto por nombre, - Cuando el usuario mencione un producto por nombre y todavía no conoces su producto_id obtenido mediante herramientas, usa buscar_producto antes de cualquier herramienta que requiera producto_id. usa buscar_producto primero.
- Si buscar_producto devuelve varias presentaciones y la petición no permite saber cuál quiere el usuario, pide una aclaración breve.
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
`.trim();

async function callOllama(messages: Message[]): Promise<OllamaResponse> {
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools: toolDefinitions,
      stream: false,
      think: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();

    throw new Error(
      `Ollama respondió HTTP ${response.status}: ${text || response.statusText}`
    );
  }

  return (await response.json()) as OllamaResponse;
}

export async function responderConAgente(
  userText: string,
  history: Message[] = []
): Promise<{ text: string; history: Message[] }> {

  console.log("\n[USER]");
  console.log(userText);

  const requestStart = performance.now();

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

    const toolCalls = assistantMessage.tool_calls ?? [];

    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? "",
      tool_calls: toolCalls,
    });

    if (toolCalls.length === 0) {
      const text = assistantMessage.content?.trim() || "Sin respuesta.";

      const totalElapsed = performance.now() - requestStart;

console.log(
  `\n[REQUEST COMPLETE] ${totalElapsed.toFixed(0)} ms`
);

      return {
        text,
        history: messages.slice(1),
      };
    }

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function?.name;

      if (!toolName) {
        continue;
      }

      let result: unknown;

      if (!toolName) {
      continue;
      }

      console.log(`\n[TOOL REQUEST] ${toolName}`);

console.log(
  JSON.stringify(toolCall.function.arguments ?? {}, null, 2)
);

const toolStart = performance.now();

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
