import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { optimizeProfilePhoto, readProfilePhotoForm } from "../../lib/profile-photo-processing.ts";
import { storeProfilePhoto } from "../../lib/profile-photo-storage.ts";
import { profilePhotoPaths, profileThumbnailPath } from "../../lib/profile-images.ts";

test("photo processing verifies bytes, orients, compresses, creates two sizes and strips metadata", async () => {
  const bytes = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: "#c29654" } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.ok((await sharp(bytes).metadata()).exif);
  const result = await optimizeProfilePhoto(new File([bytes], "camera.jpg", { type: "image/jpeg" }));
  for (const [image, size] of [[result.profile, 1024], [result.thumbnail, 160]] as const) {
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.format, "webp"); assert.equal(metadata.width, size); assert.equal(metadata.height, size);
    assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined); assert.equal(metadata.orientation, undefined);
    assert.ok(image.length < 1024 * 1024);
  }
});
test("unsupported, corrupt, spoofed and oversized photo input is rejected", async () => {
  await assert.rejects(() => optimizeProfilePhoto(new File(["no"], "file.gif", { type: "image/gif" })), /Choose/);
  await assert.rejects(() => optimizeProfilePhoto(new File(["not a PNG"], "file.png", { type: "image/png" })), /decoded safely/);
  await assert.rejects(() => optimizeProfilePhoto(new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], "fake.jpg", { type: "image/jpeg" })), /decoded safely/);
  await assert.rejects(() => optimizeProfilePhoto(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })), /5 MB/);
});
test("multipart body limit is enforced even without a content-length header", async () => {
  const request = new Request("https://ravoge.com/api/profile-photo", { method: "POST", body: new Uint8Array(5_400_001) });
  await assert.rejects(() => readProfilePhotoForm(request), /5 MB/);
});
test("thumbnail derivation preserves legacy files and uses a unique paired path for new photos", () => {
  const path = "org/user/avatar/v2-11111111-1111-4111-8111-111111111111.webp";
  assert.equal(profileThumbnailPath(path), path.replace(".webp", "-thumb.webp"));
  assert.deepEqual(profilePhotoPaths("org/user/avatar.jpg"), ["org/user/avatar.jpg"]);
});

function fixture(failure: "none" | "upload" | "pointer" | "lost-response" | "cleanup" | "filtered-cleanup" = "none") {
  const previous = "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/avatar/v2-00000000-0000-4000-8000-000000000003.webp";
  const uploaded: string[] = [], removed: string[][] = [], events: string[] = [];
  let pointer = previous;
  const mock = {
    storage: { from: () => ({
      upload: async (path: string) => { uploaded.push(path); events.push("upload"); return { error: failure === "upload" && uploaded.length === 2 ? {} : null }; },
      createSignedUrl: async () => ({ data: { signedUrl: "https://example.supabase.co/storage/v1/object/sign/private?token=test-only" }, error: null }),
      remove: async (paths: string[]) => { events.push("remove"); removed.push(paths); return { data: failure === "filtered-cleanup" ? [] : paths.map(name => ({ name })), error: failure === "cleanup" ? {} : null }; },
    }) },
    rpc: async (name: string, args: { new_asset_path: string }) => {
      if (name === "get_profile_photo_edit_context") return { data: [{ avatar_path: pointer }], error: null };
      events.push("pointer");
      if (failure === "pointer") return { error: {} };
      pointer = args.new_asset_path;
      return { error: failure === "lost-response" ? {} : null };
    },
  };
  return { previous, uploaded, removed, events, getPointer: () => pointer, supabase: mock as unknown as SupabaseClient };
}
const prepared = { profile: Buffer.from("validated-profile"), thumbnail: Buffer.from("validated-thumbnail") };
test("replacement uploads both immutable sizes, commits the pointer, then removes old files", async () => {
  const state = fixture();
  await storeProfilePhoto({ ...state, userId: "user", organizationId: "org", prepared });
  assert.deepEqual(state.events, ["upload", "upload", "pointer", "remove"]);
  assert.notEqual(state.getPointer(), state.previous);
  assert.deepEqual(state.removed, [profilePhotoPaths(state.previous)]);
});
for (const failure of ["upload", "pointer"] as const) test(`failed ${failure} keeps the previous pointer and never deletes the previous photo`, async () => {
  const state = fixture(failure);
  await assert.rejects(() => storeProfilePhoto({ ...state, userId: "user", organizationId: "org", prepared }));
  assert.equal(state.getPointer(), state.previous);
  assert.ok(state.removed.every(paths => !paths.includes(state.previous)));
});
test("a lost commit response is rechecked, and cleanup failure does not undo a confirmed save", async () => {
  for (const failure of ["lost-response", "cleanup", "filtered-cleanup"] as const) {
    const state = fixture(failure);
    const result = await storeProfilePhoto({ ...state, userId: "user", organizationId: "org", prepared });
    assert.notEqual(state.getPointer(), state.previous);
    assert.equal(result.cleanupPending, failure !== "lost-response");
  }
});
