import { withDatabase } from "../connection.js";

export type AthleteBenchmarks = {
  accountId: string;
  benchmarksMarkdown: string;
  createdAt: string;
  updatedAt: string;
};

export type SaveAthleteBenchmarks = {
  accountId: string;
  benchmarksMarkdown: string;
};

export type AthleteBenchmarksQueries = {
  findByAccountId: (accountId: string) => AthleteBenchmarks | null;
  save: (profile: SaveAthleteBenchmarks) => void;
};

type AthleteBenchmarksRow = {
  account_id: string;
  benchmarks_markdown: string;
  created_at: string;
  updated_at: string;
};

export function createAthleteBenchmarksQueries(
  databasePath: string,
): AthleteBenchmarksQueries {
  return {
    findByAccountId(accountId) {
      return withDatabase(databasePath, (database) => {
        const row = database
          .prepare(
            `
              SELECT
                account_id,
                benchmarks_markdown,
                created_at,
                updated_at
              FROM athlete_benchmarks
              WHERE account_id = ?
            `,
          )
          .get(accountId) as AthleteBenchmarksRow | undefined;

        return row === undefined ? null : toAthleteBenchmarks(row);
      });
    },

    save({ accountId, benchmarksMarkdown }) {
      withDatabase(databasePath, (database) => {
        database
          .prepare(
            `
              INSERT INTO athlete_benchmarks (account_id, benchmarks_markdown)
              VALUES (?, ?)
              ON CONFLICT (account_id) DO UPDATE SET
                benchmarks_markdown = excluded.benchmarks_markdown,
                updated_at = CURRENT_TIMESTAMP
            `,
          )
          .run(accountId, benchmarksMarkdown);
      });
    },
  };
}

function toAthleteBenchmarks(row: AthleteBenchmarksRow): AthleteBenchmarks {
  return {
    accountId: row.account_id,
    benchmarksMarkdown: row.benchmarks_markdown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
