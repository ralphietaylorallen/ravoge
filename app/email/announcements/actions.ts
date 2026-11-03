"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
export async function saveAnnouncementPreferenceAction(_state:{status:string;message?:string},form:FormData){
 const supabase=await createClient();
 try{const {error}=await supabase.rpc("set_announcement_preference",{allow_announcements:form.get("announcements")==="yes"});if(error)return {status:"error",message:"Your preference could not be saved. Sign in with an active gym membership and retry."};for(const p of ["/owner/announcements","/coach/profile","/client/profile"])revalidatePath(p);return {status:"success",message:form.get("announcements")==="yes"?"You opted in to optional gym announcements.":"Optional gym announcement emails are off."};}catch{return {status:"error",message:"Your preference could not be confirmed. Please refresh before retrying."};}
}
export async function unsubscribeAnnouncementAction(_state:{status:string;message?:string},form:FormData){
 const token=String(form.get("token")??"");if(!/^[0-9a-f]{64}$/.test(token))return {status:"error",message:"This unsubscribe link is invalid. You can change announcement preferences in your Ravoge profile."};
 try{const supabase=await createClient();const {error}=await supabase.rpc("unsubscribe_announcement",{opaque_token:token});return error?{status:"error",message:"This link is unavailable. Sign in and turn off announcements in your profile."}:{status:"success",message:"You are unsubscribed from this gym's optional announcements. Your account and training access are unchanged."};}catch{return {status:"error",message:"Unsubscribe could not be confirmed. Please try again."};}
}
