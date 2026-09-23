// Explicit, disposable hosted QA fixture. Never targets an existing gym or user.
import { randomBytes, randomUUID } from "node:crypto";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const project = "kqdnljafaiohlijbgfld";
if (process.env.RAVOGE_RUN_DISPOSABLE_QA !== "yes" || readFileSync("supabase/.temp/project-ref","utf8").trim() !== project) throw new Error("Explicit Ravoge QA opt-in and verified link required.");
const cli = "npx --yes supabase@2.117.0";
const env = {...process.env};
const keys = JSON.parse(execSync(`${cli} projects api-keys --project-ref ${project} -o json --agent no`,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}));
env.NEXT_PUBLIC_SUPABASE_URL = `https://${project}.supabase.co`;
env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = keys.find(key=>key.type==="publishable")?.api_key;
if(!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) throw new Error("Ravoge publishable key missing.");
const org=randomUUID();
const roles=["owner","coach","client","pool"];
const users=roles.map(role=>({role,id:randomUUID(),email:`qa-pr22-${role}-${randomUUID()}@example.test`,password:randomBytes(24).toString("hex")}));
const owner=users[0],coach=users[1];
for(const user of users) { env[`PR22_${user.role.toUpperCase()}_EMAIL`]=user.email; env[`PR22_${user.role.toUpperCase()}_PASSWORD`]=user.password; env[`PR22_${user.role.toUpperCase()}_ID`]=user.id; }
env.PR22_ORGANIZATION_ID=org;
mkdirSync(".temp",{recursive:true});
writeFileSync(".temp/pr22-qa-state.json",JSON.stringify({organizationId:org,users:users.map(({id,email,role})=>({id,email,role}))}));
function sql(query) {
  writeFileSync(".temp/pr22-qa.sql",query);
  try { return execSync(`${cli} db query --linked --file .temp/pr22-qa.sql --agent no`,{encoding:"utf8",stdio:["ignore","pipe","pipe"]}); }
  catch(error) { throw new Error(`QA database operation failed: ${String(error.stderr??"").replaceAll(/encrypted_password.*$/gm,"[redacted]")}`); }
  finally { rmSync(".temp/pr22-qa.sql",{force:true}); }
}
let server;
let created=false;
try {
  sql(`begin;
    ${users.map(user=>`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change,email_change_token_new,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('${user.id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${user.email}',crypt('${user.password}',gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{"full_name":"QA ${user.role === "pool" ? "Pool Client" : user.role.charAt(0).toUpperCase()+user.role.slice(1)}"}',now(),now());
    insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at) values(gen_random_uuid(),'${user.id}','${user.id}','{"sub":"${user.id}","email":"${user.email}","email_verified":true}','email',now(),now(),now());`).join("\n")}
    insert into public.organizations(id,name,timezone) values('${org}','Ravoge PR22 Verification','UTC');
    ${users.map(user=>`insert into public.organization_memberships(organization_id,user_id,role) values('${org}','${user.id}','${user.role==="pool"?"client":user.role}');`).join("\n")}
    insert into public.organization_hours(organization_id,day_of_week,is_closed,opens_at,closes_at,updated_by) select '${org}',d,false,'06:00','22:00','${owner.id}' from generate_series(0,6) d;
    insert into public.organization_session_settings(organization_id,default_duration_minutes,permitted_durations,slot_increment_minutes,minimum_notice_minutes,maximum_advance_days,cancellation_cutoff_minutes,updated_by) values('${org}',60,array[30,45,60,90]::smallint[],30,0,30,0,'${owner.id}');
    insert into public.coach_availability(organization_id,coach_user_id,day_of_week,starts_at,ends_at) select '${org}','${coach.id}',d,'07:00','21:00' from generate_series(0,6) d;
    commit;`);
  created=true;
  if(!env.PLAYWRIGHT_BASE_URL) {
    env.PLAYWRIGHT_BASE_URL="http://localhost:3100";
    server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--port","3100"],{env,stdio:["ignore","ignore","pipe"],windowsHide:true});
    server.stderr.on("data",chunk=>process.stderr.write(chunk));
    for(let attempt=0;attempt<60;attempt++){try{if((await fetch(env.PLAYWRIGHT_BASE_URL)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  }
  execSync("npx playwright test tests/operations-ui.spec.ts --project=desktop --workers=1",{env,stdio:"inherit"});
} finally {
  server?.kill();
  if(created) {
    // Remove uploaded QA assets through the same user-scoped Storage API.
    for(const user of users.filter(user=>["coach","client"].includes(user.role))) {
      const client=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      const {error}=await client.auth.signInWithPassword({email:user.email,password:user.password});
      if(!error){const folder=`${org}/${user.id}/avatar`;const {data}=await client.storage.from("profile-images").list(folder);if(data?.length)await client.storage.from("profile-images").remove(data.map(file=>`${folder}/${file.name}`));await client.auth.signOut();}
    }
    // This session-only fixture cleanup bypasses the primary-owner deletion guard
    // solely for the newly generated QA membership. Application tests never bypass RLS.
    sql(`begin;
      do $$ begin if not exists(select 1 from public.organizations where id='${org}' and name='Ravoge PR22 Verification') then raise exception 'QA cleanup scope mismatch'; end if; end $$;
      delete from public.workout_assignments where organization_id='${org}';
      delete from public.client_states where organization_id='${org}';
      delete from public.client_body_composition_assessments where organization_id='${org}';
      delete from public.client_intakes where organization_id='${org}';
      delete from public.bookings where organization_id='${org}';
      set local session_replication_role=replica;
      delete from public.organization_memberships where organization_id='${org}' and user_id='${owner.id}';
      set local session_replication_role=origin;
      delete from public.organizations where id='${org}' and name='Ravoge PR22 Verification';
      delete from auth.users where id in (${users.map(user=>`'${user.id}'`).join(",")}) and email like 'qa-pr22-%@example.test';
      commit;`);
    console.log("Disposable QA gym, identities, sessions, and uploaded photos removed.");
    rmSync(".temp/pr22-qa-state.json",{force:true});
  }
}
