import "server-only";

import { cookies } from "next/headers";

import { getInvitationContext } from "@/lib/invitations";

export const ENROLLMENT_HANDOFF_COOKIE = "ravoge_enrollment_handoff";
export const ENROLLMENT_HANDOFF_MAX_AGE = 2 * 60 * 60;

export async function getEnrollmentHandoff() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ENROLLMENT_HANDOFF_COOKIE)?.value;
  if (!token) return null;
  const invitation = await getInvitationContext(token);
  return invitation ? { invitation, token } : null;
}

export async function clearEnrollmentHandoff() {
  const cookieStore = await cookies();
  cookieStore.delete(ENROLLMENT_HANDOFF_COOKIE);
}
