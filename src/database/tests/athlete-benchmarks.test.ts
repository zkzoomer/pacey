import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDatabase } from "../index.js";

test("creates, reads, and updates isolated athlete benchmarks", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-benchmarks-test-"));
  const path = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const paceyDatabase = createDatabase(directory);
    paceyDatabase.initialize();

    assert.equal(
      paceyDatabase.athleteBenchmarks.findByAccountId("telegram-user-1"),
      null,
    );

    paceyDatabase.athleteBenchmarks.save({
      accountId: "telegram-user-1",
      benchmarksMarkdown: "# First benchmarks",
    });
    paceyDatabase.athleteBenchmarks.save({
      accountId: "telegram-user-2",
      benchmarksMarkdown: "# Second benchmarks",
    });

    const firstBenchmarks =
      paceyDatabase.athleteBenchmarks.findByAccountId("telegram-user-1");
    assert.deepEqual(firstBenchmarks, {
      accountId: "telegram-user-1",
      benchmarksMarkdown: "# First benchmarks",
      createdAt: firstBenchmarks?.createdAt,
      updatedAt: firstBenchmarks?.updatedAt,
    });
    assert.match(firstBenchmarks?.createdAt ?? "", timestampPattern);
    assert.match(firstBenchmarks?.updatedAt ?? "", timestampPattern);

    const rawDatabase = new DatabaseSync(path);
    try {
      rawDatabase
        .prepare(
          `
            UPDATE athlete_benchmarks
            SET
              created_at = ?,
              updated_at = ?
            WHERE account_id = ?
          `,
        )
        .run("2026-01-01 00:00:00", "2026-01-01 00:00:00", "telegram-user-1");
    } finally {
      rawDatabase.close();
    }

    paceyDatabase.athleteBenchmarks.save({
      accountId: "telegram-user-1",
      benchmarksMarkdown: "# Updated first benchmarks",
    });

    const updatedBenchmarks =
      paceyDatabase.athleteBenchmarks.findByAccountId("telegram-user-1");
    assert.deepEqual(updatedBenchmarks, {
      accountId: "telegram-user-1",
      benchmarksMarkdown: "# Updated first benchmarks",
      createdAt: "2026-01-01 00:00:00",
      updatedAt: updatedBenchmarks?.updatedAt,
    });
    assert.match(updatedBenchmarks?.updatedAt ?? "", timestampPattern);
    assert.notEqual(updatedBenchmarks?.updatedAt, "2026-01-01 00:00:00");

    assert.equal(
      paceyDatabase.athleteBenchmarks.findByAccountId("telegram-user-2")
        ?.benchmarksMarkdown,
      "# Second benchmarks",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
