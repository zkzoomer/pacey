# Swimming benchmarks

Read this reference when the athlete-assessment workflow needs to collect or
interpret swimming performance benchmarks. The athlete-assessment skill owns the
conversation, confirmation, and save operation.

This is a benchmark interview, not a general swimming intake. The athlete
profile already owns goals, routine, experience, availability, facilities,
equipment, injuries, and preferences. Read it first and never ask the athlete to
repeat those facts merely to complete the benchmark snapshot.

## Interview scope

Ask only for existing performance measurements that could materially change the
first plan. Useful categories are:

- **Endurance:** A recent continuous swim distance and time, commonly 400 m,
  1,000 m, or another representative duration.
- **Repeat pace:** A familiar repeat set such as 4-6 × 100 m, including typical
  repeat times, rest or send-off, and effort.
- **Speed:** A recent 25 m, 50 m, or 100 m time when speed is relevant to the
  athlete's goal.
- **Goal-specific stroke:** A recent distance, time, or repeat set for a stroke
  central to the athlete's goal, such as butterfly.

Do not ask for every category. Select at most the two or three measurements most
useful for the athlete's stated goals and intended first plan. Ask for them in
one concise message when they are closely related; use at most one follow-up for
a material ambiguity.

Accept approximate values, ranges, older dated results, and “I don't know.” Do
not require a fresh test or delay planning to fill an unknown value. If the
athlete knows no useful times, record the material benchmarks as unknown and let
the first plan gather them through an ordinary conservative session.

## What not to ask

Do not use routine benchmark onboarding to ask about:

- basic water competence, submerging, breathing, stopping, or returning to a
  wall;
- general swimming experience or a descriptive swimmer level;
- weekly frequency, usual session duration, pool access, equipment, injuries,
  or availability already present in the athlete profile;
- technique diagnosis, stroke-count targets, turns, video, fear, or detailed
  training conditions unless the athlete raises them and they directly affect a
  reported benchmark;
- new maximal-effort testing.

Regular independent swimming, structured-set experience, or a meaningful swim
performance in the profile is sufficient evidence that a basic water-competence
question is unnecessary. If the athlete explicitly says they are unable to swim
independently, cannot return to support, or are afraid or unsafe in the water,
stop the benchmark interview and apply the swimming skill's safety guidance.
Do not screen established swimmers for those possibilities by default.

## Recording a result

Preserve only the context needed to interpret or compare a measurement:

- stroke, distance, time or pace, and approximate date;
- pool course or units when they are not already known;
- rest versus send-off for repeat sets;
- push or dive start, equipment, or effort only when it materially changes the
  meaning of the result.

Keep metres and yards distinct. Keep pool and open-water results distinct. Do
not present a converted value, estimated pace, or planned test as an achieved
result. Preserve lifetime bests separately from recent capacity when both are
provided.

## Selecting useful benchmarks

Choose benchmarks by the decision they support:

| Planning need        | Useful existing benchmark                          |
| -------------------- | -------------------------------------------------- |
| Endurance volume     | Continuous distance and time, or a steady long set |
| Everyday pacing      | Repeat times with rest/send-off and effort         |
| Sprint development   | Recent 25 m, 50 m, or 100 m result                 |
| Sustained intensity  | Existing 200/400 results or a known CSS estimate   |
| Stroke-specific goal | A recent result or repeat set in that stroke       |

CSS may be recorded when the athlete already knows it or supplies compatible
200 m and 400 m results. Do not turn onboarding into a CSS test. When deriving
it from supplied times, label it as derived and preserve the source results:

```text
CSS_pace_s_per_100m = (T400_s - T200_s) / 2
```

## Benchmark document content

Under the complete benchmark document's `## Swimming` heading, store concise
performance facts rather than duplicating the athlete profile. For example:

```markdown
## Swimming

- Recent 1,000 m freestyle: Approximately 21:00 in a 25 m pool (September 2026, athlete reported)
- Typical freestyle repeats: 6 × 100 m around 1:55 with 20 seconds rest at RPE 5
- Recent 100 m freestyle: Unknown
- Butterfly benchmark: 4 × 25 m around 24 seconds with 30 seconds rest
```

Include only benchmarks relevant to the athlete. Mark a material missing value
as `Unknown`; omit optional categories that do not affect the intended plan.
Never include account identifiers, workout prescriptions, diagnoses, or general
profile facts in the benchmark document.
