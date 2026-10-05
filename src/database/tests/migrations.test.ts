import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { withDatabase } from "../connection.js";
import { createDatabase } from "../index.js";
import { LATEST_DATABASE_VERSION } from "../migrations/index.js";

function databasePath(stateDirectory: string): string {
  return join(stateDirectory, "plugins", "pacey", "pacey.sqlite");
}

test("initializes a fresh database at the latest version", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));

  try {
    createDatabase(directory).initialize();

    const database = new DatabaseSync(databasePath(directory), {
      readOnly: true,
    });
    try {
      const version = database.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      assert.equal(LATEST_DATABASE_VERSION, version.user_version);

      const tables = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => (row as { name: string }).name);
      assert.deepEqual(tables, [
        "athlete_benchmarks",
        "athlete_profiles",
        "planned_workouts",
        "training_weeks",
        "weights",
      ]);

      const athleteProfileColumns = database
        .prepare("PRAGMA table_info(athlete_profiles)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(athleteProfileColumns, [
        "account_id",
        "profile_markdown",
        "timezone",
        "created_at",
        "updated_at",
      ]);

      const trainingWeekColumns = database
        .prepare("PRAGMA table_info(training_weeks)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(trainingWeekColumns, [
        "id",
        "account_id",
        "week_start",
        "timezone",
        "revision",
        "status",
        "created_at",
        "updated_at",
      ]);

      const plannedWorkoutColumns = database
        .prepare("PRAGMA table_info(planned_workouts)")
        .all()
        .map((column) => (column as { name: string }).name);
      assert.deepEqual(plannedWorkoutColumns, [
        "id",
        "training_week_id",
        "account_id",
        "sport_id",
        "scheduled_at_utc",
        "timezone",
        "estimated_duration_minutes",
        "target_rpe",
        "instructions_markdown",
        "status",
        "created_at",
        "updated_at",
      ]);
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("upgrades a version 1 database without losing weight data", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));
  const path = databasePath(directory);
  mkdirSync(join(directory, "plugins", "pacey"), { recursive: true });

  try {
    const database = new DatabaseSync(path);
    try {
      const initialMigration = readFileSync(
        new URL("../migrations/001-create-weights.sql", import.meta.url),
        "utf8",
      );
      database.exec(initialMigration);
      database
        .prepare(
          `
            INSERT INTO weights (
              account_id,
              weight_kg,
              bodyfat,
              measured_on
            ) VALUES (?, ?, ?, ?)
          `,
        )
        .run("telegram-user-1", 82, null, "2026-09-24");
      database.exec("PRAGMA user_version = 1");
    } finally {
      database.close();
    }

    createDatabase(directory).initialize();

    const migratedDatabase = new DatabaseSync(path, { readOnly: true });
    try {
      const version = migratedDatabase.prepare("PRAGMA user_version").get() as {
        user_version: number;
      };
      const weights = migratedDatabase
        .prepare("SELECT COUNT(*) AS count FROM weights")
        .get() as { count: number };

      assert.equal(version.user_version, LATEST_DATABASE_VERSION);
      assert.equal(weights.count, 1);
      assert.doesNotThrow(() =>
        migratedDatabase.prepare("SELECT * FROM athlete_profiles").all(),
      );
      assert.doesNotThrow(() =>
        migratedDatabase.prepare("SELECT * FROM training_weeks").all(),
      );
      assert.doesNotThrow(() =>
        migratedDatabase.prepare("SELECT * FROM planned_workouts").all(),
      );
    } finally {
      migratedDatabase.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("enforces planned workout ownership and field constraints", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));
  const path = databasePath(directory);

  try {
    createDatabase(directory).initialize();

    withDatabase(path, (database) => {
      database
        .prepare(
          `
            INSERT INTO training_weeks (
              id,
              account_id,
              week_start,
              timezone,
              revision,
              status
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          "week-1",
          "telegram-user-1",
          "2026-10-05",
          "Europe/Malta",
          1,
          "published",
        );

      const insertWorkout = database.prepare(
        `
          INSERT INTO planned_workouts (
            id,
            training_week_id,
            account_id,
            sport_id,
            scheduled_at_utc,
            timezone,
            estimated_duration_minutes,
            target_rpe,
            instructions_markdown
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      );

      insertWorkout.run(
        "workout-1",
        "week-1",
        "telegram-user-1",
        "swimming",
        "2026-10-05T06:00:00.000Z",
        "Europe/Malta",
        60,
        5,
        "# Endurance swim",
      );

      assert.throws(() =>
        insertWorkout.run(
          "workout-2",
          "week-1",
          "telegram-user-2",
          "swimming",
          "2026-10-06T06:00:00.000Z",
          "Europe/Malta",
          45,
          4,
          "# Technique swim",
        ),
      );
      assert.throws(() =>
        insertWorkout.run(
          "workout-3",
          "week-1",
          "telegram-user-1",
          "swimming",
          "2026-10-07T06:00:00.000Z",
          "Europe/Malta",
          45,
          11,
          "# Sprint swim",
        ),
      );
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects a database created by a newer version of Pacey", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-migration-test-"));
  const path = databasePath(directory);
  mkdirSync(join(directory, "plugins", "pacey"), { recursive: true });

  try {
    const database = new DatabaseSync(path);
    try {
      database.exec(`PRAGMA user_version = ${LATEST_DATABASE_VERSION + 1}`);
    } finally {
      database.close();
    }

    assert.throws(
      () => createDatabase(directory).initialize(),
      `/version ${LATEST_DATABASE_VERSION + 1} is newer than supported version ${LATEST_DATABASE_VERSION}/`,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
