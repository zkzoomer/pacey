import type { Migration } from "./types.js";

export const createWeights: Migration = {
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE weights (
        account_id TEXT NOT NULL,
        weight_kg REAL NOT NULL CHECK (weight_kg > 0),
        measured_on TEXT NOT NULL
      ) STRICT;

      CREATE INDEX weights_account_day
        ON weights (account_id, measured_on);
    `);
  },
};
