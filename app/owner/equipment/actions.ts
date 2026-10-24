"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { EquipmentActionState } from "@/app/owner/actions";
import { parseWeightSizes, validateWeightRange } from "@/lib/equipment-weights";

export async function saveResourceAction(id: string | null, kind: "equipment" | "facility", _state: EquipmentActionState, form: FormData): Promise<EquipmentActionState> {
  const { supabase } = await requireRole("owner");
  const name = String(form.get("name") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const number = (key: string) => String(form.get(key) ?? "").trim() ? Number(form.get(key)) : null;
  const quantity = number("quantity"), length = number("length");
  if ((id && !/^[0-9a-f-]{36}$/i.test(id)) || name.length < 2 || name.length > 120 || notes.length > 1000
    || (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000))
    || (length !== null && (!Number.isFinite(length) || length <= 0 || length > 1000))) return { status: "error", message: "Check the name, quantity and usable length. Unknown quantities may be left blank." };
  try {
  const min = number("minWeightLb"), max = number("maxWeightLb");
  const sizes = parseWeightSizes(String(form.get("weightSizesLb") ?? ""));
  validateWeightRange(min, max, sizes);
  if (form.get("pairsConfirmed") === "yes" && (sizes?.length ?? 0) > 16) return { status: "error", message: "Use at most 16 confirmed paired plate sizes." };
  if (form.get("pairsConfirmed") === "yes" && (!sizes?.length || quantity !== null && quantity < sizes.length * 2)) return { status: "error", message: "List the plate sizes before confirming pairs. A known plate quantity must cover two of each size; leave quantity blank if unknown." };
  const { error } = await supabase.rpc("save_gym_resource_lb", {
    target_id: id, resource_kind: kind, resource_type: String(form.get("equipmentType") ?? ""), resource_name: name,
    resource_quantity: kind === "equipment" ? quantity : null, resource_length: kind === "facility" ? length : null,
    resource_unit: String(form.get("lengthUnit") ?? "yards"), available: id === null || form.get("available") === "yes", resource_notes: notes || null,
    minimum_lb: kind === "equipment" ? min : null, maximum_lb: kind === "equipment" ? max : null,
    exact_sizes_lb: kind === "equipment" ? sizes : null, matched_pairs: kind === "equipment" && form.get("pairsConfirmed") === "yes",
  }).abortSignal(AbortSignal.timeout(8000));
  if (error) return { status: "error", message: "Not saved. Check the fields and duplicate names. Existing inventory has not been removed." };
  revalidatePath("/owner/equipment");
  return { status: "success", message: id ? "Changes saved." : kind === "facility" ? "Training space saved." : "Added and available for new workouts." };
  } catch {
    return { status: "error", message: "Save not confirmed. Check the lb range and exact sizes. If the connection timed out, reload inventory before retrying an uncertain save." };
  }
}
