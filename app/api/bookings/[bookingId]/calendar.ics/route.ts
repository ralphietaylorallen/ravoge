import { createBookingIcs } from "@/lib/calendar";
import { getVerifiedUser } from "@/lib/auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await context.params;
  if (!UUID_PATTERN.test(bookingId)) return new Response("Not found", { status: 404 });
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return new Response("Authentication required", { status: 401 });
  const { data: booking } = await supabase.from("bookings").select("id,organization_id,coach_user_id,starts_at,ends_at").eq("id", bookingId).maybeSingle();
  if (!booking) return new Response("Not found", { status: 404 });
  const [{ data: organization }, { data: coach }] = await Promise.all([
    supabase.from("organizations").select("name,address").eq("id", booking.organization_id).single(),
    supabase.from("profiles").select("full_name,preferred_name").eq("id", booking.coach_user_id).single(),
  ]);
  if (!organization || !coach) return new Response("Not found", { status: 404 });
  const calendar = createBookingIcs({ bookingId: booking.id, coachName: coach.preferred_name || coach.full_name, endsAt: booking.ends_at, gymAddress: organization.address, gymName: organization.name, startsAt: booking.starts_at });
  return new Response(calendar, { headers: { "Cache-Control": "private, no-store", "Content-Disposition": `attachment; filename="ravoge-${booking.id}.ics"`, "Content-Type": "text/calendar; charset=utf-8" } });
}
