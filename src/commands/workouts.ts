import type {
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
  PluginLogger,
} from "openclaw/plugin-sdk/plugin-entry";

import type { PaceyDatabase } from "../database/index.js";
import type { PlannedWorkout } from "../database/queries/planned-workouts.js";
import { findSupportedSport } from "../sports/index.js";

type WorkoutCommandDependencies = {
  database: {
    plannedWorkouts: Pick<
      PaceyDatabase["plannedWorkouts"],
      "findPublishedBetween"
    >;
  };
  logger: Pick<PluginLogger, "debug" | "error">;
};

type DateRange = { startUtc: string; endUtc: string };
type ScheduleView = "today" | "week";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "short",
});

export function serverDayRange(date = new Date()): DateRange {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function serverWeekRange(date = new Date()): DateRange {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  const start = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - daysSinceMonday,
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7,
  );
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export function formatWorkoutSchedule(
  workouts: PlannedWorkout[],
  view: ScheduleView,
): string {
  if (workouts.length === 0) {
    return view === "today"
      ? "You don't have any workouts planned for today."
      : "You don't have any workouts planned for this week yet.";
  }

  const sections = [
    view === "today" ? "Today's workouts" : "This week's workouts",
  ];
  let previousDay = "";

  for (const workout of [...workouts].sort((left, right) =>
    left.scheduledAtUtc.localeCompare(right.scheduledAtUtc),
  )) {
    const scheduledAt = new Date(workout.scheduledAtUtc);
    const calendarDay = localCalendarDay(scheduledAt);
    if (view === "week" && calendarDay !== previousDay) {
      sections.push(WEEKDAY_FORMAT.format(scheduledAt));
      previousDay = calendarDay;
    }

    const sport = findSupportedSport(workout.sportId);
    const sportLabel =
      sport === null ? workout.sportId : `${sport.emoji} ${sport.name}`;
    const period = dayPeriod(scheduledAt.getHours());
    const time = `${String(scheduledAt.getHours()).padStart(2, "0")}:${String(scheduledAt.getMinutes()).padStart(2, "0")}`;
    const effort =
      workout.targetRpe === null
        ? "Effort not set"
        : `RPE ${workout.targetRpe}/10`;

    sections.push(
      `${sportLabel} — ${titleCase(workout.status)}\n${period} around ${time} · ${workout.estimatedDurationMinutes} min · ${effort}\n${workout.instructionsMarkdown.trim()}`,
    );
  }

  return sections.join("\n\n");
}

export function createWorkoutTodayCommand(
  dependencies: WorkoutCommandDependencies,
): OpenClawPluginCommandDefinition {
  return createWorkoutCommand({
    dependencies,
    name: "workout_today",
    description: "Show today's planned workouts",
    view: "today",
    range: serverDayRange,
  });
}

export function createWorkoutWeekCommand(
  dependencies: WorkoutCommandDependencies,
): OpenClawPluginCommandDefinition {
  return createWorkoutCommand({
    dependencies,
    name: "workout_week",
    description: "Show this week's planned workouts",
    view: "week",
    range: serverWeekRange,
  });
}

function createWorkoutCommand(options: {
  dependencies: WorkoutCommandDependencies;
  name: string;
  description: string;
  view: ScheduleView;
  range: () => DateRange;
}): OpenClawPluginCommandDefinition {
  const { dependencies, name, description, view, range } = options;

  return {
    name,
    description,
    channels: ["telegram"],
    acceptsArgs: false,
    requireAuth: true,
    handler(context: PluginCommandContext): PluginCommandResult {
      dependencies.logger.debug?.(`[${name}] command received`);
      const accountId = context.senderId ?? context.from;
      if (!accountId) {
        return {
          text: "I couldn't identify your Telegram account, so I couldn't load your workouts.",
        };
      }

      try {
        const { startUtc, endUtc } = range();
        const workouts =
          dependencies.database.plannedWorkouts.findPublishedBetween(
            accountId,
            startUtc,
            endUtc,
          );
        dependencies.logger.debug?.(
          `[${name}] loaded ${workouts.length} workout(s)`,
        );
        return { text: formatWorkoutSchedule(workouts, view) };
      } catch (error) {
        dependencies.logger.error(
          `Failed to load ${view} workouts: ${String(error)}`,
        );
        return {
          text: "I couldn't load your workouts right now. Please try again.",
        };
      }
    },
  };
}

function localCalendarDay(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function dayPeriod(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

function titleCase(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
