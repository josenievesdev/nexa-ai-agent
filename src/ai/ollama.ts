import "dotenv/config";
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
- Nunca supongas un producto_id.
- Cuando el usuario mencione un producto por nombre, normalmente usa buscar_producto primero.
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
    const response = await callOllama(messages);

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
