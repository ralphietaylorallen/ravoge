import Link from "next/link";

import { ProfilePhoto } from "@/components/profile-photo";
import { createGoogleCalendarUrl } from "@/lib/calendar";
import { formatZonedDateTime } from "@/lib/timezone";

import styles from "./dashboard.module.css";

export type BookingListItem = {
  clientName?: string;
  clientPhotoUrl?: string | null;
  clientUserId?: string;
  coachName: string;
  coachPhotoUrl?: string | null;
  endsAt: string;
  gymAddress?: string | null;
  gymName: string;
  id: string;
  startsAt: string;
  status: string;
  timezone: string;
};

export function BookingList({ bookings, empty, perspective }: { bookings: BookingListItem[]; empty: string; perspective: "owner" | "coach" | "client" }) {
  if (!bookings.length) return <p className={styles.empty}>{empty}</p>;
  return <ul className={styles.bookingList}>{bookings.map((booking) => {
    const personName = perspective === "client" ? booking.coachName : booking.clientName ?? "Client";
    const personPhoto = perspective === "client" ? booking.coachPhotoUrl : booking.clientPhotoUrl;
    const duration = Math.round((Date.parse(booking.endsAt) - Date.parse(booking.startsAt)) / 60000);
    return <li key={booking.id}><ProfilePhoto name={personName} size="small" url={personPhoto} /><div><strong>{formatZonedDateTime(booking.startsAt, booking.timezone, { dateStyle: "medium", timeStyle: "short", timeZone: booking.timezone })}</strong><span>{perspective === "owner" ? `${booking.coachName} with ${personName}` : perspective === "coach" ? personName : `Training with ${personName}`} · {duration} min</span><small>{booking.gymName} · {booking.status.replaceAll("_", " ")}</small></div><div className={styles.bookingActions}>{perspective === "coach" && booking.clientUserId && <Link href={`/coach/clients/${booking.clientUserId}`}>Client</Link>}{perspective === "client" && <><a href={createGoogleCalendarUrl({ bookingId: booking.id, coachName: booking.coachName, endsAt: booking.endsAt, gymAddress: booking.gymAddress, gymName: booking.gymName, startsAt: booking.startsAt })} rel="noreferrer" target="_blank">Google</a><a href={`/api/bookings/${booking.id}/calendar.ics`}>.ics</a></>}</div></li>;
  })}</ul>;
}
