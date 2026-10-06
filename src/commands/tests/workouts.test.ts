import assert from "node:assert/strict";
import test from "node:test";

import type { PluginCommandContext } from "openclaw/plugin-sdk/plugin-entry";

import type { PlannedWorkout } from "../../database/queries/planned-workouts.js";
import {
  createWorkoutTodayCommand,
  createWorkoutWeekCommand,
  formatWorkoutSchedule,
  serverDayRange,
  serverWeekRange,
} from "../workouts.js";

test("derives today and Monday-to-Sunday ranges in the server timezone", () => {
  const sunday = new Date(2026, 9, 11, 14, 30);

  assert.deepEqual(serverDayRange(sunday), {
    startUtc: new Date(2026, 9, 11).toISOString(),
    endUtc: new Date(2026, 9, 12).toISOString(),
  });
  assert.deepEqual(serverWeekRange(sunday), {
    startUtc: new Date(2026, 9, 5).toISOString(),
    endUtc: new Date(2026, 9, 12).toISOString(),
  });
});

test("formats workouts chronologically with their schedule and instructions", () => {
  const morning = plannedWorkout({
    id: "workout-morning",
    scheduledAtUtc: new Date(2026, 9, 5, 8).toISOString(),
    estimatedDurationMinutes: 60,
    targetRpe: 4,
    instructionsMarkdown: "Easy endurance swim",
  });
  const evening = plannedWorkout({
    id: "workout-evening",
    scheduledAtUtc: new Date(2026, 9, 5, 19).toISOString(),
    estimatedDurationMinutes: 45,
    targetRpe: 7,
    instructionsMarkdown: "Short speed session",
  });

  assert.equal(
    formatWorkoutSchedule([evening, morning], "today"),
    `**Today's workouts**

**🏊 Swimming — Planned**
_Morning around 08:00 · 60 min · RPE 4/10_

Easy endurance swim

**🏊 Swimming — Planned**
_Evening around 19:00 · 45 min · RPE 7/10_

Short speed session`,
  );
});

test("groups the weekly view by local calendar day", () => {
  const monday = plannedWorkout({
    scheduledAtUtc: new Date(2026, 9, 5, 8).toISOString(),
    instructionsMarkdown: "Technique swim",
  });
  const wednesday = plannedWorkout({
    id: "workout-2",
    scheduledAtUtc: new Date(2026, 9, 7, 19).toISOString(),
    targetRpe: null,
    instructionsMarkdown: "Easy swim",
  });

  const output = formatWorkoutSchedule([wednesday, monday], "week");

  assert.match(output, /^\*\*This week's workouts\*\*/);
  assert.match(output, /---\n\n\*\*<u>Monday 5 Oct<\/u>\*\*/);
  assert.ok(output.indexOf("Monday 5 Oct") < output.indexOf("Wednesday 7 Oct"));
  assert.match(output, /_Evening around 19:00 · 60 min · Effort not set_/);
});

test("styles easier options and reporting prompts as callouts", () => {
  const workout = plannedWorkout({
    instructionsMarkdown: `Main set.

**Easier option in either pool:** Do 3×300 m instead.

**Report afterward:** pool length, completed distance and RPE.`,
  });

  assert.match(
    formatWorkoutSchedule([workout], "today"),
    /> 💡 \*\*Easier option in either pool\*\*\n> _Do 3×300 m instead\._/,
  );
  assert.match(
    formatWorkoutSchedule([workout], "today"),
    /> 📝 \*\*Report afterward\*\*\n> _pool length, completed distance and RPE\._/,
  );
});

test("returns a friendly empty response without exposing another account", async () => {
  const requestedAccounts: string[] = [];
  const command = createWorkoutTodayCommand({
    database: {
      plannedWorkouts: {
        findPublishedBetween: (accountId) => {
          requestedAccounts.push(accountId);
          return [];
        },
      },
    },
    logger: { error: () => undefined },
  });
  const context = {
    senderId: "telegram-user-1",
    channel: "telegram",
    isAuthorizedSender: true,
    commandBody: "/workout_today",
    config: {},
  } as PluginCommandContext;

  const result = await command.handler(context);

  assert.deepEqual(requestedAccounts, ["telegram-user-1"]);
  assert.equal(result.text, "You don't have any workouts planned for today.");
  assert.equal(command.acceptsArgs, false);
});

test("registers the weekly view as an authenticated Telegram command", () => {
  const command = createWorkoutWeekCommand({
    database: {
      plannedWorkouts: { findPublishedBetween: () => [] },
    },
    logger: { error: () => undefined },
  });

  assert.equal(command.name, "workout_week");
  assert.deepEqual(command.channels, ["telegram"]);
  assert.equal(command.requireAuth, true);
  assert.equal(command.acceptsArgs, false);
});

function plannedWorkout(
  overrides: Partial<PlannedWorkout> = {},
): PlannedWorkout {
  return {
    id: "workout-1",
    trainingWeekId: "week-1",
    accountId: "telegram-user-1",
    sportId: "swimming",
    scheduledAtUtc: new Date(2026, 9, 5, 8).toISOString(),
    timezone: "Europe/Malta",
    estimatedDurationMinutes: 60,
    targetRpe: 5,
    instructionsMarkdown: "Swim",
    status: "planned",
    ...overrides,
  };
}
