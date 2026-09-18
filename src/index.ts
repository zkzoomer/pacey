import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { createCommandRegistry } from "./commands/index.js";
import { createDatabase } from "./database/index.js";

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

    const commandRegistry = createCommandRegistry({
      database,
      logger: api.logger,
    });
    api.on("message_received", commandRegistry.handleMessageReceived);

    for (const command of commandRegistry.commands) {
      api.registerCommand(command);
    }
  },
});
