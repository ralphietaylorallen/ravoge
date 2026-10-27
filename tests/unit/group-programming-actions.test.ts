import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ModuleKind, transpileModule } from "typescript";
import { groupWeek, validGroupDate, type GroupResult } from "../../lib/group-programming.ts";

function harness(allowed = true) {
  const calls: { name: string; args?: Record<string,unknown> }[] = [];
  const supabase = { rpc(name: string, args?: Record<string,unknown>) {
    calls.push({name,args});
    if (name === "can_manage_group_programming") return Promise.resolve({data:allowed,error:null});
    return { abortSignal: async () => ({ data: args?.target_date === "2026-11-03" ? null : {programming_date:args?.target_date}, error: args?.target_date === "2026-11-03" ? { code:"40001" } : null }) };
  }};
  const dependencies: Record<string,unknown> = { "next/cache":{revalidatePath:()=>{}}, "@/lib/group-programming":{groupWeek,validGroupDate}, "@/lib/auth":{requireRole:async()=>({supabase,membership:{organization_id:"session-gym"}})} };
  const source=transpileModule(readFileSync(new URL("../../app/group-programming-actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,(...args:unknown[])=>Promise<GroupResult>>={};
  new Function("require","exports",source)((name:string)=>{if(!(name in dependencies))throw new Error(`Unexpected dependency ${name}`);return dependencies[name];},exports);
  return {calls,publish:exports.publishGroupDatesAction,save:exports.saveGroupDraftAction};
}
test("publishing one failed date continues other dates and cannot choose a gym",async()=>{
  const h=harness(); const result=await h.publish("coach",[{date:"2026-11-02",revision:1},{date:"2026-11-03",revision:2},{date:"2026-11-04",revision:3}]);
  assert.equal(result.status,"error"); assert.equal(result.programs?.length,2); assert.match(result.message,/2026-11-03/);
  const calls=h.calls.filter(c=>c.name==="publish_group_program");assert.equal(calls.length,3);
  assert.deepEqual(calls[2].args,{target_date:"2026-11-04",expected_revision:3,retry_sync:false});
});
test("denied permission and malformed dates are rejected before mutations",async()=>{
  const denied=harness(false);assert.equal((await denied.publish("coach",[{date:"2026-11-02",revision:1}])).status,"error");assert.equal(denied.calls.length,1);
  const h=harness();assert.equal((await h.publish("owner",[{date:"2026-11-08",revision:1}])).status,"error");assert.equal(h.calls.length,1);
});
test("saving passes raw text and revision only, while retries never republish drafts implicitly",async()=>{
  const h=harness();const raw="  EMOM\n\n8 / side\t55 lb  ";
  assert.equal((await h.save("coach","2026-11-02",raw,0)).status,"success");
  assert.deepEqual(h.calls[1].args,{target_date:"2026-11-02",workout_text:raw,expected_revision:0});
  await h.publish("coach",[{date:"2026-11-02",revision:1}],true);
  assert.deepEqual(h.calls.at(-1)?.args,{target_date:"2026-11-02",expected_revision:1,retry_sync:true});
});
