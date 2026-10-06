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
  getTrainingState: (
    accountId: string,
    window: TrainingStateWindow,
  ) => TrainingState;
  reschedule: (
    accountId: string,
    workoutId: string,
    scheduledAtUtc: string,
  ) => void;
  cancel: (accountId: string, workoutId: string) => void;
};

export type TrainingStateWindow = {
  currentWeekStart: string;
  nextWeekStart: string;
  recentStartUtc: string;
  nowUtc: string;
};

export type TrainingState = {
  currentWeek: "present" | "missing";
  nextWeek: "present" | "missing";
  unreportedRecentWorkouts: number;
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

type TrainingStateRow = {
  current_week_present: number;
  next_week_present: number;
  unreported_recent_workouts: number;
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
    getTrainingState(accountId, window) {
      return withDatabase(databasePath, (database) => {
        const row = database
          .prepare(
            `
              SELECT
                EXISTS (
                  SELECT 1
                  FROM training_weeks
                  WHERE account_id = ?
                    AND week_start = ?
                    AND status = 'published'
                ) AS current_week_present,
                EXISTS (
                  SELECT 1
                  FROM training_weeks
                  WHERE account_id = ?
                    AND week_start = ?
                    AND status = 'published'
                ) AS next_week_present,
                (
                  SELECT COUNT(*)
                  FROM planned_workouts
                  JOIN training_weeks
                    ON training_weeks.id = planned_workouts.training_week_id
                    AND training_weeks.account_id = planned_workouts.account_id
                  WHERE planned_workouts.account_id = ?
                    AND training_weeks.status = 'published'
                    AND planned_workouts.scheduled_at_utc >= ?
                    AND planned_workouts.scheduled_at_utc < ?
                    AND planned_workouts.status IN ('planned', 'unknown')
                ) AS unreported_recent_workouts
            `,
          )
          .get(
            accountId,
            window.currentWeekStart,
            accountId,
            window.nextWeekStart,
            accountId,
            window.recentStartUtc,
            window.nowUtc,
          ) as TrainingStateRow;

        return {
          currentWeek: row.current_week_present ? "present" : "missing",
          nextWeek: row.next_week_present ? "present" : "missing",
          unreportedRecentWorkouts: row.unreported_recent_workouts,
        };
      });
    },
    reschedule(accountId, workoutId, scheduledAtUtc) {
      const result = withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              UPDATE planned_workouts
              SET scheduled_at_utc = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
                AND account_id = ?
                AND status = 'planned'
                AND EXISTS (
                  SELECT 1
                  FROM training_weeks
                  WHERE training_weeks.id = planned_workouts.training_week_id
                    AND training_weeks.account_id = planned_workouts.account_id
                    AND training_weeks.status = 'published'
                )
            `,
          )
          .run(scheduledAtUtc, workoutId, accountId),
      );
      if (result.changes !== 1) {
        throw new Error("The planned workout was not found.");
      }
    },
    cancel(accountId, workoutId) {
      const result = withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              UPDATE planned_workouts
              SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
                AND account_id = ?
                AND status = 'planned'
                AND EXISTS (
                  SELECT 1
                  FROM training_weeks
                  WHERE training_weeks.id = planned_workouts.training_week_id
                    AND training_weeks.account_id = planned_workouts.account_id
                    AND training_weeks.status = 'published'
                )
            `,
          )
          .run(workoutId, accountId),
      );
      if (result.changes !== 1) {
        throw new Error("The planned workout was not found.");
      }
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
