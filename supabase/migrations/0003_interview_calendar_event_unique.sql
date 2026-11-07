-- One interview per Google Calendar event, per user.
--
-- Calendar sync and "Track interview" already check for an existing interview
-- before inserting; this index makes the database enforce it too, so two syncs
-- running at the same moment (e.g. the background refresh and a manual click
-- in another tab) can never create a duplicate.
--
-- Safe to apply at any time. If it fails because duplicates already exist,
-- list them with:
--   select user_id, google_event_id, count(*) from public.interviews
--   where google_event_id is not null group by 1, 2 having count(*) > 1;

create unique index if not exists interviews_user_google_event_unique
  on public.interviews (user_id, google_event_id)
  where google_event_id is not null;
