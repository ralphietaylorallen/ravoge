import "server-only";

import nodemailer from "nodemailer";
import { normalizeInvitationEmail } from "./invitation-input.ts";

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
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.RAVOGE_SMTP_PASSWORD;
  const fromValue = process.env.RAVOGE_EMAIL_FROM?.trim();
  const from = fromValue?.match(/^(?:Ravoge\s*<)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/i)?.[1];

  if (!host || !user || !pass || !from) {
    return { error: null, id: null, status: "not_configured" as const };
  }

  try {
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw { code: "ECONFIG" };
    const { html, subject, text } = createInvitationEmailContent({ ...input, recipientEmail });
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      requireTLS: true,
      tls: { minVersion: "TLSv1.2" },
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    const info = await transporter.sendMail({
      from: { name: "Ravoge", address: from },
      replyTo: { name: "Ravoge", address: from },
      to: recipientEmail,
      envelope: { from, to: [recipientEmail] },
      subject,
      html,
      text,
    });

    if (!info.accepted?.some(address => String(address).toLowerCase() === recipientEmail) || info.rejected?.length || info.envelope?.to?.length !== 1 || info.envelope.to[0].toLowerCase() !== recipientEmail) throw { code: "ERECIPIENT" };
    console.info("[Ravoge email] SMTP invitation accepted", { role: input.role, intendedRecipientAccepted: true, envelopeRecipientMatches: true });

    return {
      error: null,
      id: typeof info.messageId === "string" ? info.messageId : null,
      status: "sent" as const,
    };
  } catch (error) {
    // SMTP response/message can contain addresses, credentials or the invitation URL.
    const details = error as { code?: string; responseCode?: number } | null;
    const code = ["EAUTH", "ECONNECTION", "ESOCKET", "ETIMEDOUT", "ETLS", "EENVELOPE", "EMESSAGE", "ERECIPIENT", "ECONFIG"].includes(details?.code ?? "") ? details!.code : "unknown";
    console.error("[Ravoge email] SMTP invitation delivery failed", { code, responseCode: typeof details?.responseCode === "number" ? details.responseCode : undefined });
    return {
      error: code === "EAUTH" ? "The email mailbox could not authenticate. Ask the Owner to check the Microsoft 365 sending configuration. Your secure invite link is still available." : "Email delivery failed. Retry, or copy the secure invite link below.",
      id: null,
      status: "failed" as const,
    };
  }
}
