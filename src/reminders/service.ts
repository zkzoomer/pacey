import type {
  OpenClawPluginService,
  OpenClawPluginServiceContext,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";

import type { PaceyDatabase } from "../database/index.js";
import type { PlannedWorkout } from "../database/queries/planned-workouts.js";
import { findSupportedSport } from "../sports/index.js";

const RECONCILIATION_INTERVAL_MS = 10 * 60_000;
const PRE_WORKOUT_MINUTES = 60;
const POST_WORKOUT_DELAY_MINUTES = 30;
const DECLARATION_PREFIX = "pacey:reminder:";

type ReminderType = "pre_workout" | "post_workout";

export type ReminderCronJob = {
  id: string;
  declarationKey?: string;
};

export type ReminderCronInput = {
  declarationKey: string;
  name: string;
  description: string;
  enabled: true;
  deleteAfterRun: true;
  schedule: { kind: "at"; at: string };
  sessionTarget: "isolated";
  wakeMode: "now";
  payload: {
    kind: "agentTurn";
    message: string;
    lightContext: true;
    toolsAllow: [];
  };
  delivery: {
    mode: "announce";
    channel: "telegram";
    to: string;
  };
};

export type ReminderCronService = {
  list: (options?: { includeDisabled?: boolean }) => Promise<ReminderCronJob[]>;
  add: (input: ReminderCronInput) => Promise<unknown>;
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
  const desiredByKey = new Map(
    reminders.map((reminder) => [reminder.input.declarationKey, reminder]),
  );

  const existing = await cron.list({ includeDisabled: true });
  const managedByKey = Map.groupBy(
    existing.filter((job) =>
      job.declarationKey?.startsWith(DECLARATION_PREFIX),
    ),
    (job) => job.declarationKey as string,
  );

  for (const [key, jobs] of managedByKey) {
    const sortedJobs = jobs.toSorted((left, right) =>
      left.id.localeCompare(right.id),
    );
    const obsoleteJobs = desiredByKey.has(key)
      ? sortedJobs.slice(1)
      : sortedJobs;
    for (const job of obsoleteJobs) await cron.remove(job.id);
  }

  for (const reminder of reminders) await cron.add(reminder.input);

  return reminders.length;
}

function getReminderCron(
  context: OpenClawPluginServiceContext,
): ReminderCronService | undefined {
  // OpenClaw accepts its full cron job shape here, although the public service
  // type currently exposes only the narrower hook projection.
  return context.getCron?.() as unknown as ReminderCronService | undefined;
}

type DesiredReminder = {
  type: ReminderType;
  input: ReminderCronInput;
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
      type: reminder.type,
      input: {
        declarationKey: `${DECLARATION_PREFIX}${workout.id}:${reminder.type}`,
        name: `Pacey ${reminder.type.replace("_", " ")} (${workout.id})`,
        description: "Pacey-managed workout reminder.",
        enabled: true,
        deleteAfterRun: true,
        schedule: { kind: "at", at: new Date(reminder.atMs).toISOString() },
        sessionTarget: "isolated",
        wakeMode: "now",
        payload: {
          kind: "agentTurn",
          message: `Send this reminder exactly as written, with no additions or explanation:\n\n${reminder.text}`,
          lightContext: true,
          toolsAllow: [],
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
  return `${emoji} Your ${label} workout starts in about 30 minutes.\n\nUse /workout_today for the full session.`;
}

function postWorkoutText(workout: PlannedWorkout): string {
  const sport = findSupportedSport(workout.sportId);
  const label = sport?.name.toLocaleLowerCase() ?? workout.sportId;
  const emoji = sport?.emoji ?? "🏃";
  const reportPrompt = extractReportPrompt(workout.instructionsMarkdown);
  return `${emoji} How did your ${label} workout go?\n\n${reportPrompt}`;
}

function extractReportPrompt(instructions: string): string {
  const marker = "**Report afterward:**";
  const markerIndex = instructions
    .toLocaleLowerCase()
    .lastIndexOf(marker.toLocaleLowerCase());
  if (markerIndex !== -1) return instructions.slice(markerIndex).trim();
  return "Tell me what you completed, how long it took, and your RPE.";
}
