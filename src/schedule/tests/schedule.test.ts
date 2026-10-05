import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { withDatabase } from "../../database/connection.js";
import { createDatabase } from "../../database/index.js";
import {
  trainingStateContext,
  trainingStateUnavailableContext,
} from "../context.js";
import {
  boundedScheduleDateRange,
  createTrainingStateWindow,
} from "../dates.js";
import { createScheduleTool } from "../tool.js";

test("validates a bounded inclusive schedule date range", () => {
  const range = boundedScheduleDateRange("2026-10-05", "2026-10-05");
  assert.ok(range.startUtc < range.endUtc);

  assert.throws(
    () => boundedScheduleDateRange("2026-10-05", "2026-11-05"),
    /cannot exceed 31 days/,
  );
  assert.throws(
    () => boundedScheduleDateRange("2026-10-06", "2026-10-05"),
    /on or after/,
  );
  assert.throws(
    () => boundedScheduleDateRange("2026-02-30", "2026-03-01"),
    /valid calendar date/,
  );
});

test("renders only compact training state", () => {
  assert.equal(
    trainingStateContext({
      currentWeek: "present",
      nextWeek: "missing",
      unreportedRecentWorkouts: 2,
    }),
    `<pacey_training_state>
current_week: present
next_week: missing
unreported_recent_workouts: 2
</pacey_training_state>`,
  );
  assert.match(trainingStateUnavailableContext(), /status: unavailable/);

  const window = createTrainingStateWindow(new Date(2026, 9, 7, 12));
  assert.equal(window.currentWeekStart, "2026-10-05");
  assert.equal(window.nextWeekStart, "2026-10-12");
});

test("returns only the trusted requester's schedule", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-schedule-tool-test-"));
  const databasePath = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const database = createDatabase(directory);
    database.initialize();
    withDatabase(databasePath, (connection) => {
      const insertWeek = connection.prepare(`
        INSERT INTO training_weeks (
          id, account_id, week_start, timezone, revision, status
        ) VALUES (?, ?, ?, 'Europe/Malta', 1, 'published')
      `);
      insertWeek.run("week-1", "telegram-user-1", "2026-10-05");
      insertWeek.run("week-2", "telegram-user-2", "2026-10-05");

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
        ) VALUES (?, ?, ?, 'swimming', ?, 'Europe/Malta', 45, 5, ?)
      `);
      insertWorkout.run(
        "workout-1",
        "week-1",
        "telegram-user-1",
        "2026-10-05T06:00:00.000Z",
        "Technique swim",
      );
      insertWorkout.run(
        "workout-2",
        "week-2",
        "telegram-user-2",
        "2026-10-05T08:00:00.000Z",
        "Private swim",
      );
    });

    const factory = createScheduleTool({
      database,
      logger: { debug: () => undefined, error: () => undefined },
    });
    assert.equal(
      factory({ messageChannel: "telegram" } as OpenClawPluginToolContext),
      null,
    );

    const tool = factory({
      messageChannel: "telegram",
      requesterSenderId: "telegram-user-1",
    } as OpenClawPluginToolContext);
    assert.ok(tool && !Array.isArray(tool));

    const result = await tool.execute("tool-call-1", {
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      accountId: "telegram-user-2",
    });
    assert.deepEqual(result.details, {
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      workouts: [
        {
          id: "workout-1",
          sportId: "swimming",
          scheduledAtUtc: "2026-10-05T06:00:00.000Z",
          timezone: "Europe/Malta",
          estimatedDurationMinutes: 45,
          targetRpe: 5,
          instructionsMarkdown: "Technique swim",
          status: "planned",
        },
      ],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
