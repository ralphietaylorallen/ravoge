import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { getEquipmentScanConfiguration } from "@/lib/equipment-scan/config";
import { validateScanDecisions } from "@/lib/equipment-scan/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return jsonError("Sign in as a gym Owner to save equipment.", 401);
  const membership = await getActiveMembership(userId, supabase);
  if (!membership || membership.role !== "owner") {
    return jsonError("Only an active gym Owner can save scanned equipment.", 403);
  }
  if (!getEquipmentScanConfiguration().enabled) {
    return jsonError("Equipment photo scanning is currently unavailable. Manual entry still works.", 503);
  }
  if (Number(request.headers.get("content-length") ?? 0) > 100_000) {
    return jsonError("The equipment review is too large.", 413);
  }

  let scanRequestId: string;
  let decisions;
  try {
    const body = await request.json() as { decisions?: unknown; scanRequestId?: unknown };
    scanRequestId = typeof body.scanRequestId === "string" ? body.scanRequestId : "";
    if (!/^[0-9a-f-]{36}$/i.test(scanRequestId)) throw new Error("The scan session is invalid.");
    decisions = validateScanDecisions(body.decisions);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "The equipment review is invalid.", 400);
  }

  const { data, error } = await supabase.rpc("save_equipment_scan_results", {
    approved_items: decisions,
    target_scan_request_id: scanRequestId,
  });
  if (error) {
    const duplicate = error.message.includes("organization_equipment_name_idx");
    return jsonError(
      duplicate
        ? "One equipment name already exists. Choose Update or rename it; nothing was partially saved."
        : "The reviewed equipment could not be saved. Nothing was partially saved.",
      409,
    );
  }

  revalidatePath("/owner/equipment");
  return NextResponse.json({ result: data }, { headers: { "Cache-Control": "no-store" } });
}
