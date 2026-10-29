# Duplicate Week

Owners can copy saved Monday–Saturday group programming to the immediately following week. Sunday is not supported by the existing calendar/table constraint. All editable content currently lives in `raw_workout_text`: titles, labels, notes, spacing and line breaks are copied byte-for-byte. No parsing or new workout fields are introduced.

The existing week toolbar adds **Duplicate Week**. Empty destinations copy immediately; occupied destinations offer **Copy only into empty days**, **Replace existing programmed days**, and **Cancel**. Unsaved editor changes use the existing save/discard dialog first. Success opens the next week; editing, Save Draft and Publish Week remain the existing workflow.

One additive migration adds a public invoker RPC and private write helper, following the existing restricted-RPC pattern. There are no new tables, columns, RLS policies, or changes to existing saves/publication. Active Owner membership is checked server-side and again in SQL. Organization identity comes from membership, with no gym ID parameter. Existing Coach editing permissions do not grant duplication.

One database transaction locks both calendar weeks using the existing save date-lock keys and row locks. Copies create independent destination IDs and fresh draft versions; explicit replacements keep earlier destination versions recoverable but reset current publication/sync flags. Dates without corresponding source rows remain untouched. No original rows, version history or Mindbody records are changed.

Date arithmetic uses SQL `date + 7` and the existing calendar-date client helpers, avoiding DST/UTC shifts. Existing unique gym/date constraints and the in-flight UI guard prevent duplicate rows. Replacement requires the destination revisions shown at conflict confirmation; later edits abort the entire operation. A repeated completed replacement is a no-op rather than another revision. An interrupted response can be retried safely: occupied destinations require another explicit choice, and conflicting edits cannot be silently overwritten.

Schema reversal, if required: drop `public.duplicate_group_programming_week(date,text,jsonb)`, then `private.duplicate_group_programming_week(date,text,jsonb)`. Preserve all copied programming and history. Existing migrations must not be reapplied.

Verification includes the rollback-only `supabase/tests/duplicate_group_week_rls.sql`, existing group-programming RLS suite, unit action/date checks and authenticated `tests/group-programming.spec.ts`. Browser fixtures use an isolated disposable QA organization; they must never overwrite an existing gym's actual programming.
