import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ModuleKind, transpileModule } from "typescript";
import { getEmailSender } from "../../lib/email-sender.ts";
import * as calendar from "../../lib/calendar.ts";

const envKeys = ["RAVOGE_EMAIL_FROM","RAVOGE_EMAIL_REPLY_TO","RAVOGE_SMTP_USER","RESEND_API_KEY"];
function preserveEnvironment() {
  const old = Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
  return () => { for(const key of envKeys) { if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]; } };
}
test("shared sender stays the info alias independently of the licensed SMTP login",()=>{
  const restore=preserveEnvironment();
  try {
    delete process.env.RAVOGE_EMAIL_FROM; assert.equal(getEmailSender(),null);
    Object.assign(process.env,{RAVOGE_EMAIL_FROM:"Ravoge <info@ravoge.com>",RAVOGE_EMAIL_REPLY_TO:"info@ravoge.com",RAVOGE_SMTP_USER:"dane@ravoge.com"});
    assert.deepEqual(getEmailSender(),{from:{name:"Ravoge",address:"info@ravoge.com"},replyTo:{name:"Ravoge",address:"info@ravoge.com"},fromHeader:"Ravoge <info@ravoge.com>",replyToAddress:"info@ravoge.com"});
    const disallowedAddresses = ["dane@ravoge.com", "coach@external.example.test", "client@external.example.test", "test@example.test"];
    for (const address of disallowedAddresses) {
      process.env.RAVOGE_EMAIL_FROM = `Ravoge <${address}>`;
      assert.throws(() => getEmailSender());
      process.env.RAVOGE_EMAIL_FROM = "Ravoge <info@ravoge.com>";
      process.env.RAVOGE_EMAIL_REPLY_TO = address;
      assert.throws(() => getEmailSender());
      process.env.RAVOGE_EMAIL_REPLY_TO = "info@ravoge.com";
    }
    process.env.RAVOGE_EMAIL_FROM="info@ravoge.com\r\nBcc: attacker@example.test";assert.throws(()=>getEmailSender());
  } finally { restore(); }
});

test("existing Resend booking adapter shares From/Reply-To and preserves intended recipient and calendar",async(t)=>{
  const restore=preserveEnvironment();let payload:Record<string,unknown>={};let calls=0;let failed=false;
  t.mock.method(globalThis,"fetch",async(_url:unknown,options?:RequestInit)=>{
    calls++;payload=JSON.parse(String(options?.body));return new Response(JSON.stringify(failed?{message:"private-provider-detail"}:{id:"unit-booking-message"}),{status:failed?403:200});
  });
  const source=transpileModule(readFileSync(new URL("../../lib/booking-email.ts",import.meta.url),"utf8"),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,(input:unknown)=>Promise<{status:string;error:string|null}>>={};
  new Function("require","exports",source)((name:string)=>{if(name==="@/lib/calendar")return calendar;if(name==="./email-sender.ts")return {getEmailSender};throw new Error(`Unexpected import ${name}`);},exports);
  const booking={bookingId:"unit-booking",coachName:"QA Coach",durationMinutes:60,endsAt:"2026-10-29T17:00:00Z",startsAt:"2026-10-29T16:00:00Z",event:"booked",gymName:"QA gym",manageUrl:"https://ravoge.com/client/schedule",recipientEmail:"intended@external.example.test",timezone:"UTC"};
  try {
    Object.assign(process.env,{RAVOGE_EMAIL_FROM:"Ravoge <info@ravoge.com>",RAVOGE_EMAIL_REPLY_TO:"info@ravoge.com",RESEND_API_KEY:"unit-fixture-only"});
    assert.equal((await exports.sendBookingEmail(booking)).status,"sent");
    assert.equal(payload.from,"Ravoge <info@ravoge.com>");assert.equal(payload.reply_to,"info@ravoge.com");assert.deepEqual(payload.to,[booking.recipientEmail]);
    assert.ok(Array.isArray(payload.attachments));assert.ok(String(payload.html).includes(booking.manageUrl));
    failed=true;const failure=await exports.sendBookingEmail(booking);assert.equal(failure.status,"failed");assert.ok(!JSON.stringify(failure).includes("private-provider-detail"));
    const before=calls;process.env.RAVOGE_EMAIL_FROM="dane@ravoge.com";assert.equal((await exports.sendBookingEmail(booking)).status,"failed");assert.equal(calls,before);
    delete process.env.RESEND_API_KEY;assert.equal((await exports.sendBookingEmail(booking)).status,"skipped");assert.equal(calls,before);
  } finally { restore(); }
});
