import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { withDatabase } from "../../database/connection.js";
import { createDatabase } from "../../database/index.js";
import { createWeekPlanTool } from "../tool.js";
import { validateWeekPlan } from "../validation.js";

test("validates canonical workouts, dates, effort, and non-overlap", () => {
  const plan = validPlan();
  plan.workouts.reverse();
  const validation = validateWeekPlan(plan);
  assert.equal(validation.ok, true);
  assert.deepEqual(
    validation.plan.workouts.map(({ id }) => id),
    ["swim-tuesday", "swim-thursday"],
  );

  assert.match(
    validationError({ ...validPlan(), weekStart: "2026-10-06" }),
    /must be a Monday/,
  );
  assert.match(
    validationError(updateWorkout(validPlan(), 0, { sportId: "swim" })),
    /canonical supported sport ID/,
  );
  assert.match(
    validationError(
      updateWorkout(validPlan(), 0, {
        scheduledAtUtc: "2026-10-12T06:00:00.000Z",
      }),
    ),
    /within the planned week/,
  );
  assert.match(
    validationError(
      updateWorkout(validPlan(), 0, { estimatedDurationMinutes: 0 }),
    ),
    /between 1 and 1440/,
  );
  assert.match(
    validationError(updateWorkout(validPlan(), 0, { targetRpe: 11 })),
    /integer from 1-10/,
  );
  assert.match(
    validationError(
      updateWorkout(validPlan(), 0, {
        instructionsMarkdown: "Technique and easy endurance swim",
      }),
    ),
    /Report afterward/,
  );

  const duplicateIds = validPlan();
  duplicateIds.workouts[1].id = duplicateIds.workouts[0].id;
  assert.match(validationError(duplicateIds), /appears more than once/);

  const overlapping = validPlan();
  overlapping.workouts[1].scheduledAtUtc = "2026-10-06T06:30:00.000Z";
  assert.match(validationError(overlapping), /overlap/);
});

test("requires onboarding and atomically replaces only the requester's week", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-week-plan-tool-test-"));
  const databasePath = join(directory, "plugins", "pacey", "pacey.sqlite");

  try {
    const database = createDatabase(directory);
    database.initialize();
    const factory = createWeekPlanTool({
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

    await assert.rejects(
      tool.execute("tool-call-1", validPlan()),
      /profile is required/,
    );
    database.athleteProfiles.save({
      accountId: "telegram-user-1",
      profileMarkdown: "# Athlete Profile",
    });
    await assert.rejects(
      tool.execute("tool-call-2", validPlan()),
      /benchmark snapshot is required/,
    );
    database.athleteBenchmarks.save({
      accountId: "telegram-user-1",
      benchmarksMarkdown: "# Athlete Benchmarks",
    });

    const firstResult = await tool.execute("tool-call-3", {
      ...validPlan(),
      accountId: "telegram-user-2",
    });
    assert.deepEqual(firstResult.details, {
      saved: true,
      weekStart: "2026-10-05",
      revision: 1,
      workoutCount: 2,
    });

    const replacement = validPlan();
    replacement.workouts = [
      {
        ...replacement.workouts[0],
        id: "replacement-swim",
        instructionsMarkdown:
          "Replacement swim\n\n**Report afterward:** Tell me your completed distance and RPE.",
      },
    ];
    const replacementResult = await tool.execute("tool-call-4", replacement);
    assert.deepEqual(replacementResult.details, {
      saved: true,
      weekStart: "2026-10-05",
      revision: 2,
      workoutCount: 1,
    });

    assert.deepEqual(
      database.plannedWorkouts
        .findPublishedBetween(
          "telegram-user-1",
          "2026-10-05T00:00:00.000Z",
          "2026-10-12T00:00:00.000Z",
        )
        .map(({ id }) => id),
      ["replacement-swim"],
    );
    assert.deepEqual(
      database.plannedWorkouts.findPublishedBetween(
        "telegram-user-2",
        "2026-10-05T00:00:00.000Z",
        "2026-10-12T00:00:00.000Z",
      ),
      [],
    );

    const revisions = withDatabase(databasePath, (connection) =>
      connection
        .prepare(
          `
            SELECT revision, status
            FROM training_weeks
            WHERE account_id = ? AND week_start = ?
            ORDER BY revision
          `,
        )
        .all("telegram-user-1", "2026-10-05")
        .map((row) => ({ ...row })),
    );
    assert.deepEqual(revisions, [
      { revision: 1, status: "superseded" },
      { revision: 2, status: "published" },
    ]);

    const conflictingReplacement = validPlan();
    conflictingReplacement.workouts = [conflictingReplacement.workouts[0]];
    await assert.rejects(
      tool.execute("tool-call-5", conflictingReplacement),
      /could not be saved/,
    );
    assert.deepEqual(
      database.plannedWorkouts
        .findPublishedBetween(
          "telegram-user-1",
          "2026-10-05T00:00:00.000Z",
          "2026-10-12T00:00:00.000Z",
        )
        .map(({ id }) => id),
      ["replacement-swim"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

type Plan = ReturnType<typeof validPlan>;
type Workout = Plan["workouts"][number];

function validPlan() {
  return {
    weekStart: "2026-10-05",
    timezone: "Europe/Malta",
    workouts: [
      {
        id: "swim-tuesday",
        sportId: "swimming",
        scheduledAtUtc: "2026-10-06T06:00:00.000Z",
        estimatedDurationMinutes: 60,
        targetRpe: 4 as number | null,
        instructionsMarkdown:
          "Technique and easy endurance swim\n\n**Report afterward:** Tell me your completed distance and RPE.",
      },
      {
        id: "swim-thursday",
        sportId: "swimming",
        scheduledAtUtc: "2026-10-08T17:00:00.000Z",
        estimatedDurationMinutes: 45,
        targetRpe: 7 as number | null,
        instructionsMarkdown:
          "Controlled sustained swim\n\n**Report afterward:** Tell me your splits and RPE.",
      },
    ],
  };
}

function updateWorkout(
  plan: Plan,
  index: number,
  update: Partial<Workout>,
): Plan {
  plan.workouts[index] = { ...plan.workouts[index], ...update };
  return plan;
}

function validationError(input: unknown): string {
  const validation = validateWeekPlan(input);
  assert.equal(validation.ok, false);
  return validation.message;
}
