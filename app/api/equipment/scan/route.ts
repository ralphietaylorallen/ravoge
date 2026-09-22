import { NextResponse } from "next/server";

import { getActiveMembership, getVerifiedUser } from "@/lib/auth";
import { getEquipmentScanConfiguration } from "@/lib/equipment-scan/config";
import { prepareEquipmentImage, validateImageFileSet } from "@/lib/equipment-scan/image";
import {
  analyzeEquipmentPhotos,
  EquipmentScanProviderError,
  getEquipmentVisionModel,
} from "@/lib/equipment-scan/openai";
import {
  findDuplicateMatches,
  type ExistingEquipmentMatch,
} from "@/lib/equipment-scan/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = 5_500_000;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const { supabase, userId } = await getVerifiedUser();
  if (!userId) return jsonError("Sign in as a gym Owner to scan equipment.", 401);

  const membership = await getActiveMembership(userId, supabase);
  if (!membership || membership.role !== "owner") {
    return jsonError("Only an active gym Owner can scan equipment.", 403);
  }
  const configuration = getEquipmentScanConfiguration();
  if (!configuration.enabled) {
    return jsonError("Equipment photo scanning is currently unavailable. Manual entry still works.", 503);
  }
  if (!configuration.keyConfigured) {
    return jsonError("Equipment photo analysis is not configured. Manual entry still works.", 503);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_MULTIPART_BYTES) return jsonError("The processed photos must total 5 MB or less.", 413);

  let files: File[];
  try {
    const formData = await request.formData();
    files = formData.getAll("photos").filter((value): value is File => value instanceof File);
    validateImageFileSet(files);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Choose 1–5 valid photos.", 400);
  }

  let prepared;
  try {
    prepared = await Promise.all(files.map(prepareEquipmentImage));
    if (prepared.reduce((total, image) => total + image.size, 0) > 5_000_000) {
      return jsonError("The processed photos must total 5 MB or less.", 413);
    }
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "A photo could not be processed.", 400);
  }

  const model = getEquipmentVisionModel();
  const { data: reservations, error: reservationError } = await supabase.rpc("reserve_equipment_scan", {
    requested_image_count: prepared.length,
    requested_model_snapshot: model,
  });
  const reservation = Array.isArray(reservations) ? reservations[0] : null;
  if (reservationError || !reservation?.scan_request_id || !reservation?.organization_id) {
    const limited = reservationError?.message?.includes("daily limit");
    return jsonError(
      limited
        ? "This gym has used its 10 photo scans for the rolling 24-hour period. Manual entry still works."
        : "The scan could not be authorized. Manual entry still works.",
      limited ? 429 : 403,
    );
  }

  const scanRequestId = String(reservation.scan_request_id);
  const organizationId = String(reservation.organization_id);
  const startedAt = Date.now();

  try {
    const [{ data: existingRows, error: existingError }, analysis] = await Promise.all([
      supabase
        .from("organization_equipment")
        .select("id,equipment_type,name,quantity")
        .eq("organization_id", organizationId),
      analyzeEquipmentPhotos(prepared.map((image) => image.dataUrl), undefined, request.signal),
    ]);
    if (existingError) throw new Error("existing_equipment_unavailable");

    const existing: ExistingEquipmentMatch[] = (existingRows ?? []).map((row) => ({
      equipmentType: row.equipment_type,
      id: row.id,
      name: row.name,
      quantity: row.quantity,
    }));
    const candidates = analysis.candidates.map((candidate) => ({
      ...candidate,
      duplicateMatches: findDuplicateMatches(candidate, existing),
      id: crypto.randomUUID(),
    }));
    const latencyMs = Date.now() - startedAt;

    const { error: completionError } = await supabase.rpc("complete_equipment_scan", {
      final_candidate_count: candidates.length,
      final_error_category: null,
      final_input_tokens: analysis.inputTokens,
      final_latency_ms: latencyMs,
      final_output_tokens: analysis.outputTokens,
      final_provider_request_id: analysis.providerRequestId,
      final_status: "succeeded",
      target_scan_request_id: scanRequestId,
    });
    if (completionError) throw new Error("scan_metadata_unavailable");

    return NextResponse.json({
      candidates,
      scanRequestId,
      usage: { inputTokens: analysis.inputTokens, outputTokens: analysis.outputTokens },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const providerError = error instanceof EquipmentScanProviderError ? error : null;
    const errorCategory = providerError?.category === "not_configured" ? "upstream_error" : (providerError?.category ?? "upstream_error");
    await supabase.rpc("complete_equipment_scan", {
      final_candidate_count: 0,
      final_error_category: errorCategory,
      final_input_tokens: null,
      final_latency_ms: Math.min(Date.now() - startedAt, 300000),
      final_output_tokens: null,
      final_provider_request_id: null,
      final_status: "failed",
      target_scan_request_id: scanRequestId,
    });

    const status = errorCategory === "upstream_rate_limit" ? 429
      : errorCategory === "timeout" ? 504
        : errorCategory === "model_unavailable" ? 503
          : 502;
    return jsonError(
      providerError?.message ?? "Photo analysis is temporarily unavailable. Manual equipment entry still works.",
      status,
    );
  }
}
