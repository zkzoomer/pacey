import { randomUUID } from "node:crypto";

import { withDatabase } from "../connection.js";

export type WeekPlanWorkout = {
  id: string;
  sportId: string;
  scheduledAtUtc: string;
  estimatedDurationMinutes: number;
  targetRpe: number | null;
  instructionsMarkdown: string;
};

export type ReplaceWeekPlan = {
  accountId: string;
  weekStart: string;
  timezone: string;
  workouts: WeekPlanWorkout[];
};

export type SavedWeekPlan = {
  trainingWeekId: string;
  revision: number;
};

export type WeekPlanQueries = {
  replace: (plan: ReplaceWeekPlan) => SavedWeekPlan;
};

type RevisionRow = { next_revision: number };

export function createWeekPlanQueries(databasePath: string): WeekPlanQueries {
  return {
    replace(plan) {
      return withDatabase(databasePath, (database) => {
        database.exec("BEGIN IMMEDIATE");
        try {
          const { next_revision: revision } = database
            .prepare(
              `
                SELECT COALESCE(MAX(revision), 0) + 1 AS next_revision
                FROM training_weeks
                WHERE account_id = ? AND week_start = ?
              `,
            )
            .get(plan.accountId, plan.weekStart) as RevisionRow;
          const trainingWeekId = randomUUID();

          database
            .prepare(
              `
                UPDATE training_weeks
                SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
                WHERE account_id = ?
                  AND week_start = ?
                  AND status != 'superseded'
              `,
            )
            .run(plan.accountId, plan.weekStart);

          database
            .prepare(
              `
                INSERT INTO training_weeks (
                  id, account_id, week_start, timezone, revision, status
                ) VALUES (?, ?, ?, ?, ?, 'published')
              `,
            )
            .run(
              trainingWeekId,
              plan.accountId,
              plan.weekStart,
              plan.timezone,
              revision,
            );

          const insertWorkout = database.prepare(`
            INSERT INTO planned_workouts (
              id,
              training_week_id,
              account_id,
              sport_id,
              scheduled_at_utc,
              timezone,
              estimated_duration_minutes,
              target_rpe,
              instructions_markdown
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const workout of plan.workouts) {
            insertWorkout.run(
              workout.id,
              trainingWeekId,
              plan.accountId,
              workout.sportId,
              workout.scheduledAtUtc,
              plan.timezone,
              workout.estimatedDurationMinutes,
              workout.targetRpe,
              workout.instructionsMarkdown,
            );
          }

          database.exec("COMMIT");
          return { trainingWeekId, revision };
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },
  };
}
