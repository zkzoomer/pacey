import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";
import {
  UTC_TIMESTAMP_PATTERN,
  WORKOUT_ID_PATTERN,
} from "../planning/validation.js";

export const RESCHEDULE_WORKOUT_TOOL = "pacey_reschedule_workout";
export const CANCEL_WORKOUT_TOOL = "pacey_cancel_workout";

const workoutId = Type.String({
  description: "A workout ID returned by pacey_get_schedule.",
  pattern: WORKOUT_ID_PATTERN,
});

const rescheduleParameters = Type.Object(
  {
    workoutId,
    scheduledAtUtc: Type.String({
      description: "The new start time as a canonical UTC timestamp.",
      pattern: UTC_TIMESTAMP_PATTERN,
    }),
  },
  { additionalProperties: false },
);

const cancelParameters = Type.Object(
  { workoutId },
  { additionalProperties: false },
);

const rescheduleOutput = Type.Object(
  {
    updated: Type.Boolean(),
    workoutId: Type.String(),
    scheduledAtUtc: Type.String(),
  },
  { additionalProperties: false },
);

const cancelOutput = Type.Object(
  {
    updated: Type.Boolean(),
    workoutId: Type.String(),
    status: Type.Literal("cancelled"),
  },
  { additionalProperties: false },
);

type WorkoutToolDependencies = {
  database: {
    plannedWorkouts: Pick<
      PaceyDatabase["plannedWorkouts"],
      "reschedule" | "cancel"
    >;
  };
  logger: Pick<PluginLogger, "debug" | "error">;
  reconcileReminders?: () => Promise<void>;
};

export function createRescheduleWorkoutTool(
  dependencies: WorkoutToolDependencies,
): OpenClawPluginToolFactory {
  return (context) => {
    if (
      context.messageChannel !== "telegram" ||
      context.requesterSenderId === undefined
    ) {
      return null;
    }
    const accountId = context.requesterSenderId;

    return {
      name: RESCHEDULE_WORKOUT_TOOL,
      label: "Reschedule workout",
      description:
        "Move one of the current Telegram user's published, still-planned workouts after resolving its ID and checking nearby training with pacey_get_schedule. This preserves the workout ID and contents. The account comes from trusted context.",
      parameters: rescheduleParameters,
      outputSchema: rescheduleOutput,
      async execute(_toolCallId, rawParameters) {
        const input = rawParameters as {
          workoutId: string;
          scheduledAtUtc: string;
        };
        if (!isCanonicalUtcTimestamp(input.scheduledAtUtc)) {
          throw new Error("scheduledAtUtc must be a canonical UTC timestamp.");
        }

        try {
          dependencies.database.plannedWorkouts.reschedule(
            accountId,
            input.workoutId,
            input.scheduledAtUtc,
          );
          await dependencies.reconcileReminders?.();
          const result = {
            updated: true,
            workoutId: input.workoutId,
            scheduledAtUtc: input.scheduledAtUtc,
          };
          dependencies.logger.debug?.(
            "[schedule] workout rescheduled for current requester",
          );
          return {
            content: [{ type: "text", text: "The workout was rescheduled." }],
            details: result,
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to reschedule workout: ${String(error)}`,
          );
          throw new Error("The workout could not be rescheduled.", {
            cause: error,
          });
        }
      },
    };
  };
}

export function createCancelWorkoutTool(
  dependencies: WorkoutToolDependencies,
): OpenClawPluginToolFactory {
  return (context) => {
    if (
      context.messageChannel !== "telegram" ||
      context.requesterSenderId === undefined
    ) {
      return null;
    }
    const accountId = context.requesterSenderId;

    return {
      name: CANCEL_WORKOUT_TOOL,
      label: "Cancel workout",
      description:
        "Cancel one of the current Telegram user's published, still-planned workouts after resolving its ID and checking nearby training with pacey_get_schedule. This preserves the workout record and changes its status. The account comes from trusted context.",
      parameters: cancelParameters,
      outputSchema: cancelOutput,
      async execute(_toolCallId, rawParameters) {
        const { workoutId } = rawParameters as { workoutId: string };

        try {
          dependencies.database.plannedWorkouts.cancel(accountId, workoutId);
          await dependencies.reconcileReminders?.();
          const result = {
            updated: true,
            workoutId,
            status: "cancelled" as const,
          };
          dependencies.logger.debug?.(
            "[schedule] workout cancelled for current requester",
          );
          return {
            content: [{ type: "text", text: "The workout was cancelled." }],
            details: result,
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to cancel workout: ${String(error)}`,
          );
          throw new Error("The workout could not be cancelled.", {
            cause: error,
          });
        }
      },
    };
  };
}

function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !new RegExp(UTC_TIMESTAMP_PATTERN).test(value)
  ) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}
