import { withDatabase } from "../connection.js";

import type {
  SportMetrics,
  WorkoutCompletionStatus,
} from "./workout-reports.js";

export type WeekReviewRange = {
  accountId: string;
  weekStart: string;
  weekEnd: string;
  startUtc: string;
  endUtc: string;
};

export type WeekReviewData = {
  weekStart: string;
  weekEnd: string;
  plannedWorkouts: number;
  completedWorkouts: number;
  partialWorkouts: number;
  skippedWorkouts: number;
  cancelledWorkouts: number;
  unknownWorkouts: number;
  adherencePercentage: number | null;
  plannedMinutes: number;
  reportedMinutes: number;
  averageTargetRpe: number | null;
  averagePerceivedRpe: number | null;
  sportSummaries: Array<{
    sportId: string;
    reportedWorkouts: number;
    reportedMinutes: number;
    totals: Record<string, number>;
  }>;
  missingReports: Array<{
    workoutId: string;
    sportId: string;
    scheduledAtUtc: string;
  }>;
  reports: Array<{
    sportId: string;
    originalMessage: string;
    sportMetrics: SportMetrics | null;
  }>;
  storedReviewMarkdown: string | null;
};

export type WeeklyReviewQueries = {
  getData: (range: WeekReviewRange) => WeekReviewData;
  save: (review: {
    accountId: string;
    weekStart: string;
    reviewMarkdown: string;
  }) => void;
};

type WorkoutRow = {
  id: string;
  sport_id: string;
  scheduled_at_utc: string;
  estimated_duration_minutes: number;
  target_rpe: number | null;
  status: string;
  report_id: string | null;
  original_message: string | null;
  completion_status: WorkoutCompletionStatus | null;
  duration_minutes: number | null;
  perceived_rpe: number | null;
  report_sport_id: string | null;
  sport_metrics_json: string | null;
};

type ReportRow = {
  original_message: string;
  completion_status: WorkoutCompletionStatus;
  duration_minutes: number | null;
  perceived_rpe: number | null;
  sport_id: string;
  sport_metrics_json: string | null;
};

export function createWeeklyReviewQueries(
  databasePath: string,
): WeeklyReviewQueries {
  return {
    getData(range) {
      return withDatabase(databasePath, (database) => {
        const workouts = database
          .prepare(
            `
              SELECT
                planned_workouts.id,
                planned_workouts.sport_id,
                planned_workouts.scheduled_at_utc,
                planned_workouts.estimated_duration_minutes,
                planned_workouts.target_rpe,
                planned_workouts.status,
                workout_reports.id AS report_id,
                workout_reports.original_message,
                workout_reports.completion_status,
                workout_reports.duration_minutes,
                workout_reports.perceived_rpe,
                workout_reports.sport_id AS report_sport_id,
                workout_reports.sport_metrics_json
              FROM planned_workouts
              JOIN training_weeks
                ON training_weeks.id = planned_workouts.training_week_id
                AND training_weeks.account_id = planned_workouts.account_id
              LEFT JOIN workout_reports
                ON workout_reports.planned_workout_id = planned_workouts.id
                AND workout_reports.account_id = planned_workouts.account_id
              WHERE planned_workouts.account_id = ?
                AND training_weeks.status = 'published'
                AND planned_workouts.scheduled_at_utc >= ?
                AND planned_workouts.scheduled_at_utc < ?
              ORDER BY planned_workouts.scheduled_at_utc, planned_workouts.id
            `,
          )
          .all(range.accountId, range.startUtc, range.endUtc) as WorkoutRow[];
        const unplannedReports = database
          .prepare(
            `
              SELECT
                original_message,
                completion_status,
                duration_minutes,
                perceived_rpe,
                sport_id,
                sport_metrics_json
              FROM workout_reports
              WHERE account_id = ?
                AND planned_workout_id IS NULL
                AND julianday(created_at) >= julianday(?)
                AND julianday(created_at) < julianday(?)
            `,
          )
          .all(range.accountId, range.startUtc, range.endUtc) as ReportRow[];
        const storedReview = database
          .prepare(
            `
              SELECT review_markdown
              FROM weekly_reviews
              WHERE account_id = ? AND week_start = ?
            `,
          )
          .get(range.accountId, range.weekStart) as
          { review_markdown: string } | undefined;

        return aggregate(
          range,
          workouts,
          unplannedReports,
          storedReview?.review_markdown ?? null,
        );
      });
    },

    save(review) {
      withDatabase(databasePath, (database) => {
        database
          .prepare(
            `
              INSERT INTO weekly_reviews (
                account_id, week_start, review_markdown
              ) VALUES (?, ?, ?)
              ON CONFLICT (account_id, week_start) DO UPDATE SET
                review_markdown = excluded.review_markdown,
                updated_at = CURRENT_TIMESTAMP
            `,
          )
          .run(review.accountId, review.weekStart, review.reviewMarkdown);
      });
    },
  };
}

