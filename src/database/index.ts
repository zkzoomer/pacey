import { join } from "node:path";

import { migrateDatabase } from "./migrations/index.js";
import {
  createAthleteProfileQueries,
  type AthleteProfileQueries,
} from "./queries/athlete-profiles.js";
import { createWeightQueries, type WeightQueries } from "./queries/weights.js";
import {
  AthleteBenchmarksQueries,
  createAthleteBenchmarksQueries,
} from "./queries/athlete-benchmarks.js";
import {
  createPlannedWorkoutQueries,
  type PlannedWorkoutQueries,
} from "./queries/planned-workouts.js";

export type PaceyDatabase = {
  initialize: () => void;
  athleteProfiles: AthleteProfileQueries;
  athleteBenchmarks: AthleteBenchmarksQueries;
  plannedWorkouts: PlannedWorkoutQueries;
  weights: WeightQueries;
};

export function createDatabase(stateDirectory: string): PaceyDatabase {
  const databasePath = join(stateDirectory, "plugins", "pacey", "pacey.sqlite");

  return {
    initialize: () => migrateDatabase(databasePath),
    athleteProfiles: createAthleteProfileQueries(databasePath),
    athleteBenchmarks: createAthleteBenchmarksQueries(databasePath),
    plannedWorkouts: createPlannedWorkoutQueries(databasePath),
    weights: createWeightQueries(databasePath),
  };
}
