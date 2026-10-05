import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";
import { boundedScheduleDateRange, MAX_SCHEDULE_RANGE_DAYS } from "./dates.js";

export const GET_SCHEDULE_TOOL = "pacey_get_schedule";

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";

const parameters = Type.Object(
  {
    startDate: Type.String({
      description:
        "The inclusive server-local start date in YYYY-MM-DD format.",
      pattern: DATE_PATTERN,
    }),
    endDate: Type.String({
      description: `The inclusive end date. The complete range may contain at most ${MAX_SCHEDULE_RANGE_DAYS} days.`,
      pattern: DATE_PATTERN,
    }),
  },
  { additionalProperties: false },
);

const workoutSchema = Type.Object(
  {
    id: Type.String(),
    sportId: Type.String(),
    scheduledAtUtc: Type.String(),
    timezone: Type.String(),
    estimatedDurationMinutes: Type.Integer(),
    targetRpe: Type.Union([Type.Integer(), Type.Null()]),
    instructionsMarkdown: Type.String(),
    status: Type.String(),
  },
  { additionalProperties: false },
);

const outputSchema = Type.Object(
  {
    startDate: Type.String(),
    endDate: Type.String(),
    workouts: Type.Array(workoutSchema),
  },
  { additionalProperties: false },
);

type ScheduleToolDependencies = {
  database: {
    plannedWorkouts: Pick<
      PaceyDatabase["plannedWorkouts"],
      "findPublishedBetween"
    >;
  };
  logger: Pick<PluginLogger, "debug" | "error">;
};

export function createScheduleTool(
  dependencies: ScheduleToolDependencies,
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
      name: GET_SCHEDULE_TOOL,
      label: "Get training schedule",
      description: `Get the current Telegram user's published workouts over an inclusive server-local date range of at most ${MAX_SCHEDULE_RANGE_DAYS} days. The account is selected from trusted request context and is not a tool argument.`,
      parameters,
      outputSchema,
      async execute(_toolCallId, rawParameters) {
        const { startDate, endDate } = rawParameters as {
          startDate?: unknown;
          endDate?: unknown;
        };
        const { startUtc, endUtc } = boundedScheduleDateRange(
          startDate,
          endDate,
        );

        try {
          const workouts =
            dependencies.database.plannedWorkouts.findPublishedBetween(
              accountId,
              startUtc,
              endUtc,
            );
          const result = {
            startDate: startDate as string,
            endDate: endDate as string,
            workouts: workouts.map((workout) => ({
              id: workout.id,
              sportId: workout.sportId,
              scheduledAtUtc: workout.scheduledAtUtc,
              timezone: workout.timezone,
              estimatedDurationMinutes: workout.estimatedDurationMinutes,
              targetRpe: workout.targetRpe,
              instructionsMarkdown: workout.instructionsMarkdown,
              status: workout.status,
            })),
          };
          dependencies.logger.debug?.(
            `[schedule] loaded ${workouts.length} workout(s) for current requester`,
          );

          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            details: result,
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to load training schedule: ${String(error)}`,
          );
          throw new Error("The training schedule could not be loaded.", {
            cause: error,
          });
        }
      },
    };
  };
}