function aggregate(
  range: WeekReviewRange,
  workouts: WorkoutRow[],
  unplannedReports: ReportRow[],
  storedReviewMarkdown: string | null,
): WeekReviewData {
  const linkedReports = workouts.flatMap((workout): ReportRow[] =>
    workout.report_id === null ||
    workout.original_message === null ||
    workout.completion_status === null ||
    workout.report_sport_id === null
      ? []
      : [
          {
            original_message: workout.original_message,
            completion_status: workout.completion_status,
            duration_minutes: workout.duration_minutes,
            perceived_rpe: workout.perceived_rpe,
            sport_id: workout.report_sport_id,
            sport_metrics_json: workout.sport_metrics_json,
          },
        ],
  );
  const reports = [...linkedReports, ...unplannedReports];
  const completedReports = reports.filter((report) =>
    ["completed", "partial"].includes(report.completion_status),
  );
  const activeWorkouts = workouts.filter(
    (workout) => workout.status !== "cancelled",
  );
  const count = (status: string) =>
    workouts.filter((workout) => workout.status === status).length;
  const completedWorkouts = count("completed");
  const partialWorkouts = count("partial");
  const cancelledWorkouts = count("cancelled");

  return {
    weekStart: range.weekStart,
    weekEnd: range.weekEnd,
    plannedWorkouts: workouts.length,
    completedWorkouts,
    partialWorkouts,
    skippedWorkouts: count("skipped"),
    cancelledWorkouts,
    unknownWorkouts: workouts.filter((workout) =>
      ["planned", "unknown"].includes(workout.status),
    ).length,
    adherencePercentage:
      activeWorkouts.length === 0
        ? null
        : round(
            ((completedWorkouts + partialWorkouts) / activeWorkouts.length) *
              100,
          ),
    plannedMinutes: sum(
      activeWorkouts.map((workout) => workout.estimated_duration_minutes),
    ),
    reportedMinutes: sum(
      completedReports.map((report) => report.duration_minutes ?? 0),
    ),
    averageTargetRpe: average(
      activeWorkouts.flatMap((workout) =>
        workout.target_rpe === null ? [] : [workout.target_rpe],
      ),
    ),
    averagePerceivedRpe: average(
      completedReports.flatMap((report) =>
        report.perceived_rpe === null ? [] : [report.perceived_rpe],
      ),
    ),
    sportSummaries: summarizeSports(completedReports),
    missingReports: workouts.flatMap((workout) =>
      workout.report_id === null && workout.status !== "cancelled"
        ? [
            {
              workoutId: workout.id,
              sportId: workout.sport_id,
              scheduledAtUtc: workout.scheduled_at_utc,
            },
          ]
        : [],
    ),
    reports: reports.map((report) => ({
      sportId: report.sport_id,
      originalMessage: report.original_message,
      sportMetrics:
        report.sport_metrics_json === null
          ? null
          : (JSON.parse(report.sport_metrics_json) as SportMetrics),
    })),
    storedReviewMarkdown,
  };
}

function summarizeSports(
  reports: ReportRow[],
): WeekReviewData["sportSummaries"] {
  const summaries = new Map<
    string,
    {
      reportedWorkouts: number;
      reportedMinutes: number;
      totals: Map<string, number>;
    }
  >();

  for (const report of reports) {
    const summary = summaries.get(report.sport_id) ?? {
      reportedWorkouts: 0,
      reportedMinutes: 0,
      totals: new Map<string, number>(),
    };
    summary.reportedWorkouts += 1;
    summary.reportedMinutes += report.duration_minutes ?? 0;
    for (const [name, value] of metricTotals(report.sport_metrics_json)) {
      summary.totals.set(name, (summary.totals.get(name) ?? 0) + value);
    }
    summaries.set(report.sport_id, summary);
  }

  return [...summaries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sportId, summary]) => ({
      sportId,
      reportedWorkouts: summary.reportedWorkouts,
      reportedMinutes: summary.reportedMinutes,
      totals: Object.fromEntries(summary.totals),
    }));
}

function metricTotals(value: string | null): Array<[string, number]> {
  if (value === null) return [];
  const totals = (JSON.parse(value) as { totals?: unknown }).totals;
  if (typeof totals !== "object" || totals === null || Array.isArray(totals)) {
    return [];
  }
  return Object.entries(totals).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" &&
      Number.isFinite(entry[1]) &&
      entry[1] >= 0,
  );
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : round(sum(values) / values.length);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
