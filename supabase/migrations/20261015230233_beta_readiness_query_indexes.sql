-- Cover the complete composite foreign keys identified by the advisor.
create index training_library_reviews_source_scope_idx
  on public.training_library_reviews(training_item_id,organization_id);
create index intake_generation_safety_intake_scope_idx
  on public.intake_generation_safety_reviews(intake_id,organization_id,client_user_id);
