import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function withDatabase<T>(
  databasePath: string,
  operation: (database: DatabaseSync) => T,
): T {
  const directory = dirname(databasePath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);

  const database = new DatabaseSync(databasePath);
  try {
    chmodSync(databasePath, 0o600);
    database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    return operation(database);
  } finally {
    database.close();
  }
}
