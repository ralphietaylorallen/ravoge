import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_IMAGE_BUCKET = "profile-images";
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function getProfileImageUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn = 3600,
) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .createSignedUrl(path, expiresIn);
  return error ? null : data.signedUrl;
}
