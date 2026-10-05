import { findSupportedSport } from "../sports/index.js";

export const MAX_PLANNED_WORKOUTS = 28;
export const MAX_WORKOUT_DURATION_MINUTES = 1_440;
export const MAX_WORKOUT_INSTRUCTIONS_LENGTH = 20_000;
export const WORKOUT_ID_PATTERN = "^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$";
export const UTC_TIMESTAMP_PATTERN =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$";

export type ValidatedWeekPlan = {
  weekStart: string;
  timezone: string;
  workouts: Array<{
    id: string;
    sportId: string;
    scheduledAtUtc: string;
    estimatedDurationMinutes: number;
    targetRpe: number | null;
    instructionsMarkdown: string;
  }>;
};

export type WeekPlanValidation =
  { ok: true; plan: ValidatedWeekPlan } | { ok: false; message: string };

export function validateWeekPlan(input: unknown): WeekPlanValidation {
  if (!isRecord(input)) return invalid("The week plan must be an object.");

  const weekStart = input.weekStart;
  if (typeof weekStart !== "string" || !isCalendarDate(weekStart)) {
    return invalid("weekStart must be a valid date in YYYY-MM-DD format.");
  }
  if (new Date(`${weekStart}T00:00:00.000Z`).getUTCDay() !== 1) {
    return invalid("weekStart must be a Monday.");
  }

  const timezone = input.timezone;
  if (typeof timezone !== "string" || !isTimezone(timezone)) {
    return invalid("timezone must be a valid IANA timezone.");
  }

  if (!Array.isArray(input.workouts) || input.workouts.length === 0) {
    return invalid("The week plan must contain at least one workout.");
  }
  if (input.workouts.length > MAX_PLANNED_WORKOUTS) {
    return invalid(
      `The week plan cannot contain more than ${MAX_PLANNED_WORKOUTS} workouts.`,
    );
  }

  const nextWeekStart = addCalendarDays(weekStart, 7);
  const workoutIds = new Set<string>();
  const workouts: ValidatedWeekPlan["workouts"] = [];

  for (const [index, inputWorkout] of input.workouts.entries()) {
    const field = `workouts[${index}]`;
    if (!isRecord(inputWorkout)) {
      return invalid(`${field} must be an object.`);
    }

    const id = inputWorkout.id;
    if (typeof id !== "string" || !new RegExp(WORKOUT_ID_PATTERN).test(id)) {
      return invalid(
        `${field}.id must contain 1-100 letters, numbers, underscores, or hyphens and begin with a letter or number.`,
      );
    }
    if (workoutIds.has(id)) {
      return invalid(`Workout ID "${id}" appears more than once.`);
    }
    workoutIds.add(id);

    const sportId = inputWorkout.sportId;
    const sport =
      typeof sportId === "string" ? findSupportedSport(sportId) : null;
    if (sport === null || sport.id !== sportId) {
      return invalid(
        `${field}.sportId must be a canonical supported sport ID.`,
      );
    }

    const scheduledAtUtc = inputWorkout.scheduledAtUtc;
    if (
      typeof scheduledAtUtc !== "string" ||
      !new RegExp(UTC_TIMESTAMP_PATTERN).test(scheduledAtUtc) ||
      !isCanonicalUtcTimestamp(scheduledAtUtc)
    ) {
      return invalid(
        `${field}.scheduledAtUtc must be a valid UTC timestamp such as 2026-10-05T06:00:00.000Z.`,
      );
    }
    const scheduledDate = calendarDateInTimezone(scheduledAtUtc, timezone);
    if (scheduledDate < weekStart || scheduledDate >= nextWeekStart) {
      return invalid(
        `${field}.scheduledAtUtc must fall within the planned week.`,
      );
    }

    const estimatedDurationMinutes = inputWorkout.estimatedDurationMinutes;
    if (
      !Number.isInteger(estimatedDurationMinutes) ||
      (estimatedDurationMinutes as number) < 1 ||
      (estimatedDurationMinutes as number) > MAX_WORKOUT_DURATION_MINUTES
    ) {
      return invalid(
        `${field}.estimatedDurationMinutes must be an integer between 1 and ${MAX_WORKOUT_DURATION_MINUTES}.`,
      );
    }

    const targetRpe = inputWorkout.targetRpe;
    if (
      targetRpe !== null &&
      (!Number.isInteger(targetRpe) ||
        (targetRpe as number) < 1 ||
        (targetRpe as number) > 10)
    ) {
      return invalid(
        `${field}.targetRpe must be null or an integer from 1-10.`,
      );
    }

    const instructionsMarkdown = inputWorkout.instructionsMarkdown;
    if (
      typeof instructionsMarkdown !== "string" ||
      instructionsMarkdown.trim().length === 0
    ) {
      return invalid(`${field}.instructionsMarkdown cannot be empty.`);
    }
    if (instructionsMarkdown.trim().length > MAX_WORKOUT_INSTRUCTIONS_LENGTH) {
      return invalid(
        `${field}.instructionsMarkdown cannot exceed ${MAX_WORKOUT_INSTRUCTIONS_LENGTH} characters.`,
      );
    }

    workouts.push({
      id,
      sportId,
      scheduledAtUtc,
      estimatedDurationMinutes: estimatedDurationMinutes as number,
      targetRpe: targetRpe as number | null,
      instructionsMarkdown: instructionsMarkdown.trim(),
    });
  }

  const chronologicalWorkouts = [...workouts].sort((left, right) =>
    left.scheduledAtUtc.localeCompare(right.scheduledAtUtc),
  );
  for (let index = 1; index < chronologicalWorkouts.length; index += 1) {
    const previous = chronologicalWorkouts[index - 1];
    const current = chronologicalWorkouts[index];
    const previousEnd =
      Date.parse(previous.scheduledAtUtc) +
      previous.estimatedDurationMinutes * 60_000;
    if (Date.parse(current.scheduledAtUtc) < previousEnd) {
      return invalid(`Workouts "${previous.id}" and "${current.id}" overlap.`);
    }
  }

  return {
    ok: true,
    plan: { weekStart, timezone, workouts: chronologicalWorkouts },
  };
}

function invalid(message: string): WeekPlanValidation {
  return { ok: false, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isCanonicalUtcTimestamp(value: string): boolean {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function calendarDateInTimezone(timestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
