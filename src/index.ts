import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { responderConAgente } from "./ai/ollama.js";
import { sql } from "./database/db.js";

const rl = readline.createInterface({ input, output });

async function main() {
  console.log("SIBIA - Asistente empresarial de inventario");
  console.log("Escribe /salir para terminar.\n");

  let history: any[] = [];

  while (true) {
    const question = (await rl.question("Tú > ")).trim();

    if (!question) {
      continue;
    }

    if (question.toLowerCase() === "/salir") {
      break;
    }

    try {
      const response = await responderConAgente(question, history);

      history = response.history;

      console.log(`\nSIBIA > ${response.text}\n`);
    } catch (error) {
      console.error(
        "\nError:",
        error instanceof Error ? error.message : error,
        "\n"
      );
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await sql.end({ timeout: 3 }).catch(() => undefined);
  });
