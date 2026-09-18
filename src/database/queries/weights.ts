import { withDatabase } from "../connection.js";

export type WeightMeasurement = {
  accountId: string;
  weightKg: number;
  measuredOn: string;
};

export type WeightQueries = {
  record: (measurement: WeightMeasurement) => void;
};

export function createWeightQueries(databasePath: string): WeightQueries {
  return {
    record({ accountId, weightKg, measuredOn }) {
      withDatabase(databasePath, (database) => {
        database
          .prepare(
            `
            INSERT INTO weights (account_id, weight_kg, measured_on)
            VALUES (?, ?, ?)
          `,
          )
          .run(accountId, weightKg, measuredOn);
      });
    },
  };
}
