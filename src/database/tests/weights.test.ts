import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDatabase } from "../index.js";

test("records only the fields in a weight measurement", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-weights-test-"));
  const databasePath = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const paceyDatabase = createDatabase(directory);
    paceyDatabase.initialize();
    const record1 = {
      accountId: "telegram-user-1",
      weightKg: 82.1,
      bodyfat: 23.1,
      measuredOn: "2026-09-18",
    };
    const record2 = {
      accountId: "telegram-user-1",
      weightKg: 82.3,
      bodyfat: 26.1,
      measuredOn: "2026-09-18",
    };

    paceyDatabase.weights.record(record1);
    paceyDatabase.weights.record(record2);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const columns = database
        .prepare("PRAGMA table_info(weights)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(columns, [
        "account_id",
        "weight_kg",
        "bodyfat",
        "measured_on",
      ]);

      const rows = database
        .prepare(
          `
          SELECT account_id, weight_kg, bodyfat, measured_on
          FROM weights
          ORDER BY rowid
        `,
        )
        .all()
        .map(toMeasurement);
      assert.deepEqual(rows, [record1, record2]);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("records NULL bodyfat if not provided", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-weights-test-"));
  const databasePath = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const paceyDatabase = createDatabase(directory);
    paceyDatabase.initialize();
    const record1 = {
      accountId: "telegram-user-1",
      weightKg: 82.1,
      bodyfat: null,
      measuredOn: "2026-09-18",
    };
    const record2 = {
      accountId: "telegram-user-1",
      weightKg: 82.3,
      bodyfat: null,
      measuredOn: "2026-09-18",
    };

    paceyDatabase.weights.record(record1);
    paceyDatabase.weights.record(record2);

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const columns = database
        .prepare("PRAGMA table_info(weights)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(columns, [
        "account_id",
        "weight_kg",
        "bodyfat",
        "measured_on",
      ]);

      const rows = database
        .prepare(
          `
          SELECT account_id, weight_kg, bodyfat, measured_on
          FROM weights
          ORDER BY rowid
        `,
        )
        .all()
        .map(toMeasurement);
      assert.deepEqual(rows, [record1, record2]);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function toMeasurement(row: Record<string, unknown>) {
  return {
    accountId: row.account_id,
    weightKg: row.weight_kg,
    bodyfat: row.bodyfat,
    measuredOn: row.measured_on,
  };
}
