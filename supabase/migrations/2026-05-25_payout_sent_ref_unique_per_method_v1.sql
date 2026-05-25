-- Synora Audio - Optional hard guarantee: unique settlement proof per user+method for SENT payouts
-- Creates a partial unique index only if there are no duplicates already.

do $$
declare
  dup_count bigint;
begin
  select count(*) into dup_count
  from (
    select user_id, payout_method, sent_ref
    from public.payout_requests
    where status = 'SENT'
      and payout_method is not null
      and sent_ref is not null
      and btrim(sent_ref) <> ''
    group by user_id, payout_method, sent_ref
    having count(*) > 1
  ) d;

  if dup_count = 0 then
    execute 'create unique index if not exists payout_sent_ref_unique_per_user_method on public.payout_requests (user_id, payout_method, sent_ref) where status = ''SENT'' and payout_method is not null and sent_ref is not null';
  else
    raise notice 'Skipping unique index payout_sent_ref_unique_per_user_method: found % duplicate (user_id,payout_method,sent_ref) among SENT payouts. Clean duplicates first.', dup_count;
  end if;
end $$;

