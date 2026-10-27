import "server-only";

import nodemailer from "nodemailer";

type InvitationEmail = {
  invitationUrl: string;
  organizationName: string;
  recipientEmail: string;
  role: "owner" | "coach" | "client";
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

function smtpPort() {
  const value = Number(process.env.SMTP_PORT || 587);
  return Number.isInteger(value) && value > 0 ? value : 587;
}

export async function sendInvitationEmail(input: InvitationEmail) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.RAVOGE_SMTP_PASSWORD?.trim() || process.env.SMTP_PASS?.trim();
  const from = process.env.RAVOGE_EMAIL_FROM?.trim();

  if (!host || !user || !pass || !from) {
    return { error: null, id: null, status: "not_configured" as const };
  }

  const roleLabel = input.role === "owner" ? "Owner" : input.role === "coach" ? "Coach" : "Client";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ed;color:#171918;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:42px 24px"><div style="background:#fff;border:1px solid #ddd8ce;padding:38px"><p style="margin:0 0 34px;letter-spacing:.28em;font-weight:700">RAVOGE</p><p style="margin:0;color:#8a6b3d;font-size:12px;letter-spacing:.18em;font-weight:700">${roleLabel.toUpperCase()} INVITATION</p><h1 style="margin:18px 0 10px;font-size:31px">Join ${escapeHtml(input.organizationName)}</h1><p style="margin:0;color:#666;line-height:1.65">Use your own Ravoge account to accept this secure, email-bound invitation.</p><a href="${escapeHtml(input.invitationUrl)}" style="display:block;margin-top:28px;padding:14px;background:#171918;color:#fff;text-align:center;text-decoration:none;font-weight:700">Get Ravoge</a><p style="margin:16px 0 0;color:#666;line-height:1.65">Install Ravoge, create your password, and you’re connected.</p><p style="margin:26px 0 0;color:#777;font-size:12px;line-height:1.55">No password is included. This link is intended only for ${escapeHtml(input.recipientEmail)} and expires automatically.</p></div></div></body></html>`;

  try {
    const port = smtpPort();
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    const info = await transporter.sendMail({
      from: { name: "Ravoge", address: from },
      to: input.recipientEmail,
      subject: `Join ${input.organizationName} on Ravoge as ${roleLabel}`,
      html,
      text: `Join ${input.organizationName} on Ravoge as ${roleLabel}.\n\nGet Ravoge: ${input.invitationUrl}\n\nInstall Ravoge, create your password, and you’re connected.\n\nThis secure invitation is intended only for ${input.recipientEmail} and expires automatically. No password is included.`,
    });

    return {
      error: null,
      id: typeof info.messageId === "string" ? info.messageId : null,
      status: "sent" as const,
    };
  } catch (error) {
    console.error("[Ravoge email] SMTP invitation delivery failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return {
      error: "SMTP email delivery failed. Check the Microsoft 365 mailbox and SMTP configuration.",
      id: null,
      status: "failed" as const,
    };
  }
}
