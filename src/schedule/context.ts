import type { TrainingState } from "../database/queries/planned-workouts.js";

export function trainingStateContext(state: TrainingState): string {
  return `
<pacey_training_state>
current_week: ${state.currentWeek}
next_week: ${state.nextWeek}
unreported_recent_workouts: ${state.unreportedRecentWorkouts}
</pacey_training_state>
  `.trim();
}

export function trainingStateUnavailableContext(): string {
  return `
<pacey_training_state>
status: unavailable
</pacey_training_state>
  `.trim();
}
