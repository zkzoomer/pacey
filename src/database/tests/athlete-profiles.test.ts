import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createDatabase } from "../index.js";

test("creates, reads, and updates isolated athlete profiles", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-profiles-test-"));
  const path = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const paceyDatabase = createDatabase(directory);
    paceyDatabase.initialize();

    assert.equal(
      paceyDatabase.athleteProfiles.findByAccountId("telegram-user-1"),
      null,
    );

    paceyDatabase.athleteProfiles.save({
      accountId: "telegram-user-1",
      profileMarkdown: "# First profile",
    });
    paceyDatabase.athleteProfiles.save({
      accountId: "telegram-user-2",
      profileMarkdown: "# Second profile",
    });

    const firstProfile =
      paceyDatabase.athleteProfiles.findByAccountId("telegram-user-1");
    assert.deepEqual(firstProfile, {
      accountId: "telegram-user-1",
      profileMarkdown: "# First profile",
      timezone: null,
      createdAt: firstProfile?.createdAt,
      updatedAt: firstProfile?.updatedAt,
    });
    assert.match(firstProfile?.createdAt ?? "", timestampPattern);
    assert.match(firstProfile?.updatedAt ?? "", timestampPattern);

    const rawDatabase = new DatabaseSync(path);
    try {
      rawDatabase
        .prepare(
          `
            UPDATE athlete_profiles
            SET
              timezone = ?,
              created_at = ?,
              updated_at = ?
            WHERE account_id = ?
          `,
        )
        .run(
          "Europe/Malta",
          "2026-01-01 00:00:00",
          "2026-01-01 00:00:00",
          "telegram-user-1",
        );
    } finally {
      rawDatabase.close();
    }

    paceyDatabase.athleteProfiles.save({
      accountId: "telegram-user-1",
      profileMarkdown: "# Updated first profile",
    });

    const updatedProfile =
      paceyDatabase.athleteProfiles.findByAccountId("telegram-user-1");
    assert.deepEqual(updatedProfile, {
      accountId: "telegram-user-1",
      profileMarkdown: "# Updated first profile",
      timezone: "Europe/Malta",
      createdAt: "2026-01-01 00:00:00",
      updatedAt: updatedProfile?.updatedAt,
    });
    assert.match(updatedProfile?.updatedAt ?? "", timestampPattern);
    assert.notEqual(updatedProfile?.updatedAt, "2026-01-01 00:00:00");

    assert.equal(
      paceyDatabase.athleteProfiles.findByAccountId("telegram-user-2")
        ?.profileMarkdown,
      "# Second profile",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const timestampPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
