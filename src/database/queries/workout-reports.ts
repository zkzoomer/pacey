import { randomUUID } from "node:crypto";

import { withDatabase } from "../connection.js";

export type WorkoutCompletionStatus =
  "completed" | "partial" | "skipped" | "cancelled";

export type SportMetrics = { version: number } & Record<string, unknown>;

export type WorkoutReport = {
  id: string;
  accountId: string;
  plannedWorkoutId: string | null;
  originalMessage: string;
  completionStatus: WorkoutCompletionStatus;
  durationMinutes: number | null;
  perceivedRpe: number | null;
  sportId: string;
  sportMetrics: SportMetrics | null;
  createdAt: string;
};

export type RecordWorkoutReport = Omit<
  WorkoutReport,
  "id" | "sportMetrics" | "createdAt"
> & {
  sportMetricsJson: string | null;
};

export type SavedWorkoutReport = {
  reportId: string;
  plannedWorkoutId: string | null;
};

export type WorkoutReportQueries = {
  findByAccountId: (accountId: string) => WorkoutReport[];
  record: (report: RecordWorkoutReport) => SavedWorkoutReport;
};

type WorkoutReportRow = {
  id: string;
  account_id: string;
  planned_workout_id: string | null;
  original_message: string;
  completion_status: WorkoutCompletionStatus;
  duration_minutes: number | null;
  perceived_rpe: number | null;
  sport_id: string;
  sport_metrics_json: string | null;
  created_at: string;
};

type PlannedWorkoutRow = {
  sport_id: string;
};

type SavedWorkoutReportRow = {
  id: string;
};

export function createWorkoutReportQueries(
  databasePath: string,
): WorkoutReportQueries {
  return {
    findByAccountId(accountId) {
      return withDatabase(databasePath, (database) =>
        database
          .prepare(
            `
              SELECT
                id,
                account_id,
                planned_workout_id,
                original_message,
                completion_status,
                duration_minutes,
                perceived_rpe,
                sport_id,
                sport_metrics_json,
                created_at
              FROM workout_reports
              WHERE account_id = ?
              ORDER BY created_at, id
            `,
          )
          .all(accountId)
          .map((row) => toWorkoutReport(row as WorkoutReportRow)),
      );
    },

    record(report) {
      return withDatabase(databasePath, (database) => {
        database.exec("BEGIN IMMEDIATE");
        try {
          if (report.plannedWorkoutId !== null) {
            const plannedWorkout = database
              .prepare(
                `
                  SELECT sport_id
                  FROM planned_workouts
                  WHERE id = ? AND account_id = ?
                `,
              )
              .get(report.plannedWorkoutId, report.accountId) as
              PlannedWorkoutRow | undefined;
            if (plannedWorkout === undefined) {
              throw new Error("The selected planned workout was not found.");
            }
            if (plannedWorkout.sport_id !== report.sportId) {
              throw new Error(
                "The report sport does not match the selected planned workout.",
              );
            }
          }

          const savedReport = database
            .prepare(
              `
                INSERT INTO workout_reports (
                  id,
                  account_id,
                  planned_workout_id,
                  original_message,
                  completion_status,
                  duration_minutes,
                  perceived_rpe,
                  sport_id,
                  sport_metrics_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (planned_workout_id) DO UPDATE SET
                  account_id = excluded.account_id,
                  original_message = excluded.original_message,
                  completion_status = excluded.completion_status,
                  duration_minutes = excluded.duration_minutes,
                  perceived_rpe = excluded.perceived_rpe,
                  sport_id = excluded.sport_id,
                  sport_metrics_json = excluded.sport_metrics_json
                RETURNING id
              `,
            )
            .get(
              randomUUID(),
              report.accountId,
              report.plannedWorkoutId,
              report.originalMessage,
              report.completionStatus,
              report.durationMinutes,
              report.perceivedRpe,
              report.sportId,
              report.sportMetricsJson,
            ) as SavedWorkoutReportRow;

          if (report.plannedWorkoutId !== null) {
            database
              .prepare(
                `
                  UPDATE planned_workouts
                  SET status = ?, updated_at = CURRENT_TIMESTAMP
                  WHERE id = ? AND account_id = ?
                `,
              )
              .run(
                report.completionStatus,
                report.plannedWorkoutId,
                report.accountId,
              );
          }

          database.exec("COMMIT");
          return {
            reportId: savedReport.id,
            plannedWorkoutId: report.plannedWorkoutId,
          };
        } catch (error) {
          database.exec("ROLLBACK");
          throw error;
        }
      });
    },
  };
}

function toWorkoutReport(row: WorkoutReportRow): WorkoutReport {
  return {
    id: row.id,
    accountId: row.account_id,
    plannedWorkoutId: row.planned_workout_id,
    originalMessage: row.original_message,
    completionStatus: row.completion_status,
    durationMinutes: row.duration_minutes,
    perceivedRpe: row.perceived_rpe,
    sportId: row.sport_id,
    sportMetrics:
      row.sport_metrics_json === null
        ? null
        : (JSON.parse(row.sport_metrics_json) as SportMetrics),
    createdAt: row.created_at,
  };
}
