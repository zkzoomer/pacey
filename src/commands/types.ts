import type { PluginLogger } from "openclaw/plugin-sdk/plugin-entry";

import type { PaceyDatabase } from "../database/index.js";

export type CommandDependencies = {
  database: PaceyDatabase;
  logger: Pick<PluginLogger, "error">;
  takeMessageTimestamp: (
    sessionKey: string | undefined,
    commandName: string,
  ) => number | undefined;
};
