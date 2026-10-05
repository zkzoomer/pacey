import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withDatabase } from "../connection.js";
import { createDatabase } from "../index.js";

test("returns only the current account's published workouts in time order", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-workouts-test-"));
  const databasePath = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const database = createDatabase(directory);
    database.initialize();

    withDatabase(databasePath, (connection) => {
      const insertWeek = connection.prepare(`
        INSERT INTO training_weeks (
          id, account_id, week_start, timezone, revision, status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      insertWeek.run(
        "week-1",
        "telegram-user-1",
        "2026-10-05",
        "Europe/Malta",
        1,
        "published",
      );
      insertWeek.run(
        "week-2",
        "telegram-user-2",
        "2026-10-05",
        "Europe/Malta",
        1,
        "published",
      );
      insertWeek.run(
        "week-draft",
        "telegram-user-1",
        "2026-10-05",
        "Europe/Malta",
        2,
        "draft",
      );

      const insertWorkout = connection.prepare(`
        INSERT INTO planned_workouts (
          id,
          training_week_id,
          account_id,
          sport_id,
          scheduled_at_utc,
          timezone,
          estimated_duration_minutes,
          target_rpe,
          instructions_markdown
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertWorkout.run(
        "workout-evening",
        "week-1",
        "telegram-user-1",
        "swimming",
        "2026-10-05T17:00:00.000Z",
        "Europe/Malta",
        45,
        7,
        "Speed swim",
      );
      insertWorkout.run(
        "workout-morning",
        "week-1",
        "telegram-user-1",
        "swimming",
        "2026-10-05T06:00:00.000Z",
        "Europe/Malta",
        60,
        4,
        "Endurance swim",
      );
      insertWorkout.run(
        "other-user-workout",
        "week-2",
        "telegram-user-2",
        "swimming",
        "2026-10-05T08:00:00.000Z",
        "Europe/Malta",
        30,
        3,
        "Other user's swim",
      );
      insertWorkout.run(
        "draft-workout",
        "week-draft",
        "telegram-user-1",
        "swimming",
        "2026-10-05T10:00:00.000Z",
        "Europe/Malta",
        30,
        null,
        "Unconfirmed swim",
      );
    });

    const workouts = database.plannedWorkouts.findPublishedBetween(
      "telegram-user-1",
      "2026-10-05T00:00:00.000Z",
      "2026-10-06T00:00:00.000Z",
    );

    assert.deepEqual(
      workouts.map(({ id }) => id),
      ["workout-morning", "workout-evening"],
    );
    assert.ok(
      workouts.every(({ accountId }) => accountId === "telegram-user-1"),
    );

    assert.deepEqual(
      database.plannedWorkouts.getTrainingState("telegram-user-1", {
        currentWeekStart: "2026-10-05",
        nextWeekStart: "2026-10-12",
        recentStartUtc: "2026-09-29T00:00:00.000Z",
        nowUtc: "2026-10-06T00:00:00.000Z",
      }),
      {
        currentWeek: "present",
        nextWeek: "missing",
        unreportedRecentWorkouts: 2,
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
