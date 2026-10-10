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


export type SetConfirmedSolanaAnchorV12Result = {
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

export async function rpcSetConfirmedSolanaAnchorV12(input: {
  service: SupabaseClient;
  split_id: string;
  user_id: string;
  fingerprint_sha256_hex: string;
  tx_signature: string;
  anchored_at: string;
  confirmation: {
    slot: number;
    err: unknown | null;
    confirmationStatus: string | null;
  };
}): Promise<SetConfirmedSolanaAnchorV12Result> {
  const {
    service,
    split_id,
    user_id,
    fingerprint_sha256_hex,
    tx_signature,
    anchored_at,
    confirmation,
  } = input;

  const { data, error } = await service.rpc(
    "set_recording_split_solana_anchor_confirmed",
    {
      p_split_id: split_id,
      p_user_id: user_id,
      p_fingerprint_sha256_hex: fingerprint_sha256_hex,
      p_tx_signature: tx_signature,
      p_anchored_at: anchored_at,
      p_confirmation: confirmation,
    },
  );

  if (error) {
    throw new Error(
      `set_recording_split_solana_anchor_confirmed failed: ${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as unknown as
    | SetConfirmedSolanaAnchorV12Result
    | null;

  if (!row) {
    throw new Error(
      "set_recording_split_solana_anchor_confirmed returned empty result",
    );
  }

  return row;
}

export type SetRecoverySolanaAnchorV12Result = {
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

export async function rpcSetRecoverySolanaAnchorV12(input: {
  service: SupabaseClient;
  split_id: string;
  user_id: string;
  fingerprint_sha256_hex: string;
  tx_signature: string;
  to_status: "expired" | "failed";
  err?: string | null;
}): Promise<SetRecoverySolanaAnchorV12Result> {
  const { data, error } = await input.service.rpc(
    "set_recording_split_solana_anchor_recovery",
    {
      p_split_id: input.split_id,
      p_user_id: input.user_id,
      p_fingerprint_sha256_hex: input.fingerprint_sha256_hex,
      p_tx_signature: input.tx_signature,
      p_to_status: input.to_status,
      p_err: input.err ?? null,
    },
  );

  if (error) {
    throw new Error(
      `set_recording_split_solana_anchor_recovery failed: ${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as unknown as
    | SetRecoverySolanaAnchorV12Result
    | null;

  if (!row) {
    throw new Error(
      "set_recording_split_solana_anchor_recovery returned empty result",
    );
  }

  return row;
}

export type RetryExpiredSolanaAnchorV12Result = {
  ok: boolean;
  status: string;
  fingerprint_sha256_hex: string | null;
  network: string | null;
};

export async function rpcRetrySolanaAnchorFromExpiredV12(input: {
  service: SupabaseClient;
  split_id: string;
  user_id: string;
  fingerprint_sha256_hex: string;
  prev_tx_signature: string;
  prev_recent_blockhash: string;
  prev_last_valid_block_height: number;
}): Promise<RetryExpiredSolanaAnchorV12Result> {
  const { data, error } = await input.service.rpc(
    "retry_recording_split_solana_anchor_from_expired",
    {
      p_split_id: input.split_id,
      p_user_id: input.user_id,
      p_fingerprint_sha256_hex: input.fingerprint_sha256_hex,
      p_prev_tx_signature: input.prev_tx_signature,
      p_prev_recent_blockhash: input.prev_recent_blockhash,
      p_prev_last_valid_block_height: input.prev_last_valid_block_height,
    },
  );

  if (error) {
    throw new Error(
      `retry_recording_split_solana_anchor_from_expired failed: ${error.message}`,
    );
  }

  const row = (Array.isArray(data) ? data[0] : data) as unknown as
    | RetryExpiredSolanaAnchorV12Result
    | null;

  if (!row) {
    throw new Error(
      "retry_recording_split_solana_anchor_from_expired returned empty result",
    );
  }

  return row;
}
