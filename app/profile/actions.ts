"use server";

import { revalidatePath } from "next/cache";

import { requireRole, type AccountRole } from "@/lib/auth";
import { PROFILE_IMAGE_BUCKET, PROFILE_IMAGE_MAX_BYTES, PROFILE_IMAGE_TYPES } from "@/lib/profile-images";

export type ProfileActionState = { message?: string; status: "idle" | "error" | "success" };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string, maximum: number) {
  return String(formData.get(name) ?? "").trim().slice(0, maximum);
}

async function saveProfile(role: AccountRole, formData: FormData): Promise<ProfileActionState> {
  const { supabase } = await requireRole(role);
  const preferredName = text(formData, "preferredName", 80);
  const bio = text(formData, "bio", 1200);
  const patch: Record<string, unknown> = { bio, preferredName };
  if (role === "coach") {
    const fullName = text(formData, "fullName", 120);
    const yearsValue = String(formData.get("yearsCoaching") ?? "").trim();
    const yearsCoaching = yearsValue === "" ? "" : Number(yearsValue);
    const specialties = text(formData, "specialties", 1700).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
    if (fullName.length < 2 || (yearsCoaching !== "" && (!Number.isInteger(yearsCoaching) || Number(yearsCoaching) < 0 || Number(yearsCoaching) > 80))) {
      return { message: "Enter a valid name and coaching experience.", status: "error" };
    }
    patch.fullName = fullName;
    patch.specialties = specialties;
    patch.yearsCoaching = yearsCoaching;
  }
  const { error } = await supabase.rpc("update_own_profile", { profile_patch: patch });
  if (error) return { message: "Your profile could not be updated.", status: "error" };
  revalidatePath(`/${role}`);
  revalidatePath(`/${role}/profile`);
  return { message: "Profile updated.", status: "success" };
}

export async function saveCoachProfileAction(_state: ProfileActionState, formData: FormData) {
  return saveProfile("coach", formData);
}

export async function saveClientProfileAction(_state: ProfileActionState, formData: FormData) {
  return saveProfile("client", formData);
}

async function uploadProfilePhoto(role: AccountRole, formData: FormData): Promise<ProfileActionState> {
  const { membership, supabase, userId } = await requireRole(role);
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { message: "Choose an image to upload.", status: "error" };
  const extension = PROFILE_IMAGE_TYPES.get(file.type);
  if (!extension || file.size > PROFILE_IMAGE_MAX_BYTES) {
    return { message: "Use a JPG, PNG, or WebP image no larger than 5 MB.", status: "error" };
  }
  const { data: current } = await supabase.from("profiles").select("avatar_path").eq("id", userId).single();
  const path = `${membership.organization_id}/${userId}/avatar.${extension}`;
  const { error: uploadError } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return { message: "The photo upload was rejected. Check the file and try again.", status: "error" };
  const { error: profileError } = await supabase.rpc("update_own_profile", { profile_patch: { avatarPath: path } });
  if (profileError) return { message: "The photo uploaded but could not be attached to your profile.", status: "error" };
  if (current?.avatar_path && current.avatar_path !== path) {
    await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([current.avatar_path]);
  }
  revalidatePath(`/${role}`);
  revalidatePath(`/${role}/profile`);
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

export async function deleteCertificationAction(certificationId: string) {
  const { supabase } = await requireRole("coach");
  if (!UUID_PATTERN.test(certificationId)) return;
  await supabase.from("coach_certifications").delete().eq("id", certificationId);
  revalidatePath("/coach/profile");
}
