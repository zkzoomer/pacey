import type {
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
} from "openclaw/plugin-sdk/plugin-entry";

import type { CommandDependencies } from "./types.js";

export const WEIGHT_USAGE = `
  Usage: /weight <weight> [bodyfat]

  Arguments:
  • weight: Your weight in kilograms
  • bodyfat: Optional body fat percentage
  `.trim();

const MIN_WEIGHT_KG = 10;
const MAX_WEIGHT_KG = 500;
const NUMBER_PATTERN = /^\d+(?:[.,]\d+)?$/;

export type WeightParseResult =
  | { ok: true; weightKg: number; bodyfat: number | null }
  | { ok: false; message: string };

function roundKilograms(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function parseWeightInput(raw: string | undefined): WeightParseResult {
  const parts = raw?.trim().split(/\s+/) ?? [];
  if (
    parts.length < 1 ||
    parts.length > 2 ||
    parts.some((part) => !NUMBER_PATTERN.test(part))
  ) {
    return { ok: false, message: WEIGHT_USAGE };
  }

  const [weightInput, bodyfatInput] = parts;
  const weightKg = roundKilograms(
    Number.parseFloat(weightInput.replace(",", ".")),
  );
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

  const bodyfat =
    bodyfatInput === undefined
      ? null
      : Number.parseFloat(bodyfatInput.replace(",", "."));
  if (
    bodyfat !== null &&
    (!Number.isFinite(bodyfat) || bodyfat <= 0 || bodyfat > 100)
  ) {
    return { ok: false, message: "Body fat must be between 0 and 100%." };
  }

  return { ok: true, weightKg, bodyfat };
}

export function serverCalendarDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createWeightHandler(dependencies: CommandDependencies) {
  return (context: PluginCommandContext): PluginCommandResult => {
    dependencies.logger.debug?.("[weight] command received");

    const accountId = context.senderId ?? context.from;
    if (!accountId) {
      dependencies.logger.debug?.("[weight] rejected: account unavailable");
      return {
        text: "I couldn't identify your Telegram account, so nothing was recorded.",
      };
    }

    try {
      const parsed = parseWeightInput(context.args);
      if (!parsed.ok) {
        dependencies.logger.debug?.("[weight] rejected: invalid arguments");
        return { text: parsed.message };
      }

      dependencies.logger.debug?.(
        `[weight] arguments parsed (bodyfatProvided=${parsed.bodyfat !== null})`,
      );

      const measuredOn = serverCalendarDay();
      dependencies.database.weights.record({
        accountId,
        weightKg: parsed.weightKg,
        bodyfat: parsed.bodyfat,
        measuredOn,
      });
      dependencies.logger.debug?.(
        `[weight] measurement persisted (measuredOn=${measuredOn})`,
      );

      return {
        text: `Recorded ${parsed.weightKg} kg${parsed.bodyfat === null ? "" : `, ${parsed.bodyfat}% body fat`} for ${measuredOn}.`,
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
