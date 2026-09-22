import { StaffBookingPage } from "@/components/staff-booking-page";

export default async function CoachBookClientPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ date?: string; duration?: string; reschedule?: string }> }) {
  return <StaffBookingPage clientId={(await params).clientId} role="coach" searchParams={await searchParams} />;
}
