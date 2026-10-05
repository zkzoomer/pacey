import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";
import {
  MAX_PLANNED_WORKOUTS,
  MAX_WORKOUT_DURATION_MINUTES,
  MAX_WORKOUT_INSTRUCTIONS_LENGTH,
  UTC_TIMESTAMP_PATTERN,
  validateWeekPlan,
  WORKOUT_ID_PATTERN,
} from "./validation.js";

export const SAVE_WEEK_PLAN_TOOL = "pacey_create_or_replace_week_plan";

const workoutSchema = Type.Object(
  {
    id: Type.String({ pattern: WORKOUT_ID_PATTERN }),
    sportId: Type.String({
      description: "A canonical sport ID from pacey_supported_sports.",
    }),
    scheduledAtUtc: Type.String({
      description: "The workout start as a canonical UTC timestamp.",
      pattern: UTC_TIMESTAMP_PATTERN,
    }),
    estimatedDurationMinutes: Type.Integer({
      minimum: 1,
      maximum: MAX_WORKOUT_DURATION_MINUTES,
    }),
    targetRpe: Type.Union([
      Type.Integer({ minimum: 1, maximum: 10 }),
      Type.Null(),
    ]),
    instructionsMarkdown: Type.String({
      minLength: 1,
      maxLength: MAX_WORKOUT_INSTRUCTIONS_LENGTH,
    }),
  },
  { additionalProperties: false },
);

const parameters = Type.Object(
  {
    weekStart: Type.String({
      description:
        "The Monday starting the complete plan, in YYYY-MM-DD format.",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
    }),
    timezone: Type.String({
      description: "The IANA timezone used to interpret the athlete's week.",
      minLength: 1,
      maxLength: 100,
    }),
    workouts: Type.Array(workoutSchema, {
      minItems: 1,
      maxItems: MAX_PLANNED_WORKOUTS,
    }),
  },
  { additionalProperties: false },
);

const outputSchema = Type.Object(
  {
    saved: Type.Boolean(),
    weekStart: Type.String(),
    revision: Type.Integer(),
    workoutCount: Type.Integer(),
  },
  { additionalProperties: false },
);

type WeekPlanToolDependencies = {
  database: {
    athleteProfiles: Pick<PaceyDatabase["athleteProfiles"], "findByAccountId">;
    athleteBenchmarks: Pick<
      PaceyDatabase["athleteBenchmarks"],
      "findByAccountId"
    >;
    weekPlans: Pick<PaceyDatabase["weekPlans"], "replace">;
  };
  logger: Pick<PluginLogger, "debug" | "error">;
};

export function createWeekPlanTool(
  dependencies: WeekPlanToolDependencies,
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
      name: SAVE_WEEK_PLAN_TOOL,
      label: "Create or replace weekly training plan",
      description:
        "Publish a complete Monday-to-Sunday training plan for the current Telegram user. Call only after showing the complete draft and receiving explicit confirmation. This replaces that week's published plan atomically; the account is selected from trusted request context.",
      parameters,
      outputSchema,
      async execute(_toolCallId, rawParameters) {
        const validation = validateWeekPlan(rawParameters);
        if (!validation.ok) throw new Error(validation.message);

        if (
          dependencies.database.athleteProfiles.findByAccountId(accountId) ===
          null
        ) {
          throw new Error("An athlete profile is required before planning.");
        }
        if (
          dependencies.database.athleteBenchmarks.findByAccountId(accountId) ===
          null
        ) {
          throw new Error(
            "An athlete benchmark snapshot is required before planning.",
          );
        }

        try {
          const savedPlan = dependencies.database.weekPlans.replace({
            accountId,
            ...validation.plan,
          });
          const result = {
            saved: true,
            weekStart: validation.plan.weekStart,
            revision: savedPlan.revision,
            workoutCount: validation.plan.workouts.length,
          };
          dependencies.logger.debug?.(
            `[week-plan] published revision ${savedPlan.revision} with ${result.workoutCount} workout(s) for current requester`,
          );

          return {
            content: [
              {
                type: "text",
                text: `The current user's week plan was published with ${result.workoutCount} workout(s).`,
              },
            ],
            details: result,
          };
        } catch (error) {
          dependencies.logger.error(
            `Failed to publish week plan: ${String(error)}`,
          );
          throw new Error("The week plan could not be saved.", {
            cause: error,
          });
        }
      },
    };
  };
}
