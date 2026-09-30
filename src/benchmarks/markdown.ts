import { findSupportedSport, listSupportedSports } from "../sports/index.js";

export const ATHLETE_BENCHMARKS_TITLE = "# Athlete Benchmarks";
export const MAX_ATHLETE_BENCHMARKS_LENGTH = 20_000;

export type AthleteBenchmarksMarkdownValidation =
  { ok: true; benchmarksMarkdown: string } | { ok: false; message: string };

export function validateAthleteBenchmarksMarkdown(
  input: string,
): AthleteBenchmarksMarkdownValidation {
  const benchmarksMarkdown = input.trim();

  if (benchmarksMarkdown.length === 0) {
    return { ok: false, message: "The athlete benchmarks cannot be empty." };
  }
  if (benchmarksMarkdown.length > MAX_ATHLETE_BENCHMARKS_LENGTH) {
    return {
      ok: false,
      message: `The athlete benchmarks cannot exceed ${MAX_ATHLETE_BENCHMARKS_LENGTH} characters.`,
    };
  }

  const lines = benchmarksMarkdown.split("\n").map((line) => line.trim());
  if (lines[0] !== ATHLETE_BENCHMARKS_TITLE) {
    return {
      ok: false,
      message: `The athlete benchmarks must begin with "${ATHLETE_BENCHMARKS_TITLE}".`,
    };
  }

  const sectionIndexes = lines.flatMap((line, index) =>
    /^##\s+\S/.test(line) ? [index] : [],
  );
  if (sectionIndexes.length === 0) {
    return {
      ok: false,
      message:
        "The athlete benchmarks must contain at least one sport section.",
    };
  }

  const sectionNames = sectionIndexes.map((index) =>
    lines[index].slice(3).trim(),
  );
  const normalizedNames = sectionNames.map((name) => name.toLocaleLowerCase());
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    return {
      ok: false,
      message: "Each athlete benchmark sport section must have a unique name.",
    };
  }

  for (const sectionName of sectionNames) {
    const sport = findSupportedSport(sectionName);
    if (sport === null) {
      const supportedNames = listSupportedSports()
        .map(({ name }) => `"${name}"`)
        .join(", ");
      return {
        ok: false,
        message: `The "## ${sectionName}" section is not supported. Supported sport sections: ${supportedNames}.`,
      };
    }
    if (sectionName !== sport.name) {
      return {
        ok: false,
        message: `Use the canonical heading "## ${sport.name}" instead of "## ${sectionName}".`,
      };
    }
  }

  for (const [index, sectionIndex] of sectionIndexes.entries()) {
    const nextSectionIndex = sectionIndexes[index + 1] ?? lines.length;
    const hasContent = lines
      .slice(sectionIndex + 1, nextSectionIndex)
      .some((line) => line.length > 0);
    if (!hasContent) {
      return {
        ok: false,
        message: `The "## ${sectionNames[index]}" section cannot be empty.`,
      };
    }
  }

  return { ok: true, benchmarksMarkdown };
}
