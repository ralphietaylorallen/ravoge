import { revalidatePath } from "next/cache";
import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { storeProfilePhoto } from "@/lib/profile-photo-storage";
import { optimizeProfilePhoto, readProfilePhotoForm } from "@/lib/profile-photo-processing";

export const runtime = 'nodejs';
const UNASSIGNED = '00000000-0000-0000-0000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });

async function changePhoto(request: Request, remove: boolean) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== host) return reply({ message: 'Open Ravoge directly and retry this photo change.' }, 403);
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return reply({ message: 'Sign in again before changing a photo.' }, 401);
  if (Number(request.headers.get('content-length') ?? 0) > 5_400_000) return reply({ message: 'Choose a smaller photo (prepared limit: 5 MB).' }, 413);
  let form: FormData;
  try { form = await readProfilePhotoForm(request); } catch (error) {
    const oversized = error instanceof Error && error.message === 'The prepared photo must be 5 MB or smaller.';
    return reply({ message: oversized ? error.message : 'The upload was interrupted. Your previous photo is unchanged. Retry.' }, oversized ? 413 : 400);
  }
  const target = String(form.get('targetUserId') || userId);
  const membership = await getActiveMembership(userId, supabase);
  const organization = String(form.get('organizationId') || membership?.organization_id || UNASSIGNED);
  if (!UUID.test(target) || !UUID.test(organization)) return reply({ message: 'This profile photo is not available.' }, 403);
  const { data: contexts, error: contextError } = await supabase.rpc('get_profile_photo_edit_context', { target_user_id: target, target_organization_id: organization });
  if (contextError || !contexts?.length) return reply({ message: 'You do not have permission to change this photo.' }, 403);
  const previous = contexts[0].avatar_path as string | null;
  let prepared = null;
  if (!remove) {
    const file = form.get('photo');
    if (!(file instanceof File)) return reply({ message: 'Choose a photo first.' }, 400);
    try { prepared = await optimizeProfilePhoto(file); }
    catch (error) { return reply({ message: error instanceof Error ? error.message : 'Choose another image and retry.' }, 400); }
  }
  try {
    const result = await storeProfilePhoto({ supabase, userId: target, organizationId: organization, previous, prepared });
    // A cache invalidation failure must not misreport an already committed save.
    try { revalidatePath('/', 'layout'); } catch { /* The client also refreshes the current profile. */ }
    return reply(result);
  } catch (error) { return reply({ message: error instanceof Error ? error.message : 'The photo could not be saved. Refresh and retry.' }, 409); }
}

async function handle(request: Request, remove: boolean) {
  try { return await changePhoto(request, remove); }
  catch { return reply({ message: 'The connection was interrupted. Refresh this profile to check whether the photo saved, then retry.' }, 503); }
}
export async function POST(request: Request) { return handle(request, false); }
export async function DELETE(request: Request) { return handle(request, true); }
