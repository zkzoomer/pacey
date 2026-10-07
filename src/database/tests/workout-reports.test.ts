import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { withDatabase } from "../connection.js";
import { createDatabase } from "../index.js";

test("records only the current account's planned workout", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-report-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    publishWorkout(database, "telegram-user-1", "user-1-swim");
    publishWorkout(database, "telegram-user-2", "user-2-swim");

    const saved = database.workoutReports.record({
      accountId: "telegram-user-1",
      plannedWorkoutId: "user-1-swim",
      originalMessage:
        "Finished all 2,000 m in the 25 m pool. Felt like RPE 7.",
      completionStatus: "completed",
      durationMinutes: 68,
      perceivedRpe: 7,
      sportId: "swimming",
      sportMetricsJson: JSON.stringify({
        version: 1,
        totals: { distanceM: 2000 },
        details: {
          poolLengthM: 25,
          strokes: ["freestyle"],
        },
      }),
    });

    assert.equal(saved.plannedWorkoutId, "user-1-swim");
    assert.deepEqual(
      database.workoutReports.findByAccountId("telegram-user-1"),
      [
        {
          id: saved.reportId,
          accountId: "telegram-user-1",
          plannedWorkoutId: "user-1-swim",
          originalMessage:
            "Finished all 2,000 m in the 25 m pool. Felt like RPE 7.",
          completionStatus: "completed",
          durationMinutes: 68,
          perceivedRpe: 7,
          sportId: "swimming",
          sportMetrics: {
            version: 1,
            totals: { distanceM: 2000 },
            details: {
              poolLengthM: 25,
              strokes: ["freestyle"],
            },
          },
          createdAt:
            database.workoutReports.findByAccountId("telegram-user-1")[0]
              .createdAt,
        },
      ],
    );

    assert.equal(
      database.plannedWorkouts.findPublishedBetween(
        "telegram-user-1",
        "2026-10-08T00:00:00.000Z",
        "2026-10-09T00:00:00.000Z",
      )[0].status,
      "completed",
    );
    assert.equal(
      database.plannedWorkouts.findPublishedBetween(
        "telegram-user-2",
        "2026-10-08T00:00:00.000Z",
        "2026-10-09T00:00:00.000Z",
      )[0].status,
      "planned",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rolls back the report and status update together", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-report-test-"));
  const path = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const database = createDatabase(directory);
    database.initialize();
    publishWorkout(database, "telegram-user-1", "user-1-swim");

    assert.throws(() =>
      database.workoutReports.record({
        accountId: "telegram-user-2",
        plannedWorkoutId: "user-1-swim",
        originalMessage: "Finished it.",
        completionStatus: "completed",
        durationMinutes: null,
        perceivedRpe: null,
        sportId: "swimming",
        sportMetricsJson: null,
      }),
    );

    const reportCount = withDatabase(
      path,
      (connection) =>
        (
          connection
            .prepare("SELECT COUNT(*) AS count FROM workout_reports")
            .get() as {
            count: number;
          }
        ).count,
    );
    assert.equal(reportCount, 0);
    assert.equal(
      database.plannedWorkouts.findPublishedBetween(
        "telegram-user-1",
        "2026-10-08T00:00:00.000Z",
        "2026-10-09T00:00:00.000Z",
      )[0].status,
      "planned",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("replaces the report for the same planned workout", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-report-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    publishWorkout(database, "telegram-user-1", "user-1-swim");

    const first = database.workoutReports.record({
      accountId: "telegram-user-1",
      plannedWorkoutId: "user-1-swim",
      originalMessage: "Finished it. RPE 8.",
      completionStatus: "completed",
      durationMinutes: 60,
      perceivedRpe: 8,
      sportId: "swimming",
      sportMetricsJson: null,
    });
    const corrected = database.workoutReports.record({
      accountId: "telegram-user-1",
      plannedWorkoutId: "user-1-swim",
      originalMessage: "Correction: I only finished half. RPE 7.",
      completionStatus: "partial",
      durationMinutes: 30,
      perceivedRpe: 7,
      sportId: "swimming",
      sportMetricsJson: null,
    });

    assert.equal(corrected.reportId, first.reportId);
    assert.deepEqual(
      database.workoutReports
        .findByAccountId("telegram-user-1")
        .map(({ originalMessage, completionStatus, durationMinutes }) => ({
          originalMessage,
          completionStatus,
          durationMinutes,
        })),
      [
        {
          originalMessage: "Correction: I only finished half. RPE 7.",
          completionStatus: "partial",
          durationMinutes: 30,
        },
      ],
    );
    assert.equal(
      database.plannedWorkouts.findPublishedBetween(
        "telegram-user-1",
        "2026-10-08T00:00:00.000Z",
        "2026-10-09T00:00:00.000Z",
      )[0].status,
      "partial",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function publishWorkout(
  database: ReturnType<typeof createDatabase>,
  accountId: string,
  workoutId: string,
): void {
  database.weekPlans.replace({
    accountId,
    weekStart: "2026-10-05",
    timezone: "Europe/Malta",
    workouts: [
      {
        id: workoutId,
        sportId: "swimming",
        scheduledAtUtc: "2026-10-08T10:00:00.000Z",
        estimatedDurationMinutes: 70,
        targetRpe: 6,
        instructionsMarkdown: "Butterfly technique",
      },
    ],
  });
}
