"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { EquipmentActionState } from "@/app/owner/actions";

export async function saveResourceAction(id: string | null, kind: "equipment" | "facility", _state: EquipmentActionState, form: FormData): Promise<EquipmentActionState> {
  const { supabase } = await requireRole("owner");
  const name = String(form.get("name") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const number = (key: string) => String(form.get(key) ?? "").trim() ? Number(form.get(key)) : null;
  const quantity = number("quantity"), length = number("length");
  if ((id && !/^[0-9a-f-]{36}$/i.test(id)) || name.length < 2 || name.length > 120 || notes.length > 1000
    || (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000))
    || (length !== null && (!Number.isFinite(length) || length <= 0 || length > 1000))) return { status: "error", message: "Check the name, quantity and usable length. Unknown quantities may be left blank." };
  const { error } = await supabase.rpc("save_gym_resource", {
    target_id: id, resource_kind: kind, resource_type: String(form.get("equipmentType") ?? ""), resource_name: name,
    resource_quantity: kind === "equipment" ? quantity : null, resource_length: kind === "facility" ? length : null,
    resource_unit: String(form.get("lengthUnit") ?? "yards"), available: form.get("available") === "yes", resource_notes: notes || null,
  });
  if (error) return { status: "error", message: "Not saved. Check the fields and duplicate names. Existing inventory has not been removed." };
  revalidatePath("/owner/equipment");
  return { status: "success", message: "Saved. Generation uses only available resources; turf also needs a usable length." };
}
