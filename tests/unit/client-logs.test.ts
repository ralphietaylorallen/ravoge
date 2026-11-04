import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {activityInput,activitySummary,dailyInput,logDate,recoveryInput,recoverySummary} from "../../lib/client-logs.ts";
function form(fields:Record<string,string>){const f=new FormData();for(const [k,v] of Object.entries(fields))f.set(k,v);return f;}
test("daily totals distinguish missing values from explicit zero and validate dates",()=>{
 assert.deepEqual(dailyInput(form({date:"2026-11-03",calories:"",protein_grams:""})),{date:"2026-11-03",calories:null,protein:null});
 assert.equal(dailyInput(form({date:"2026-11-03",calories:"0"})).calories,0);
 for(const date of ["2026-02-30","2026-13-01","not-a-date"])assert.throws(()=>logDate(date));
 for(const calories of ["-1","2.5","NaN","Infinity","30001"])assert.throws(()=>dailyInput(form({date:"2026-11-03",calories})));
});
test("activities require actual duration and preserve optional distance and effort",()=>{
 const f=form({date:"2026-11-03",activity_type:"walk",distance_unit:"mi",duration_minutes:"23.5"});
 assert.deepEqual(activityInput(f),{date:"2026-11-03",activity:"walk",unit:"mi",minutes:23.5,distance:null,effort:null});
 for(const minutes of ["0","","-1","1441"]){f.set("duration_minutes",minutes);assert.throws(()=>activityInput(f));}
 assert.match(activitySummary({id:"x",log_date:"2026-11-03",activity_type:"walk",duration_minutes:20,distance:null,distance_unit:"mi",effort:null}),/Distance: Not logged.*Effort: Not logged/);
});
test("recovery accepts actual minutes, optional F/C temperature and no generated duration",()=>{
 const f=form({date:"2026-11-03",recovery_type:"cold_plunge",temperature_unit:"F",duration_minutes:"2.5",water_temperature:"45"});
 assert.equal(recoveryInput(f).temperature,45);f.set("temperature_unit","C");f.set("water_temperature","8");assert.equal(recoveryInput(f).temperature,8);
 f.set("water_temperature","");assert.equal(recoveryInput(f).temperature,null);f.set("duration_minutes","");assert.throws(()=>recoveryInput(f));
 assert.match(recoverySummary({id:"x",log_date:"2026-11-03",workout_assignment_id:"y",recovery_type:"cold_plunge",duration_minutes:2,water_temperature:null,temperature_unit:"F"}),/Temperature: Not logged/);
});
test("logging QA refuses any hosted fixture target before touching data",()=>{
 const r=spawnSync(process.execPath,["scripts/verify-beta-ui.mjs"],{encoding:"utf8",env:{...process.env,SUPABASE_DB_TARGET:"hosted",RAVOGE_CLIENT_LOG_QA:"yes"}});
 assert.notEqual(r.status,0);assert.match(r.stderr,/Client log fixtures require isolated local Supabase/);assert.ok(!r.stdout.includes("Preparing"));
});
