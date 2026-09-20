"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";

const EQUIPMENT_TYPES = new Set([
  "barbell", "plates", "squat_rack", "bench", "dumbbells", "kettlebells",
  "cable_machine", "selectorized_machine", "cardio_equipment", "sled",
  "bands", "medicine_balls", "specialty_equipment", "other",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EquipmentActionState = {
  message?: string;
  status: "idle" | "error" | "success";
};

export type CoachAssignmentActionState = {
  message?: string;
  status: "idle" | "error" | "success";
};

export async function assignClientCoachAction(
  clientId: string,
  _state: CoachAssignmentActionState,
  formData: FormData,
): Promise<CoachAssignmentActionState> {
  const { supabase } = await requireRole("owner");
  const coachId = String(formData.get("coachId") ?? "");
  if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(coachId)) {
    return { message: "Choose an available coach.", status: "error" };
  }

  const { error } = await supabase.rpc("assign_client_to_coach", {
    target_client_user_id: clientId,
    target_coach_user_id: coachId,
  });
  if (error) {
    return {
      message: "That assignment could not be changed. Confirm both memberships are active in this gym.",
      status: "error",
    };
  }

  revalidatePath("/owner");
  revalidatePath("/owner/team");
  revalidatePath("/owner/clients");
  revalidatePath(`/owner/clients/${clientId}`);
  return { message: "Primary coach assignment updated.", status: "success" };
}

export async function addEquipmentAction(
  _state: EquipmentActionState,
  formData: FormData,
): Promise<EquipmentActionState> {
  const { membership, supabase, userId } = await requireRole("owner");
  const equipmentType = String(formData.get("equipmentType") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const quantityValue = String(formData.get("quantity") ?? "").trim();
  const quantity = quantityValue ? Number(quantityValue) : null;

  if (!EQUIPMENT_TYPES.has(equipmentType) || name.length < 2 || name.length > 120) {
    return { message: "Choose a valid type and enter a name between 2 and 120 characters.", status: "error" };
  }
  if (notes.length > 1000 || (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000))) {
    return { message: "Check the quantity and keep notes under 1,000 characters.", status: "error" };
  }

  const { error } = await supabase.from("organization_equipment").insert({
    created_by: userId,
    equipment_type: equipmentType,
    name,
    notes: notes || null,
    organization_id: membership.organization_id,
    quantity,
  });
  if (error) {
    return { message: "That equipment could not be added. Names must be unique for this gym.", status: "error" };
  }

  revalidatePath("/owner/equipment");
  return { message: "Equipment added.", status: "success" };
}

export async function setEquipmentAvailabilityAction(equipmentId: string, isAvailable: boolean) {
  const { membership, supabase } = await requireRole("owner");
  if (!UUID_PATTERN.test(equipmentId)) return;
  await supabase
    .from("organization_equipment")
    .update({ is_available: isAvailable })
    .eq("id", equipmentId)
    .eq("organization_id", membership.organization_id);
  revalidatePath("/owner/equipment");
}
