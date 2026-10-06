CREATE TABLE workout_reports (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  planned_workout_id TEXT,
  original_message TEXT NOT NULL CHECK (length(original_message) > 0),
  completion_status TEXT NOT NULL CHECK (
    completion_status IN (
      'completed',
      'partial',
      'skipped',
      'cancelled'
    )
  ),
  duration_minutes INTEGER CHECK (duration_minutes > 0),
  perceived_rpe REAL CHECK (perceived_rpe BETWEEN 1 AND 10),
  sport_id TEXT NOT NULL,
  sport_metrics_json TEXT CHECK (
    sport_metrics_json IS NULL OR (
      json_valid(sport_metrics_json)
      AND json_type(sport_metrics_json) = 'object'
      AND json_type(sport_metrics_json, '$.version') = 'integer'
      AND json_extract(sport_metrics_json, '$.version') > 0
    )
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (planned_workout_id) REFERENCES planned_workouts (id)
) STRICT;

CREATE INDEX workout_reports_account_created
  ON workout_reports (account_id, created_at);

CREATE UNIQUE INDEX workout_reports_planned_workout
  ON workout_reports (planned_workout_id);
