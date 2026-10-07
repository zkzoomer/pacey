import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";
import type {
  RecordWorkoutReport,
  SportMetrics,
  WorkoutCompletionStatus,
} from "../database/queries/workout-reports.js";
import { findSupportedSport } from "../sports/index.js";

export const RECORD_WORKOUT_REPORT_TOOL = "pacey_record_workout_report";

const MAX_ORIGINAL_MESSAGE_LENGTH = 20_000;
const MAX_REPORT_DURATION_MINUTES = 1_440;
const MAX_SPORT_METRICS_LENGTH = 20_000;

type WorkoutReportParameters = {
  plannedWorkoutId: string | null;
  originalMessage: string;
  completionStatus: WorkoutCompletionStatus;
  durationMinutes: number | null;
  perceivedRpe: number | null;
  sportId: string;
  sportMetrics: SportMetrics | null;
};

const parameters = Type.Object(
  {
    plannedWorkoutId: Type.Union([Type.String(), Type.Null()], {
      description:
        "The matching workout ID returned by pacey_get_schedule, or null for an unplanned workout.",
    }),
    originalMessage: Type.String({
      description: "The athlete's complete original message, copied verbatim.",
      minLength: 1,
      maxLength: MAX_ORIGINAL_MESSAGE_LENGTH,
    }),
    completionStatus: Type.Union([
      Type.Literal("completed"),
      Type.Literal("partial"),
      Type.Literal("skipped"),
      Type.Literal("cancelled"),
    ]),
    durationMinutes: Type.Union([
      Type.Integer({ minimum: 1, maximum: MAX_REPORT_DURATION_MINUTES }),
      Type.Null(),
    ]),
    perceivedRpe: Type.Union([
      Type.Number({ minimum: 1, maximum: 10 }),
      Type.Null(),
    ]),
    sportId: Type.String({
      description: "A canonical sport ID from pacey_supported_sports.",
    }),
    sportMetrics: Type.Union(
      [
        Type.Object(
          {
            version: Type.Integer({ minimum: 1 }),
            totals: Type.Optional(
              Type.Record(Type.String(), Type.Number({ minimum: 0 })),
            ),
            details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
          },
          { additionalProperties: false },
        ),
        Type.Null(),
      ],
      {
        description: `Optional versioned sport-specific JSON of at most ${MAX_SPORT_METRICS_LENGTH} characters. Additive numeric metrics belong in totals; other structured values belong in details. Follow the relevant sport skill.`,
      },
    ),
  },
  { additionalProperties: false },
);

const outputSchema = Type.Object(
  {
    saved: Type.Boolean(),
    reportId: Type.String(),
    linkedPlannedWorkoutId: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

type WorkoutReportToolDependencies = {
  database: Pick<PaceyDatabase, "workoutReports">;
  logger: Pick<PluginLogger, "debug" | "error">;
  reconcileReminders?: () => Promise<void>;
};

export function createWorkoutReportTool(
  dependencies: WorkoutReportToolDependencies,
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
      name: RECORD_WORKOUT_REPORT_TOOL,
      label: "Record workout report",
      description:
        "Record the current Telegram user's workout report after using pacey_get_schedule to resolve any planned-workout match. Calling this again for the same planned workout replaces its existing report. Copy the athlete's original message verbatim. The account comes from trusted context and is not a tool argument.",
      parameters,
      outputSchema,
      async execute(_toolCallId, rawParameters) {
        const input = rawParameters as WorkoutReportParameters;
        if (
          input.originalMessage.length === 0 ||
          input.originalMessage.length > MAX_ORIGINAL_MESSAGE_LENGTH
        ) {
          throw new Error("originalMessage is not valid.");
        }
        if (findSupportedSport(input.sportId)?.id !== input.sportId) {
          throw new Error("sportId must be a canonical supported sport ID.");
        }
        const sportMetricsJson =
          input.sportMetrics === null
            ? null
            : JSON.stringify(input.sportMetrics);
        if (
          sportMetricsJson !== null &&
          sportMetricsJson.length > MAX_SPORT_METRICS_LENGTH
        ) {
          throw new Error("sportMetrics is too large.");
        }

        try {
          const saved = dependencies.database.workoutReports.record({
            accountId,
            plannedWorkoutId: input.plannedWorkoutId,
            originalMessage: input.originalMessage,
            completionStatus: input.completionStatus,
            durationMinutes: input.durationMinutes,
            perceivedRpe: input.perceivedRpe,
            sportId: input.sportId,
            sportMetricsJson,
          } satisfies RecordWorkoutReport);
          await dependencies.reconcileReminders?.();
          dependencies.logger.debug?.(
            `[workout-report] report persisted for current requester (linked=${saved.plannedWorkoutId !== null})`,
          );

          return {
            content: [
              {
                type: "text",
                text:
                  saved.plannedWorkoutId === null
                    ? "The workout report was saved as an unplanned workout."
                    : "The workout report was saved and linked to the planned workout.",
              },
            ],
            details: {
              saved: true,
              reportId: saved.reportId,
              linkedPlannedWorkoutId: saved.plannedWorkoutId,
            },
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to record workout report: ${String(error)}`,
          );
          throw new Error("The workout report could not be saved.", {
            cause: error,
          });
        }
      },
    };
  };
}
