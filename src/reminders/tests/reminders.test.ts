import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabase } from "../../database/index.js";
import {
  type ReminderCronInput,
  type ReminderCronService,
  type ReminderCronUpdate,
  reconcileReminderJobs,
} from "../service.js";

test("reconciles workout reminders without duplicates", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-reminders-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    database.weekPlans.replace({
      accountId: "telegram-user-1",
      weekStart: "2026-10-05",
      timezone: "Europe/Malta",
      workouts: [
        {
          id: "swim-thursday",
          sportId: "swimming",
          scheduledAtUtc: "2026-10-08T10:00:00.000Z",
          estimatedDurationMinutes: 60,
          targetRpe: 6,
          instructionsMarkdown:
            "5×200 m controlled.\n\n**Before workout:** Bring fins for the technique set.\n\n**Report afterward:** 🏊 How did the 5×200 m set go? Send each split, actual rest, and RPE.",
        },
      ],
    });
    const cron = new FakeCron();
    const now = new Date("2026-10-06T10:00:00.000Z");

    assert.equal(await reconcileReminderJobs(database, cron, now), 4);
    assert.deepEqual(
      cron.jobs.map((job) => ({
        key: job.declarationKey,
        at: job.schedule.at,
      })),
      [
        {
          key: "pacey:reminder:swim-thursday:pre_workout",
          at: "2026-10-08T09:00:00.000Z",
        },
        {
          key: "pacey:reminder:swim-thursday:post_workout",
          at: "2026-10-08T11:30:00.000Z",
        },
        {
          key: "pacey:reminder:swim-thursday:post_workout_follow_up",
          at: "2026-10-08T12:00:00.000Z",
        },
        {
          key: "pacey:reminder:swim-thursday:post_workout_final",
          at: "2026-10-08T13:00:00.000Z",
        },
      ],
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.delivery),
      [
        { mode: "announce", channel: "telegram", to: "telegram-user-1" },
        { mode: "announce", channel: "telegram", to: "telegram-user-1" },
        { mode: "announce", channel: "telegram", to: "telegram-user-1" },
        { mode: "announce", channel: "telegram", to: "telegram-user-1" },
      ],
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.payload.kind),
      ["command", "command", "command", "command"],
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.payload.argv[3]),
      [
        "🏊 Your swimming workout starts in about 60 minutes.\n\nUse /workout_today for the full session.\n\n**Before workout:** Bring fins for the technique set.",
        "🏊 How did the 5×200 m set go? Send each split, actual rest, and RPE.",
        "Quick reminder to log today’s swimming workout when you have a moment.",
        "Final reminder for today’s swimming workout. I’ll leave it unreported for now, but you can still tell me how it went later.",
      ],
    );
    const originalIds = cron.jobs.map((job) => job.id);
    await reconcileReminderJobs(database, cron, now);
    assert.deepEqual(
      cron.jobs.map((job) => job.id),
      originalIds,
    );
    await cron.remove(originalIds[0]);
    await reconcileReminderJobs(database, cron, now);
    assert.equal(cron.jobs.length, 4);

    database.plannedWorkouts.reschedule(
      "telegram-user-1",
      "swim-thursday",
      "2026-10-09T17:00:00.000Z",
    );
    const idsBeforeReschedule = cron.jobs.map((job) => job.id).sort();
    await reconcileReminderJobs(database, cron, now);
    assert.deepEqual(
      cron.jobs.map((job) => job.id).sort(),
      idsBeforeReschedule,
    );
    assert.deepEqual(cron.jobs.map((job) => job.schedule.at).sort(), [
      "2026-10-09T16:00:00.000Z",
      "2026-10-09T18:30:00.000Z",
      "2026-10-09T19:00:00.000Z",
      "2026-10-09T20:00:00.000Z",
    ]);
    await reconcileReminderJobs(
      database,
      cron,
      new Date("2026-10-09T18:00:00.000Z"),
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.declarationKey),
      [
        "pacey:reminder:swim-thursday:post_workout",
        "pacey:reminder:swim-thursday:post_workout_follow_up",
        "pacey:reminder:swim-thursday:post_workout_final",
      ],
    );

    database.plannedWorkouts.cancel("telegram-user-1", "swim-thursday");
    await reconcileReminderJobs(database, cron, now);
    assert.deepEqual(cron.jobs, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("removes remaining reminders after a workout report", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-reminders-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    database.weekPlans.replace({
      accountId: "telegram-user-1",
      weekStart: "2026-10-05",
      timezone: "Europe/Malta",
      workouts: [
        {
          id: "swim-thursday",
          sportId: "swimming",
          scheduledAtUtc: "2026-10-08T10:00:00.000Z",
          estimatedDurationMinutes: 60,
          targetRpe: 6,
          instructionsMarkdown: "Swim.\n\n**Report afterward:** How did it go?",
        },
      ],
    });
    const cron = new FakeCron();
    const now = new Date("2026-10-08T11:45:00.000Z");

    await reconcileReminderJobs(database, cron, now);
    assert.deepEqual(
      cron.jobs.map((job) => job.declarationKey),
      [
        "pacey:reminder:swim-thursday:post_workout_follow_up",
        "pacey:reminder:swim-thursday:post_workout_final",
      ],
    );

    database.workoutReports.record({
      accountId: "telegram-user-1",
      plannedWorkoutId: "swim-thursday",
      originalMessage: "Completed it as planned.",
      completionStatus: "completed",
      durationMinutes: null,
      perceivedRpe: null,
      sportId: "swimming",
      sportMetricsJson: null,
    });
    await reconcileReminderJobs(database, cron, now);

    assert.deepEqual(cron.jobs, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

type FakeCronJob = ReminderCronInput & { id: string };

class FakeCron implements ReminderCronService {
  jobs: FakeCronJob[] = [];
  #nextId = 1;

  async list(): Promise<FakeCronJob[]> {
    return this.jobs;
  }

  async add(input: ReminderCronInput): Promise<unknown> {
    assert.equal(
      this.jobs.some((job) => job.declarationKey === input.declarationKey),
      false,
      "add must not be used to update an existing cron job",
    );
    const job = { id: `cron-${this.#nextId}`, ...input };
    this.#nextId += 1;
    this.jobs.push(job);
    return job;
  }

  async update(id: string, patch: ReminderCronUpdate): Promise<unknown> {
    const job = this.jobs.find((candidate) => candidate.id === id);
    assert.ok(job, `cron job ${id} was not found`);
    Object.assign(job, patch);
    return job;
  }

  async remove(id: string): Promise<{ removed: boolean }> {
    const previousLength = this.jobs.length;
    this.jobs = this.jobs.filter((job) => job.id !== id);
    return { removed: this.jobs.length !== previousLength };
  }
}
