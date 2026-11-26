import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailSender } from "@/lib/email-sender";

export async function sendWorkoutCompletionEmail(supabase: SupabaseClient, workoutId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  let sender: ReturnType<typeof getEmailSender>;
  try { sender = getEmailSender(); }
  catch { return "unavailable"; }
  if (!apiKey || !sender) return "unavailable";

  try {
    const { data: claim, error } = await supabase.rpc("claim_workout_completion_email", {
      target_workout_id: workoutId,
    }).maybeSingle<{ claim_id: string; recipient_email: string }>();
    if (error) return "unavailable";
    if (!claim) return "unclaimed";

    const url = `https://ravoge.com/client/workouts/${encodeURIComponent(workoutId)}`;
    let messageId: string | null = null;
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `ravoge-workout-complete/${workoutId}`,
        },
        body: JSON.stringify({
          from: sender.fromHeader,
          reply_to: sender.replyToAddress,
          to: [claim.recipient_email],
          subject: "Your Ravoge workout report is ready",
          text: `Your workout is recorded. Sign in to view your report: ${url}`,
          html: `<p>Your workout is recorded.</p><p><a href="${url}">Sign in to view your workout report</a></p>`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const result: unknown = await response.json();
        if (result && typeof result === "object" && "id" in result && typeof result.id === "string") {
          messageId = result.id;
        }
      }
    } catch {
      // Use the same provider key if a later attempt follows an ambiguous response.
    }

    const { error: finalizeError } = await supabase.rpc("finalize_workout_completion_email", {
      target_workout_id: workoutId,
      delivery_claim: claim.claim_id,
      delivery_status: messageId ? "sent" : "failed",
      message_id: messageId,
    });
    if (finalizeError || !messageId) return "unavailable";
    return "accepted";
  } catch {
    return "unavailable";
  }
}
