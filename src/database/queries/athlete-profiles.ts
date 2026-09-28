import { withDatabase } from "../connection.js";

export type AthleteProfile = {
  accountId: string;
  profileMarkdown: string;
  timezone: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SaveAthleteProfile = {
  accountId: string;
  profileMarkdown: string;
};

export type AthleteProfileQueries = {
  findByAccountId: (accountId: string) => AthleteProfile | null;
  save: (profile: SaveAthleteProfile) => void;
};

type AthleteProfileRow = {
  account_id: string;
  profile_markdown: string;
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

export function createAthleteProfileQueries(
  databasePath: string,
): AthleteProfileQueries {
  return {
    findByAccountId(accountId) {
      return withDatabase(databasePath, (database) => {
        const row = database
          .prepare(
            `
              SELECT
                account_id,
                profile_markdown,
                timezone,
                created_at,
                updated_at
              FROM athlete_profiles
              WHERE account_id = ?
            `,
          )
          .get(accountId) as AthleteProfileRow | undefined;

        return row === undefined ? null : toAthleteProfile(row);
      });
    },

    save({ accountId, profileMarkdown }) {
      withDatabase(databasePath, (database) => {
        database
          .prepare(
            `
              INSERT INTO athlete_profiles (account_id, profile_markdown)
              VALUES (?, ?)
              ON CONFLICT (account_id) DO UPDATE SET
                profile_markdown = excluded.profile_markdown,
                updated_at = CURRENT_TIMESTAMP
            `,
          )
          .run(accountId, profileMarkdown);
      });
    },
  };
}

function toAthleteProfile(row: AthleteProfileRow): AthleteProfile {
  return {
    accountId: row.account_id,
    profileMarkdown: row.profile_markdown,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
