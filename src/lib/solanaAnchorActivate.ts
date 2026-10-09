export type SolanaAnchorClaim = {
  ok: boolean;
  status: string;
  claim_acquired: boolean;
  network: string | null;
  fingerprint_sha256_hex: string | null;
  tx_signature: string | null;
  recent_blockhash: string | null;
  last_valid_block_height: number | null;
  raw_tx_base64: string | null;
  anchored_at: string | null;
  err: string | null;
};

export type SolanaPreparedTx = {
  tx_signature: string;
  recent_blockhash: string;
  last_valid_block_height: number;
  raw_tx_base64: string;
};

export type SolanaAnchorPrepared = SolanaPreparedTx & {
  persisted_ok: boolean;
  persisted_status: string;
};

export type SolanaActivationGate = {
  allowed: boolean;
  reason:
    | "winner_prepared"
    | "observer_prepared"
    | "observer_confirmed"
    | "blocked_pending_observer"
    | "blocked_pending_winner_not_prepared"
    | "blocked_claim_not_ok"
    | "blocked_status";
};

export async function prepareSolanaAnchorPreparedBeforeBroadcast(input: {
  split_id: string;
  user_id: string;
  fingerprint_sha256_hex: string;
  claim: (args: { split_id: string; user_id: string; fingerprint_sha256_hex: string }) => Promise<SolanaAnchorClaim>;
  buildSignedTx: (args: { fingerprint_sha256_hex: string }) => Promise<SolanaPreparedTx>;
  setPrepared: (args: {
    split_id: string;
    user_id: string;
    fingerprint_sha256_hex: string;
    tx_signature: string;
    recent_blockhash: string;
    last_valid_block_height: number;
    raw_tx_base64: string;
  }) => Promise<{ ok: boolean; status: string }>;
}): Promise<{ claim: SolanaAnchorClaim; prepared: SolanaAnchorPrepared | null; gate: SolanaActivationGate }> {
  const { split_id, user_id, fingerprint_sha256_hex } = input;

  const claim = await input.claim({ split_id, user_id, fingerprint_sha256_hex });

  if (!claim.ok) {
    return { claim, prepared: null, gate: { allowed: false, reason: "blocked_claim_not_ok" } };
  }

  // Only winner can build/sign on first cycle.
  if (!(claim.status === "pending" && claim.claim_acquired === true)) {
    if (claim.status === "pending" && claim.claim_acquired === false) {
      return { claim, prepared: null, gate: { allowed: false, reason: "blocked_pending_observer" } };
    }
    if (claim.status === "prepared") {
      return { claim, prepared: null, gate: { allowed: true, reason: "observer_prepared" } };
    }
    if (claim.status === "confirmed") {
      return { claim, prepared: null, gate: { allowed: true, reason: "observer_confirmed" } };
    }
    return { claim, prepared: null, gate: { allowed: false, reason: "blocked_status" } };
  }

  const built = await input.buildSignedTx({ fingerprint_sha256_hex });

  const persisted = await input.setPrepared({
    split_id,
    user_id,
    fingerprint_sha256_hex,
    tx_signature: built.tx_signature,
    recent_blockhash: built.recent_blockhash,
    last_valid_block_height: built.last_valid_block_height,
    raw_tx_base64: built.raw_tx_base64,
  });

  if (!(persisted.ok && persisted.status === "prepared")) {
    return {
      claim,
      prepared: {
        ...built,
        persisted_ok: persisted.ok,
        persisted_status: persisted.status,
      },
      gate: { allowed: false, reason: "blocked_pending_winner_not_prepared" },
    };
  }

  return {
    claim,
    prepared: {
      ...built,
      persisted_ok: persisted.ok,
      persisted_status: persisted.status,
    },
    gate: { allowed: true, reason: "winner_prepared" },
  };
}
