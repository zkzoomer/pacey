import type {
  OpenClawPluginToolFactory,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

import type { PaceyDatabase } from "../database/index.js";
import {
  MAX_ATHLETE_PROFILE_LENGTH,
  validateAthleteProfileMarkdown,
} from "./markdown.js";

export const SAVE_ATHLETE_PROFILE_TOOL = "pacey_save_athlete_profile";

const parameters = Type.Object(
  {
    profileMarkdown: Type.String({
      description:
        "The complete replacement athlete profile in Pacey's canonical Markdown format.",
      minLength: 1,
      maxLength: MAX_ATHLETE_PROFILE_LENGTH,
    }),
  },
  { additionalProperties: false },
);

const outputSchema = Type.Object(
  { saved: Type.Boolean() },
  { additionalProperties: false },
);

type AthleteProfileToolDependencies = {
  database: Pick<PaceyDatabase, "athleteProfiles">;
  logger: Pick<PluginLogger, "debug" | "error">;
};

export function createAthleteProfileTool(
  dependencies: AthleteProfileToolDependencies,
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
      name: SAVE_ATHLETE_PROFILE_TOOL,
      label: "Save athlete profile",
      description:
        "Create or replace the current Telegram user's complete athlete profile. Use only after following the athlete-profile skill. The account is selected from trusted request context and is not a tool argument.",
      parameters,
      outputSchema,
      async execute(_toolCallId, rawParameters) {
        const { profileMarkdown } = rawParameters as {
          profileMarkdown: string;
        };
        const validation = validateAthleteProfileMarkdown(profileMarkdown);
        if (!validation.ok) {
          throw new Error(validation.message);
        }

        try {
          dependencies.database.athleteProfiles.save({
            accountId,
            profileMarkdown: validation.profileMarkdown,
          });
          dependencies.logger.debug?.(
            "[athlete-profile] profile persisted for current requester",
          );
        } catch (error) {
          dependencies.logger.error(
            `Failed to save athlete profile: ${String(error)}`,
          );
          throw new Error("The athlete profile could not be saved.", {
            cause: error,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: "The current user's athlete profile was saved.",
            },
          ],
          details: { saved: true },
        };
      },
    };
  };
}
