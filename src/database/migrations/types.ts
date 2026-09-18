import type { DatabaseSync } from "node:sqlite";

export type Migration = Readonly<{
  version: number;
  up: (database: DatabaseSync) => void;
}>;
