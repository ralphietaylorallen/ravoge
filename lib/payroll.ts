import { shiftLocalDate } from "./timezone.ts";

export const PAYROLL_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export type PayrollSettings = { cadenceDays: 7 | 14; anchorDate: string; startWeekday: number; configured: boolean };
export type PayrollAmounts = { currency: string; revenueMinor: string; commissionMinor: string; hourlyMinor: string; totalMinor: string; reviewSessions: number; unpriced: number; refunded: number };
export type PayrollCoach = { id: string; name: string; status: string; model: "none" | "hourly" | "percentage"; commissionBasisPoints: number | null; hourlyRateMinor: string | null; currency: string; completedSessions: number; reviewSessions: number; amounts: PayrollAmounts[] };
export type PayrollReport = { timezone: string; today: string; startDate: string; endDate: string; settings: PayrollSettings; completedSessions: number; reviewSessions: number; coaches: PayrollCoach[]; totals: PayrollAmounts[] };
export function validPayrollDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1900-01-01" && value <= "2200-12-31" && Number.isFinite(Date.parse(value+"T12:00:00Z")) && new Date(value+"T12:00:00Z").toISOString().slice(0,10)===value;
}
export function payrollPeriod(today:string, cadence:7|14, anchor:string) {
  if(!validPayrollDate(today)||!validPayrollDate(anchor))throw Error("Choose valid payroll dates.");
  const offset=Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse(anchor+"T12:00:00Z"))/86400000/cadence)*cadence;
  const start=shiftLocalDate(anchor,offset)!;
  return {start,end:shiftLocalDate(start,cadence-1)!};
}
export function payrollAnchorForWeekday(anchor:string, weekday:number) {
  if(!validPayrollDate(anchor)||!Number.isInteger(weekday)||weekday<0||weekday>6)throw Error("Choose a valid start day.");
  const dow=new Date(anchor+"T12:00:00Z").getUTCDay();
  return shiftLocalDate(anchor,weekday-dow)!;
}
export function payrollMoney(minor: string, currency="USD") {
  // DB aggregation uses exact numeric cents. Keep large totals exact as BigInt.
  const value=BigInt(minor), zero=BigInt(0), hundred=BigInt(100), absolute=value<zero?-value:value;
  const parts=new Intl.NumberFormat("en-US",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:2}).formatToParts(absolute/hundred);
  return (value<zero?"−":"")+parts.map(p=>p.type==="fraction"?String(absolute%hundred).padStart(2,"0"):p.value).join("");
}
export function payrollDateLabel(date:string) {
  return new Date(date+"T12:00:00Z").toLocaleDateString("en-US",{timeZone:"UTC",month:"short",day:"numeric",year:"numeric"});
}
