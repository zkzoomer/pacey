CREATE TABLE weekly_reviews (
  account_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  review_markdown TEXT NOT NULL CHECK (
    length(trim(review_markdown)) > 0
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, week_start)
) STRICT;
