import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimSolanaAnchorV12Result = {
  ok: boolean;
  status: string;
  claim_acquired: boolean;
  fingerprint_sha256_hex: string | null;
  network: string | null;
  tx_signature: string | null;
  recent_blockhash: string | null;
  last_valid_block_height: number | null;
  raw_tx_base64: string | null;
  anchored_at: string | null;
  err: string | null;
};

export async function rpcClaimSolanaAnchorV12(input: {
  service: SupabaseClient;
  split_id: string;
  user_id: string;
  fingerprint_sha256_hex: string;
}): Promise<ClaimSolanaAnchorV12Result> {
  const { service, split_id, user_id, fingerprint_sha256_hex } = input;
  const { data, error } = await service.rpc("claim_recording_split_solana_anchor", {
    p_split_id: split_id,
    p_user_id: user_id,
    p_fingerprint_sha256_hex: fingerprint_sha256_hex,
  });
  if (error) throw new Error(`claim_recording_split_solana_anchor failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as unknown as ClaimSolanaAnchorV12Result | null;
  if (!row) throw new Error("claim_recording_split_solana_anchor returned empty result");
  return row;
}

export type SetPreparedSolanaAnchorV12Result = {
  ok: boolean;
  status: string;
  fingerprint_sha256_hex: string | null;
  network: string | null;
  tx_signature: string | null;
  recent_blockhash: string | null;
  last_valid_block_height: number | null;
  raw_tx_base64: string | null;
  anchored_at: string | null;
  err: string | null;
};

export async function rpcSetPreparedSolanaAnchorV12(input: {
  service: SupabaseClient;
  split_id: string;
  user_id: string;
  fingerprint_sha256_hex: string;
  tx_signature: string;
  recent_blockhash: string;
  last_valid_block_height: number;
  raw_tx_base64: string;
}): Promise<SetPreparedSolanaAnchorV12Result> {
  const { service, split_id, user_id, fingerprint_sha256_hex, tx_signature, recent_blockhash, last_valid_block_height, raw_tx_base64 } =
    input;
  const { data, error } = await service.rpc("set_recording_split_solana_anchor_prepared", {
    p_split_id: split_id,
    p_user_id: user_id,
    p_fingerprint_sha256_hex: fingerprint_sha256_hex,
    p_tx_signature: tx_signature,
    p_recent_blockhash: recent_blockhash,
    p_last_valid_block_height: last_valid_block_height,
    p_raw_tx_base64: raw_tx_base64,
  });
  if (error) throw new Error(`set_recording_split_solana_anchor_prepared failed: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as unknown as SetPreparedSolanaAnchorV12Result | null;
  if (!row) throw new Error("set_recording_split_solana_anchor_prepared returned empty result");
  return row;
}

