-- "On hold": still hired, but paused. The client keeps you for future or
-- per-diem work and will call when you are needed.
--
-- Safe to run more than once. Paste into the Supabase SQL editor and run.
-- (ALTER TYPE ... ADD VALUE must run on its own, outside a transaction block.)

alter type public.application_status add value if not exists 'on_hold' after 'hired';
