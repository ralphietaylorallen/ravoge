"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import {
  parseSavedTrainingImport,
  parseTrainingHistoryFile,
  type ParsedTrainingImport,
} from "@/lib/training-import";

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

export type TrainingImportActionState = {
  data?: ParsedTrainingImport;
  importedCount?: number;
  message?: string;
  status: "idle" | "error" | "success";
};

export type RevenueActionState = {
  message?: string;
  status: "idle" | "error" | "success";
};

function parseMoneyToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function parsePercentToBasisPoints(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return basisPoints <= 10000 ? basisPoints : null;
}

export async function saveSessionPricingAction(
  _state: RevenueActionState,
  formData: FormData,
): Promise<RevenueActionState> {
  const { supabase } = await requireRole("owner");
  const rawPrice = String(formData.get("sessionPrice") ?? "").trim();
  const priceMinor = rawPrice ? parseMoneyToMinor(rawPrice) : null;
  if (rawPrice && priceMinor === null) {
    return { message: "Enter a valid session value with no more than two decimal places.", status: "error" };
  }

  const { error } = await supabase.rpc("configure_organization_session_pricing", {
    session_currency: "USD",
    session_price_minor: priceMinor,
  });
  if (error) {
    return { message: "Session pricing could not be saved.", status: "error" };
  }

  revalidatePath("/owner/revenue");
  return { message: rawPrice ? "Default session value saved." : "Default session value removed.", status: "success" };
}

export async function saveCoachCompensationAction(
  coachId: string,
  _state: RevenueActionState,
  formData: FormData,
): Promise<RevenueActionState> {
  const { supabase } = await requireRole("owner");
  if (!UUID_PATTERN.test(coachId)) {
    return { message: "Choose an active Coach.", status: "error" };
  }

  const model = String(formData.get("model") ?? "");
  if (!new Set(["none", "hourly", "percentage"]).has(model)) {
    return { message: "Choose a valid compensation model.", status: "error" };
  }
  const hourlyRateMinor = model === "hourly"
    ? parseMoneyToMinor(String(formData.get("hourlyRate") ?? ""))
    : null;
  const commissionBasisPoints = model === "percentage"
    ? parsePercentToBasisPoints(String(formData.get("commissionPercentage") ?? ""))
    : null;
  if ((model === "hourly" && hourlyRateMinor === null) || (model === "percentage" && commissionBasisPoints === null)) {
    return { message: model === "hourly" ? "Enter a valid hourly amount." : "Enter a percentage from 0 to 100.", status: "error" };
  }

  const { error } = await supabase.rpc("configure_coach_compensation", {
    commission_basis_points: commissionBasisPoints,
    compensation_currency: "USD",
    compensation_model: model,
    hourly_rate_minor: hourlyRateMinor,
    target_coach_user_id: coachId,
  });
  if (error) {
    return { message: "Coach compensation could not be saved.", status: "error" };
  }

  revalidatePath("/owner/revenue");
  return { message: "Coach compensation saved for future or rescheduled sessions.", status: "success" };
}

export async function parseTrainingHistoryAction(
  _state: TrainingImportActionState,
  formData: FormData,
): Promise<TrainingImportActionState> {
  await requireRole("owner");
  const file = formData.get("trainingHistory");
  if (!(file instanceof File)) {
    return { message: "Choose a CSV or XLSX file.", status: "error" };
  }

  try {
    const data = await parseTrainingHistoryFile(file);
    return {
      data,
      message: `${data.rows.length} row${data.rows.length === 1 ? "" : "s"} ready to import.`,
      status: "success",
    };
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "That file could not be parsed.",
      status: "error",
    };
  }
}

export async function saveTrainingHistoryAction(
  _state: TrainingImportActionState,
  formData: FormData,
): Promise<TrainingImportActionState> {
  const { supabase } = await requireRole("owner");

  try {
    const data = parseSavedTrainingImport(String(formData.get("parsedImport") ?? ""));
    const { data: importedCount, error } = await supabase.rpc("import_training_library_rows", {
      source_filename: data.fileName,
      source_format: data.format,
      source_rows: data.rows,
    });
    if (error) throw error;

    revalidatePath("/owner/training-library");
    return {
      importedCount: Number(importedCount ?? data.rows.length),
      message: `${Number(importedCount ?? data.rows.length)} row${Number(importedCount ?? data.rows.length) === 1 ? "" : "s"} saved as draft training-library records.`,
      status: "success",
    };
  } catch (error) {
    return {
      message: error instanceof Error && error.message.includes("preview")
        ? error.message
        : "The import could not be saved. Nothing was partially imported.",
      status: "error",
    };
  }
}

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
