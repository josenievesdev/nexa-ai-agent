import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

export const sql = postgres(connectionString, {
  ssl: "require",
});