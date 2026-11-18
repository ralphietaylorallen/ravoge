"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { validPayrollDate } from "@/lib/payroll";
export type PayrollActionState={status:"idle"|"error"|"success";message?:string};
export async function savePayrollSettingsAction(_state:PayrollActionState,form:FormData):Promise<PayrollActionState> {
 const {supabase}=await requireRole("owner");
 const days=Number(form.get("cadenceDays")),anchor=String(form.get("anchorDate")??"");
 const weekday=Number(form.get("startWeekday"));
 if(![7,14].includes(days)||!validPayrollDate(anchor)||!Number.isInteger(weekday)||weekday<0||weekday>6||new Date(anchor+"T12:00:00Z").getUTCDay()!==weekday)return {status:"error",message:"Choose weekly or every two weeks, and an anchor date matching the start day."};
 const {error}=await supabase.rpc("save_owner_payroll_settings",{period_days:days,first_period_start:anchor});
 if(error)return {status:"error",message:"Pay period settings could not be saved. Your current settings are unchanged."};
 revalidatePath("/owner/payroll");
 return {status:"success",message:"Pay period settings saved. Open Current period to view the new cycle."};
}
