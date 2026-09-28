import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { createDatabase } from "../../database/index.js";
import {
  athleteProfileContext,
  athleteProfileUnavailableContext,
} from "../context.js";
import { validateAthleteProfileMarkdown } from "../markdown.js";
import { createAthleteProfileTool } from "../tool.js";

test("validates the canonical athlete profile", () => {
  assert.deepEqual(validateAthleteProfileMarkdown(validProfile), {
    ok: true,
    profileMarkdown: validProfile,
  });

  const missingSection = validProfile.replace(
    "## Preferences\n\n- Direct coaching",
    "",
  );
  assert.match(
    validationError(missingSection),
    /exactly one "## Preferences" section/,
  );

  const emptySection = validProfile.replace(
    "## Availability\n\n- Weekday evenings",
    "## Availability\n\n",
  );
  assert.match(validationError(emptySection), /Availability.*cannot be empty/);
});

test("renders missing, present, and unavailable profile context", () => {
  const missingContext = athleteProfileContext(null);
  assert.match(missingContext, /status="missing"/);
  assert.match(missingContext, /begin or continue its interview now/);
  assert.doesNotMatch(missingContext, /\/goals/);

  const presentContext = athleteProfileContext({
    accountId: "telegram-user-1",
    profileMarkdown: validProfile,
    timezone: null,
    createdAt: "2026-09-24 12:00:00",
    updatedAt: "2026-09-24 12:00:00",
  });
  assert.match(presentContext, /status="present"/);
  assert.match(presentContext, /Run a half marathon/);
  assert.doesNotMatch(presentContext, /telegram-user-1/);

  assert.match(athleteProfileUnavailableContext(), /status="unavailable"/);
});

test("saves only the trusted requester's profile", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-profile-tool-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    const factory = createAthleteProfileTool({
      database,
      logger: { debug: () => undefined, error: () => undefined },
    });

    assert.equal(
      factory({ messageChannel: "telegram" } as OpenClawPluginToolContext),
      null,
    );

    const tool = factory({
      messageChannel: "telegram",
      requesterSenderId: "telegram-user-1",
    } as OpenClawPluginToolContext);
    assert.ok(tool && !Array.isArray(tool));

    const result = await tool.execute("tool-call-1", {
      profileMarkdown: validProfile,
    });

    assert.deepEqual(result.details, { saved: true });
    assert.equal(
      database.athleteProfiles.findByAccountId("telegram-user-1")
        ?.profileMarkdown,
      validProfile,
    );
    assert.equal(
      database.athleteProfiles.findByAccountId("telegram-user-2"),
      null,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function validationError(profileMarkdown: string): string {
  const result = validateAthleteProfileMarkdown(profileMarkdown);
  assert.equal(result.ok, false);
  return result.message;
}

const validProfile = `# Athlete Profile

## Goals

- Run a half marathon

## Current Training and Experience

- Runs three times per week

## Desired Routine

- Four sessions per week

## Availability

- Weekday evenings

## Constraints and Injuries

- No current injuries

## Equipment and Environment

- Commercial gym

## Preferences

- Direct coaching`;
