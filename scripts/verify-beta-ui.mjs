import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, execSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const project = "kqdnljafaiohlijbgfld";
const local = process.env.SUPABASE_DB_TARGET === "local";
if (process.env.RAVOGE_CLIENT_LOG_QA === "yes" && !local) throw new Error("Client log fixtures require isolated local Supabase; hosted targets are forbidden.");
if (process.env.RAVOGE_ANNOUNCEMENTS_QA === "yes" && !local) throw new Error("Announcement fixtures require isolated local Supabase; hosted targets are forbidden.");
if (process.env.RAVOGE_MEMBER_REMOVE_QA === "yes" && !local) throw new Error("Member removal fixtures require isolated local Supabase; hosted targets are forbidden.");
if (process.env.RAVOGE_INVITATION_CLEAR_QA === "yes" && !local) throw new Error("Invitation clearing fixtures require isolated local Supabase; hosted targets are forbidden.");
if (process.env.RAVOGE_GROUP_QA === "yes" && !local) throw new Error("Group browser fixtures require isolated local Supabase; hosted targets are forbidden.");
if (process.env.RAVOGE_BETA_QA !== "yes" || (!local && readFileSync("supabase/.temp/project-ref", "utf8").trim() !== project)) throw new Error("Explicit isolated Ravoge beta test opt-in required");
const localProject = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (local && (localProject !== "ravoge" || process.env.PLAYWRIGHT_BASE_URL)) throw new Error("Local QA must use the Ravoge Docker stack and its own loopback app server.");
const cli = "npx --yes supabase@2.117.0";
const connection = JSON.parse(execSync(local ? `${cli} status -o json --agent no` : `${cli} projects api-keys --project-ref ${project} -o json --agent no`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }));
const key = local ? connection.PUBLISHABLE_KEY : connection.find(row => row.type === "publishable")?.api_key;
const apiUrl = local ? connection.API_URL : `https://${project}.supabase.co`;
if (local && (!apiUrl || !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname))) throw new Error("Local QA refuses a hosted Supabase endpoint.");
if (!key?.startsWith("sb_publishable_")) throw new Error("Ravoge publishable key unavailable");
const org = randomUUID(), run = randomUUID(), prefix = `qa-beta-${run}`;
const password = randomBytes(24).toString("hex");
const roles = ["owner", "invited_coach", "existing_client", "coach", "coach", "coach", "coach"];
if (process.env.RAVOGE_QUALITY_QA === "yes") roles.push("client", "client", "client");
if (process.env.RAVOGE_GROUP_QA === "yes") roles.push("client");
if (process.env.RAVOGE_INVITATION_CLEAR_QA === "yes") roles.push("client");
if (process.env.RAVOGE_MEMBER_REMOVE_QA === "yes") roles.push("client");
if (process.env.RAVOGE_ANNOUNCEMENTS_QA === "yes") roles.push("client");
if (process.env.RAVOGE_CLIENT_LOG_QA === "yes") roles.push("client");
const users = roles.map((role, index) => ({ role, id: randomUUID(), email: `${prefix}-${index}@example.test`, password, name: `Beta QA ${role} ${index}` }));
const newCoachEmail = `${prefix}-new-coach@example.test`, newClientEmail = `${prefix}-new-client@example.test`, expiredInviteEmail = `${prefix}-expired@example.test`;
const logWorkout = randomUUID(), logDate = new Date(Date.now()-2*86400000).toISOString().slice(0,10);
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key,
  BETA_QA_LOG_WORKOUT:logWorkout, BETA_QA_LOG_DATE:logDate,
  BETA_QA_USERS: JSON.stringify(users), BETA_QA_PASSWORD: password, BETA_QA_NEW_COACH_EMAIL: newCoachEmail, BETA_QA_NEW_CLIENT_EMAIL: newClientEmail, BETA_QA_EXPIRED_INVITE_EMAIL: expiredInviteEmail };
