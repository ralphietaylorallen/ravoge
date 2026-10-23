import assert from "node:assert/strict";
import { test } from "node:test";
import { emptySpot, parseIntakeContext, validateInjurySpot } from "../../lib/intake-history.ts";

test("spots preserve independent history, unknown and zero pain",()=>{
  const a={...emptySpot(),categories:["surgery","long_term"] as const,pain:0,surgeryRepair:"Ligament repair",surgeryWhen:"Several years ago"};
  const b={...emptySpot(),region:"lower_back",categories:["recent_injury"],pain:null};
  const first=validateInjurySpot(a),second=validateInjurySpot(b);
  assert.notEqual(first.id,second.id); assert.equal(first.pain,0); assert.equal(second.pain,null);
  assert.deepEqual(first.categories,["surgery","long_term"]); assert.equal(first.clinicianInstructions,"unsure");
  second.notes="Changed"; assert.equal(first.notes,"");
});
test("invalid spot payloads cannot supply roles, organization or out-of-range scores",()=>{
  const s={...emptySpot(),categories:["recent_injury"]};
  for(const invalid of [{...s,organization_id:crypto.randomUUID()},{...s,pain:11},{...s,pain:-1},{...s,pain:2.5},{...s,side:"screen_left"},{...s,categories:[]},{...s,categories:["surgery","surgery"]},{...s,notes:"x".repeat(2001)}]) assert.throws(()=>validateInjurySpot(invalid));
});
test("unknown measurements remain null while explicit zero activity is retained",()=>{
  const f=new FormData(); f.set("recentWorkoutDays","0"); f.set("noDeadline","on"); f.set("targetDate","2027-01-01");
  const v=parseIntakeContext(f); assert.equal(v.currentWeightLb,null); assert.equal(v.sleepHours,null); assert.equal(v.recentWorkoutDays,0); assert.equal(v.targetDate,null);
  f.set("sleepHours","26"); assert.throws(()=>parseIntakeContext(f));
});
