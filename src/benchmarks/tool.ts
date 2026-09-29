import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";
import {
  MAX_ATHLETE_BENCHMARKS_LENGTH,
  validateAthleteBenchmarksMarkdown,
} from "./markdown.js";

export const SAVE_ATHLETE_BENCHMARKS_TOOL = "pacey_save_athlete_benchmarks";

const parameters = Type.Object(
  {
    benchmarksMarkdown: Type.String({
      description:
        "The complete replacement athlete benchmark snapshot in Pacey's canonical Markdown format.",
      minLength: 1,
      maxLength: MAX_ATHLETE_BENCHMARKS_LENGTH,
    }),
  },
  { additionalProperties: false },
);

const outputSchema = Type.Object(
  { saved: Type.Boolean() },
  { additionalProperties: false },
);

type AthleteBenchmarksToolDependencies = {
  database: Pick<PaceyDatabase, "athleteBenchmarks">;
  logger: Pick<PluginLogger, "debug" | "error">;
};

export function createAthleteBenchmarksTool(
  dependencies: AthleteBenchmarksToolDependencies,
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
      name: SAVE_ATHLETE_BENCHMARKS_TOOL,
      label: "Save athlete benchmarks",
      description:
        "Create or replace the current Telegram user's complete athlete benchmark snapshot after the user confirms it. The account is selected from trusted request context and is not a tool argument.",
      parameters,
      outputSchema,
      async execute(_toolCallId, rawParameters) {
        const { benchmarksMarkdown } = rawParameters as {
          benchmarksMarkdown: string;
        };
        const validation =
          validateAthleteBenchmarksMarkdown(benchmarksMarkdown);
        if (!validation.ok) {
          throw new Error(validation.message);
        }

        try {
          dependencies.database.athleteBenchmarks.save({
            accountId,
            benchmarksMarkdown: validation.benchmarksMarkdown,
          });
          dependencies.logger.debug?.(
            "[athlete-benchmarks] benchmarks persisted for current requester",
          );
        } catch (error) {
          dependencies.logger.error(
            `Failed to save athlete benchmarks: ${String(error)}`,
          );
          throw new Error("The athlete benchmarks could not be saved.", {
            cause: error,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: "The current user's athlete benchmarks were saved.",
            },
          ],
          details: { saved: true },
        };
      },
    };
  };
}