mkdirSync(".temp", { recursive: true });
writeFileSync(".temp/beta-qa-state.json", JSON.stringify({ organizationId: org, prefix, userIds: users.map(user => user.id) }));
function sql(query) {
  const file = ".temp/beta-qa.sql";
  writeFileSync(file, query);
  try {
    if (local) return execFileSync("docker", ["exec", "-i", `supabase_db_${localProject}`, "psql", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=on"], { input: `set search_path=public,extensions;\n${query}`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], windowsHide: true, timeout: 60_000 });
    return execSync(`${cli} db query --linked --file ${file} --agent no`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, timeout: 60_000 });
  }
  catch (error) { throw new Error(`Isolated beta fixture database operation ${error.signal ? "timed out or was interrupted" : "failed"}; SQL output suppressed to protect runtime credentials.`); }
  finally { rmSync(file, { force: true }); }
}
let server, created = false;
try {
  console.log("Preparing this run’s isolated Ravoge QA identities and organization.");
  sql(`begin;
    ${users.map(user => `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change,email_change_token_new,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values('${user.id}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','${user.email}',crypt('${password}',gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}',jsonb_build_object('full_name','${user.name}'),now(),now());
      insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at) values(gen_random_uuid(),'${user.id}','${user.id}',jsonb_build_object('sub','${user.id}','email','${user.email}','email_verified',true),'email',now(),now());`).join("\n")}
    insert into public.organizations(id,name,timezone) values('${org}','Ravoge Beta Verification ${run}','UTC');
    update public.organization_preworkout_questions set question_text='QA session question '||position where organization_id='${org}';
    ${users.filter(user => ["owner", "coach", "client"].includes(user.role)).map(user => `insert into public.organization_memberships(organization_id,user_id,role) values('${org}','${user.id}','${user.role}');`).join("\n")}
    ${users.filter(user => user.role === "client").map(user => `insert into public.coach_client_assignments(organization_id,coach_user_id,client_user_id) values('${org}','${users[3].id}','${user.id}');`).join("\n")}
    ${users.filter(user => ["invited_coach", "existing_client"].includes(user.role)).map(user => `select set_config('request.jwt.claim.sub','${user.id}',true); select public.register_unaffiliated_account_type('${user.role === "invited_coach" ? "coach" : "client"}');`).join("\n")}
    ${env.RAVOGE_INVITATION_CLEAR_QA === "yes" ? `insert into public.organization_invitations(organization_id,invited_by,email,role,token_hash,created_at,expires_at) values('${org}','${users[0].id}','${expiredInviteEmail}','client',encode(extensions.digest('${randomBytes(32).toString("hex")}','sha256'),'hex'),now()-interval '2 days',now()-interval '1 day');` : ""}
    ${env.RAVOGE_MEMBER_REMOVE_QA === "yes" ? `insert into public.bookings(organization_id,coach_user_id,client_user_id,starts_at,ends_at,timezone,blocked_span,booked_by) values('${org}','${users[3].id}','${users.at(-1).id}',now()+interval '3 days',now()+interval '3 days 1 hour','UTC',tstzrange(now(),now()+interval '1 hour'),'${users[0].id}');` : ""}
    ${env.RAVOGE_CLIENT_LOG_QA === "yes" ? `insert into public.workout_assignments(id,organization_id,coach_user_id,client_user_id,title,scheduled_date,status,completed_at) values('${logWorkout}','${org}','${users[3].id}','${users.at(-1).id}','Completed logging QA session','${logDate}','completed','${logDate}T23:30:00Z');
    insert into public.workout_exercises(workout_assignment_id,exercise_name,sets,reps,load,load_unit,sort_order,completed_at) values('${logWorkout}','Recorded QA movement',1,8,25,'lb',0,'${logDate}T23:30:00Z');` : ""}
    commit;`);
  created = true;
  console.log("Isolated fixtures ready. Starting authenticated browser checks.");
  if (!env.PLAYWRIGHT_BASE_URL) {
    env.PLAYWRIGHT_BASE_URL = "http://localhost:3100";
    env.RAVOGE_ENROLLMENT_TOKEN_KEY = randomBytes(32).toString("hex");
    delete env.RESEND_API_KEY; delete env.RAVOGE_EMAIL_FROM;
    delete env.OPENAI_API_KEY; // Automated local browser QA uses the tested fallback, never a paid call.
    if (local) execSync("npm run build", { env, stdio: "inherit", windowsHide: true });
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", "3100"], { env, stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    server.stderr.on("data", chunk => process.stderr.write(chunk));
    for (let attempt = 0; attempt < 60; attempt++) { try { if ((await fetch(env.PLAYWRIGHT_BASE_URL)).ok) break; } catch {} await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  execSync(`npx playwright test ${env.RAVOGE_CLIENT_LOG_QA === "yes" ? "tests/client-logs.spec.ts" : env.RAVOGE_ANNOUNCEMENTS_QA === "yes" ? "tests/announcements.spec.ts" : env.RAVOGE_MEMBER_REMOVE_QA === "yes" ? "tests/member-removal.spec.ts" : env.RAVOGE_INVITATION_CLEAR_QA === "yes" ? "tests/invitation-clearing.spec.ts" : env.RAVOGE_GROUP_QA === "yes" ? "tests/group-programming.spec.ts" : env.RAVOGE_INVITATION_QA === "yes" ? "tests/coach-invitation.spec.ts" : env.RAVOGE_REFERENCE_QA === "yes" ? "tests/gym-references.spec.ts" : env.RAVOGE_LOAD_QA === "yes" ? "tests/starting-loads.spec.ts" : env.RAVOGE_QUALITY_QA === "yes" ? "tests/workout-quality.spec.ts" : "tests/beta-readiness.spec.ts"} --project=desktop --workers=1`, { env, stdio: "inherit", windowsHide: true });
} finally {
  server?.kill();
  if (created) {
    // Remove only this run's synthetic images through ordinary authenticated
    // Storage API calls before deleting the disposable gym/identities.
    for (const email of [newClientEmail, newCoachEmail]) {
      const scoped = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await scoped.auth.signInWithPassword({ email, password });
      if (!error && data.user) {
        const folder = `${org}/${data.user.id}/avatar`;
        const { data: profile } = await scoped.from("profiles").select("avatar_path").eq("id", data.user.id).single();
        if (profile?.avatar_path) await scoped.rpc("set_managed_profile_photo", { target_user_id: data.user.id, target_organization_id: org, new_asset_path: null, expected_asset_path: profile.avatar_path });
        const { data: objects } = await scoped.storage.from("profile-images").list(folder);
        if (objects?.length) {
          const removed = await scoped.storage.from("profile-images").remove(objects.map((object) => `${folder}/${object.name}`));
          if (removed.error) throw new Error("Synthetic QA photo cleanup failed; scope retained in the ignored QA state file.");
        }
        await scoped.auth.signOut();
      }
    }
    // Only this run's newly created test data is eligible for cleanup. Existing
    // organizations, users, passwords and imports are never addressed.
    sql(`begin;
      do $$ begin if not exists(select 1 from public.organizations where id='${org}' and name='Ravoge Beta Verification ${run}') then raise exception 'QA cleanup identity mismatch'; end if; end $$;
      ${env.RAVOGE_CLIENT_LOG_QA === "yes" ? `delete from public.client_recovery_entries where organization_id='${org}'; delete from public.client_activity_entries where organization_id='${org}'; delete from public.client_daily_totals where organization_id='${org}';` : ""}
      delete from public.workout_assignments where organization_id='${org}';
      delete from public.generated_prescriptions where organization_id='${org}';
      delete from public.client_states where organization_id='${org}';
      delete from public.client_intakes where organization_id='${org}';
      delete from public.announcement_recipients where organization_id='${org}';
      delete from public.announcements where organization_id='${org}';
      delete from public.announcement_preferences where organization_id='${org}';
      delete from public.member_access_removals where organization_id='${org}';
      set local session_replication_role=replica;
      delete from public.organization_memberships where organization_id='${org}' and user_id='${users[0].id}';
      set local session_replication_role=origin;
      delete from public.organizations where id='${org}' and name='Ravoge Beta Verification ${run}';
      delete from auth.users where email in (${[...users.map(user => user.email), newCoachEmail, newClientEmail].map(email => `'${email}'`).join(",")}) and email like '${prefix}%@example.test';
      commit;`);
    rmSync(".temp/beta-qa-state.json", { force: true });
    console.log("Only this run’s isolated QA gym, identities and test records were removed.");
  }
}
