import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {payrollPeriod,payrollAnchorForWeekday,payrollMoney,validPayrollDate,type PayrollReport} from '../../lib/payroll.ts';

test('weekly and biweekly periods preserve anchor parity, cross month/year and handle dates before anchor',()=>{
 assert.deepEqual(payrollPeriod('2026-11-18',7,'2026-11-16'),{start:'2026-11-16',end:'2026-11-22'});
 assert.deepEqual(payrollPeriod('2026-11-18',14,'2026-11-09'),{start:'2026-11-09',end:'2026-11-22'});
 assert.deepEqual(payrollPeriod('2026-11-08',14,'2026-11-09'),{start:'2026-10-26',end:'2026-11-08'});
 assert.deepEqual(payrollPeriod('2027-01-01',14,'2026-12-28'),{start:'2026-12-28',end:'2027-01-10'});
 assert.equal(payrollAnchorForWeekday('2026-11-18',5),'2026-11-20');
 for(const value of ['2026-02-30','2026-1-1','not-a-date','1800-01-01',undefined])assert.equal(validPayrollDate(value),false);
 assert.equal(payrollMoney('3001'),'$30.01');assert.equal(payrollMoney('0'),'$0.00');assert.equal(payrollMoney('900719925474099301'),'$9,007,199,254,740,993.01');
});

