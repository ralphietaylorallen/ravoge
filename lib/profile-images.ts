import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_IMAGE_BUCKET = "profile-images";
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export function profileThumbnailPath(path: string) {
  return /\/avatar\/v2-[0-9a-f-]{36}\.webp$/i.test(path) ? path.replace(/\.webp$/, "-thumb.webp") : path;
}

export function profilePhotoPaths(path: string) {
  const thumbnail = profileThumbnailPath(path);
  return thumbnail === path ? [path] : [path, thumbnail];
}

export async function getProfileImageUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
  expiresIn = 900,
) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .createSignedUrl(path, expiresIn);
  return error ? null : data.signedUrl;
}

export async function getProfileThumbnailUrl(supabase: SupabaseClient, path: string | null | undefined) {
  return getProfileImageUrl(supabase, path ? profileThumbnailPath(path) : null);
}
