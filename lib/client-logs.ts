export type DailyTotal = { log_date: string; calories: number | null; protein_grams: number | null };
export type ActivityEntry = { id: string; log_date: string; activity_type: string; duration_minutes: number; distance: number | null; distance_unit: string; effort: number | null };
export type RecoveryEntry = { id: string; log_date: string; workout_assignment_id: string; recovery_type: string; duration_minutes: number; water_temperature: number | null; temperature_unit: string; occurred_at?:string|null; notes?:string|null; felt_after?:string|null };
export const ACTIVITY_LABELS: Record<string,string> = { walk: "Walk", jog: "Jog", run: "Run", other: "Other workout" };
export const RECOVERY_LABELS: Record<string,string> = { sauna: "Sauna", cold_plunge: "Cold plunge" };
export const LOG_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function logDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2100-12-31" || new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) !== value) throw new Error("Choose a valid date.");
  return value;
}
function numberField(data: FormData,name: string,min: number,max: number,required=false,integer=false) {
  const text=data.get(name);
  if (text===null || text==="") { if(required) throw new Error("Enter the actual minutes completed."); return null; }
  if(typeof text!=="string" || !text.trim()) throw new Error("Enter a valid number.");
  const n=Number(text);
  if(!Number.isFinite(n)||n<min||n>max||integer&&!Number.isInteger(n)) throw new Error(`Review ${name.replaceAll("_"," ")}: enter ${min}–${max}${integer?" as a whole number":""}.`);
  return n;
}
export function dailyInput(data: FormData) {
  return {date:logDate(data.get("date")),calories:numberField(data,"calories",0,30000,false,true),protein:numberField(data,"protein_grams",0,2000)};
}
export function activityInput(data: FormData) {
  const activity=String(data.get("activity_type")),unit=String(data.get("distance_unit"));
  if(!Object.hasOwn(ACTIVITY_LABELS,activity)||!["mi","km"].includes(unit)) throw new Error("Choose an activity and distance unit.");
  return {date:logDate(data.get("date")),activity,unit,minutes:numberField(data,"duration_minutes",0.01,1440,true)!,distance:numberField(data,"distance",0.001,10000),effort:numberField(data,"effort",1,10,false,true)};
}
export function recoveryInput(data: FormData) {
  const recovery=String(data.get("recovery_type")),unit=String(data.get("temperature_unit"));
  if(!Object.hasOwn(RECOVERY_LABELS,recovery)||!["F","C"].includes(unit)) throw new Error("Choose recovery and temperature units.");
  return {date:logDate(data.get("date")),recovery,unit,minutes:numberField(data,"duration_minutes",0.01,1440,true)!,temperature:recovery==="sauna"?null:numberField(data,"water_temperature",unit==="F"?32:0,unit==="F"?120:49)};
}
export function activitySummary(entry: ActivityEntry) {
  return `${ACTIVITY_LABELS[entry.activity_type]} · ${entry.duration_minutes} min · ${entry.distance===null?"Distance: Not logged":`${entry.distance} ${entry.distance_unit}`} · ${entry.effort===null?"Effort: Not logged":`Effort ${entry.effort}/10`}`;
}
export function recoverySummary(entry: RecoveryEntry) {
  return `${RECOVERY_LABELS[entry.recovery_type]} · ${entry.duration_minutes} min${entry.recovery_type==="cold_plunge"?` · ${entry.water_temperature===null?"Temperature: Not logged":`${entry.water_temperature} °${entry.temperature_unit}`}`:""}`;
}
