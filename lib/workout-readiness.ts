export type WorkoutReadiness = {
  ready: boolean; intakeId?: string; needsSafetyReview?: boolean; compatibleExercises: number;
  reasons: string[]; missingEquipment?: string[]; sourceType?: string; sourceTitle?: string;
};