test('actual payroll migration: exact full-range aggregation, roster, historical rates, DST and ordinary-role isolation',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`
 create role anon;create role authenticated;create schema auth;create schema private;
 grant usage on schema auth,private to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);
 create table public.organizations(id uuid primary key,timezone text);
 create table public.profiles(id uuid primary key,full_name text,preferred_name text);
 create table public.organization_memberships(organization_id uuid,user_id uuid,role text,status text);
 create view private.request_memberships as select * from public.organization_memberships m where m.organization_id::text=current_setting('test.organization',true);
 create table public.organization_session_pricing(organization_id uuid,currency text);
 create table public.coach_compensation_configs(organization_id uuid,coach_user_id uuid,model text,commission_basis_points integer,hourly_rate_minor bigint,currency text);
 create table public.bookings(id uuid default gen_random_uuid(),organization_id uuid,coach_user_id uuid,starts_at timestamptz,status text,session_price_minor bigint,currency text,compensation_model text,coach_compensation_minor bigint,payment_status text);
 `);
 await db.exec(await readFile('supabase/migrations/20261118173716_owner_payroll_period_reporting.sql','utf8'));
 const org='af000000-0000-4000-8000-000000000001',owner='af000000-0000-4000-8000-000000000002',coach='af000000-0000-4000-8000-000000000003',zero='af000000-0000-4000-8000-000000000004',client='af000000-0000-4000-8000-000000000005',otherOrg='af000000-0000-4000-8000-000000000006',otherOwner='af000000-0000-4000-8000-000000000007';
 for(const id of [owner,coach,zero,client,otherOwner])await db.query('insert into auth.users values($1)',[id]);
 await db.query("insert into organizations values($1,'America/Denver'),($2,'America/Denver')",[org,otherOrg]);
 await db.query("insert into organization_memberships values($1,$2,'owner','active'),($1,$3,'coach','active'),($1,$4,'coach','inactive'),($1,$5,'client','active'),($6,$7,'owner','active')",[org,owner,coach,zero,client,otherOrg,otherOwner]);
 await db.query("insert into profiles values($1,'Coach One',null),($2,'No sessions',null)",[coach,zero]);
 await db.query("insert into coach_compensation_configs values($1,$2,'percentage',7000,null,'USD')",[org,coach]);
 const actor=async(id:string,selected=org)=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('test.organization',$2,false)",[id,selected]);};
 const report=async(start:string|null='2026-03-08',end:string|null=start)=>(await db.query<{data:PayrollReport}>('select public.get_owner_payroll_report($1,$2) data',[start,end])).rows[0].data;
 await actor(owner);
 await db.query("select public.save_owner_payroll_settings(14,'2026-11-09')");
 assert.equal((await report(null,null)).settings.cadenceDays,14);
 await assert.rejects(()=>db.query("select public.save_owner_payroll_settings(10,'2026-11-09')"),/weekly/);
 await assert.rejects(()=>report('2026-11-18','2026-11-17'),/valid inclusive/);
 await assert.rejects(()=>report('2026-11-18',null),/both/);
 await db.exec('reset role');
 // Denver's spring DST day is 23 hours: midnight starts at 07Z and ends at 06Z.
 await db.query("insert into bookings(organization_id,coach_user_id,starts_at,status,session_price_minor,currency,compensation_model,coach_compensation_minor,payment_status) select $1,$2,'2026-03-08T07:00Z','completed',10001,'USD','percentage',3000,'unpaid' from generate_series(1,1005)",[org,coach]);
 const booking=async(time:string,status:string,price:number|null,model:string|null,pay:number|null,payment='unpaid',currency='USD',organization=org)=>db.query('insert into bookings(organization_id,coach_user_id,starts_at,status,session_price_minor,currency,compensation_model,coach_compensation_minor,payment_status) values($1,$2,$3,$4,$5,$6,$7,$8,$9)',[organization,coach,time,status,price,currency,model,pay,payment]);
 await booking('2026-03-09T05:59:59Z','completed',100,'hourly',50);
 for(const time of ['2026-03-08T06:59:59Z','2026-03-09T06:00Z'])await booking(time,'completed',10000,'percentage',5000);
 for(const status of ['scheduled','cancelled','no_show'])await booking('2026-03-08T18:00Z',status,10000,'percentage',5000);
 await booking('2026-03-08T18:00Z','completed',2000,'percentage',600,'refunded');
 await booking('2026-03-08T18:00Z','completed',null,null,null);
 await booking('2026-03-08T18:00Z','completed',2000,'none',0);
 await booking('2026-03-08T18:00Z','completed',3000,'percentage',900,'paid','EUR');
 await booking('2026-03-08T18:00Z','completed',999999,'percentage',99999,'paid','USD',otherOrg);
 await actor(owner);
 const data=await report();assert.equal(data.coaches.length,2);assert.equal(data.completedSessions,1010);assert.equal(data.reviewSessions,3);
 const usd=data.totals.find(x=>x.currency==='USD')!,eur=data.totals.find(x=>x.currency==='EUR')!;
 assert.equal(usd.revenueMinor,String(10001*1005+100+2000));assert.equal(usd.commissionMinor,String(3000*1005));assert.equal(usd.hourlyMinor,'50');assert.equal(usd.totalMinor,String(3000*1005+50));assert.equal(eur.totalMinor,'900');
 assert.equal(data.coaches.find(c=>c.id===coach)!.commissionBasisPoints,7000,'Current 70% must not rewrite saved 30% sessions');
 assert.equal(data.coaches.find(c=>c.id===zero)!.completedSessions,0);
 const empty=await report('2026-03-10');assert.equal(empty.coaches.length,2);assert.equal(empty.completedSessions,0);
 for(const id of [coach,client,otherOwner]){await actor(id);await assert.rejects(report,/Owner access/);await assert.rejects(()=>db.query("select public.save_owner_payroll_settings(7,'2026-11-16')"),/Owner access/);}
 await actor(owner,otherOrg);await assert.rejects(report,/Owner access/);
 await actor(otherOwner,otherOrg);const separate=await report();assert.equal(separate.totals[0].commissionMinor,'99999');assert.equal(separate.coaches.length,1);
 await actor(owner);await assert.rejects(()=>db.query('update organization_payroll_settings set cadence_days=7'),/permission denied/);
 await db.exec('reset role;set role anon');await assert.rejects(report,/permission denied/);
 }finally{await db.close();}
});
