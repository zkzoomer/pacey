---
name: workout-reporting
description: Interpret and record a Pacey athlete's natural-language report about a workout they completed, partially completed, skipped, or cancelled.
user-invocable: false
---

# Workout reporting

Turn ordinary post-workout conversation into a durable report without making
the athlete fill out a form. This skill owns planned-workout matching. The
recording tool owns requester isolation, status updates, and atomic persistence.
Sport skills own interpretation of sport-specific metrics.

## Recognize a report

Use this flow when the athlete says that a real workout was completed,
partially completed, skipped, or cancelled. This includes informal messages
such as “just finished the swim” or “only managed half of it.” Do not record a
hypothetical session, a question about a workout, or a proposed schedule
change as a report.

If it is genuinely unclear whether the athlete is describing something they
did, ask one short clarification question before using the tool.

## Extract the common envelope

Extract only these shared fields:

- `completionStatus`: `completed`, `partial`, `skipped`, or `cancelled`;
- `durationMinutes`: a positive whole number, or `null`;
- `perceivedRpe`: the athlete's perceived effort from 1-10, or `null`;
- `sportId`: the exact canonical ID from `pacey_supported_sports`;
- `sportMetrics`: versioned sport-specific JSON, or `null`.

Do not manufacture a duration, effort, or metric from vague language. Missing
optional values do not block a report and should not trigger a questionnaire.

Keep the complete original reporting message available and later pass it to the
recording tool verbatim, including when matching requires a clarification turn.

## Interpret sport-specific metrics

Resolve `sportId` through `pacey_supported_sports`, load the exact named sport
skill, and follow its workout-report metric contract. Put only those structured
values under `sportMetrics`; the complete unstructured report remains safe in
the original message.

If the sport is not registered, explain that structured reporting for it is
not supported yet and do not pretend that a generic schema is sport-specific.

## Match and persist

Use `pacey_get_schedule` for the smallest date range that covers when the
workout plausibly occurred. Consider only workouts for the same sport and use
their scheduled times and instructions to resolve the match:

- one plausible workout is linked automatically;
- no plausible workout uses `plannedWorkoutId: null`;
- multiple plausible workouts require a short clarification before saving.

For an ambiguous match, ask one concise question that distinguishes the
workouts by local time and purpose. Include “neither” as an option.

Once the match is resolved, call `pacey_record_workout_report` with the planned
workout ID or `null`, the original message verbatim, the common envelope, and
sport metrics. Never provide an account ID. Confirm that the report was
recorded only when the tool returns `saved: true`. Then respond like a coach:
acknowledge the useful evidence and, when warranted, offer one concise
observation or follow-up. Do not overwhelm the athlete by repeating every
extracted field.

If the athlete corrects a report, submit the correction message verbatim and a
complete corrected set of normalized fields with the same planned workout ID.
Retain values that the athlete did not change. This replaces the previous
report. Unplanned reports cannot be replaced because they have no planned
workout ID to identify them.
