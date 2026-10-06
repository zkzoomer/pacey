import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { createDatabase } from "../../database/index.js";
import {
  createCancelWorkoutTool,
  createRescheduleWorkoutTool,
} from "../workout-tools.js";

test("reschedules and cancels only the requester's workouts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-workout-tools-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    publishWorkouts(database, "telegram-user-1", "user-1");
    publishWorkouts(database, "telegram-user-2", "user-2");

    const context = {
      messageChannel: "telegram",
      requesterSenderId: "telegram-user-1",
    } as OpenClawPluginToolContext;
    const dependencies = {
      database,
      logger: { debug: () => undefined, error: () => undefined },
    };
    const reschedule = createRescheduleWorkoutTool(dependencies)(context);
    const cancel = createCancelWorkoutTool(dependencies)(context);
    assert.ok(reschedule && !Array.isArray(reschedule));
    assert.ok(cancel && !Array.isArray(cancel));

    await reschedule.execute("reschedule-1", {
      workoutId: "user-1-swim-1",
      scheduledAtUtc: "2026-10-08T17:00:00.000Z",
      accountId: "telegram-user-2",
    });
    await cancel.execute("cancel-1", {
      workoutId: "user-1-swim-2",
      accountId: "telegram-user-2",
    });
    await assert.rejects(
      reschedule.execute("reschedule-2", {
        workoutId: "user-2-swim-1",
        scheduledAtUtc: "2026-10-09T17:00:00.000Z",
      }),
      /could not be rescheduled/,
    );
    await assert.rejects(
      cancel.execute("cancel-2", { workoutId: "user-2-swim-2" }),
      /could not be cancelled/,
    );

    assert.deepEqual(
      database.plannedWorkouts
        .findPublishedBetween(
          "telegram-user-1",
          "2026-10-05T00:00:00.000Z",
          "2026-10-12T00:00:00.000Z",
        )
        .map(({ id, scheduledAtUtc, status }) => ({
          id,
          scheduledAtUtc,
          status,
        })),
      [
        {
          id: "user-1-swim-2",
          scheduledAtUtc: "2026-10-07T06:00:00.000Z",
          status: "cancelled",
        },
        {
          id: "user-1-swim-1",
          scheduledAtUtc: "2026-10-08T17:00:00.000Z",
          status: "planned",
        },
      ],
    );
    assert.deepEqual(
      database.plannedWorkouts
        .findPublishedBetween(
          "telegram-user-2",
          "2026-10-05T00:00:00.000Z",
          "2026-10-12T00:00:00.000Z",
        )
        .map(({ id, scheduledAtUtc, status }) => ({
          id,
          scheduledAtUtc,
          status,
        })),
      [
        {
          id: "user-2-swim-1",
          scheduledAtUtc: "2026-10-06T06:00:00.000Z",
          status: "planned",
        },
        {
          id: "user-2-swim-2",
          scheduledAtUtc: "2026-10-07T06:00:00.000Z",
          status: "planned",
        },
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function publishWorkouts(
  database: ReturnType<typeof createDatabase>,
  accountId: string,
  prefix: string,
): void {
  database.weekPlans.replace({
    accountId,
    weekStart: "2026-10-05",
    timezone: "Europe/Malta",
    workouts: [
      {
        id: `${prefix}-swim-1`,
        sportId: "swimming",
        scheduledAtUtc: "2026-10-06T06:00:00.000Z",
        estimatedDurationMinutes: 60,
        targetRpe: 5,
        instructionsMarkdown: "Technique swim",
      },
      {
        id: `${prefix}-swim-2`,
        sportId: "swimming",
        scheduledAtUtc: "2026-10-07T06:00:00.000Z",
        estimatedDurationMinutes: 45,
        targetRpe: 6,
        instructionsMarkdown: "Endurance swim",
      },
    ],
  });
}
