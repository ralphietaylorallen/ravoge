import { NextResponse } from "next/server";
import { getVerifiedUser, getActiveMembership } from "@/lib/auth";
import { ownerDemoInput } from "@/lib/owner-demo-generation";
import { generateIntelligentWorkout } from "@/lib/workout-intelligence";
import type { DemoData } from "@/lib/demo-state";

export const maxDuration=60;
const recent=new Map<string,number[]>();
export async function POST(request:Request) {
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return NextResponse.json({message:"Open Demo from your Owner account."},{status:403});
  const {supabase,userId}=await getVerifiedUser();
  if(!userId)return NextResponse.json({message:"Sign in to Owner access."},{status:401});
  const membership=await getActiveMembership(userId,supabase);
  if(membership?.role!=="owner")return NextResponse.json({message:"Owner access is required."},{status:403});
  const now=Date.now();for(const [k,v]of recent)if(!v.some(t=>now-t<60000))recent.delete(k);
  const times=(recent.get(userId)??[]).filter(t=>now-t<60000);
  if(times.length>=3)return NextResponse.json({message:"Wait a minute before another AI generation. Your demo remains available."},{status:429});
  try {
    const text=await request.text();if(text.length>120000)return NextResponse.json({message:"Reset the demo history before generating again."},{status:413});
    const data=JSON.parse(text) as DemoData;
    const {input,assumptions}=await ownerDemoInput(supabase,membership.organization_id,data);
    recent.set(userId,[...times,now]);
    const result=await generateIntelligentWorkout(input);
    if(!result.workout)return NextResponse.json({message:("blocker" in result&&result.blocker)||"AI generation could not complete. Your test assessment is preserved; retry or use the sample workout to explore buttons."},{status:409});
    return NextResponse.json({workout:result.workout,assumptions,model:result.model,sources:("evidence" in result?result.evidence?.sources:[])?.map(s=>({title:s.title,url:s.url}))??[],percentage:result.workout.provenanceAudit?.gymPercentage??null},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({message:"Demo generation could not complete. Check the entered ranges or reset demo data and try again. No client data was changed."},{status:400});}
}
