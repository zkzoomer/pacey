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
    paceyDatabase.weights.record({
      accountId: "telegram-user-1",
      weightKg: 82.1,
      measuredOn: "2026-09-18",
    });
    paceyDatabase.weights.record({
      accountId: "telegram-user-1",
      weightKg: 82.3,
      measuredOn: "2026-09-18",
    });

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const columns = database
        .prepare("PRAGMA table_info(weights)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(columns, ["account_id", "weight_kg", "measured_on"]);

      const rows = database
        .prepare(
          `
          SELECT account_id, weight_kg, measured_on
          FROM weights
          ORDER BY rowid
        `,
        )
        .all()
        .map((row) => ({ ...row }));
      assert.deepEqual(rows, [
        {
          account_id: "telegram-user-1",
          weight_kg: 82.1,
          measured_on: "2026-09-18",
        },
        {
          account_id: "telegram-user-1",
          weight_kg: 82.3,
          measured_on: "2026-09-18",
        },
      ]);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
