import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  findSupportedSport,
  listSupportedSports,
  SUPPORTED_SPORTS,
  supportedSportsContext,
} from "../index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const sportsSkillsDirectory = join(
  repositoryRoot,
  "workspace",
  "skills",
  "sports",
);

test("resolves supported sport names and aliases", () => {
  assert.equal(findSupportedSport("Swimming")?.id, "swimming");
  assert.equal(findSupportedSport("swim")?.id, "swimming");
  assert.equal(findSupportedSport("open-water swimming")?.id, "swimming");
  assert.equal(findSupportedSport("running"), null);
});

test("renders the exact sport-to-skill routing context", () => {
  const context = supportedSportsContext();

  assert.match(context, /id: swimming/);
  assert.match(context, /name: Swimming/);
  assert.match(context, /skill: swimming-coach/);
  assert.match(context, /Do not infer that an unlisted sport is supported/);
});

test("keeps the registry in sync with usable sport skills", () => {
  for (const sport of listSupportedSports()) {
    const skillPath = join(sportsSkillsDirectory, sport.id, "SKILL.md");
    assert.equal(existsSync(skillPath), true, `Missing ${skillPath}`);

    const metadata = readSkillMetadata(readFileSync(skillPath, "utf8"));
    assert.ok(metadata, `${skillPath} must begin with valid frontmatter`);
    assert.equal(metadata.name, sport.skillName);
    assert.notEqual(metadata.description, "");
  }

  for (const entry of readdirSync(sportsSkillsDirectory, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(sportsSkillsDirectory, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    const metadata = readSkillMetadata(readFileSync(skillPath, "utf8"));
    if (metadata === null || metadata.description === "") continue;

    assert.ok(
      entry.name in SUPPORTED_SPORTS,
      `${skillPath} is usable but is missing from SUPPORTED_SPORTS`,
    );
  }
});

function readSkillMetadata(
  contents: string,
): { name: string; description: string } | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents);
  if (frontmatter === null) return null;

  const name = /^name:\s*(.+)$/m.exec(frontmatter[1])?.[1]?.trim();
  const description = /^description:\s*(.+)$/m
    .exec(frontmatter[1])?.[1]
    ?.trim();
  if (name === undefined || description === undefined) return null;

  return { name, description };
}
