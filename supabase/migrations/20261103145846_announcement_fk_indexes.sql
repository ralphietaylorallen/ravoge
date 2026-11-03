-- Cover each composite FK in declaration order for the hosted advisor and
-- parent-key checks. This only indexes the new announcement queue.
create index announcement_recipients_parent_idx
 on public.announcement_recipients(announcement_id,organization_id);
create index announcement_recipients_membership_idx
 on public.announcement_recipients(organization_id,user_id);
