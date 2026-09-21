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

export async function sendInvitationEmail(input: InvitationEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RAVOGE_EMAIL_FROM;
  if (!apiKey || !from) {
    return { error: null, id: null, status: "not_configured" as const };
  }

  const roleLabel = input.role === "owner" ? "Owner" : input.role === "coach" ? "Coach" : "Client";
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ed;color:#171918;font-family:Arial,sans-serif"><div style="max-width:620px;margin:0 auto;padding:42px 24px"><div style="background:#fff;border:1px solid #ddd8ce;padding:38px"><p style="margin:0 0 34px;letter-spacing:.28em;font-weight:700">RAVOGE</p><p style="margin:0;color:#8a6b3d;font-size:12px;letter-spacing:.18em;font-weight:700">${roleLabel.toUpperCase()} INVITATION</p><h1 style="margin:18px 0 10px;font-size:31px">Join ${escapeHtml(input.organizationName)}</h1><p style="margin:0;color:#666;line-height:1.65">Use your own Ravoge account to accept this secure, email-bound invitation.</p><a href="${escapeHtml(input.invitationUrl)}" style="display:block;margin-top:28px;padding:14px;background:#171918;color:#fff;text-align:center;text-decoration:none;font-weight:700">OPEN RAVOGE</a><p style="margin:26px 0 0;color:#777;font-size:12px;line-height:1.55">No password is included. This link is intended only for ${escapeHtml(input.recipientEmail)} and expires automatically.</p></div></div></body></html>`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from,
        html,
        subject: `Join ${input.organizationName} on Ravoge as ${roleLabel}`,
        to: [input.recipientEmail],
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const payload = await response.json() as { id?: string; message?: string };
    if (!response.ok || !payload.id) {
      return {
        error: payload.message ?? `Email provider returned ${response.status}.`,
        id: null,
        status: "failed" as const,
      };
    }
    return { error: null, id: payload.id, status: "sent" as const };
  } catch {
    return {
      error: "Transactional email provider could not be reached.",
      id: null,
      status: "failed" as const,
    };
  }
}
