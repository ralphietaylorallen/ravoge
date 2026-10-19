import styles from "./dashboard.module.css";

export type BookingSlot = { starts_at: string; ends_at: string; available: boolean };

export function BookingTimeSlots({ slots, timezone }: { slots: BookingSlot[]; timezone: string }) {
  const firstOpen = slots.find((slot) => slot.available)?.starts_at;
  // A server refresh after a competing booking must clear the stale selection.
  const revision = slots.map((slot) => `${slot.starts_at}:${slot.available}`).join(",");
  return <fieldset className={styles.choiceField}><legend>Available times</legend><div className={styles.slotGrid} key={revision}>
    {slots.map((slot) => <label key={slot.starts_at}>
      <input defaultChecked={slot.starts_at === firstOpen} disabled={!slot.available} name="startsAt" required type="radio" value={slot.starts_at} />
      <span>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(slot.starts_at))}{!slot.available && <small>Full</small>}</span>
    </label>)}
  </div></fieldset>;
}
