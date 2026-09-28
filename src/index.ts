import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { createWeightCommand } from "./commands/weight.js";
import { createDatabase } from "./database/index.js";
import {
  athleteProfileContext,
  athleteProfileUnavailableContext,
} from "./profile/context.js";
import {
  createAthleteProfileTool,
  SAVE_ATHLETE_PROFILE_TOOL,
} from "./profile/tool.js";

export default definePluginEntry({
  id: "pacey",
  name: "Pacey",
  description: "Pacey-specific behavior for OpenClaw.",

  register(api) {
    const database = createDatabase(
      api.runtime.state.resolveStateDir(process.env),
    );

    api.registerService({
      id: "pacey-database",
      start: database.initialize,
    });

    api.registerCommand(createWeightCommand({ database, logger: api.logger }));

    api.on("before_prompt_build", (_event, context) => {
      const channel = context.channel ?? context.messageProvider;
      if (channel !== "telegram" || !context.senderId) return;

      try {
        const profile = database.athleteProfiles.findByAccountId(
          context.senderId,
        );
        api.logger.debug?.(
          `[athlete-profile] context loaded (status=${profile === null ? "missing" : "present"})`,
        );
        return { prependContext: athleteProfileContext(profile) };
      } catch (error) {
        api.logger.error(
          `Failed to load athlete profile context: ${String(error)}`,
        );
        return { prependContext: athleteProfileUnavailableContext() };
      }
    });

    api.registerTool(
      createAthleteProfileTool({ database, logger: api.logger }),
      { name: SAVE_ATHLETE_PROFILE_TOOL },
    );
  },
});
