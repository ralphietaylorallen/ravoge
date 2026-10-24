import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {transpileModule,ModuleKind} from "typescript";
import {parseWeightSizes,validateWeightRange} from "../../lib/equipment-weights.ts";

// Exercise the actual Server Action with only authentication, persistence and
// cache boundaries replaced. Never writes equipment into a real gym.
function harness(error:unknown=null){
  const calls:{name:string;args:Record<string,unknown>}[]=[],paths:string[]=[],roles:string[]=[];
  const exports:Record<string, (...args:unknown[])=>Promise<{status:string}>>={};
  const source=transpileModule(readFileSync(new URL("../../app/owner/equipment/actions.ts",import.meta.url),"utf8"),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
  const require=(name:string)=>{
    if(name==="next/cache")return {revalidatePath:(path:string)=>paths.push(path)};
    if(name==="@/lib/equipment-weights")return {parseWeightSizes,validateWeightRange};
    if(name==="@/lib/auth")return {requireRole:async(role:string)=>{roles.push(role);return {supabase:{rpc:(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {abortSignal:async()=>({error})};}}};}};
    throw new Error(`Unexpected dependency ${name}`);
  };
  new Function("require","exports",source)(require,exports);
  const form=()=>{const f=new FormData();f.set("name","Test dumbbells");f.set("equipmentType","dumbbells");return f;};
  return {calls,paths,roles,form,save:exports.saveResourceAction};
}
test("new equipment is immediately available even if the optional availability field is absent or forged false",async()=>{
  for(const available of [null,"no"]){
    const h=harness(),f=h.form();if(available)f.set("available",available);
    const result=await h.save(null,"equipment",{},f);
    assert.equal(result.status,"success");assert.deepEqual(h.roles,["owner"]);
    assert.equal(h.calls[0].name,"save_gym_resource_lb");assert.equal(h.calls[0].args.available,true);
    assert.equal(h.calls[0].args.resource_quantity,null);assert.equal(h.calls[0].args.minimum_lb,null);
    assert.deepEqual(h.paths,["/owner/equipment"]);
  }
});
test("editing can remove equipment from future workouts and save failures never report success",async()=>{
  const h=harness(),f=h.form();
  assert.equal((await h.save("11111111-1111-4111-8111-111111111111","equipment",{},f)).status,"success");
  assert.equal(h.calls[0].args.available,false);
  const failed=harness({message:"write rejected"});
  assert.equal((await failed.save(null,"equipment",{},failed.form())).status,"error");assert.deepEqual(failed.paths,[]);
});
test("invalid equipment weights fail before persistence and unknown weights stay unknown",async()=>{
  const h=harness(),f=h.form();f.set("minWeightLb","50");f.set("maxWeightLb","5");
  assert.equal((await h.save(null,"equipment",{},f)).status,"error");assert.equal(h.calls.length,0);
});
