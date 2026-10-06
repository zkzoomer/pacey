export type SportDefinition = {
  name: string;
  emoji: string;
  skillName: string;
  aliases: readonly string[];
};

export const SUPPORTED_SPORTS = {
  swimming: {
    name: "Swimming",
    emoji: "🏊",
    skillName: "swimming-coach",
    aliases: ["swim", "swimming", "swimmer", "open-water swimming"],
  },
} as const satisfies Record<string, SportDefinition>;

export type SupportedSportId = keyof typeof SUPPORTED_SPORTS;

export type SupportedSport = SportDefinition & {
  id: SupportedSportId;
};

export function listSupportedSports(): SupportedSport[] {
  return (Object.keys(SUPPORTED_SPORTS) as SupportedSportId[]).map((id) => ({
    id,
    ...SUPPORTED_SPORTS[id],
  }));
}

export function findSupportedSport(value: string): SupportedSport | null {
  const normalizedValue = normalizeSportName(value);

  return (
    listSupportedSports().find((sport) =>
      [sport.id, sport.name, ...sport.aliases].some(
        (candidate) => normalizeSportName(candidate) === normalizedValue,
      ),
    ) ?? null
  );
}

export function supportedSportsContext(): string {
  const sports = listSupportedSports()
    .map(
      (sport) =>
        `- id: ${sport.id}; name: ${sport.name}; emoji: ${sport.emoji}; skill: ${sport.skillName}; aliases: ${sport.aliases.join(", ")}`,
    )
    .join("\n");

  return `<pacey_supported_sports>
Only the sports listed below have specialized assessment, planning, and reporting support.
Match profile wording against the id, name, or aliases, then load the exact named skill.
Do not infer that an unlisted sport is supported from general model knowledge.
${sports}
</pacey_supported_sports>`;
}

function normalizeSportName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replaceAll("_", " ")
    .replace(/\s+/g, " ");
}
