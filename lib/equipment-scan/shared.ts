export const EQUIPMENT_TYPES = [
  "barbell",
  "plates",
  "squat_rack",
  "bench",
  "dumbbells",
  "kettlebells",
  "cable_machine",
  "selectorized_machine",
  "cardio_equipment",
  "sled",
  "bands",
  "medicine_balls",
  "specialty_equipment",
  "other",
] as const;

export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export type ExistingEquipmentMatch = {
  equipmentType: EquipmentType;
  id: string;
  name: string;
  quantity: number | null;
};

export type EquipmentScanCandidate = {
  confidence: number;
  duplicateMatches: ExistingEquipmentMatch[];
  equipmentType: EquipmentType;
  evidence: string;
  id: string;
  name: string;
  quantity: number | null;
  quantityIsEstimate: boolean;
  reviewNote: string | null;
};

export type EquipmentScanDecision = {
  action: "add" | "skip" | "update";
  equipmentType: EquipmentType;
  name: string;
  notes: string | null;
  quantity: number | null;
  targetEquipmentId?: string;
};

const equipmentTypeSet = new Set<string>(EQUIPMENT_TYPES);

export function isEquipmentType(value: unknown): value is EquipmentType {
  return typeof value === "string" && equipmentTypeSet.has(value);
}

export function normalizeEquipmentIdentity(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(sets?|pairs?|the|gym)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findDuplicateMatches(
  candidate: Pick<EquipmentScanCandidate, "equipmentType" | "name">,
  existing: ExistingEquipmentMatch[],
) {
  const candidateName = normalizeEquipmentIdentity(candidate.name);
  return existing.filter((item) => {
    const existingName = normalizeEquipmentIdentity(item.name);
    if (candidateName && existingName && candidateName === existingName) return true;
    return item.equipmentType === candidate.equipmentType
      && candidateName.length >= 4
      && existingName.length >= 4
      && (candidateName.includes(existingName) || existingName.includes(candidateName));
  });
}

export function validateScanDecisions(value: unknown): EquipmentScanDecision[] {
  if (!Array.isArray(value) || value.length > 40) {
    throw new Error("Choose no more than 40 equipment results.");
  }

  return value.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("An equipment result is invalid.");
    const item = raw as Record<string, unknown>;
    if (!new Set(["add", "skip", "update"]).has(String(item.action))) {
      throw new Error("Choose add, update, or skip for every result.");
    }
    const action = item.action as EquipmentScanDecision["action"];
    const equipmentType = item.equipmentType;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const notes = typeof item.notes === "string" && item.notes.trim() ? item.notes.trim() : null;
    const quantity = item.quantity === null || item.quantity === "" ? null : Number(item.quantity);
    const targetEquipmentId = typeof item.targetEquipmentId === "string" ? item.targetEquipmentId : undefined;

    if (action !== "skip") {
      if (!isEquipmentType(equipmentType) || name.length < 2 || name.length > 120) {
        throw new Error("Check each equipment name and type.");
      }
      if (quantity !== null && (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)) {
        throw new Error("Equipment quantities must be whole numbers from 1 to 10,000.");
      }
      if (notes && notes.length > 1000) throw new Error("Keep equipment notes under 1,000 characters.");
      if (action === "update" && !/^[0-9a-f-]{36}$/i.test(targetEquipmentId ?? "")) {
        throw new Error("Choose the existing equipment to update.");
      }
    }

    return {
      action,
      equipmentType: isEquipmentType(equipmentType) ? equipmentType : "other",
      name: name || "Skipped item",
      notes,
      quantity,
      ...(targetEquipmentId ? { targetEquipmentId } : {}),
    };
  });
}
