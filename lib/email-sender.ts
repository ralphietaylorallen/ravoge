import "server-only";

const senderName = "Ravoge";
const defaultSenderAddress = "info@ravoge.com";

// Sender identity is independent of the licensed mailbox used to authenticate.
// Keep this server-only and shared by existing transactional email adapters.
export function getEmailSender() {
  const value = process.env.RAVOGE_EMAIL_FROM?.trim();
  if (!value) return null;
  const address = value.match(/^(?:Ravoge\s*<)?([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>?$/i)?.[1]?.toLowerCase();
  const senderAddress = address;
  const replyTo = process.env.RAVOGE_EMAIL_REPLY_TO?.trim().toLowerCase() || senderAddress || defaultSenderAddress;
  // Preserve existing info configuration for other adapters while allowing the
  // configured licensed hello mailbox. Recipients can never become senders.
  if (!senderAddress || ![defaultSenderAddress, "hello@ravoge.com"].includes(senderAddress) || replyTo !== senderAddress) throw { code: "ECONFIG" };
  return {
    from: { name: senderName, address: senderAddress },
    replyTo: { name: senderName, address: senderAddress },
    fromHeader: `${senderName} <${senderAddress}>`,
    replyToAddress: replyTo,
  };
}
