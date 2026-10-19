import { requireRole } from "@/lib/auth";
import { TrainingReadinessReview } from "./training-readiness";

export async function TrainingReadinessHistory({ clientId }: { clientId: string }) {
  const { supabase, membership } = await requireRole("coach");
  const { data } = await supabase.from("training_readiness_checkins").select("id,answers,pain_note,recommendation,coach_decision,coach_response,created_at").eq("organization_id", membership.organization_id).eq("client_user_id", clientId).order("created_at", { ascending: false }).limit(3);
  return <>{data?.map(row => <TrainingReadinessReview clientId={clientId} row={row} key={row.id}/>)}</>;
}
