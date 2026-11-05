import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnvironment } from "./env";
import { ACCESS_COOKIE, parseAccessSelection } from "@/lib/access-selection";

export async function createClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = getSupabaseEnvironment();
  const selection = parseAccessSelection(cookieStore.get(ACCESS_COOKIE)?.value);

  return createServerClient(url, publishableKey, {
    // Untrusted preferences: database helpers recheck both against active access.
    global: selection ? { headers: {
      "x-ravoge-organization": selection.organizationId,
      "x-ravoge-view": selection.role,
    } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, options, value } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. proxy.ts refreshes sessions.
        }
      },
    },
  });
}
