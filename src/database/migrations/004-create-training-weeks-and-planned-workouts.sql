CREATE TABLE training_weeks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  timezone TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL CHECK (
    status IN ('draft', 'published', 'superseded')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, week_start, revision),
  UNIQUE (id, account_id)
) STRICT;

CREATE INDEX training_weeks_account_start
  ON training_weeks (account_id, week_start);

CREATE TABLE planned_workouts (
  id TEXT PRIMARY KEY,
  training_week_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  sport_id TEXT NOT NULL,
  scheduled_at_utc TEXT NOT NULL,
  timezone TEXT NOT NULL,
  estimated_duration_minutes INTEGER NOT NULL CHECK (
    estimated_duration_minutes > 0
  ),
  target_rpe INTEGER CHECK (target_rpe BETWEEN 1 AND 10),
  instructions_markdown TEXT NOT NULL CHECK (
    length(trim(instructions_markdown)) > 0
  ),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (
    status IN (
      'planned',
      'completed',
      'partial',
      'skipped',
      'cancelled',
      'unknown'
    )
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (training_week_id, account_id)
    REFERENCES training_weeks (id, account_id)
    ON DELETE CASCADE
) STRICT;

CREATE INDEX planned_workouts_account_schedule
  ON planned_workouts (account_id, scheduled_at_utc);

CREATE INDEX planned_workouts_training_week
  ON planned_workouts (training_week_id);
