-- The private trigger must inspect trainer membership during authorized row updates.
-- The existing trigger checks, table RLS, and restricted function grants still apply.
alter function private.enforce_workout_identity() security definer;
