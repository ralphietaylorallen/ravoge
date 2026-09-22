create index owner_signup_intents_consumed_by_idx
  on private.owner_signup_intents (consumed_by)
  where consumed_by is not null;

comment on index private.owner_signup_intents_consumed_by_idx is
  'Covers the auth.users foreign key used by completed first-owner provisioning records.';
