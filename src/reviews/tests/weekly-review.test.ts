import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { createDatabase } from "../../database/index.js";
import type { WeekReviewData } from "../../database/queries/weekly-reviews.js";
import {
  createSaveWeeklyReviewTool,
  createWeekReviewDataTool,
  reviewWeekRange,
  validateWeeklyReviewMarkdown,
} from "../tool.js";

test("calculates isolated weekly facts and stores a concise review", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-weekly-review-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    publishReviewWeek(database, "telegram-user-1", "user-1");
    publishOtherUserWorkout(database);
    recordReports(database);
    database.plannedWorkouts.cancel("telegram-user-1", "user-1-cancelled");

    const dependencies = {
      database,
      logger: { debug: () => undefined, error: () => undefined },
    };
    const context = {
      messageChannel: "telegram",
      requesterSenderId: "telegram-user-1",
    } as OpenClawPluginToolContext;
    const getData = createWeekReviewDataTool(dependencies)(context);
    const saveReview = createSaveWeeklyReviewTool(dependencies)(context);
    assert.ok(getData && !Array.isArray(getData));
    assert.ok(saveReview && !Array.isArray(saveReview));

    const result = await getData.execute("get-review", {
      weekStart: "2026-10-05",
      accountId: "telegram-user-2",
    });
    const data = result.details as WeekReviewData;
    assert.equal(data.plannedWorkouts, 5);
    assert.equal(data.completedWorkouts, 1);
    assert.equal(data.partialWorkouts, 1);
    assert.equal(data.skippedWorkouts, 1);
    assert.equal(data.cancelledWorkouts, 1);
    assert.equal(data.unknownWorkouts, 1);
    assert.equal(data.adherencePercentage, 50);
    assert.equal(data.plannedMinutes, 175);
    assert.equal(data.reportedMinutes, 85);
    assert.equal(data.averageTargetRpe, 6);
    assert.equal(data.averagePerceivedRpe, 7.5);
    assert.deepEqual(data.sportSummaries, [
      {
        sportId: "swimming",
        reportedWorkouts: 2,
        reportedMinutes: 85,
        totals: { distanceM: 3_000 },
      },
    ]);
    assert.deepEqual(data.missingReports, [
      {
        workoutId: "user-1-unknown",
        sportId: "swimming",
        scheduledAtUtc: "2026-10-09T06:00:00.000Z",
      },
    ]);
    assert.equal(data.reports.length, 3);
    assert.deepEqual(data.reports[0]?.sportMetrics, {
      version: 1,
      totals: { distanceM: 2_000 },
      details: { poolLengthM: 25, strokes: ["freestyle"] },
    });
    assert.equal(data.reports[2]?.sportMetrics, null);
    assert.equal(data.storedReviewMarkdown, null);
    assert.equal(
      data.reports.some((report) =>
        report.originalMessage.includes("other user's"),
      ),
      false,
    );

    const reviewMarkdown = validReview();
    const saveResult = await saveReview.execute("save-review", {
      weekStart: "2026-10-05",
      reviewMarkdown,
      accountId: "telegram-user-2",
    });
    assert.deepEqual(saveResult.details, {
      saved: true,
      weekStart: "2026-10-05",
    });

    const updatedData = (
      await getData.execute("get-saved-review", { weekStart: "2026-10-05" })
    ).details as WeekReviewData;
    assert.equal(updatedData.storedReviewMarkdown, reviewMarkdown);

    const otherUserTool = createWeekReviewDataTool(dependencies)({
      messageChannel: "telegram",
      requesterSenderId: "telegram-user-2",
    } as OpenClawPluginToolContext);
    assert.ok(otherUserTool && !Array.isArray(otherUserTool));
    const otherUserData = (
      await otherUserTool.execute("get-other-review", {
        weekStart: "2026-10-05",
      })
    ).details as WeekReviewData;
    assert.equal(otherUserData.plannedWorkouts, 1);
    assert.equal(otherUserData.storedReviewMarkdown, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("validates review weeks and review text", () => {
  assert.deepEqual(reviewWeekRange("2026-10-05").weekEnd, "2026-10-11");
  assert.throws(() => reviewWeekRange("2026-10-06"), /valid Monday/);
  assert.equal(
    validateWeeklyReviewMarkdown("  Useful review.  "),
    "Useful review.",
  );
  assert.throws(() => validateWeeklyReviewMarkdown("   "), /1-8000/);
});

function publishReviewWeek(
  database: ReturnType<typeof createDatabase>,
  accountId: string,
  prefix: string,
): void {
  database.weekPlans.replace({
    accountId,
    weekStart: "2026-10-05",
    timezone: "Europe/Malta",
    workouts: [
      workout(`${prefix}-completed`, "2026-10-05T06:00:00.000Z", 60, 6),
      workout(`${prefix}-partial`, "2026-10-06T06:00:00.000Z", 45, 7),
      workout(`${prefix}-skipped`, "2026-10-07T06:00:00.000Z", 30, 5),
      workout(`${prefix}-cancelled`, "2026-10-08T06:00:00.000Z", 50, 4),
      workout(`${prefix}-unknown`, "2026-10-09T06:00:00.000Z", 40, 6),
    ],
  });
}

function publishOtherUserWorkout(
  database: ReturnType<typeof createDatabase>,
): void {
  database.weekPlans.replace({
    accountId: "telegram-user-2",
    weekStart: "2026-10-05",
    timezone: "Europe/Malta",
    workouts: [
      workout("user-2-completed", "2026-10-05T07:00:00.000Z", 300, 10),
    ],
  });
  database.workoutReports.record({
    accountId: "telegram-user-2",
    plannedWorkoutId: "user-2-completed",
    originalMessage: "The other user's 9,999 m swim.",
    completionStatus: "completed",
    durationMinutes: 300,
    perceivedRpe: 10,
    sportId: "swimming",
    sportMetricsJson: JSON.stringify({
      version: 1,
      totals: { distanceM: 9_999 },
    }),
  });
}

function recordReports(database: ReturnType<typeof createDatabase>): void {
  database.workoutReports.record({
    accountId: "telegram-user-1",
    plannedWorkoutId: "user-1-completed",
    originalMessage: "Completed 2,000 m. Smooth until the final set.",
    completionStatus: "completed",
    durationMinutes: 55,
    perceivedRpe: 7,
    sportId: "swimming",
    sportMetricsJson: JSON.stringify({
      version: 1,
      totals: { distanceM: 2_000 },
      details: { poolLengthM: 25, strokes: ["freestyle"] },
    }),
  });
  database.workoutReports.record({
    accountId: "telegram-user-1",
    plannedWorkoutId: "user-1-partial",
    originalMessage: "Stopped after 1,000 m because I ran out of time.",
    completionStatus: "partial",
    durationMinutes: 30,
    perceivedRpe: 8,
    sportId: "swimming",
    sportMetricsJson: JSON.stringify({
      version: 1,
      totals: { distanceM: 1_000 },
    }),
  });
  database.workoutReports.record({
    accountId: "telegram-user-1",
    plannedWorkoutId: "user-1-skipped",
    originalMessage: "Skipped because the pool was closed.",
    completionStatus: "skipped",
    durationMinutes: null,
    perceivedRpe: null,
    sportId: "swimming",
    sportMetricsJson: null,
  });
}

function workout(
  id: string,
  scheduledAtUtc: string,
  estimatedDurationMinutes: number,
  targetRpe: number,
) {
  return {
    id,
    sportId: "swimming",
    scheduledAtUtc,
    estimatedDurationMinutes,
    targetRpe,
    instructionsMarkdown: "Swim session",
  };
}

function validReview(): string {
  return "Two sessions were attempted. Keep next week conservative.";
}
