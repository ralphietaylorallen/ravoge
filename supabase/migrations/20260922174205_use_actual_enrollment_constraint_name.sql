-- PostgreSQL's generated unique-constraint name was abbreviated to fit the
-- 63-byte identifier limit. Give it the explicit stable name referenced by
-- the RPC so fresh and hosted databases behave identically.
alter table public.organization_enrollment_credentials
  rename constraint organization_enrollment_crede_organization_id_authorized_ro_key
  to organization_enrollment_credentials_organization_id_authorized_;
