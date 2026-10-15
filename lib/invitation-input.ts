export const MAX_BULK_INVITATIONS = 25;

export function normalizeInvitationEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 320 && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email)
    ? email : null;
}

export function parseInvitationEmails(value: string) {
  const emails: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  for (const line of value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const email = normalizeInvitationEmail(line);
    if (!email) invalid.push(line);
    else if (emails.includes(email)) duplicates.push(email);
    else emails.push(email);
  }
  return { emails, duplicates: [...new Set(duplicates)], invalid, tooMany: emails.length > MAX_BULK_INVITATIONS };
}
