-- Synora Audio - Optional hard guarantee: unique sent_ref per user for SENT payouts
-- This migration is safe to run even if duplicates exist: it will SKIP creating the unique index.
-- Use it after cleaning legacy duplicates.

do $$
declare
  dup_count bigint;
begin
  select count(*) into dup_count
  from (
    select user_id, sent_ref
    from public.payout_requests
    where status = 'SENT' and sent_ref is not null and btrim(sent_ref) <> ''
    group by user_id, sent_ref
    having count(*) > 1
  ) d;

  if dup_count = 0 then
    execute 'create unique index if not exists payout_sent_ref_unique_per_user on public.payout_requests (user_id, sent_ref) where status = ''SENT'' and sent_ref is not null';
  else
    raise notice 'Skipping unique index payout_sent_ref_unique_per_user: found % duplicate (user_id,sent_ref) among SENT payouts. Clean duplicates first.', dup_count;
  end if;
end $$;

