import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const root = path.resolve(import.meta.dirname, "../..");

type Element = { type: string | ((props: Record<string, unknown>) => unknown); props: Record<string, unknown> };
function harness() {
  const values: unknown[] = []; let cursor = 0; const pushes: string[] = []; let bookingCalls = 0;
  const action = async () => { bookingCalls++; return {status:"success"}; };
  const hooks = { ...React, useState(initial: unknown) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value: unknown) => { values[index] = value; }]; }, useEffect() {}, useActionState() { return [{status:"idle"}, action, false]; } };
  const modules = new Map<string, Record<string, unknown>>();
  function load(file: string): Record<string, unknown> {
    const cached = modules.get(file); if (cached) return cached;
    const exports: Record<string, unknown> = {}; modules.set(file, exports);
    const source = ts.transpileModule(readFileSync(file,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const localRequire = (name: string): unknown => {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return require(name);
      if (name === "next/navigation") return {useRouter:()=>({push:(url:string)=>pushes.push(url),refresh(){}})};
      if (name === "next/link") return {__esModule:true, default:({children,...props}:Record<string,unknown>)=>React.createElement("a",props,children)};
      if (name.endsWith(".css")) return {__esModule:true,default:new Proxy({}, {get:(_target,key)=>String(key)})};
      if (name.includes("staff-actions")) return {createCoachCalendarBookingAction:action,createStaffBookingAction:action,rescheduleStaffBookingAction:action};
      const base = name.startsWith("@/") ? path.join(root,name.slice(2)) : path.resolve(path.dirname(file),name);
      const resolved = /\.tsx?$/.test(base) ? base : [base+".tsx",base+".ts"].find(candidate=>{try{readFileSync(candidate);return true;}catch{return false;}});
      if (!resolved) throw new Error(`Unmocked import ${name}`);
      return load(resolved);
    };
    new Function("require","exports",source)(localRequire,exports);return exports;
  }
  function nodes(value: unknown): Element[] {
    if (value === null || value === undefined || typeof value === "boolean") return [];
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (typeof value !== "object") return [];
    const element = value as Element;
    if (typeof element.type === "function") return nodes(element.type(element.props));
    return [element,...nodes(element.props?.children)];
  }
  function render(component: unknown, props: unknown) {cursor=0;return nodes((component as (props: unknown) => unknown)(props));}
  return {load,render,pushes,get bookingCalls(){return bookingCalls;}};
}
const slot = {starts_at:"2026-11-12T16:00:00Z",ends_at:"2026-11-12T16:45:00Z",available:true};
const props = {bookings:[],clients:[{id:"client-a",name:"Jamie"}],date:"2026-11-12",today:"2026-11-11",slots:[slot,{...slot,starts_at:"2026-11-12T17:00:00Z",available:false}],duration:45,durations:[45,60],selectedClientId:"client-a",timezone:"America/Denver"};

test("booking uses a complete month and preserves booking context when navigating",()=>{
 const h=harness();const {CoachBookingCalendar}=h.load(path.join(root,"components/coach-booking-calendar.tsx"));
 const elements=h.render(CoachBookingCalendar,props);
 assert.ok(elements.some(node=>node.props["aria-label"]==="Monthly booking calendar"));
 assert.equal(elements.filter(node=>node.type==="a"&&node.props.className==="date").length,30);
 const next=elements.find(node=>node.props["aria-label"]==="Next month")!;
 const url=new URL(String(next.props.href),"https://ravoge.com");
 assert.equal(url.searchParams.get("date"),"2026-12-01");assert.equal(url.searchParams.get("client"),"client-a");assert.equal(url.searchParams.get("duration"),"45");
 assert.ok(elements.some(node=>node.type==="a"&&node.props.className==="durationChoice"&&node.props["aria-current"]==="true"));
});

test("tap selects only an open slot and opens explicit confirmation without booking",()=>{
 const h=harness();const {CoachBookingCalendar}=h.load(path.join(root,"components/coach-booking-calendar.tsx"));
 let elements=h.render(CoachBookingCalendar,props);
 const times=elements.filter(node=>node.type==="button"&&node.props["aria-pressed"]!==undefined);
 assert.equal(times[0].props.disabled,false);assert.equal(times[1].props.disabled,true);
 (times[0].props.onClick as () => void)();elements=h.render(CoachBookingCalendar,props);
 assert.equal(h.bookingCalls,0);
 assert.ok(elements.some(node=>node.props.role==="dialog"&&node.props["aria-modal"]==="true"));
 assert.equal(elements.find(node=>node.props.name==="clientId")?.props.value,"client-a");
 assert.equal(elements.find(node=>node.props.name==="startsAt")?.props.value,slot.starts_at);
 assert.ok(elements.some(node=>node.type==="button"&&node.props.type==="submit"));
});

test("month picker disables dates outside the existing client booking window",()=>{
 const h=harness();const {BookingMonthPicker}=h.load(path.join(root,"components/booking-month-picker.tsx"));
 const elements=h.render(BookingMonthPicker,{date:props.date,today:props.today,timezone:props.timezone,basePath:"/coach/clients/a",minDate:"2026-11-11",maxDate:"2026-12-11",extraParams:{tab:"schedule",reschedule:"booking-a",kind:"intake"}});
 assert.equal(elements.filter(node=>node.type==="button"&&node.props.className==="date"&&node.props.disabled).length,10);
 const next=elements.find(node=>node.props["aria-label"]==="Next month")!;
 assert.match(String(next.props.href),/reschedule=booking-a/);assert.match(String(next.props.href),/tab=schedule/);assert.match(String(next.props.href),/kind=intake/);
});

test("client-profile booking requires choosing a current available time",()=>{
 const h=harness();const {StaffBookingForm}=h.load(path.join(root,"components/staff-booking-form.tsx"));
 const formProps={clientId:"client-a",clientName:"Jamie",coachId:"coach-a",duration:45,role:"coach",slots:[slot],timezone:props.timezone};
 let elements=h.render(StaffBookingForm,formProps);
 assert.equal(elements.find(node=>node.props.type==="submit")?.props.disabled,true);
 (elements.find(node=>node.type==="button"&&node.props["aria-pressed"]!==undefined)!.props.onClick as () => void)();
 elements=h.render(StaffBookingForm,formProps);
 assert.equal(elements.find(node=>node.props.type==="submit")?.props.disabled,false);
 elements=h.render(StaffBookingForm,{...formProps,slots:[{...slot,available:false}]});
 assert.equal(elements.find(node=>node.props.name==="startsAt")?.props.value,"");
 assert.equal(elements.find(node=>node.props.type==="submit")?.props.disabled,true);
});
