import { readFileSync } from "node:fs";

import { withDatabase } from "../connection.js";

type Migration = Readonly<{ version: number; filename: string }>;

const migrations = [
  { version: 1, filename: "001-create-weights.sql" },
  { version: 2, filename: "002-create-athlete-profiles.sql" },
  { version: 3, filename: "003-create-athlete-benchmarks.sql" },
] satisfies readonly Migration[];

function validateMigrations(): void {
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion) {
      throw new Error(
        `Expected database migration ${expectedVersion}, got ${migration.version}`,
      );
    }
  });
}

validateMigrations();

export const LATEST_DATABASE_VERSION = migrations.at(-1)?.version ?? 0;

export function migrateDatabase(databasePath: string): void {
  withDatabase(databasePath, (database) => {
    const row = database.prepare("PRAGMA user_version").get() as
      { user_version: number } | undefined;
    const currentVersion = row?.user_version ?? 0;

    if (currentVersion > LATEST_DATABASE_VERSION) {
      throw new Error(
        `Pacey database version ${currentVersion} is newer than supported version ${LATEST_DATABASE_VERSION}`,
      );
    }

    const pendingMigrations = migrations.filter(
      ({ version }) => version > currentVersion,
    );
    if (pendingMigrations.length === 0) return;

    database.exec("BEGIN IMMEDIATE");
    try {
      for (const migration of pendingMigrations) {
        const sql = readFileSync(
          new URL(migration.filename, import.meta.url),
          "utf8",
        );
        database.exec(sql);
        database.exec(`PRAGMA user_version = ${migration.version}`);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  });
}
