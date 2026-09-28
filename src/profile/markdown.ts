export const ATHLETE_PROFILE_TITLE = "# Athlete Profile";
export const ATHLETE_PROFILE_SECTION_HEADINGS = [
  "## Goals",
  "## Current Training and Experience",
  "## Desired Routine",
  "## Availability",
  "## Constraints and Injuries",
  "## Equipment and Environment",
  "## Preferences",
] as const;

export const MAX_ATHLETE_PROFILE_LENGTH = 20_000;

export type AthleteProfileMarkdownValidation =
  { ok: true; profileMarkdown: string } | { ok: false; message: string };

export function validateAthleteProfileMarkdown(
  input: string,
): AthleteProfileMarkdownValidation {
  const profileMarkdown = input.trim();

  if (profileMarkdown.length === 0) {
    return { ok: false, message: "The athlete profile cannot be empty." };
  }
  if (profileMarkdown.length > MAX_ATHLETE_PROFILE_LENGTH) {
    return {
      ok: false,
      message: `The athlete profile cannot exceed ${MAX_ATHLETE_PROFILE_LENGTH} characters.`,
    };
  }

  const lines = profileMarkdown.split("\n").map((line) => line.trim());
  if (lines[0] !== ATHLETE_PROFILE_TITLE) {
    return {
      ok: false,
      message: `The athlete profile must begin with "${ATHLETE_PROFILE_TITLE}".`,
    };
  }

  let previousHeadingIndex = 0;
  for (const heading of ATHLETE_PROFILE_SECTION_HEADINGS) {
    const matchingIndexes = lines.flatMap((line, index) =>
      line === heading ? [index] : [],
    );
    if (matchingIndexes.length !== 1) {
      return {
        ok: false,
        message: `The athlete profile must contain exactly one "${heading}" section.`,
      };
    }

    const [headingIndex] = matchingIndexes;
    if (headingIndex <= previousHeadingIndex) {
      return {
        ok: false,
        message: `The athlete profile sections must follow the canonical order; "${heading}" is out of order.`,
      };
    }
    previousHeadingIndex = headingIndex;
  }

  const headingIndexes = ATHLETE_PROFILE_SECTION_HEADINGS.map((heading) =>
    lines.indexOf(heading),
  );
  for (const [index, headingIndex] of headingIndexes.entries()) {
    const nextHeadingIndex = headingIndexes[index + 1] ?? lines.length;
    const hasContent = lines
      .slice(headingIndex + 1, nextHeadingIndex)
      .some((line) => line.length > 0);
    if (!hasContent) {
      return {
        ok: false,
        message: `The "${ATHLETE_PROFILE_SECTION_HEADINGS[index]}" section cannot be empty.`,
      };
    }
  }

  return { ok: true, profileMarkdown };
}
