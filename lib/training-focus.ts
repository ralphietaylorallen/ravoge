// Structured intent, not private free text or an authorization claim.
export const TRAINING_FOCUS = {
  running_5k: "5K running performance",
  muscle_growth: "Muscle growth",
  general_fitness: "General fitness and consistency",
  fat_loss_support: "Fitness and fat-loss support",
} as const;
export type TrainingFocus = keyof typeof TRAINING_FOCUS;
export function validTrainingFocus(value: string): value is TrainingFocus | "" {
  return value === "" || Object.hasOwn(TRAINING_FOCUS, value);
}
