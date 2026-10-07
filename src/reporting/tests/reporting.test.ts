import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { createDatabase } from "../../database/index.js";
import { createWorkoutReportTool } from "../tool.js";

test("records against only the trusted requester's planned workout", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-report-tool-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    publishWorkout(database, "telegram-user-1", "user-1-swim");
    publishWorkout(database, "telegram-user-2", "user-2-swim");

    const factory = createWorkoutReportTool({
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

    const originalMessage =
      "Done — all 2,000m in the 25m pool, mostly freestyle. RPE 7.";
    const result = await tool.execute("tool-call-1", {
      plannedWorkoutId: "user-1-swim",
      originalMessage,
      ...validReport(),
      accountId: "telegram-user-2",
    });

    assert.equal(
      (result.details as { linkedPlannedWorkoutId: string })
        .linkedPlannedWorkoutId,
      "user-1-swim",
    );
    assert.deepEqual(
      database.workoutReports
        .findByAccountId("telegram-user-1")
        .map((report) => ({
          accountId: report.accountId,
          plannedWorkoutId: report.plannedWorkoutId,
          originalMessage: report.originalMessage,
          sportMetrics: report.sportMetrics,
        })),
      [
        {
          accountId: "telegram-user-1",
          plannedWorkoutId: "user-1-swim",
          originalMessage,
          sportMetrics: {
            version: 1,
            totals: { distanceM: 2_000 },
            details: {
              poolLengthM: 25,
              strokes: ["freestyle"],
            },
          },
        },
      ],
    );

    await assert.rejects(
      tool.execute("tool-call-2", {
        plannedWorkoutId: "user-2-swim",
        originalMessage,
        ...validReport(),
      }),
      /could not be saved/,
    );
    assert.deepEqual(
      database.workoutReports.findByAccountId("telegram-user-2"),
      [],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function validReport() {
  return {
    completionStatus: "completed",
    durationMinutes: 68,
    perceivedRpe: 7,
    sportId: "swimming",
    sportMetrics: {
      version: 1,
      totals: { distanceM: 2_000 },
      details: {
        poolLengthM: 25,
        strokes: ["freestyle"],
      },
    },
  };
}

function publishWorkout(
  database: ReturnType<typeof createDatabase>,
  accountId: string,
  id: string,
): void {
  database.weekPlans.replace({
    accountId,
    weekStart: "2026-10-05",
    timezone: "Europe/Malta",
    workouts: [
      {
        id,
        sportId: "swimming",
        scheduledAtUtc: "2026-10-08T10:00:00.000Z",
        estimatedDurationMinutes: 60,
        targetRpe: 6,
        instructionsMarkdown: "Technique swim",
      },
    ],
  });
}
