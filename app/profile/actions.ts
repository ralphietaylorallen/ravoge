"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sharp from "sharp";

import {
  dashboardForRole,
  getAccountType,
  getActiveMembership,
  getVerifiedUser,
  requireRole,
  type AccountRole,
} from "@/lib/auth";
import { PROFILE_IMAGE_BUCKET, PROFILE_IMAGE_MAX_BYTES } from "@/lib/profile-images";

export type ProfileActionState = { message?: string; status: "idle" | "error" | "success" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNASSIGNED_PROFILE_SCOPE = "00000000-0000-0000-0000-000000000000";

function text(formData: FormData, name: string, maximum: number) {
  return String(formData.get(name) ?? "").trim().slice(0, maximum);
}

async function getProfileActor(role: Extract<AccountRole, "coach" | "client">) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) redirect(`/login?next=/${role}/onboarding`);
  const membership = await getActiveMembership(userId, supabase);
  if (membership && membership.role !== role) redirect(dashboardForRole(membership.role));
  if (!membership) {
    const accountType = await getAccountType(userId, supabase);
    if (accountType !== role) redirect("/signup");
  }
  return { membership, supabase, userId };
}

async function saveProfile(role: Extract<AccountRole, "coach" | "client">, formData: FormData): Promise<ProfileActionState> {
  const { supabase } = await getProfileActor(role);
  const preferredName = text(formData, "preferredName", 80);
  const bio = text(formData, "bio", 1200);
  const patch: Record<string, unknown> = { bio, preferredName };
  const fullName = text(formData, "fullName", 120);
  if (fullName.length < 2) {
    return { message: "Enter a valid full name.", status: "error" };
  }
  patch.fullName = fullName;
  if (role === "coach") {
    const yearsValue = String(formData.get("yearsCoaching") ?? "").trim();
    const yearsCoaching = yearsValue === "" ? "" : Number(yearsValue);
    const specialties = text(formData, "specialties", 1700).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
    if (fullName.length < 2 || (yearsCoaching !== "" && (!Number.isInteger(yearsCoaching) || Number(yearsCoaching) < 0 || Number(yearsCoaching) > 80))) {
      return { message: "Enter a valid name and coaching experience.", status: "error" };
    }
    patch.specialties = specialties;
    patch.yearsCoaching = yearsCoaching;
  }
  const { error } = await supabase.rpc("update_own_profile", { profile_patch: patch });
  if (error) return { message: "Your profile could not be updated.", status: "error" };
  revalidatePath(`/${role}`);
  revalidatePath(`/${role}/profile`);
  revalidatePath(`/${role}/onboarding`);
  return { message: "Profile updated.", status: "success" };
}

export async function saveCoachProfileAction(_state: ProfileActionState, formData: FormData) {
  return saveProfile("coach", formData);
}

export async function saveClientProfileAction(_state: ProfileActionState, formData: FormData) {
  return saveProfile("client", formData);
}

async function uploadProfilePhoto(role: Extract<AccountRole, "coach" | "client">, formData: FormData): Promise<ProfileActionState> {
  const { membership, supabase, userId } = await getProfileActor(role);
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose an image to upload.", status: "error" };
  if (file.type !== "image/webp" || file.size > PROFILE_IMAGE_MAX_BYTES) {
    return { message: "Crop the photo to a WebP image no larger than 5 MB.", status: "error" };
  }
  let optimizedPhoto: Buffer;
  try {
    optimizedPhoto = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 20_000_000 })
      .rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
  } catch {
    return { message: "The image could not be decoded. Choose another photo.", status: "error" };
  }
  if (optimizedPhoto.length > PROFILE_IMAGE_MAX_BYTES) return { message: "The cropped photo is too large.", status: "error" };
  const { data: current } = await supabase.from("profiles").select("avatar_path").eq("id", userId).single();
  const path = `${membership?.organization_id ?? UNASSIGNED_PROFILE_SCOPE}/${userId}/avatar/${crypto.randomUUID()}.webp`;
  const { error: uploadError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, optimizedPhoto, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: false,
  });
  if (uploadError) return { message: "The photo upload was rejected. Check the file and try again.", status: "error" };
  const { error: profileError } = membership
    ? await supabase.rpc("update_own_profile", { profile_patch: { avatarPath: path } })
    : await supabase.rpc("update_unaffiliated_profile_photo", { asset_path: path });
  if (profileError) {
    await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([path]);
    return { message: "The photo could not be attached to your profile. Your previous photo remains unchanged.", status: "error" };
  }
  if (current?.avatar_path && current.avatar_path !== path) {
    await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([current.avatar_path]);
  }
  revalidatePath(`/${role}`);
  revalidatePath(`/${role}/profile`);
  revalidatePath(`/${role}/onboarding`);
  revalidatePath("/owner/clients");
  revalidatePath("/owner/team");
  revalidatePath(`/owner/clients/${userId}`);
  revalidatePath(`/coach/clients/${userId}`);
  return { message: "Profile photo updated.", status: "success" };
}

export async function uploadCoachPhotoAction(_state: ProfileActionState, formData: FormData) {
  return uploadProfilePhoto("coach", formData);
}
export async function uploadClientPhotoAction(_state: ProfileActionState, formData: FormData) {
  return uploadProfilePhoto("client", formData);
}

export async function addCertificationAction(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const { membership, supabase, userId } = await requireRole("coach");
  const certificationName = text(formData, "certificationName", 160);
  const issuingOrganization = text(formData, "issuingOrganization", 160);
  if (certificationName.length < 2 || issuingOrganization.length < 2) {
    return { message: "Certification and issuing organization are required.", status: "error" };
  }
  const { error } = await supabase.from("coach_certifications").insert({
    certification_name: certificationName,
    coach_user_id: userId,
    credential_number: text(formData, "credentialNumber", 120) || null,
    expiration_date: text(formData, "expirationDate", 10) || null,
    issue_date: text(formData, "issueDate", 10) || null,
    issuing_organization: issuingOrganization,
    notes: text(formData, "notes", 1000) || null,
    organization_id: membership.organization_id,
  });
  if (error) return { message: "That certification could not be saved.", status: "error" };
  revalidatePath("/coach/profile");
  return { message: "Certification added.", status: "success" };
}

export async function deleteCertificationAction(certificationId: string, _state: ProfileActionState): Promise<ProfileActionState> {
  void _state;
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(certificationId)) return { message: "That certification is not available.", status: "error" };
  const { data, error } = await supabase.from("coach_certifications").delete().eq("id", certificationId).select("id").maybeSingle();
  if (error || !data) return { message: "That certification could not be removed.", status: "error" };
  revalidatePath("/coach/profile");
  return { message: "Certification removed.", status: "success" };
}
