import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { createWeightCommand } from "./commands/weight.js";
import { createDatabase } from "./database/index.js";

const commandFactories = [createWeightCommand];

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

    for (const createCommand of commandFactories) {
      api.registerCommand(createCommand({ database, logger: api.logger }));
    }
  },
});
