import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function appendJsonl(file: string, record: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
}
