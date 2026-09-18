import { join } from "node:path";

import { migrateDatabase } from "./migrations/index.js";
import { createWeightQueries, type WeightQueries } from "./queries/weights.js";

export type PaceyDatabase = {
  initialize: () => void;
  weights: WeightQueries;
};

export function createDatabase(stateDirectory: string): PaceyDatabase {
  const databasePath = join(stateDirectory, "plugins", "pacey", "pacey.sqlite");

  return {
    initialize: () => migrateDatabase(databasePath),
    weights: createWeightQueries(databasePath),
  };
}
