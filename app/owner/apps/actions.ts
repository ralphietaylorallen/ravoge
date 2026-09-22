"use server";

import { revalidatePath } from "next/cache";

import { getVerifiedUser } from "@/lib/auth";
import {
  rotateOrganizationEnrollmentCredential,
  type EnrollmentRole,
} from "@/lib/organization-enrollment";

function roleFromForm(formData: FormData): EnrollmentRole {
  const role = formData.get("role");
  if (role !== "coach" && role !== "client") throw new Error("Invalid enrollment role.");
  return role;
}

export async function rotateEnrollmentQrAction(formData: FormData) {
  const role = roleFromForm(formData);
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) throw new Error("Authentication is required.");
  await rotateOrganizationEnrollmentCredential(supabase, role);
  revalidatePath("/owner/apps");
}

export async function disableEnrollmentQrAction(formData: FormData) {
  const role = roleFromForm(formData);
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) throw new Error("Authentication is required.");
  const { error } = await supabase.rpc("disable_organization_enrollment_credential", {
    requested_role: role,
  });
  if (error) throw new Error("Ravoge could not disable this enrollment QR.");
  revalidatePath("/owner/apps");
}
