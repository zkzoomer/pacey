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
import {
  createWeekPlanQueries,
  type WeekPlanQueries,
} from "./queries/week-plans.js";
import {
  createWorkoutReportQueries,
  type WorkoutReportQueries,
} from "./queries/workout-reports.js";

export type PaceyDatabase = {
  initialize: () => void;
  athleteProfiles: AthleteProfileQueries;
  athleteBenchmarks: AthleteBenchmarksQueries;
  plannedWorkouts: PlannedWorkoutQueries;
  weekPlans: WeekPlanQueries;
  workoutReports: WorkoutReportQueries;
  weights: WeightQueries;
};

export function createDatabase(stateDirectory: string): PaceyDatabase {
  const databasePath = join(stateDirectory, "plugins", "pacey", "pacey.sqlite");

  return {
    initialize: () => migrateDatabase(databasePath),
    athleteProfiles: createAthleteProfileQueries(databasePath),
    athleteBenchmarks: createAthleteBenchmarksQueries(databasePath),
    plannedWorkouts: createPlannedWorkoutQueries(databasePath),
    weekPlans: createWeekPlanQueries(databasePath),
    workoutReports: createWorkoutReportQueries(databasePath),
    weights: createWeightQueries(databasePath),
  };
}
