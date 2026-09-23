"use client";

import Link from "next/link";
import { useState } from "react";
import { ProfilePhoto } from "./profile-photo";
import styles from "./dashboard.module.css";

export type DirectoryClient = { id: string; name: string; photo: string | null; status: string; coachId: string | null; coach: string; joined: string; nextSession: string; intake: string; workout: string };

export function ClientDirectory({ clients }: { clients: DirectoryClient[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [coach, setCoach] = useState("");
  const coaches = [...new Map(clients.filter((client) => client.coachId).map((client) => [client.coachId!, client.coach])).entries()];
  const visible = clients.filter((client) => client.name.toLowerCase().includes(search.toLowerCase()) && (!status || client.status === status) && (!coach || (coach === "unassigned" ? !client.coachId : client.coachId === coach)));
  return <section aria-label="Organization clients" className={styles.clientDirectory}>
    <div className={styles.directoryFilters}>
      <label className={styles.field}><span className={styles.srOnly}>Search clients</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search clients…" type="search" value={search} /></label>
      <label className={styles.field}><span className={styles.srOnly}>Client status</span><select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label className={styles.field}><span className={styles.srOnly}>Assigned coach</span><select onChange={(event) => setCoach(event.target.value)} value={coach}><option value="">All coaches</option><option value="unassigned">Not assigned</option>{coaches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <Link className={styles.action} href="/owner/apps">+ Invite Client</Link>
    </div>
    <div aria-hidden="true" className={styles.directoryHead}><span>Client</span><span>Status</span><span>Coach</span><span>Next session</span><span>Intake</span><span>Latest workout</span><span /></div>
    <ul className={styles.clientRows}>{visible.map((client) => <li key={client.id}><Link aria-label={`Open Client: ${client.name}`} className={styles.clientRow} href={`/owner/clients/${client.id}`}>
      <span className={styles.directoryPerson}><ProfilePhoto name={client.name} size="small" url={client.photo} /><span><strong>{client.name}</strong><small>Joined {client.joined}</small></span></span>
      <span><span className={client.status === "active" ? styles.successPill : styles.mutedPill}>{client.status}</span></span>
      <span data-label="Coach" className={!client.coachId ? styles.warningText : ""}>{client.coach}</span>
      <span data-label="Next session">{client.nextSession}</span><span data-label="Intake"><span className={client.intake === "Pending" ? styles.pendingPill : styles.successPill}>{client.intake}</span></span><span data-label="Latest workout">{client.workout}</span>
      <span className={styles.openClient}>Open Client <span aria-hidden="true">→</span></span>
    </Link></li>)}</ul>
    {!visible.length && <p className={styles.empty}>No clients match these filters.</p>}
    <p className={styles.formHint}>Showing {visible.length} of {clients.length} clients</p>
  </section>;
}
