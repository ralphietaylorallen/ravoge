"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { sendBookingEmail } from "@/lib/booking-email";
import { getProfileImageUrl } from "@/lib/profile-images";
import { zonedLocalDateTimeToIso } from "@/lib/timezone";

export type ScheduleActionState = { message?: string; status: "idle" | "error" | "success" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DURATIONS = new Set([15, 30, 45, 60, 75, 90, 105, 120]);

function integer(formData: FormData, name: string, minimum: number, maximum: number) {
  const value = Number(formData.get(name));
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : null;
}

export async function saveOrganizationScheduleAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { membership, supabase, userId } = await requireRole("owner");
  const timezone = String(formData.get("timezone") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim().slice(0, 500);
  const defaultDuration = integer(formData, "defaultDuration", 15, 120);
  const slotIncrement = integer(formData, "slotIncrement", 5, 60);
  const minimumNotice = integer(formData, "minimumNotice", 0, 10080);
  const maximumAdvance = integer(formData, "maximumAdvance", 1, 365);
  const cancellationCutoff = integer(formData, "cancellationCutoff", 0, 43200);
  const bufferBefore = integer(formData, "bufferBefore", 0, 120);
  const bufferAfter = integer(formData, "bufferAfter", 0, 120);
  const permittedDurations = formData.getAll("permittedDuration").map(Number).filter((value) => DURATIONS.has(value));
  if (!timezone || timezone.length > 100 || !defaultDuration || !permittedDurations.includes(defaultDuration) || !slotIncrement || minimumNotice === null || !maximumAdvance || cancellationCutoff === null || bufferBefore === null || bufferAfter === null) {
    return { message: "Review the timezone and session settings.", status: "error" };
  }
  const hours = [];
  for (let day = 0; day < 7; day += 1) {
    const isClosed = formData.get(`day-${day}-closed`) === "on";
    const opensAt = String(formData.get(`day-${day}-open`) ?? "");
    const closesAt = String(formData.get(`day-${day}-close`) ?? "");
    if (!isClosed && (!TIME_PATTERN.test(opensAt) || !TIME_PATTERN.test(closesAt) || opensAt >= closesAt)) {
      return { message: "Every open day needs a valid opening and closing time.", status: "error" };
    }
    hours.push({ closes_at: isClosed ? null : closesAt, day_of_week: day, is_closed: isClosed, opens_at: isClosed ? null : opensAt, organization_id: membership.organization_id, updated_by: userId });
  }
  const { error: organizationError } = await supabase.from("organizations").update({ address: address || null, timezone }).eq("id", membership.organization_id);
  const { error: hoursError } = await supabase.from("organization_hours").upsert(hours, { onConflict: "organization_id,day_of_week" });
  const { error: settingsError } = await supabase.from("organization_session_settings").upsert({
    buffer_after_minutes: bufferAfter,
    buffer_before_minutes: bufferBefore,
    cancellation_cutoff_minutes: cancellationCutoff,
    default_duration_minutes: defaultDuration,
    maximum_advance_days: maximumAdvance,
    minimum_notice_minutes: minimumNotice,
    organization_id: membership.organization_id,
    permitted_durations: permittedDurations,
    slot_increment_minutes: slotIncrement,
    updated_by: userId,
  });
  if (organizationError || hoursError || settingsError) return { message: "Scheduling settings could not be saved. Check the timezone and hour ranges.", status: "error" };
  revalidatePath("/owner/schedule");
  return { message: "Gym hours and session rules updated.", status: "success" };
}

export async function addClosureAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { membership, supabase, userId } = await requireRole("owner");
  const date = String(formData.get("date") ?? "");
  const label = String(formData.get("label") ?? "Gym closed").trim().slice(0, 120);
  if (!DATE_PATTERN.test(date) || label.length < 2) return { message: "Enter a valid closure date and label.", status: "error" };
  const { error } = await supabase.from("organization_special_hours").upsert({ created_by: userId, is_closed: true, label, local_date: date, organization_id: membership.organization_id }, { onConflict: "organization_id,local_date" });
  if (error) return { message: "That closure could not be saved.", status: "error" };
  revalidatePath("/owner/schedule");
  return { message: "Closure saved.", status: "success" };
}

