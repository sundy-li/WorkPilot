import { readFile } from "node:fs/promises";

export async function readSchemaSql() {
  const schemaUrl = new URL("../../db/schema.sql", import.meta.url);
  return readFile(schemaUrl, "utf8");
}

export function assertSafeIdentifier(identifier: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
}
