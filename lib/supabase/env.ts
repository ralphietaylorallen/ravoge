type SupabasePublicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

export type SupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

const defaultEnvironment: SupabasePublicEnvironment = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

export function getSupabaseEnvironment(
  environment: SupabasePublicEnvironment = defaultEnvironment,
): SupabaseEnvironment {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) {
    const missing = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ].filter(Boolean);

    throw new Error(
      `Missing required Supabase environment variable${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Copy .env.example to .env.local and add the Ravoge project's public connection values.`,
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTP or HTTPS.");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must not contain credentials.");
  }

  if (
    !publishableKey.startsWith("sb_publishable_") ||
    publishableKey.length <= 15
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key.",
    );
  }

  return { url, publishableKey };
}
