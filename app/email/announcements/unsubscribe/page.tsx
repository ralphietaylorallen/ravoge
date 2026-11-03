import type {Metadata} from "next";
import Link from "next/link";
import {AuthEntryShell} from "@/components/auth-entry-shell";
import {AnnouncementUnsubscribeForm} from "@/components/announcement-preference-form";
export const metadata:Metadata={title:"Announcement preferences | Ravoge",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function UnsubscribePage({searchParams}:{searchParams:Promise<{token?:string}>}){const {token}=await searchParams;return <AuthEntryShell><h1>Gym announcement emails</h1><p>Unsubscribing turns off optional announcements from this gym. It does not remove your membership or affect training.</p>{token&&/^[0-9a-f]{64}$/.test(token)?<AnnouncementUnsubscribeForm token={token}/>:<p role="alert">This link is invalid. You can change announcement preferences in your Ravoge profile.</p>}<Link href="/login">Sign in to Ravoge</Link></AuthEntryShell>;}
