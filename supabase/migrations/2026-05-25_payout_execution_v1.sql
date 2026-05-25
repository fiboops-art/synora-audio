-- Synora Audio - Payout execution / reconciliation fields (v1)

-- Adds operational audit columns for APPROVED -> SENT workflow.

alter table public.payout_requests add column if not exists payout_method text;
alter table public.payout_requests add column if not exists sent_by uuid;

-- Helpful indexes for ops console
create index if not exists payout_requests_user_status_idx on public.payout_requests (user_id, status, created_at desc);
create index if not exists payout_requests_user_method_idx on public.payout_requests (user_id, payout_method, created_at desc);
create index if not exists payout_requests_user_sent_ref_idx on public.payout_requests (user_id, sent_ref);

