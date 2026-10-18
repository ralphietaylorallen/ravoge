import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROFILE_IMAGE_BUCKET, profilePhotoPaths, profileThumbnailPath } from "./profile-images.ts";

export async function storeProfilePhoto({ supabase, userId, organizationId, previous, prepared }: {
  supabase: SupabaseClient; userId: string; organizationId: string; previous: string | null;
  prepared: { profile: Buffer; thumbnail: Buffer } | null;
}) {
  const bucket = supabase.storage.from(PROFILE_IMAGE_BUCKET);
  async function remove(paths: string[]) {
    try {
      const { data, error } = await bucket.remove(paths);
      // RLS can filter every row and still return HTTP 200 with an empty array.
      return !error && paths.every(path => data?.some(object => object.name === path));
    } catch { return false; }
  }
  const path = prepared ? `${organizationId}/${userId}/avatar/v2-${crypto.randomUUID()}.webp` : null;
  const newPaths = path ? profilePhotoPaths(path) : [];
  let imageUrl: string | null = null;
  try {
    if (prepared && path) {
      for (const [name, bytes] of [[path, prepared.profile], [profileThumbnailPath(path), prepared.thumbnail]] as const) {
        const { error } = await bucket.upload(name, bytes, { contentType: "image/webp", cacheControl: "3600", upsert: false });
        if (error) throw new Error("upload");
      }
      const { data, error } = await bucket.createSignedUrl(path, 900);
      if (error || !data?.signedUrl) throw new Error("verify");
      imageUrl = data.signedUrl;
    }
  } catch {
    if (newPaths.length) await remove(newPaths);
    throw new Error("The upload failed. Your previous photo is unchanged. Retry.");
  }
  const args = { target_user_id: userId, target_organization_id: organizationId };
  let committed = false;
  try { const { error } = await supabase.rpc("set_managed_profile_photo", { ...args, expected_asset_path: previous, new_asset_path: path }); committed = !error; } catch { /* A lost response is not proof that the transaction failed. */ }
  if (!committed) {
    try { const { data, error } = await supabase.rpc("get_profile_photo_edit_context", args); committed = !error && data?.[0]?.avatar_path === path; } catch { /* Keep the old image in the UI until the result is confirmed. */ }
  }
  if (!committed) {
    if (newPaths.length) await remove(newPaths); // RLS also forbids deleting a referenced image.
    throw new Error("The photo change could not be confirmed, or someone else changed it. Refresh this profile and retry.");
  }
  const cleanupPending = previous && previous !== path ? !(await remove(profilePhotoPaths(previous))) : false;
  return { imageUrl, cleanupPending, message: `${prepared ? "Profile photo updated." : "Profile photo removed."}${cleanupPending ? " A previous private file could not be cleaned up; contact your Owner." : ""}` };
}
