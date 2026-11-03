import assert from "node:assert/strict";
import test from "node:test";
import {sendAnnouncementEmail,checkAnnouncementRecipient,getAnnouncementDeliveryEvent,announcementRetryAfter,type AnnouncementDispatch} from "../../lib/announcement-email.ts";
import {announcementCounts,type AnnouncementRecipient} from "../../lib/announcement-types.ts";
const base:AnnouncementDispatch={id:"9b000000-0000-4000-8000-000000000001",lease:"9b000000-0000-4000-8000-000000000002",email:"one@example.test",subject:"Gym news",message:"Hello <team>\nNew gym hours.",gym:"Test gym",unsubscribeToken:"a".repeat(64)};
const provider="9b000000-0000-4000-8000-000000000009";
test("announcements are private per recipient, use hello identity, and retain idempotency on retry",async t=>{
 const keys=["RESEND_API_KEY","RAVOGE_EMAIL_FROM","RAVOGE_EMAIL_REPLY_TO"],before=keys.map(k=>process.env[k]);
 process.env.RESEND_API_KEY="unit-test-only";process.env.RAVOGE_EMAIL_FROM="Ravoge <hello@ravoge.com>";process.env.RAVOGE_EMAIL_REPLY_TO="hello@ravoge.com";
 const mails:{payload:Record<string,unknown>;key:string}[]=[];let mode="clear",outcome=200,transport="ok",reads=0;
 t.mock.method(globalThis,"fetch",async(url:unknown,options?:RequestInit)=>{
  if(options?.method!=="POST"){
   reads++;const u=String(url);
   if(mode==="blocked")return new Response("",{status:403});
   if(mode==="preflight-rate-limit")return new Response("",{status:429,headers:{"retry-after":"180"}});
   if(u.includes("/suppressions/"))return mode==="suppressed"?Response.json({email:decodeURIComponent(u.split("/").at(-1)!)}):new Response("",{status:404});
   if(u.includes("/contacts/"))return mode==="unsubscribed"?Response.json({email:decodeURIComponent(u.split("/").at(-1)!),unsubscribed:true}):new Response("",{status:404});
   if(u.includes("/emails/"))return Response.json({id:provider,to:mode==="wrong-recipient"?["other@example.test"]:[base.email],cc:[],bcc:[],last_event:"delivered"});
   throw Error("Unexpected provider read");
  }
  const payload=JSON.parse(String(options.body));const headers=options.headers as Record<string,string>;
  assert.equal(String(url),"https://api.resend.com/emails");assert.equal(payload.from,"Ravoge <hello@ravoge.com>");assert.equal(payload.reply_to,"hello@ravoge.com");assert.equal(payload.to.length,1);
  assert.ok(!("cc" in payload)&&!("bcc" in payload)&&!("attachments" in payload));assert.ok(String(payload.html).includes("Hello &lt;team&gt;"));assert.ok(!JSON.stringify(payload).includes("unit-test-only"));
  assert.equal(payload.headers["List-Unsubscribe-Post"],"List-Unsubscribe=One-Click");assert.ok(payload.headers["List-Unsubscribe"].includes(`/api/announcements/unsubscribe?token=${payload.to[0]==="one@example.test"?base.unsubscribeToken:"b".repeat(64)}`));
  mails.push({payload,key:headers["Idempotency-Key"]});
  if(transport==="network")throw Error("private provider detail");
  if(transport==="invalid-json")return new Response("private response",{status:200});
  return Response.json(outcome===200?{id:provider}:{message:"private provider detail"},{status:outcome,headers:{"retry-after":"120"}});
 });
 try{
  const noWait=async()=>{};
  assert.equal((await sendAnnouncementEmail(base,async()=>true,noWait)).status,"accepted");
  const second={...base,id:"9b000000-0000-4000-8000-000000000003",email:"two@example.test",unsubscribeToken:"b".repeat(64)};
  assert.equal((await sendAnnouncementEmail(second,async()=>true,noWait)).status,"accepted");
  assert.ok(!JSON.stringify(mails[0].payload).includes(second.email));assert.ok(!JSON.stringify(mails[1].payload).includes(base.email));assert.notEqual(mails[0].key,mails[1].key);
  await sendAnnouncementEmail(base,async()=>true,noWait);assert.equal(mails[2].key,mails[0].key);assert.deepEqual(mails[2].payload,mails[0].payload);
  for(const preference of ["suppressed","unsubscribed"]){mode=preference;const n=mails.length;const r=await sendAnnouncementEmail(base,async()=>true,noWait);assert.equal(r.status,"skipped");assert.equal(r.code,preference);assert.equal(mails.length,n);}
  mode="blocked";const n=mails.length;assert.equal((await sendAnnouncementEmail(base,async()=>true,noWait)).code,"suppression_check_403");assert.equal(mails.length,n);
  mode="preflight-rate-limit";const limited=await sendAnnouncementEmail(base,async()=>true,noWait);assert.equal(limited.code,"suppression_check_429");assert.equal(limited.retryAfter,180);assert.equal(mails.length,n);
  mode="clear";assert.equal((await sendAnnouncementEmail(base,async()=>false,noWait)).status,"skipped");assert.equal(mails.length,n);
  outcome=429;let r=await sendAnnouncementEmail(base,async()=>true,noWait);assert.equal(r.code,"provider_429");assert.equal(r.retryAfter,120);
  outcome=503;r=await sendAnnouncementEmail(base,async()=>true,noWait);assert.equal(r.status,"unconfirmed");assert.equal(r.code,"provider_5xx");
  outcome=400;assert.equal((await sendAnnouncementEmail(base,async()=>true,noWait)).code,"provider_400");
  outcome=200;transport="network";assert.equal((await sendAnnouncementEmail(base,async()=>true,noWait)).code,"network_unconfirmed");transport="invalid-json";assert.equal((await sendAnnouncementEmail(base,async()=>true,noWait)).code,"response_unconfirmed");transport="ok";
  assert.equal(await getAnnouncementDeliveryEvent(provider,base.email),"delivered");mode="wrong-recipient";await assert.rejects(getAnnouncementDeliveryEvent(provider,base.email),/unconfirmed/);
  const count=mails.length,readCount=reads;delete process.env.RESEND_API_KEY;assert.equal((await sendAnnouncementEmail(base,async()=>true,noWait)).code,"not_configured");assert.equal(mails.length,count);assert.equal(reads,readCount);
  await assert.rejects(checkAnnouncementRecipient("incomplete",noWait),/invalid_recipient/);
 }finally{keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i];});}
});
test("acceptance and unconfirmed leases are never counted as delivered",()=>{
 const now=Date.now(),r={id:"x",email:"one@example.test",member_role:"client",status:"accepted",attempts:1,provider_id:provider,accepted_at:new Date(now).toISOString(),delivered_at:null,provider_checked_at:null,retryable:false,error_code:null,first_attempt_at:new Date(now).toISOString(),next_attempt_at:new Date(now-1).toISOString(),lease_until:null} satisfies AnnouncementRecipient;
 const c=announcementCounts([r,{...r,status:"processing",accepted_at:null,lease_until:new Date(now-1000).toISOString()}],now);assert.equal(c.accepted,1);assert.equal(c.delivered,0);assert.equal(c.unconfirmed,1);assert.equal(c.processing,0);assert.equal(c.retryable,1);
 assert.equal(announcementCounts([{...r,status:"failed",accepted_at:null,retryable:true,first_attempt_at:new Date(now-24*3600000).toISOString()}],now).retryable,0);
 assert.equal(announcementRetryAfter("120"),120);assert.ok(announcementRetryAfter(new Date(now+300000).toUTCString())>=299);assert.equal(announcementRetryAfter("invalid"),60);
});
