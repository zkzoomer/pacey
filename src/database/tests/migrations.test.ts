import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDatabase } from "../index.js";
import { LATEST_DATABASE_VERSION } from "../migrations/index.js";

function databasePath(stateDirectory: string): string {
  return join(stateDirectory, "plugins", "pacey", "pacey.sqlite");
}

test("initializes a fresh database at version 1", () => {
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
      assert.equal(LATEST_DATABASE_VERSION, 1);
      assert.equal(version.user_version, 1);

      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);
      assert.deepEqual(tables, ["weights"]);
    } finally {
      database.close();
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
      database.exec("PRAGMA user_version = 2");
    } finally {
      database.close();
    }

    assert.throws(
      () => createDatabase(directory).initialize(),
      /version 2 is newer than supported version 1/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
