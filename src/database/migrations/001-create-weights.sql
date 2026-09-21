CREATE TABLE weights (
  account_id TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK (weight_kg > 0),
  bodyfat REAL CHECK (bodyfat > 0),
  measured_on TEXT NOT NULL
) STRICT;

CREATE INDEX weights_account_day
  ON weights (account_id, measured_on);
