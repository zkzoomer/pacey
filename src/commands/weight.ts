import type {
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
} from "openclaw/plugin-sdk/plugin-entry";

import type { CommandDependencies } from "./types.js";

const MIN_WEIGHT_KG = 10;
const MAX_WEIGHT_KG = 500;
const WEIGHT_PATTERN = /^\d+(?:[.,]\d+)?$/;
const USAGE = "Usage: /weight <weight> (kilograms)";

export type WeightParseResult =
  { ok: true; weightKg: number } | { ok: false; message: string };

function roundKilograms(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function parseWeightInput(raw: string | undefined): WeightParseResult {
  const input = raw?.trim();
  if (!input || !WEIGHT_PATTERN.test(input)) {
    return { ok: false, message: USAGE };
  }

  const weightKg = roundKilograms(Number.parseFloat(input.replace(",", ".")));
  if (
    !Number.isFinite(weightKg) ||
    weightKg < MIN_WEIGHT_KG ||
    weightKg > MAX_WEIGHT_KG
  ) {
    return {
      ok: false,
      message: `Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg.`,
    };
  }

  return { ok: true, weightKg };
}

export function calendarDayFromTimestamp(
  timestampMs: number,
  timeZone?: string,
): string {
  if (!Number.isFinite(timestampMs)) {
    throw new Error("Telegram message timestamp must be finite");
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestampMs));
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function createWeightHandler(dependencies: CommandDependencies) {
  return (context: PluginCommandContext): PluginCommandResult => {
    const accountId = context.senderId ?? context.from;
    if (!accountId) {
      return {
        text: "I couldn't identify your Telegram account, so nothing was recorded.",
      };
    }

    try {
      const messageTimestamp = dependencies.takeMessageTimestamp(
        context.sessionKey,
        "weight",
      );
      if (messageTimestamp === undefined) {
        return {
          text: "I couldn't read this Telegram message's timestamp, so nothing was recorded.",
        };
      }

      const parsed = parseWeightInput(context.args);
      if (!parsed.ok) return { text: parsed.message };

      const measuredOn = calendarDayFromTimestamp(
        messageTimestamp,
        context.config.agents?.defaults?.userTimezone,
      );
      dependencies.database.weights.record({
        accountId,
        weightKg: parsed.weightKg,
        measuredOn,
      });

      return {
        text: `Recorded ${parsed.weightKg} kg for ${measuredOn}.`,
      };
    } catch (error) {
      dependencies.logger.error(`Failed to record weight: ${String(error)}`);
      return {
        text: "I couldn't save that measurement. Nothing was recorded; please try again.",
      };
    }
  };
}

export function createWeightCommand(
  dependencies: CommandDependencies,
): OpenClawPluginCommandDefinition {
  return {
    name: "weight",
    description: "Record body weight in kilograms without calling an LLM",
    channels: ["telegram"],
    acceptsArgs: true,
    requireAuth: true,
    handler: createWeightHandler(dependencies),
  };
}
