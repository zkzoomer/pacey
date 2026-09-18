import type {
  OpenClawPluginCommandDefinition,
  PluginHookMessageReceivedEvent,
} from "openclaw/plugin-sdk/plugin-entry";

import type { CommandDependencies } from "./types.js";
import { createWeightCommand } from "./weight.js";

export type { CommandDependencies } from "./types.js";

type CommandFactory = (
  dependencies: CommandDependencies,
) => OpenClawPluginCommandDefinition;

type CommandRegistryOptions = Pick<CommandDependencies, "database" | "logger">;

const commandFactories: CommandFactory[] = [createWeightCommand];

function timestampKey(sessionKey: string, commandName: string): string {
  return `${sessionKey}\0${commandName}`;
}

function commandNameFromMessage(content: string): string | undefined {
  return /^\/([a-z0-9_]+)(?:@[^\s]+)?(?:\s|$)/i
    .exec(content.trim())?.[1]
    ?.toLowerCase();
}

export function createCommandRegistry(options: CommandRegistryOptions) {
  const messageTimestamps = new Map<string, number>();
  const dependencies: CommandDependencies = {
    ...options,
    takeMessageTimestamp: (sessionKey, commandName) => {
      if (!sessionKey) return undefined;
      const key = timestampKey(sessionKey, commandName);
      const timestamp = messageTimestamps.get(key);
      messageTimestamps.delete(key);
      return timestamp;
    },
  };
  const commands = commandFactories.map((createCommand) =>
    createCommand(dependencies),
  );
  const commandNames = new Set(commands.map((command) => command.name));

  return {
    commands,
    handleMessageReceived: (
      event: PluginHookMessageReceivedEvent,
      context: { sessionKey?: string },
    ) => {
      const commandName = commandNameFromMessage(event.content);
      if (
        !context.sessionKey ||
        !commandName ||
        !commandNames.has(commandName) ||
        event.timestamp === undefined
      ) {
        return;
      }

      // OpenClaw derives this timestamp from Telegram's message.date, but does
      // not currently include it in the native command handler context.
      messageTimestamps.set(
        timestampKey(context.sessionKey, commandName),
        event.timestamp,
      );
    },
  };
}
