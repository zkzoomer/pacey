import type {
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { isDeepStrictEqual } from "node:util";

import type { PaceyDatabase } from "../database/index.js";
import type { PlannedWorkout } from "../database/queries/planned-workouts.js";
import {
  extractBeforeWorkoutNote,
  extractReportPrompt,
} from "../planning/validation.js";
import { findSupportedSport } from "../sports/index.js";

const RECONCILIATION_INTERVAL_MS = 10 * 60_000;
const PRE_WORKOUT_MINUTES = 60;
const POST_WORKOUT_DELAY_MINUTES = 30;
const DECLARATION_PREFIX = "pacey:reminder:";
const PRINT_REMINDER_SCRIPT = "process.stdout.write(process.argv[1])";

type ReminderType = "pre_workout" | "post_workout";

export type ReminderCronJob = Partial<ReminderCronUpdate> & {
  id: string;
  declarationKey?: string;
};

export type ReminderCronUpdate = {
  name: string;
  description: string;
  enabled: true;
  deleteAfterRun: true;
  schedule: { kind: "at"; at: string };
  sessionTarget: "isolated";
  wakeMode: "now";
  payload: {
    kind: "command";
    argv: [string, "-e", string, string];
    timeoutSeconds: number;
    outputMaxBytes: number;
  };
  delivery: {
    mode: "announce";
    channel: "telegram";
    to: string;
  };
};

export type ReminderCronInput = ReminderCronUpdate & {
  declarationKey: string;
};

export type ReminderCronService = {
  list: (options?: { includeDisabled?: boolean }) => Promise<ReminderCronJob[]>;
  add: (input: ReminderCronInput) => Promise<unknown>;
  update: (id: string, patch: ReminderCronUpdate) => Promise<unknown>;
  remove: (id: string) => Promise<{ removed?: boolean }>;
};

type ReminderDatabase = Pick<PaceyDatabase, "plannedWorkouts">;

type ReminderService = {
  service: OpenClawPluginService;
  reconcile: () => Promise<void>;
};

export function createReminderService(
  database: ReminderDatabase,
  logger: Pick<PluginLogger, "debug" | "error">,
): ReminderService {
  let context: OpenClawPluginServiceContext | undefined;
  let interval: NodeJS.Timeout | undefined;
  let queue = Promise.resolve();

  const reconcile = (): Promise<void> => {
    const activeContext = context;
    if (activeContext === undefined) return Promise.resolve();

    queue = queue.then(async () => {
      try {
        const cron = getReminderCron(activeContext);
        if (cron === undefined) {
          throw new Error("OpenClaw cron is unavailable.");
        }
        const count = await reconcileReminderJobs(database, cron);
        activeContext.serviceHealth?.clearFailure();
        logger.debug?.(`[reminders] reconciled ${count} reminder job(s)`);
      } catch (error) {
        activeContext.serviceHealth?.reportFailure(error);
        logger.error(`Failed to reconcile reminders: ${String(error)}`);
      }
    });
    return queue;
  };

  return {
    reconcile,
    service: {
      id: "pacey-reminders",
      async start(serviceContext) {
        context = serviceContext;
        await reconcile();
        interval = setInterval(
          () => void reconcile(),
          RECONCILIATION_INTERVAL_MS,
        );
        interval.unref();
      },
      async stop() {
        if (interval !== undefined) clearInterval(interval);
        interval = undefined;
        context = undefined;
        await queue;
      },
    },
  };
}

export async function reconcileReminderJobs(
  database: ReminderDatabase,
  cron: ReminderCronService,
  now = new Date(),
): Promise<number> {
  const reminders = database.plannedWorkouts
    .findForReminders(now.toISOString(), POST_WORKOUT_DELAY_MINUTES)
    .flatMap((workout) => remindersForWorkout(workout, now));

  const existing = await cron.list({ includeDisabled: true });
  const managedByKey = Map.groupBy(
    existing.filter((job) =>
      job.declarationKey?.startsWith(DECLARATION_PREFIX),
    ),
    (job) => job.declarationKey as string,
  );

  for (const reminder of reminders) {
    const [existingJob, ...duplicates] = (
      managedByKey.get(reminder.declarationKey) ?? []
    ).toSorted((left, right) => left.id.localeCompare(right.id));
    for (const duplicate of duplicates) await cron.remove(duplicate.id);

    if (existingJob === undefined) {
      await cron.add({
        declarationKey: reminder.declarationKey,
        ...reminder.job,
      });
    } else if (!reminderJobMatches(existingJob, reminder.job)) {
      await cron.update(existingJob.id, reminder.job);
    }
    managedByKey.delete(reminder.declarationKey);
  }

  for (const jobs of managedByKey.values())
    for (const job of jobs) await cron.remove(job.id);

  return reminders.length;
}

function reminderJobMatches(
  job: ReminderCronJob,
  desired: ReminderCronUpdate,
): boolean {
  return Object.entries(desired).every(([key, value]) =>
    isDeepStrictEqual(Reflect.get(job, key), value),
  );
}

function getReminderCron(
  context: OpenClawPluginServiceContext,
): ReminderCronService | undefined {
  // OpenClaw accepts its full cron job shape here, although the public service
  // type currently exposes only the narrower hook projection.
  return context.getCron?.() as unknown as ReminderCronService | undefined;
}

type DesiredReminder = {
  declarationKey: string;
  job: ReminderCronUpdate;
};

function remindersForWorkout(
  workout: PlannedWorkout,
  now: Date,
): DesiredReminder[] {
  const startMs = Date.parse(workout.scheduledAtUtc);
  const reminders: Array<{ type: ReminderType; atMs: number; text: string }> = [
    {
      type: "pre_workout",
      atMs: startMs - PRE_WORKOUT_MINUTES * 60_000,
      text: preWorkoutText(workout),
    },
    {
      type: "post_workout",
      atMs:
        startMs +
        (workout.estimatedDurationMinutes + POST_WORKOUT_DELAY_MINUTES) *
          60_000,
      text: postWorkoutText(workout),
    },
  ];

  return reminders
    .filter((reminder) => reminder.atMs > now.getTime())
    .map((reminder) => ({
      declarationKey: `${DECLARATION_PREFIX}${workout.id}:${reminder.type}`,
      job: {
        name: `Pacey ${reminder.type.replace("_", " ")} (${workout.id})`,
        description: "Pacey-managed workout reminder.",
        enabled: true,
        deleteAfterRun: true,
        schedule: { kind: "at", at: new Date(reminder.atMs).toISOString() },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "command",
          argv: [process.execPath, "-e", PRINT_REMINDER_SCRIPT, reminder.text],
          timeoutSeconds: 10,
          outputMaxBytes: 20_000,
        },
        delivery: {
          mode: "announce",
          channel: "telegram",
          to: workout.accountId,
        },
      },
    }));
}

function preWorkoutText(workout: PlannedWorkout): string {
  const sport = findSupportedSport(workout.sportId);
  const label = sport?.name.toLocaleLowerCase() ?? workout.sportId;
  const emoji = sport?.emoji ?? "🏃";
  const standardReminder = `${emoji} Your ${label} workout starts in about 60 minutes.\n\nUse /workout_today for the full session.`;
  const extraNote = extractBeforeWorkoutNote(workout.instructionsMarkdown);
  return extraNote === null
    ? standardReminder
    : `${standardReminder}\n\n${extraNote}`;
}

function postWorkoutText(workout: PlannedWorkout): string {
  const sport = findSupportedSport(workout.sportId);
  const label = sport?.name.toLocaleLowerCase() ?? workout.sportId;
  const emoji = sport?.emoji ?? "🏃";
  return (
    extractReportPrompt(workout.instructionsMarkdown) ??
    `${emoji} How did your ${label} workout go? Tell me what you completed, how long it took, and your RPE.`
  );
}
