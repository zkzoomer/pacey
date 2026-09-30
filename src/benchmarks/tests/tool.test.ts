import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { OpenClawPluginToolContext } from "openclaw/plugin-sdk/plugin-entry";

import { createDatabase } from "../../database/index.js";
import { validateAthleteBenchmarksMarkdown } from "../markdown.js";
import { createAthleteBenchmarksTool } from "../tool.js";

test("validates canonical athlete benchmarks", () => {
  assert.deepEqual(validateAthleteBenchmarksMarkdown(validBenchmarks), {
    ok: true,
    benchmarksMarkdown: validBenchmarks,
  });

  assert.match(
    validationError("# Athlete Benchmarks"),
    /at least one sport section/,
  );
  assert.match(
    validationError(`${validBenchmarks}\n\n## Swimming\n\n- Duplicate`),
    /unique name/,
  );
  assert.match(
    validationError("# Athlete Benchmarks\n\n## Swimming"),
    /Swimming.*cannot be empty/,
  );
  assert.match(
    validationError("# Athlete Benchmarks\n\n## Running\n\n- 5 km: 24:30"),
    /Running.*not supported.*Swimming/,
  );
  assert.match(
    validationError("# Athlete Benchmarks\n\n## swim\n\n- 1,000 m: 21:00"),
    /canonical heading.*Swimming.*swim/,
  );
});

test("replaces only the trusted requester's athlete benchmarks", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pacey-benchmarks-tool-test-"));

  try {
    const database = createDatabase(directory);
    database.initialize();
    const factory = createAthleteBenchmarksTool({
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
      benchmarksMarkdown: validBenchmarks,
      accountId: "telegram-user-2",
    });
    assert.deepEqual(result.details, { saved: true });

    const replacement = validBenchmarks.replace("21:00", "20:30");
    await tool.execute("tool-call-2", { benchmarksMarkdown: replacement });

    assert.equal(
      database.athleteBenchmarks.findByAccountId("telegram-user-1")
        ?.benchmarksMarkdown,
      replacement,
    );
    assert.equal(
      database.athleteBenchmarks.findByAccountId("telegram-user-2"),
      null,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function validationError(benchmarksMarkdown: string): string {
  const result = validateAthleteBenchmarksMarkdown(benchmarksMarkdown);
  assert.equal(result.ok, false);
  return result.message;
}

const validBenchmarks = `# Athlete Benchmarks

## Swimming

- Recent 1,000 m: 21:00`;
