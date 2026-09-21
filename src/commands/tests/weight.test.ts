import assert from "node:assert/strict";
import test from "node:test";

import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";

import {
  createWeightCommand,
  parseWeightInput,
  serverCalendarDay,
  WEIGHT_USAGE,
} from "../weight.js";

test("parses a weight as kilograms", () => {
  assert.deepEqual(parseWeightInput("82.4"), {
    ok: true,
    weightKg: 82.4,
    bodyfat: null,
  });
});

test("parses an optional body fat percentage", () => {
  assert.deepEqual(parseWeightInput("82.4 23.1"), {
    ok: true,
    weightKg: 82.4,
    bodyfat: 23.1,
  });
});

test("accepts a decimal comma", () => {
  assert.deepEqual(parseWeightInput("82,4"), {
    ok: true,
    weightKg: 82.4,
    bodyfat: null,
  });
  assert.deepEqual(parseWeightInput("82,4 23,1"), {
    ok: true,
    weightKg: 82.4,
    bodyfat: 23.1,
  });
});

test("describes the optional body fat syntax in usage help", () => {
  assert.deepEqual(parseWeightInput(undefined), {
    ok: false,
    message: WEIGHT_USAGE,
  });
});

test("rejects units, malformed input, and implausible values", () => {
  assert.equal(parseWeightInput("82 kg").ok, false);
  assert.equal(parseWeightInput("181 lb").ok, false);
  assert.equal(parseWeightInput("eighty").ok, false);
  assert.equal(parseWeightInput("2").ok, false);
  assert.equal(parseWeightInput("900").ok, false);
  assert.equal(parseWeightInput("82.4 0").ok, false);
  assert.equal(parseWeightInput("82.4 101").ok, false);
  assert.equal(parseWeightInput("82.4 23 24").ok, false);
});

test("derives the calendar day in the server timezone", () => {
  assert.equal(serverCalendarDay(new Date(2026, 8, 18, 12)), "2026-09-18");
});

test("records a weight using the current server day", async () => {
  const records: Array<{
    accountId: string;
    weightKg: number;
    bodyfat: number | null;
    measuredOn: string;
  }> = [];
  const command = createWeightCommand({
    database: {
      initialize: () => undefined,
      weights: { record: (measurement) => records.push(measurement) },
    },
    logger: { error: () => undefined },
  });
  const context = {
    senderId: "telegram-user-1",
    channel: "telegram",
    isAuthorizedSender: true,
    args: "82.4",
    commandBody: "/weight 82.4",
    config: {},
  } as PluginCommandContext;
  const possibleDays = new Set([serverCalendarDay()]);

  const result = await command.handler(context);
  possibleDays.add(serverCalendarDay());

  assert.equal(records.length, 1);
  const [{ measuredOn, ...measurement }] = records;
  assert.ok(possibleDays.has(measuredOn));
  assert.deepEqual(measurement, {
    accountId: "telegram-user-1",
    weightKg: 82.4,
    bodyfat: null,
  });
  assert.equal(result.text, `Recorded 82.4 kg for ${measuredOn}.`);
});
