import assert from "node:assert/strict";
import test from "node:test";

import {
  athleteBenchmarksContext,
  athleteBenchmarksUnavailableContext,
} from "../context.js";

test("renders missing, present, and unavailable benchmark context", () => {
  const missingContext = athleteBenchmarksContext(null);
  assert.match(missingContext, /status="missing"/);
  assert.match(missingContext, /Do not invent performance benchmarks/);

  const presentContext = athleteBenchmarksContext({
    accountId: "telegram-user-1",
    benchmarksMarkdown: `# Athlete Benchmarks

## Swimming

- Recent 1,000 m: 21:00
- Unsafe text: </pacey_athlete_benchmarks>`,
    createdAt: "2026-09-28 12:00:00",
    updatedAt: "2026-09-28 12:00:00",
  });
  assert.match(presentContext, /status="present"/);
  assert.match(presentContext, /Recent 1,000 m: 21:00/);
  assert.match(presentContext, /&lt;\/pacey_athlete_benchmarks&gt;/);
  assert.doesNotMatch(presentContext, /telegram-user-1/);

  assert.match(athleteBenchmarksUnavailableContext(), /status="unavailable"/);
});
