import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDatabase } from "../index.js";
import { LATEST_DATABASE_VERSION } from "../migrations/index.js";

function databasePath(stateDirectory: string): string {
  return join(stateDirectory, "plugins", "pacey", "pacey.sqlite");
}

test("initializes a fresh database at the latest version", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));

  try {
    createDatabase(directory).initialize();

    const database = new DatabaseSync(databasePath(directory), {
      readOnly: true,
    });
    try {
      const version = database.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      assert.equal(LATEST_DATABASE_VERSION, 2);
      assert.equal(version.user_version, 2);

      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);
      assert.deepEqual(tables, ["athlete_profiles", "weights"]);

      const athleteProfileColumns = database
        .prepare("PRAGMA table_info(athlete_profiles)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(athleteProfileColumns, [
        "account_id",
        "profile_markdown",
        "timezone",
        "created_at",
        "updated_at",
      ]);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrades a version 1 database without losing weight data", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));
  const path = databasePath(directory);
  mkdirSync(join(directory, "plugins", "pacey"), { recursive: true });

  try {
    const database = new DatabaseSync(path);
    try {
      const initialMigration = readFileSync(
        new URL("../migrations/001-create-weights.sql", import.meta.url),
        "utf8",
      );
      database.exec(initialMigration);
      database
        .prepare(
          `
            INSERT INTO weights (
              account_id,
              weight_kg,
              bodyfat,
              measured_on
            ) VALUES (?, ?, ?, ?)
          `,
        )
        .run("telegram-user-1", 82, null, "2026-09-24");
      database.exec("PRAGMA user_version = 1");
    } finally {
      database.close();
    }

    createDatabase(directory).initialize();

    const migratedDatabase = new DatabaseSync(path, { readOnly: true });
    try {
      const version = migratedDatabase.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      const weights = migratedDatabase
        .prepare("SELECT COUNT(*) AS count FROM weights")
        .get() as { count: number };

      assert.equal(version.user_version, 2);
      assert.equal(weights.count, 1);
      assert.doesNotThrow(() =>
        migratedDatabase.prepare("SELECT * FROM athlete_profiles").all(),
      );
    } finally {
      migratedDatabase.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects a database created by a newer version of Pacey", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));
  const path = databasePath(directory);
  mkdirSync(join(directory, "plugins", "pacey"), { recursive: true });

  try {
    const database = new DatabaseSync(path);
    try {
      database.exec("PRAGMA user_version = 3");
    } finally {
      database.close();
    }

    assert.throws(
      () => createDatabase(directory).initialize(),
      /version 3 is newer than supported version 2/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
