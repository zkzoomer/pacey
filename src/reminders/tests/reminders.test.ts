import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDatabase } from "../../database/index.js";
import {
  type ReminderCronInput,
  type ReminderCronService,
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

    assert.equal(await reconcileReminderJobs(database, cron, now), 2);
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
      ],
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.delivery),
      [
        { mode: "announce", channel: "telegram", to: "telegram-user-1" },
        { mode: "announce", channel: "telegram", to: "telegram-user-1" },
      ],
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.payload.kind),
      ["command", "command"],
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.payload.argv[3]),
      [
        "🏊 Your swimming workout starts in about 60 minutes.\n\nUse /workout_today for the full session.\n\n**Before workout:** Bring fins for the technique set.",
        "🏊 How did the 5×200 m set go? Send each split, actual rest, and RPE.",
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
    assert.equal(cron.jobs.length, 2);

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
    ]);

    await reconcileReminderJobs(
      database,
      cron,
      new Date("2026-10-09T18:00:00.000Z"),
    );
    assert.deepEqual(
      cron.jobs.map((job) => job.declarationKey),
      ["pacey:reminder:swim-thursday:post_workout"],
    );

    database.plannedWorkouts.cancel("telegram-user-1", "swim-thursday");
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
    const existing = this.jobs.find(
      (job) => job.declarationKey === input.declarationKey,
    );
    if (existing !== undefined) {
      Object.assign(existing, input);
      return existing;
    }
    const job = { id: `cron-${this.#nextId}`, ...input };
    this.#nextId += 1;
    this.jobs.push(job);
    return job;
  }

  async remove(id: string): Promise<{ removed: boolean }> {
    const previousLength = this.jobs.length;
    this.jobs = this.jobs.filter((job) => job.id !== id);
    return { removed: this.jobs.length !== previousLength };
  }
}
