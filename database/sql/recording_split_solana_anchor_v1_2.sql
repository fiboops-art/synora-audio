CREATE OR REPLACE FUNCTION public.claim_recording_split_solana_anchor(p_split_id uuid, p_user_id uuid, p_fingerprint_sha256_hex text)
 RETURNS TABLE(ok boolean, status text, claim_acquired boolean, fingerprint_sha256_hex text, network text, tx_signature text, recent_blockhash text, last_valid_block_height bigint, raw_tx_base64 text, anchored_at timestamp with time zone, err text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fp text;
  v_anchor jsonb;
  v_row_exists boolean;
begin
  if p_user_id is null then
    return query select false,'unauthorized',false,null,null,null,null,null,null,null,null;
    return;
  end if;

  v_fp := coalesce(trim(p_fingerprint_sha256_hex), '');
  if v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid fingerprint_sha256_hex';
  end if;

  -- First claim: anchor does not yet exist.
  update public.recording_splits rs
     set meta = jsonb_set(
       coalesce(rs.meta, '{}'::jsonb),
       '{solana_anchor}',
       jsonb_build_object(
         'fingerprint_sha256_hex', v_fp,
         'network', 'devnet',
         'status', 'pending',
         'retry_claim_available', false,
         'tx_signature', null,
         'recent_blockhash', null,
         'last_valid_block_height', null,
         'raw_tx_base64', null,
         'anchored_at', null,
         'err', null
       ),
       true
     )
   where rs.id = p_split_id
     and rs.user_id = p_user_id
     and (rs.meta is null or rs.meta->'solana_anchor' is null)
  returning true,'pending',true,v_fp,'devnet',
            null::text,null::text,null::bigint,null::text,null::timestamptz,null::text
    into ok,status,claim_acquired,fingerprint_sha256_hex,network,
         tx_signature,recent_blockhash,last_valid_block_height,
         raw_tx_base64,anchored_at,err;

  if found then
    return next;
    return;
  end if;

  -- Recovery claim: atomically consume one retry authorization.
  update public.recording_splits rs
     set meta = jsonb_set(
       rs.meta,
       '{solana_anchor,retry_claim_available}',
       'false'::jsonb,
       true
     )
   where rs.id = p_split_id
     and rs.user_id = p_user_id
     and rs.meta->'solana_anchor'->>'network' = 'devnet'
     and rs.meta->'solana_anchor'->>'fingerprint_sha256_hex' = v_fp
     and rs.meta->'solana_anchor'->>'status' = 'pending'
     and coalesce(
           (rs.meta->'solana_anchor'->>'retry_claim_available')::boolean,
           false
         ) = true
  returning true,'pending',true,v_fp,'devnet',
            nullif(rs.meta->'solana_anchor'->>'tx_signature',''),
            nullif(rs.meta->'solana_anchor'->>'recent_blockhash',''),
            nullif(rs.meta->'solana_anchor'->>'last_valid_block_height','')::bigint,
            nullif(rs.meta->'solana_anchor'->>'raw_tx_base64',''),
            nullif(rs.meta->'solana_anchor'->>'anchored_at','')::timestamptz,
            nullif(rs.meta->'solana_anchor'->>'err','')
    into ok,status,claim_acquired,fingerprint_sha256_hex,network,
         tx_signature,recent_blockhash,last_valid_block_height,
         raw_tx_base64,anchored_at,err;

  if found then
    return next;
    return;
  end if;

  select (rs.id is not null), rs.meta->'solana_anchor'
    into v_row_exists, v_anchor
    from public.recording_splits rs
   where rs.id = p_split_id
     and rs.user_id = p_user_id;

  if not v_row_exists then
    return query select false,'not_found',false,null,null,null,null,null,null,null,null;
    return;
  end if;

  if v_anchor is null then
    return query select false,'retry',false,null,null,null,null,null,null,null,null;
    return;
  end if;

  if coalesce(v_anchor->>'network','devnet') <> 'devnet' then
    return query
      select false,'conflict',false,
             v_anchor->>'fingerprint_sha256_hex',
             v_anchor->>'network',
             v_anchor->>'tx_signature',
             v_anchor->>'recent_blockhash',
             nullif(v_anchor->>'last_valid_block_height','')::bigint,
             v_anchor->>'raw_tx_base64',
             nullif(v_anchor->>'anchored_at','')::timestamptz,
             v_anchor->>'err';
    return;
  end if;

  if coalesce(v_anchor->>'fingerprint_sha256_hex','') = v_fp then
    return query
      select true,
             coalesce(v_anchor->>'status','pending'),
             false,
             v_fp,
             'devnet',
             nullif(v_anchor->>'tx_signature',''),
             nullif(v_anchor->>'recent_blockhash',''),
             nullif(v_anchor->>'last_valid_block_height','')::bigint,
             nullif(v_anchor->>'raw_tx_base64',''),
             nullif(v_anchor->>'anchored_at','')::timestamptz,
             nullif(v_anchor->>'err','');
    return;
  end if;

  return query
    select false,'conflict',false,
           v_anchor->>'fingerprint_sha256_hex',
           'devnet',
           v_anchor->>'tx_signature',
           v_anchor->>'recent_blockhash',
           nullif(v_anchor->>'last_valid_block_height','')::bigint,
           v_anchor->>'raw_tx_base64',
           nullif(v_anchor->>'anchored_at','')::timestamptz,
           v_anchor->>'err';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.retry_recording_split_solana_anchor_from_expired(p_split_id uuid, p_user_id uuid, p_fingerprint_sha256_hex text, p_prev_tx_signature text, p_prev_recent_blockhash text, p_prev_last_valid_block_height bigint)
 RETURNS TABLE(ok boolean, status text, fingerprint_sha256_hex text, network text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fp text;
  v_sig text;
  v_bh text;
  v_lvb bigint;
begin
  if p_user_id is null then
    return query select false,'unauthorized',null,null;
    return;
  end if;

  v_fp := coalesce(trim(p_fingerprint_sha256_hex), '');
  if v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid fingerprint_sha256_hex';
  end if;

  v_sig := coalesce(trim(p_prev_tx_signature), '');
  if length(v_sig) < 20 then
    raise exception 'invalid prev_tx_signature';
  end if;

  v_bh := coalesce(trim(p_prev_recent_blockhash), '');
  if length(v_bh) < 20 then
    raise exception 'invalid prev_recent_blockhash';
  end if;

  v_lvb := p_prev_last_valid_block_height;
  if v_lvb is null or v_lvb <= 0 then
    raise exception 'invalid prev_last_valid_block_height';
  end if;

  update public.recording_splits rs
     set meta = jsonb_set(
       coalesce(rs.meta, '{}'::jsonb),
       '{solana_anchor}',
       (
         coalesce(rs.meta->'solana_anchor','{}'::jsonb)
         || jsonb_build_object(
              'history',
              coalesce(rs.meta->'solana_anchor'->'history','[]'::jsonb)
              || jsonb_build_array(rs.meta->'solana_anchor')
            )
         || jsonb_build_object(
              'fingerprint_sha256_hex', v_fp,
              'network', 'devnet',
              'status', 'pending',
              'retry_claim_available', true,
              'tx_signature', null,
              'recent_blockhash', null,
              'last_valid_block_height', null,
              'raw_tx_base64', null,
              'anchored_at', null,
              'err', null
            )
       ),
       true
     )
   where rs.id = p_split_id
     and rs.user_id = p_user_id
     and rs.meta->'solana_anchor'->>'network' = 'devnet'
     and rs.meta->'solana_anchor'->>'fingerprint_sha256_hex' = v_fp
     and rs.meta->'solana_anchor'->>'status' = 'expired'
     and rs.meta->'solana_anchor'->>'tx_signature' = v_sig
     and rs.meta->'solana_anchor'->>'recent_blockhash' = v_bh
     and nullif(rs.meta->'solana_anchor'->>'last_valid_block_height','')::bigint = v_lvb;

  if found then
    return query select true,'pending',v_fp,'devnet';
    return;
  end if;

  return query select false,'not_found',null,null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_recording_split_solana_anchor_confirmed(p_split_id uuid, p_user_id uuid, p_fingerprint_sha256_hex text, p_tx_signature text, p_anchored_at timestamp with time zone)
 RETURNS TABLE(ok boolean, status text, fingerprint_sha256_hex text, network text, tx_signature text, recent_blockhash text, last_valid_block_height bigint, raw_tx_base64 text, anchored_at timestamp with time zone, err text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fp text;
  v_sig text;
  v_anchor jsonb;
  v_row_exists boolean;
begin
  if p_user_id is null then
    return query select false, 'unauthorized', null, null, null, null, null, null, null, null;
    return;
  end if;

  v_fp := coalesce(trim(p_fingerprint_sha256_hex), '');
  if v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid fingerprint_sha256_hex';
  end if;

  v_sig := coalesce(trim(p_tx_signature), '');
  if length(v_sig) < 20 then
    raise exception 'invalid tx_signature';
  end if;

  if p_anchored_at is null then
    raise exception 'invalid anchored_at';
  end if;

  update public.recording_splits rs
     set meta = jsonb_set(
       coalesce(rs.meta, '{}'::jsonb),
       '{solana_anchor}',
       (
         coalesce(rs.meta->'solana_anchor','{}'::jsonb)
         || jsonb_build_object(
              'status', 'confirmed',
              'tx_signature', v_sig,
              'anchored_at', p_anchored_at,
              'err', null
            )
       ),
       true
     )
   where rs.id = p_split_id
     and rs.user_id = p_user_id
     and rs.meta->'solana_anchor' is not null
     and (rs.meta->'solana_anchor'->>'network') = 'devnet'
     and (rs.meta->'solana_anchor'->>'fingerprint_sha256_hex') = v_fp
     and (rs.meta->'solana_anchor'->>'tx_signature') = v_sig
     and (rs.meta->'solana_anchor'->>'status') = 'prepared'
  returning true,
            'confirmed',
            v_fp,
            'devnet',
            v_sig,
            rs.meta->'solana_anchor'->>'recent_blockhash',
            nullif(rs.meta->'solana_anchor'->>'last_valid_block_height','')::bigint,
            rs.meta->'solana_anchor'->>'raw_tx_base64',
            p_anchored_at,
            null::text
    into ok, status, fingerprint_sha256_hex, network, tx_signature, recent_blockhash, last_valid_block_height, raw_tx_base64, anchored_at, err;

  if found then
    return next;
    return;
  end if;

  select (rs.id is not null), (rs.meta->'solana_anchor')
    into v_row_exists, v_anchor
    from public.recording_splits rs
   where rs.id = p_split_id
     and rs.user_id = p_user_id;

  if not v_row_exists then
    return query select false, 'not_found', null, null, null, null, null, null, null, null;
    return;
  end if;

  if v_anchor is null then
    return query select false, 'no_claim', null, null, null, null, null, null, null, null;
    return;
  end if;

  if coalesce(v_anchor->>'fingerprint_sha256_hex','') <> v_fp then
    return query select false,
                      'conflict',
                      v_anchor->>'fingerprint_sha256_hex',
                      'devnet',
                      v_anchor->>'tx_signature',
                      v_anchor->>'recent_blockhash',
                      nullif(v_anchor->>'last_valid_block_height','')::bigint,
                      v_anchor->>'raw_tx_base64',
                      nullif(v_anchor->>'anchored_at','')::timestamptz,
                      v_anchor->>'err';
    return;
  end if;

  return query select true,
                    coalesce(v_anchor->>'status','prepared'),
                    v_fp,
                    'devnet',
                    v_sig,
                    nullif(v_anchor->>'recent_blockhash',''),
                    nullif(v_anchor->>'last_valid_block_height','')::bigint,
                    nullif(v_anchor->>'raw_tx_base64',''),
                    nullif(v_anchor->>'anchored_at','')::timestamptz,
                    nullif(v_anchor->>'err','');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_recording_split_solana_anchor_prepared(p_split_id uuid, p_user_id uuid, p_fingerprint_sha256_hex text, p_tx_signature text, p_recent_blockhash text, p_last_valid_block_height bigint, p_raw_tx_base64 text)
 RETURNS TABLE(ok boolean, status text, fingerprint_sha256_hex text, network text, tx_signature text, recent_blockhash text, last_valid_block_height bigint, raw_tx_base64 text, anchored_at timestamp with time zone, err text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fp text;
  v_sig text;
  v_bh text;
  v_raw text;
  v_anchor jsonb;
  v_row_exists boolean;
begin
  if p_user_id is null then
    return query select false, 'unauthorized', null, null, null, null, null, null, null, null;
    return;
  end if;

  v_fp := coalesce(trim(p_fingerprint_sha256_hex), '');
  if v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid fingerprint_sha256_hex';
  end if;

  v_sig := coalesce(trim(p_tx_signature), '');
  if length(v_sig) < 20 then
    raise exception 'invalid tx_signature';
  end if;

  v_bh := coalesce(trim(p_recent_blockhash), '');
  if length(v_bh) < 20 then
    raise exception 'invalid recent_blockhash';
  end if;

  if p_last_valid_block_height is null or p_last_valid_block_height <= 0 then
    raise exception 'invalid last_valid_block_height';
  end if;

  v_raw := coalesce(trim(p_raw_tx_base64), '');
  if v_raw = '' then
    raise exception 'invalid raw_tx_base64';
  end if;

  -- Atomic transition pending -> prepared (CAS on fingerprint + status)
  update public.recording_splits rs
     set meta = jsonb_set(
       coalesce(rs.meta, '{}'::jsonb),
       '{solana_anchor}',
       (
         coalesce(rs.meta->'solana_anchor','{}'::jsonb)
         || jsonb_build_object(
              'fingerprint_sha256_hex', v_fp,
              'network', 'devnet',
              'status', 'prepared',
              'tx_signature', v_sig,
              'recent_blockhash', v_bh,
              'last_valid_block_height', p_last_valid_block_height,
              'raw_tx_base64', v_raw,
              'anchored_at', null,
              'err', null
            )
       ),
       true
     )
   where rs.id = p_split_id
     and rs.user_id = p_user_id
     and rs.meta->'solana_anchor' is not null
     and (rs.meta->'solana_anchor'->>'network') = 'devnet'
     and (rs.meta->'solana_anchor'->>'fingerprint_sha256_hex') = v_fp
     and (rs.meta->'solana_anchor'->>'status') = 'pending'
  returning true,
            'prepared',
            v_fp,
            'devnet',
            v_sig,
            v_bh,
            p_last_valid_block_height,
            v_raw,
            null::timestamptz,
            null::text
    into ok, status, fingerprint_sha256_hex, network, tx_signature, recent_blockhash, last_valid_block_height, raw_tx_base64, anchored_at, err;

  if found then
    return next;
    return;
  end if;

  -- If not updated, return current state (owner-only)
  select (rs.id is not null), (rs.meta->'solana_anchor')
    into v_row_exists, v_anchor
    from public.recording_splits rs
   where rs.id = p_split_id
     and rs.user_id = p_user_id;

  if not v_row_exists then
    return query select false, 'not_found', null, null, null, null, null, null, null, null;
    return;
  end if;

  if v_anchor is null then
    return query select false, 'no_claim', null, null, null, null, null, null, null, null;
    return;
  end if;

  if coalesce(v_anchor->>'fingerprint_sha256_hex','') <> v_fp then
    return query select false,
                      'conflict',
                      v_anchor->>'fingerprint_sha256_hex',
                      'devnet',
                      v_anchor->>'tx_signature',
                      v_anchor->>'recent_blockhash',
                      nullif(v_anchor->>'last_valid_block_height','')::bigint,
                      v_anchor->>'raw_tx_base64',
                      nullif(v_anchor->>'anchored_at','')::timestamptz,
                      v_anchor->>'err';
    return;
  end if;

  return query select true,
                    coalesce(v_anchor->>'status','pending'),
                    v_fp,
                    'devnet',
                    nullif(v_anchor->>'tx_signature',''),
                    nullif(v_anchor->>'recent_blockhash',''),
                    nullif(v_anchor->>'last_valid_block_height','')::bigint,
                    nullif(v_anchor->>'raw_tx_base64',''),
                    nullif(v_anchor->>'anchored_at','')::timestamptz,
                    nullif(v_anchor->>'err','');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_recording_split_solana_anchor_recovery(p_split_id uuid, p_user_id uuid, p_fingerprint_sha256_hex text, p_tx_signature text, p_to_status text, p_err text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, status text, fingerprint_sha256_hex text, network text, tx_signature text, recent_blockhash text, last_valid_block_height bigint, raw_tx_base64 text, anchored_at timestamp with time zone, err text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fp text;
  v_sig text;
  v_to text;
  v_anchor jsonb;
  v_row_exists boolean;
begin
  if p_user_id is null then
    return query select false, 'unauthorized', null, null, null, null, null, null, null, null;
    return;
  end if;

  v_fp := coalesce(trim(p_fingerprint_sha256_hex), '');
  if v_fp !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid fingerprint_sha256_hex';
  end if;

  v_sig := coalesce(trim(p_tx_signature), '');
  if length(v_sig) < 20 then
    raise exception 'invalid tx_signature';
  end if;

  v_to := coalesce(trim(p_to_status), '');
  if v_to not in ('expired','failed') then
    raise exception 'invalid to_status';
  end if;

  if v_to = 'failed' and coalesce(trim(p_err),'') = '' then
    raise exception 'failed requires err';
  end if;

  update public.recording_splits rs
     set meta = jsonb_set(
       coalesce(rs.meta, '{}'::jsonb),
       '{solana_anchor}',
       (
         coalesce(rs.meta->'solana_anchor','{}'::jsonb)
         || jsonb_build_object(
              'status', v_to,
              'err', case when v_to = 'failed' then p_err else null end
            )
       ),
       true
     )
   where rs.id = p_split_id
     and rs.user_id = p_user_id
     and rs.meta->'solana_anchor' is not null
     and (rs.meta->'solana_anchor'->>'network') = 'devnet'
     and (rs.meta->'solana_anchor'->>'fingerprint_sha256_hex') = v_fp
     and (rs.meta->'solana_anchor'->>'tx_signature') = v_sig
     and (rs.meta->'solana_anchor'->>'status') = 'prepared'
  returning true,
            v_to,
            v_fp,
            'devnet',
            v_sig,
            rs.meta->'solana_anchor'->>'recent_blockhash',
            nullif(rs.meta->'solana_anchor'->>'last_valid_block_height','')::bigint,
            rs.meta->'solana_anchor'->>'raw_tx_base64',
            nullif(rs.meta->'solana_anchor'->>'anchored_at','')::timestamptz,
            case when v_to = 'failed' then p_err else null end
    into ok, status, fingerprint_sha256_hex, network, tx_signature, recent_blockhash, last_valid_block_height, raw_tx_base64, anchored_at, err;

  if found then
    return next;
    return;
  end if;

  select (rs.id is not null), (rs.meta->'solana_anchor')
    into v_row_exists, v_anchor
    from public.recording_splits rs
   where rs.id = p_split_id
     and rs.user_id = p_user_id;

  if not v_row_exists then
    return query select false, 'not_found', null, null, null, null, null, null, null, null;
    return;
  end if;

  if v_anchor is null then
    return query select false, 'no_claim', null, null, null, null, null, null, null, null;
    return;
  end if;

  if coalesce(v_anchor->>'fingerprint_sha256_hex','') <> v_fp then
    return query select false,
                      'conflict',
                      v_anchor->>'fingerprint_sha256_hex',
                      'devnet',
                      v_anchor->>'tx_signature',
                      v_anchor->>'recent_blockhash',
                      nullif(v_anchor->>'last_valid_block_height','')::bigint,
                      v_anchor->>'raw_tx_base64',
                      nullif(v_anchor->>'anchored_at','')::timestamptz,
                      v_anchor->>'err';
    return;
  end if;

  return query select true,
                    coalesce(v_anchor->>'status','prepared'),
                    v_fp,
                    'devnet',
                    nullif(v_anchor->>'tx_signature',''),
                    nullif(v_anchor->>'recent_blockhash',''),
                    nullif(v_anchor->>'last_valid_block_height','')::bigint,
                    nullif(v_anchor->>'raw_tx_base64',''),
                    nullif(v_anchor->>'anchored_at','')::timestamptz,
                    nullif(v_anchor->>'err','');
end;
$function$
;
