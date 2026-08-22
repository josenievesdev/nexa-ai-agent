import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "./db.js";

async function executeFile(relativePath: string) {
  const url = new URL(relativePath, import.meta.url);
  const text = await readFile(fileURLToPath(url), "utf8");

  await sql.unsafe(text).simple();
}

async function main() {
  console.log("1/2 Creando esquema...");

  await executeFile("../../database/schema.sql");

  console.log("2/2 Cargando datos de prueba...");

  await executeFile("../../database/seed.sql");

  console.log("Base de datos creada correctamente.");

  await sql.end();
}

main().catch(async (error) => {
  console.error("Error creando la base de datos:");
  console.error(error);

  await sql.end({ timeout: 1 }).catch(() => undefined);

  process.exit(1);
});