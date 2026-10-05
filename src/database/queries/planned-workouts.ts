import { withDatabase } from "../connection.js";

export type PlannedWorkout = {
  id: string;
  trainingWeekId: string;
  accountId: string;
  sportId: string;
  scheduledAtUtc: string;
  timezone: string;
  estimatedDurationMinutes: number;
  targetRpe: number | null;
  instructionsMarkdown: string;
  status: string;
};

export type PlannedWorkoutQueries = {
  findPublishedBetween: (
    accountId: string,
    startUtc: string,
    endUtc: string,
  ) => PlannedWorkout[];
};

type PlannedWorkoutRow = {
  id: string;
  training_week_id: string;
  account_id: string;
  sport_id: string;
  scheduled_at_utc: string;
  timezone: string;
  estimated_duration_minutes: number;
  target_rpe: number | null;
  instructions_markdown: string;
  status: string;
};

export function createPlannedWorkoutQueries(
  databasePath: string,
): PlannedWorkoutQueries {
  return {
    findPublishedBetween(accountId, startUtc, endUtc) {
      return withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              SELECT
                planned_workouts.id,
                planned_workouts.training_week_id,
                planned_workouts.account_id,
                planned_workouts.sport_id,
                planned_workouts.scheduled_at_utc,
                planned_workouts.timezone,
                planned_workouts.estimated_duration_minutes,
                planned_workouts.target_rpe,
                planned_workouts.instructions_markdown,
                planned_workouts.status
              FROM planned_workouts
              JOIN training_weeks
                ON training_weeks.id = planned_workouts.training_week_id
                AND training_weeks.account_id = planned_workouts.account_id
              WHERE planned_workouts.account_id = ?
                AND training_weeks.status = 'published'
                AND planned_workouts.scheduled_at_utc >= ?
                AND planned_workouts.scheduled_at_utc < ?
              ORDER BY planned_workouts.scheduled_at_utc, planned_workouts.id
            `,
          )
          .all(accountId, startUtc, endUtc)
          .map((row) => toPlannedWorkout(row as PlannedWorkoutRow)),
      );
    },
  };
}

function toPlannedWorkout(row: PlannedWorkoutRow): PlannedWorkout {
  return {
    id: row.id,
    trainingWeekId: row.training_week_id,
    accountId: row.account_id,
    sportId: row.sport_id,
    scheduledAtUtc: row.scheduled_at_utc,
    timezone: row.timezone,
    estimatedDurationMinutes: row.estimated_duration_minutes,
    targetRpe: row.target_rpe,
    instructionsMarkdown: row.instructions_markdown,
    status: row.status,
  };
}
