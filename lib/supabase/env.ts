const SECRET_KEY_PREFIXES = ["sb_secret_", "eyJ"];

export function getSupabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    (parsedUrl.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(parsedUrl.hostname))
  ) {
    throw new Error("Supabase must use HTTPS outside local development.");
  }

  if (
    publishableKey.toLowerCase().includes("service_role") ||
    SECRET_KEY_PREFIXES.some((prefix) => publishableKey.startsWith(prefix))
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key, never a secret or service-role key.",
    );
  }

  return { publishableKey, url } as const;
}