export async function deleteClosureAction(id: string) {
  const { supabase } = await requireRole("owner");
  if (!UUID_PATTERN.test(id)) return;
  await supabase.from("organization_special_hours").delete().eq("id", id);
  revalidatePath("/owner/schedule");
}

export async function addAvailabilityAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { membership, supabase, userId } = await requireRole("coach");
  const day = integer(formData, "day", 0, 6);
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  if (day === null || !TIME_PATTERN.test(startsAt) || !TIME_PATTERN.test(endsAt) || startsAt >= endsAt) return { message: "Choose a valid day and time window.", status: "error" };
  const { error } = await supabase.from("coach_availability").insert({ coach_user_id: userId, day_of_week: day, ends_at: endsAt, organization_id: membership.organization_id, starts_at: startsAt });
  if (error) return { message: "That window overlaps existing availability or could not be saved.", status: "error" };
  revalidatePath("/coach/availability");
  return { message: "Availability window added.", status: "success" };
}

export async function deleteAvailabilityAction(id: string) {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(id)) return;
  await supabase.from("coach_availability").delete().eq("id", id);
  revalidatePath("/coach/availability");
}

export async function addAvailabilityExceptionAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { membership, supabase, userId } = await requireRole("coach");
  const kind = String(formData.get("kind") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  const endsAt = String(formData.get("endsAt") ?? "");
  const label = String(formData.get("label") ?? "").trim().slice(0, 160);
  const { data: organization } = await supabase.from("organizations").select("timezone").eq("id", membership.organization_id).single();
  const startIso = organization ? zonedLocalDateTimeToIso(startsAt, organization.timezone) : null;
  const endIso = organization ? zonedLocalDateTimeToIso(endsAt, organization.timezone) : null;
  if (!new Set(["unavailable", "personal_block", "vacation", "available_override"]).has(kind) || !startIso || !endIso || Date.parse(startIso) >= Date.parse(endIso)) {
    return { message: "Choose a valid exception type and time range.", status: "error" };
  }
  const { error } = await supabase.from("coach_availability_exceptions").insert({ coach_user_id: userId, ends_at: endIso, kind, label: label || null, organization_id: membership.organization_id, starts_at: startIso });
  if (error) return { message: "That exception could not be saved.", status: "error" };
  revalidatePath("/coach/availability");
  return { message: "Availability exception added.", status: "success" };
}

export async function deleteAvailabilityExceptionAction(id: string) {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(id)) return;
  await supabase.from("coach_availability_exceptions").delete().eq("id", id);
  revalidatePath("/coach/availability");
}

