import "server-only";

// Sender identity is independent of the licensed mailbox used to authenticate.
// Keep this server-only and shared by existing transactional email adapters.
export function getEmailSender() {
  const value = process.env.RAVOGE_EMAIL_FROM?.trim();
  if (!value) return null;
  const address = value.match(/^(?:Ravoge\s*<)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/i)?.[1]?.toLowerCase();
  const replyTo = process.env.RAVOGE_EMAIL_REPLY_TO?.trim().toLowerCase() || "info@ravoge.com";
  if (address !== "info@ravoge.com" || replyTo !== "info@ravoge.com") throw { code: "ECONFIG" };
  return {
    from: { name: "Ravoge", address },
    replyTo: { name: "Ravoge", address: replyTo },
    fromHeader: "Ravoge <info@ravoge.com>",
    replyToAddress: replyTo,
  };
}
