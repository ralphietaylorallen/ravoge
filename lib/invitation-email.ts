import "server-only";

import { normalizeInvitationEmail } from "./invitation-input.ts";
import { getEmailSender } from "./email-sender.ts";

type InvitationEmail = {
  invitationUrl: string;
  organizationName: string;
  recipientEmail: string;
  role: "owner" | "coach" | "client";
  inviterName?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export function createInvitationEmailContent(input: InvitationEmail) {
  const roleLabel = input.role === "owner" ? "Owner" : input.role === "coach" ? "Coach" : "Client";
  const url = new URL(input.invitationUrl);
  // Use the existing email-bound signup screen. Installation remains a separate step.
  const token = url.searchParams.get("token");
  if (url.pathname === `/enroll/${input.role}` && token) {
    url.pathname = `/signup/${input.role}`;
    url.search = new URLSearchParams({ enrollment: token }).toString();
  }
  const invitationUrl = url.href;
  const invitation = input.role === "client"
    ? `${input.organizationName} has invited you to use Ravoge for your training, workouts, progress and scheduling.`
    : `${input.inviterName?.trim() || "Your gym"} invited you to join ${input.organizationName} as ${roleLabel === "Owner" ? "an" : "a"} ${roleLabel} on Ravoge.`;
  const button = input.role === "client" ? "Create your Ravoge account" : "Create your account";
  const instructions = `Use the invited email address (${input.recipientEmail}) to create your password and ${roleLabel} profile. Already have an account? Sign in from the invitation page.`;
  const footer = "If you were not expecting this invitation, you can ignore this email.";
  const html = `<!doctype html><html><body style="margin:0;background:#050606;color:#f6f5f3;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:36px 20px"><div style="background:#101211;border:1px solid #776343;padding:28px"><p style="margin:0 0 28px;letter-spacing:.28em;font-weight:700"><img src="https://ravoge.com/brand/ravoge-wolf-transparent.png" alt="" width="40" height="50" style="vertical-align:middle;object-fit:contain;margin-right:12px" />RAVOGE</p><h1 style="font-size:28px;line-height:1.25">You’re invited to ${escapeHtml(input.organizationName)}</h1><p style="line-height:1.6">${escapeHtml(invitation)}</p><p style="line-height:1.6;color:#d2cec5">${escapeHtml(instructions)}</p><a href="${escapeHtml(invitationUrl)}" style="display:block;margin:28px 0;padding:18px 12px;background:#e4bb70;color:#050606;text-align:center;text-decoration:none;font-weight:700;border-radius:4px">${button}</a><p style="font-size:13px;line-height:1.6;color:#d2cec5">Button not working? Open this secure invitation:<br/><a href="${escapeHtml(invitationUrl)}" style="color:#e4bb70;word-break:break-all">${escapeHtml(invitationUrl)}</a></p><p style="font-size:13px;line-height:1.6;color:#d2cec5">This email-bound link expires automatically. No password is included. After joining, you can add Ravoge to your device’s Home Screen.</p><p style="font-size:12px;line-height:1.6;color:#aaa69f">${footer}</p></div></div></body></html>`;
  return { html, subject: `You’re invited to ${input.role === "coach" ? "coach at " : "join "}${input.organizationName} on Ravoge`, text: `${invitation}\n\n${instructions}\n\nCreate your account: ${invitationUrl}\n\nThis secure invitation expires automatically. No password is included.\n\n${footer}` };
}

export async function sendInvitationEmail(input: InvitationEmail) {
  const recipientEmail = normalizeInvitationEmail(input.recipientEmail);
  if (!recipientEmail) return { error: "Enter a complete email address.", id: null, status: "failed" as const };
  const apiKey = process.env.RESEND_API_KEY;

  // Production-only credentials are intentionally absent from deploy previews.
  if (!apiKey || !process.env.RAVOGE_EMAIL_FROM?.trim()) {
    return { error: null, id: null, status: "not_configured" as const };
  }

  try {
    const sender = getEmailSender();
    if (!sender || sender.from.address !== "hello@ravoge.com" || sender.replyToAddress !== "hello@ravoge.com") throw { code: "ECONFIG" };
    const { html, subject, text } = createInvitationEmailContent({ ...input, recipientEmail });
    // Use the existing booking adapter's Resend API contract. No SMTP fallback
    // or automatic retry: an ambiguous response must not duplicate an invite.
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({ from: sender.fromHeader, reply_to: sender.replyToAddress, to: [recipientEmail], subject, html, text }),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json() as { id?: unknown } | null;
    if (!response.ok || typeof payload?.id !== "string" || !payload.id.trim()) {
      // Never log provider bodies, request headers, addresses or secure links.
      console.error("[Ravoge email] Resend invitation not confirmed", { role: input.role, httpStatus: response.status });
      return { error: `Email provider returned ${response.status}; the invitation was not confirmed. Copy the secure invite link below.`, id: null, status: "failed" as const };
    }
    console.info("[Ravoge email] Resend invitation accepted", { role: input.role, httpStatus: response.status });

    return {
      error: null,
      id: payload.id,
      status: "sent" as const,
    };
  } catch (error) {
    const configurationError = (error as { code?: string } | null)?.code === "ECONFIG";
    console.error("[Ravoge email] Resend invitation delivery failed", { role: input.role, code: configurationError ? "ECONFIG" : "unconfirmed" });
    return {
      error: configurationError ? "The Ravoge invitation sender configuration needs attention. Use hello@ravoge.com for From and Reply-To. Your secure invite link is still available." : "Email delivery could not be confirmed. Copy the secure invite link below before attempting another send.",
      id: null,
      status: "failed" as const,
    };
  }
}
