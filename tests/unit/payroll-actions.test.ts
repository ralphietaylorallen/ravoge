import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import {validPayrollDate} from '../../lib/payroll.ts';
function harness(){
 const calls:{name:string;args:unknown}[]=[];
 const modules:Record<string,unknown>={
  'next/cache':{revalidatePath:(path:string)=>calls.push({name:'invalidate',args:path})},
  '@/lib/auth':{requireRole:async(role:string)=>{
   calls.push({name:'auth',args:role});
   return {supabase:{rpc:async(name:string,args:unknown)=>{
    calls.push({name,args});return {error:null};
   }}};
  }},
  '@/lib/payroll':{validPayrollDate},
 };
 const result:Record<string,unknown>={};
 new Function('require','exports',ts.transpileModule(readFileSync('app/owner/payroll/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((name:string)=>{assert.ok(modules[name],name);return modules[name]},result);
 return {calls,save:result.savePayrollSettingsAction as (state:unknown,form:FormData)=>Promise<{status:string}>};
}
test('payroll settings authenticate as Owner and derive gym in RPC rather than trusting a submitted organization',async()=>{
 const h=harness(),form=new FormData();form.set('cadenceDays','14');form.set('anchorDate','2026-11-09');form.set('startWeekday','1');form.set('organizationId','another-gym');
 assert.equal((await h.save({},form)).status,'success');
 assert.deepEqual(h.calls[0],{name:'auth',args:'owner'});
 assert.deepEqual(h.calls.find(c=>c.name==='save_owner_payroll_settings')!.args,{period_days:14,first_period_start:'2026-11-09'});
 assert.ok(h.calls.some(c=>c.name==='invalidate'&&c.args==='/owner/payroll'));
});
test('invalid cadence, dates and mismatched weekday cannot reach payroll writes',async()=>{
 for(const values of [['10','2026-11-09','1'],['14','2026-02-30','1'],['14','2026-11-09','5']]){
  const h=harness(),form=new FormData();['cadenceDays','anchorDate','startWeekday'].forEach((name,i)=>form.set(name,values[i]));
  assert.equal((await h.save({},form)).status,'error');assert.equal(h.calls.filter(c=>c.name==='save_owner_payroll_settings').length,0);
 }
});
