import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import {
  athleteBenchmarksContext,
  athleteBenchmarksUnavailableContext,
} from "./benchmarks/context.js";
import {
  createAthleteBenchmarksTool,
  SAVE_ATHLETE_BENCHMARKS_TOOL,
} from "./benchmarks/tool.js";
import { createWeightCommand } from "./commands/weight.js";
import {
  createWorkoutTodayCommand,
  createWorkoutWeekCommand,
} from "./commands/workouts.js";
import { createDatabase } from "./database/index.js";
import {
  athleteProfileContext,
  athleteProfileUnavailableContext,
} from "./profile/context.js";
import {
  createAthleteProfileTool,
  SAVE_ATHLETE_PROFILE_TOOL,
} from "./profile/tool.js";
import { supportedSportsContext } from "./sports/index.js";

export default definePluginEntry({
  id: "pacey",
  name: "Pacey",
  description: "Pacey-specific behavior for OpenClaw.",

  register(api) {
    const database = createDatabase(
      api.runtime.state.resolveStateDir(process.env),
    );
    const sportsContext = supportedSportsContext();

    api.registerService({
      id: "pacey-database",
      start: database.initialize,
    });

    api.registerCommand(createWeightCommand({ database, logger: api.logger }));
    api.registerCommand(
      createWorkoutTodayCommand({ database, logger: api.logger }),
    );
    api.registerCommand(
      createWorkoutWeekCommand({ database, logger: api.logger }),
    );

    api.on("before_prompt_build", (_event, context) => {
      const channel = context.channel ?? context.messageProvider;
      if (channel !== "telegram" || !context.senderId) return;

      let profileContext: string;
      try {
        const profile = database.athleteProfiles.findByAccountId(
          context.senderId,
        );
        api.logger.debug?.(
          `[athlete-profile] context loaded (status=${profile === null ? "missing" : "present"})`,
        );
        profileContext = athleteProfileContext(profile);
      } catch (error) {
        api.logger.error(
          `Failed to load athlete profile context: ${String(error)}`,
        );
        profileContext = athleteProfileUnavailableContext();
      }

      let benchmarksContext: string;
      try {
        const benchmarks = database.athleteBenchmarks.findByAccountId(
          context.senderId,
        );
        api.logger.debug?.(
          `[athlete-benchmarks] context loaded (status=${benchmarks === null ? "missing" : "present"})`,
        );
        benchmarksContext = athleteBenchmarksContext(benchmarks);
      } catch (error) {
        api.logger.error(
          `Failed to load athlete benchmark context: ${String(error)}`,
        );
        benchmarksContext = athleteBenchmarksUnavailableContext();
      }

      return {
        prependContext: `${sportsContext}\n\n${profileContext}\n\n${benchmarksContext}`,
      };
    });

    api.registerTool(
      createAthleteProfileTool({ database, logger: api.logger }),
      { name: SAVE_ATHLETE_PROFILE_TOOL },
    );
    api.registerTool(
      createAthleteBenchmarksTool({ database, logger: api.logger }),
      { name: SAVE_ATHLETE_BENCHMARKS_TOOL },
    );
  },
});
