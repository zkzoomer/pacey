import assert from "node:assert/strict";
import test from "node:test";

import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";

import { createCommandRegistry } from "../index.js";

test("passes a command's Telegram timestamp to its handler", async () => {
  const registry = createCommandRegistry({
    database: {
      initialize: () => undefined,
      weights: { record: () => undefined },
    },
    logger: { error: () => undefined },
  });
  registry.handleMessageReceived(
    {
      from: "telegram-user-1",
      content: "/weight@pacey_bot",
      timestamp: 1_789_750_800_000,
    },
    { sessionKey: "telegram-session-1" },
  );

  const weightCommand = registry.commands.find(
    (command) => command.name === "weight",
  );
  assert.ok(weightCommand);

  const context = {
    senderId: "telegram-user-1",
    channel: "telegram",
    isAuthorizedSender: true,
    sessionKey: "telegram-session-1",
    commandBody: "/weight",
    config: {},
  } as PluginCommandContext;
  const firstResult = await weightCommand.handler(context);
  assert.equal(firstResult.text, "Usage: /weight <weight> (kilograms)");

  const secondResult = await weightCommand.handler(context);
  assert.equal(
    secondResult.text,
    "I couldn't read this Telegram message's timestamp, so nothing was recorded.",
  );
});
