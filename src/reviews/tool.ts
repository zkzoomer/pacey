import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";

export const GET_WEEK_REVIEW_DATA_TOOL = "pacey_get_week_review_data";
export const SAVE_WEEKLY_REVIEW_TOOL = "pacey_save_weekly_review";

const MAX_REVIEW_LENGTH = 8_000;
const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const nullableNumber = Type.Union([Type.Number(), Type.Null()]);

const weekParameters = Type.Object(
  {
    weekStart: Type.String({
      description: "The Monday starting the week, in YYYY-MM-DD format.",
      pattern: DATE_PATTERN,
    }),
  },
  { additionalProperties: false },
);

const reviewDataSchema = Type.Object(
  {
    weekStart: Type.String(),
    weekEnd: Type.String(),
    plannedWorkouts: Type.Integer(),
    completedWorkouts: Type.Integer(),
    partialWorkouts: Type.Integer(),
    skippedWorkouts: Type.Integer(),
    cancelledWorkouts: Type.Integer(),
    unknownWorkouts: Type.Integer(),
    adherencePercentage: nullableNumber,
    plannedMinutes: Type.Number(),
    reportedMinutes: Type.Number(),
    averageTargetRpe: nullableNumber,
    averagePerceivedRpe: nullableNumber,
    sportSummaries: Type.Array(
      Type.Object({
        sportId: Type.String(),
        reportedWorkouts: Type.Integer(),
        reportedMinutes: Type.Number(),
        totals: Type.Record(Type.String(), Type.Number()),
      }),
    ),
    missingReports: Type.Array(
      Type.Object({
        workoutId: Type.String(),
        sportId: Type.String(),
        scheduledAtUtc: Type.String(),
      }),
    ),
    reports: Type.Array(
      Type.Object({
        sportId: Type.String(),
        originalMessage: Type.String(),
        sportMetrics: Type.Union([
          Type.Object(
            {
              version: Type.Integer({ minimum: 1 }),
              totals: Type.Optional(
                Type.Record(Type.String(), Type.Number({ minimum: 0 })),
              ),
              details: Type.Optional(
                Type.Record(Type.String(), Type.Unknown()),
              ),
            },
            { additionalProperties: false },
          ),
          Type.Null(),
        ]),
      }),
    ),
    storedReviewMarkdown: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);

const saveParameters = Type.Object(
  {
    weekStart: Type.String({ pattern: DATE_PATTERN }),
    reviewMarkdown: Type.String({
      description: "The complete concise weekly review.",
      minLength: 1,
      maxLength: MAX_REVIEW_LENGTH,
    }),
  },
  { additionalProperties: false },
);

type Dependencies = {
  database: Pick<PaceyDatabase, "weeklyReviews">;
  logger: Pick<PluginLogger, "debug" | "error">;
};

export function createWeekReviewDataTool(
  dependencies: Dependencies,
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
      name: GET_WEEK_REVIEW_DATA_TOOL,
      label: "Get weekly review data",
      description:
        "Calculate adherence, duration, effort, missing reports, per-sport totals, and complete report data for one week belonging to the current Telegram user.",
      parameters: weekParameters,
      outputSchema: reviewDataSchema,
      async execute(_toolCallId, rawParameters) {
        const range = reviewWeekRange(
          (rawParameters as { weekStart?: unknown }).weekStart,
        );
        try {
          const data = dependencies.database.weeklyReviews.getData({
            accountId,
            ...range,
          });
          dependencies.logger.debug?.(
            `[weekly-review] calculated data for week ${range.weekStart}`,
          );
          return {
            content: [
              { type: "text", text: "The weekly review data was calculated." },
            ],
            details: data,
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to calculate weekly review data: ${String(error)}`,
          );
          throw new Error("The weekly review data could not be calculated.", {
            cause: error,
          });
        }
      },
    };
  };
}

export function createSaveWeeklyReviewTool(
  dependencies: Dependencies,
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
      name: SAVE_WEEKLY_REVIEW_TOOL,
      label: "Save weekly review",
      description:
        "Create or replace the current Telegram user's concise weekly review.",
      parameters: saveParameters,
      outputSchema: Type.Object({
        saved: Type.Boolean(),
        weekStart: Type.String(),
      }),
      async execute(_toolCallId, rawParameters) {
        const input = rawParameters as {
          weekStart?: unknown;
          reviewMarkdown?: unknown;
        };
        const { weekStart } = reviewWeekRange(input.weekStart);
        const reviewMarkdown = validateWeeklyReviewMarkdown(
          input.reviewMarkdown,
        );

        try {
          dependencies.database.weeklyReviews.save({
            accountId,
            weekStart,
            reviewMarkdown,
          });
          dependencies.logger.debug?.(
            `[weekly-review] saved review for week ${weekStart}`,
          );
          return {
            content: [{ type: "text", text: "The weekly review was saved." }],
            details: { saved: true, weekStart },
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to save weekly review: ${String(error)}`,
          );
          throw new Error("The weekly review could not be saved.", {
            cause: error,
          });
        }
      },
    };
  };
}

export function reviewWeekRange(weekStartInput: unknown) {
  if (typeof weekStartInput !== "string") {
    throw new Error("weekStart must be a Monday in YYYY-MM-DD format.");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStartInput);
  if (match === null) {
    throw new Error("weekStart must be a Monday in YYYY-MM-DD format.");
  }
  const start = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (
    start.getFullYear() !== Number(match[1]) ||
    start.getMonth() !== Number(match[2]) - 1 ||
    start.getDate() !== Number(match[3]) ||
    start.getDay() !== 1
  ) {
    throw new Error("weekStart must be a valid Monday.");
  }
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
  );
  const endExclusive = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7,
  );

  return {
    weekStart: localDate(start),
    weekEnd: localDate(end),
    startUtc: start.toISOString(),
    endUtc: endExclusive.toISOString(),
  };
}

export function validateWeeklyReviewMarkdown(input: unknown): string {
  if (typeof input !== "string") {
    throw new Error("reviewMarkdown must be a string.");
  }
  const review = input.trim();
  if (review.length === 0 || review.length > MAX_REVIEW_LENGTH) {
    throw new Error(
      `reviewMarkdown must contain 1-${MAX_REVIEW_LENGTH} characters.`,
    );
  }
  return review;
}

function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
