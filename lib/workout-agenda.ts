import { bookingWorkoutSlot } from "./coach-workday.ts";

type SlotWorkout = {
  client_user_id: string;
  coach_user_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
};

type SlotBooking = {
  client_user_id: string;
  coach_user_id: string;
  starts_at: string;
  timezone: string;
  status: string;
  session_type: string;
};

export function workoutSlot(workout: SlotWorkout) {
  return workout.scheduled_time
    ? [workout.coach_user_id, workout.client_user_id, workout.scheduled_date, workout.scheduled_time.slice(0, 5)].join("|")
    : null;
}

export function trainingBookingSlot(booking: SlotBooking) {
  if (booking.status !== "scheduled" || booking.session_type.toLowerCase() === "intake") return null;
  const slot = bookingWorkoutSlot(booking);
  return [booking.coach_user_id, booking.client_user_id, slot.date, slot.time.slice(0, 5)].join("|");
}
