import assert from "node:assert/strict";
import test from "node:test";

import {
  calendarDayFromTimestamp,
  parseWeightInput,
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

test("derives the calendar day in the configured user timezone", () => {
  const timestamp = Date.parse("2026-09-18T23:30:00.000Z");
  assert.equal(
    calendarDayFromTimestamp(timestamp, "Europe/Malta"),
    "2026-09-19",
  );
});
