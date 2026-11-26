"use client";

import { useState } from "react";
import Link from "next/link";
import { ProfilePhoto } from "./profile-photo";
import styles from "./coach-workspace.module.css";

export function CoachClientDirectory({ clients, mode = "profile" }: {
  clients: { id: string; name: string; photo: string | null }[];
  mode?: "profile" | "workout";
}) {
  const [search, setSearch] = useState("");
  if (!clients.length) return <section className={styles.agenda}>
    <p className={styles.muted}>No clients are assigned to you yet.</p>
  </section>;
  const query = search.trim().toLocaleLowerCase();
  const matches = clients.filter(client => client.name.toLocaleLowerCase().includes(query));
  return <section className={styles.agenda} aria-label="Assigned clients">
    <label className={styles.directorySearch}>Find a client
      <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name" />
    </label>
    {matches.length ? <ul className={styles.directoryList}>{matches.map(client => <li key={client.id}>
      <Link className={styles.shortcut} href={mode === "workout" ? `/coach/workout-now?client=${client.id}` : `/coach/clients/${client.id}`}>
        <ProfilePhoto name={client.name} size="small" url={client.photo} />
        <strong>{client.name}</strong><span aria-hidden="true">›</span>
      </Link>
    </li>)}</ul> : <p role="status" className={styles.muted}>No clients match that name.</p>}
  </section>;
}
