import { withDatabase } from "../connection.js";

export type WeightMeasurement = {
  accountId: string;
  weightKg: number;
  bodyfat: number | null;
  measuredOn: string;
};

export type WeightQueries = {
  record: (measurement: WeightMeasurement) => void;
};

export function createWeightQueries(databasePath: string): WeightQueries {
  return {
    record({ accountId, weightKg, bodyfat, measuredOn }) {
      withDatabase(databasePath, (database) => {
        database
          .prepare(
            `
            INSERT INTO weights (account_id, weight_kg, bodyfat, measured_on)
            VALUES (?, ?, ?, ?)
          `,
          )
          .run(accountId, weightKg, bodyfat, measuredOn);
      });
    },
  };
}
