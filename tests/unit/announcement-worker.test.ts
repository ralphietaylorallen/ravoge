import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient} from "@supabase/supabase-js";
import {runAnnouncementQueue} from "../../lib/announcement-worker.ts";
import handler from "../../netlify/functions/announcements-background.ts";

test("background queue claims one recipient at a time, rechecks access and persists results",async()=>{
 let claimed=0,sent=0,finished=0,eligible=0;
 const db={rpc:async(name:string)=>{
  if(name==="claim_announcement_recipient")return {data:claimed++<2?{id:`recipient-${claimed}`,lease:"claim"}:null,error:null};
  if(name==="announcement_dispatch_eligible"){eligible++;return {data:true,error:null};}
  if(name==="finish_announcement_recipient"){finished++;return {error:null};}
  throw Error("Unexpected RPC");
 }} as unknown as SupabaseClient;
 const result=await runAnnouncementQueue(db,"job",{wait:async()=>{},send:async(r,check)=>{assert.equal(await check(),true);sent++;assert.equal(finished,sent-1);return {status:"accepted",id:r.id,code:null,retryAfter:60};}});
 assert.equal(result.continuation,false);assert.equal(sent,2);assert.equal(finished,2);assert.equal(eligible,2);
});
test("denied claims, provider ambiguity and interrupted persistence never resend the audience",async()=>{
 let sends=0;
 const denied={rpc:async()=>({error:{code:"42501"}})} as unknown as SupabaseClient;
 assert.equal((await runAnnouncementQueue(denied,"foreign",{send:async()=>{sends++;throw Error("Forbidden");}})).code,"claim_unconfirmed");assert.equal(sends,0);
 const finished:unknown[]=[];
 const db={rpc:async(name:string,args:unknown)=>{if(name==="claim_announcement_recipient")return {data:{id:"one",lease:"lease"}};if(name==="finish_announcement_recipient"){finished.push(args);return {error:null};}return {data:true};}} as unknown as SupabaseClient;
 const result=await runAnnouncementQueue(db,"job",{send:async()=>{sends++;return {status:"unconfirmed",id:null,code:"network_unconfirmed",retryAfter:60};}});
 assert.equal(sends,1);assert.equal(finished.length,1);assert.equal(result.code,"network_unconfirmed");assert.equal(result.continuation,false);
 let clock=0;
 assert.equal((await runAnnouncementQueue({rpc:async()=>({data:{busy:true}})} as unknown as SupabaseClient,"job",{now:()=>clock,wait:async ms=>{clock+=ms;},budgetMs:1000})).continuation,true);
});
test("preview and missing authentication cannot start an announcement worker",async t=>{
 const original=process.env.CONTEXT;let requests=0;t.mock.method(globalThis,"fetch",async()=>{requests++;throw Error("No network expected");});
 try{process.env.CONTEXT="deploy-preview";await handler(new Request("https://preview.test/.netlify/functions/announcements-background",{method:"POST",body:JSON.stringify({jobId:"fake"})}));process.env.CONTEXT="production";await handler(new Request("https://ravoge.com/.netlify/functions/announcements-background",{method:"POST"}));assert.equal(requests,0);}finally{if(original===undefined)delete process.env.CONTEXT;else process.env.CONTEXT=original;}
});
test("production worker verifies the ordinary session and lets RLS authorize the job",async t=>{
 const keys=["RESEND_API_KEY","RAVOGE_EMAIL_FROM","RAVOGE_EMAIL_REPLY_TO","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],before=keys.map(k=>process.env[k]);
 Object.assign(process.env,{RESEND_API_KEY:"unit-test-only",RAVOGE_EMAIL_FROM:"Ravoge <hello@ravoge.com>",RAVOGE_EMAIL_REPLY_TO:"hello@ravoge.com",NEXT_PUBLIC_SUPABASE_URL:"https://kqdnljafaiohlijbgfld.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test_only"});
 const paths:string[]=[];let valid=true;
 t.mock.method(globalThis,"fetch",async(input:unknown,options?:RequestInit)=>{
  const u=typeof input==="string"?input:input instanceof Request?input.url:String(input);paths.push(new URL(u).pathname);
  if(u.endsWith("/auth/v1/user"))return valid?Response.json({id:"9b000000-0000-4000-8000-000000000001",aud:"authenticated"}):Response.json({msg:"Session rejected"},{status:401});
  assert.ok(u.endsWith("/rest/v1/rpc/claim_announcement_recipient"));assert.equal(JSON.parse(String(options?.body)).job_id,"9b000000-0000-4000-8000-000000000002");return Response.json(null);
 });
 const ctx={deploy:{context:"production"},site:{id:"c1bf03e6-2657-40fe-9584-f265ab9c2b94"}};
 const request=()=>new Request("https://ravoge.com/.netlify/functions/announcements-background",{method:"POST",headers:{Authorization:"Bearer unit-test-session"},body:JSON.stringify({jobId:"9b000000-0000-4000-8000-000000000002"})});
 try{await handler(request(),ctx);assert.deepEqual(paths,["/auth/v1/user","/rest/v1/rpc/claim_announcement_recipient"]);paths.length=0;valid=false;await handler(request(),ctx);assert.deepEqual(paths,["/auth/v1/user"]);paths.length=0;await handler(request(),{...ctx,deploy:{context:"deploy-preview"}});assert.equal(paths.length,0);}finally{keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];});}
});
