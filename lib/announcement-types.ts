export type AnnouncementAudience={user_id:string;name:string;email:string;role:"owner"|"coach"|"client";opted_in:boolean};
export type AnnouncementRecipient={id:string;email:string;member_role:string;status:string;attempts:number;provider_id:string|null;accepted_at:string|null;delivered_at:string|null;provider_checked_at:string|null;retryable:boolean;error_code:string|null;first_attempt_at:string|null;next_attempt_at:string;lease_until:string|null};
export type AnnouncementJob={id:string;subject:string;message:string;audience:string;status:string;created_at:string;recipients:AnnouncementRecipient[]};
export function announcementCounts(rows:AnnouncementRecipient[],now=Date.now()){
 const expired=(r:AnnouncementRecipient)=>r.status==="processing"&&Boolean(r.lease_until)&&Date.parse(r.lease_until!)<=now;
 return {total:rows.length,queued:rows.filter(r=>r.status==="queued").length,processing:rows.filter(r=>r.status==="processing"&&!expired(r)).length,
 accepted:rows.filter(r=>r.accepted_at).length,delivered:rows.filter(r=>r.delivered_at).length,
 failed:rows.filter(r=>r.status==="failed").length,unconfirmed:rows.filter(r=>r.status==="unconfirmed"||expired(r)).length,skipped:rows.filter(r=>r.status==="skipped").length,
 retryable:rows.filter(r=>(r.retryable||expired(r))&&['failed','unconfirmed','processing'].includes(r.status)&&r.first_attempt_at&&Date.parse(r.first_attempt_at)>now-23*3600000&&Date.parse(r.next_attempt_at)<=now&&r.attempts<5).length};
}
