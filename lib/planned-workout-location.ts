export const WORKOUT_EQUIPMENT_LIMIT = 400;

export const PLANNED_WORKOUT_LOCATIONS = {
  home: { label: "At home", title: "At-home workout", equipment: "Bodyweight" },
  hotel: { label: "Hotel gym", title: "Hotel gym workout", equipment: "Dumbbells, cable machine, treadmill" },
  gym: { label: "Open gym", title: "Open gym workout", equipment: "" },
} as const;

export type PlannedWorkoutLocation = keyof typeof PLANNED_WORKOUT_LOCATIONS;

export function isPlannedWorkoutLocation(value: string): value is PlannedWorkoutLocation {
  return Object.hasOwn(PLANNED_WORKOUT_LOCATIONS, value);
}

export function equipmentForLocation(location: PlannedWorkoutLocation, gymEquipment: string[]) {
  if (location !== "gym") return PLANNED_WORKOUT_LOCATIONS[location].equipment;
  return gymEquipment.reduce((list, name) => {
    const next = list ? `${list}, ${name}` : name;
    return next.length <= WORKOUT_EQUIPMENT_LIMIT ? next : list;
  }, "");
}