async function deliverBookingEmail(bookingId: string, event: "booked" | "rescheduled" | "cancelled") {
  const { supabase, userId } = await requireRole("client");
  const [{ data: booking }, { data: authData }] = await Promise.all([
    supabase.from("bookings").select("id,organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone").eq("id", bookingId).eq("client_user_id", userId).single(),
    supabase.auth.getUser(),
  ]);
  if (!booking || !authData.user?.email) return "Booking saved, but its email could not be prepared.";
  const [{ data: coach }, { data: organization }, { data: deliveries }] = await Promise.all([
    supabase.from("profiles").select("full_name,preferred_name,avatar_path").eq("id", booking.coach_user_id).single(),
    supabase.from("organizations").select("name,address").eq("id", booking.organization_id).single(),
    supabase.from("booking_email_deliveries").select("id").eq("booking_id", bookingId).eq("event_type", event).eq("status", "pending").order("created_at", { ascending: false }).limit(1),
  ]);
  const deliveryId = deliveries?.[0]?.id;
  if (!coach || !organization || !deliveryId) return "Booking saved, but its email queue record was unavailable.";
  const coachPhotoUrl = await getProfileImageUrl(supabase, coach.avatar_path, 604800);
  const appUrl = (process.env.RAVOGE_APP_URL || "https://ravoge.com").replace(/\/$/, "");
  const result = await sendBookingEmail({
    bookingId,
    coachName: coach.preferred_name || coach.full_name,
    coachPhotoUrl,
    durationMinutes: Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60000),
    endsAt: booking.ends_at,
    event,
    gymAddress: organization.address,
    gymName: organization.name,
    manageUrl: `${appUrl}/client/schedule`,
    recipientEmail: authData.user.email,
    startsAt: booking.starts_at,
    timezone: booking.timezone,
  });
  await supabase.rpc("finalize_own_booking_email_delivery", {
    delivery_error: result.status === "skipped" ? "Transactional email is not configured." : result.error,
    delivery_provider: "resend",
    delivery_provider_message_id: result.id,
    delivery_status: result.status,
    target_delivery_id: deliveryId,
  });
  if (result.status === "skipped") return "Email confirmation is not configured yet; your schedule is saved.";
  return result.error ? `Booking saved. Email delivery failed: ${result.error}` : "Confirmation email sent.";
}

export async function bookSessionAction(_state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { supabase } = await requireRole("client");
  const startsAt = String(formData.get("startsAt") ?? "");
  const duration = Number(formData.get("duration"));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 1000);
  if (!Number.isFinite(Date.parse(startsAt)) || !DURATIONS.has(duration)) return { message: "Choose an available time and duration.", status: "error" };
  const { data, error } = await supabase.rpc("create_client_booking", { client_notes: notes || null, target_duration: duration, target_starts_at: new Date(startsAt).toISOString() });
  if (error || typeof data !== "string") return { message: error?.message.includes("just booked") ? "That time was just booked. Choose another time." : "That time is no longer available.", status: "error" };
  const emailMessage = await deliverBookingEmail(data, "booked");
  revalidatePath("/client/book"); revalidatePath("/client/schedule"); revalidatePath("/coach/schedule"); revalidatePath("/owner/schedule");
  return { message: `Session booked. ${emailMessage}`, status: "success" };
}

export async function rescheduleSessionAction(bookingId: string, _state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { supabase } = await requireRole("client");
  if (!UUID_PATTERN.test(bookingId)) return { message: "That booking is not available.", status: "error" };
  const startsAt = String(formData.get("startsAt") ?? "");
  const duration = Number(formData.get("duration"));
  if (!Number.isFinite(Date.parse(startsAt)) || !DURATIONS.has(duration)) return { message: "Choose an available time.", status: "error" };
  const { error } = await supabase.rpc("reschedule_client_booking", { target_booking_id: bookingId, target_duration: duration, target_starts_at: new Date(startsAt).toISOString() });
  if (error) return { message: error.message.includes("just booked") ? "That time was just booked. Choose another time." : "That booking could not be rescheduled.", status: "error" };
  const emailMessage = await deliverBookingEmail(bookingId, "rescheduled");
  revalidatePath("/client/book"); revalidatePath("/client/schedule"); revalidatePath("/coach/schedule"); revalidatePath("/owner/schedule");
  return { message: `Session rescheduled. ${emailMessage}`, status: "success" };
}

export async function cancelSessionAction(bookingId: string, _state: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> {
  const { supabase } = await requireRole("client");
  if (!UUID_PATTERN.test(bookingId)) return { message: "That booking is not available.", status: "error" };
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  const { error } = await supabase.rpc("cancel_client_booking", { reason: reason || null, target_booking_id: bookingId });
  if (error) return { message: "This session cannot be cancelled online. Contact your gym.", status: "error" };
  const emailMessage = await deliverBookingEmail(bookingId, "cancelled");
  revalidatePath("/client/schedule"); revalidatePath("/coach/schedule"); revalidatePath("/owner/schedule");
  return { message: `Session cancelled. ${emailMessage}`, status: "success" };
}
