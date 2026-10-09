import test from "node:test";
import assert from "node:assert/strict";

import { prepareSolanaAnchorPreparedBeforeBroadcast } from "@/lib/solanaAnchorActivate";

const split_id = "22222222-2222-2222-2222-222222222222";
const user_id = "11111111-1111-1111-1111-111111111111";
const fp = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("only claim winner builds/signs + persists prepared", async () => {
  let builtCount = 0;
  let setPreparedCount = 0;

  const out = await prepareSolanaAnchorPreparedBeforeBroadcast({
    split_id,
    user_id,
    fingerprint_sha256_hex: fp,
    claim: async () => ({
      ok: true,
      status: "pending",
      claim_acquired: true,
      network: "devnet",
      fingerprint_sha256_hex: fp,
      tx_signature: null,
      recent_blockhash: null,
      last_valid_block_height: null,
      raw_tx_base64: null,
      anchored_at: null,
      err: null,
    }),
    buildSignedTx: async () => {
      builtCount++;
      return {
        tx_signature: "sig1",
        recent_blockhash: "bh1",
        last_valid_block_height: 123,
        raw_tx_base64: "raw1",
      };
    },
    setPrepared: async (args) => {
      setPreparedCount++;
      assert.equal(args.tx_signature, "sig1");
      assert.equal(args.recent_blockhash, "bh1");
      assert.equal(args.last_valid_block_height, 123);
      assert.equal(args.raw_tx_base64, "raw1");
      return { ok: true, status: "prepared" };
    },
  });

  assert.equal(out.claim.claim_acquired, true);
  assert.ok(out.prepared);
  assert.equal(out.gate.allowed, true);
  assert.equal(out.gate.reason, "winner_prepared");
  assert.equal(out.prepared?.persisted_ok, true);
  assert.equal(out.prepared?.persisted_status, "prepared");
  assert.equal(builtCount, 1);
  assert.equal(setPreparedCount, 1);
});

test("observer does not build/sign when claim_acquired=false", async () => {
  let builtCount = 0;
  let setPreparedCount = 0;

  const out = await prepareSolanaAnchorPreparedBeforeBroadcast({
    split_id,
    user_id,
    fingerprint_sha256_hex: fp,
    claim: async () => ({
      ok: true,
      status: "pending",
      claim_acquired: false,
      network: "devnet",
      fingerprint_sha256_hex: fp,
      tx_signature: null,
      recent_blockhash: null,
      last_valid_block_height: null,
      raw_tx_base64: null,
      anchored_at: null,
      err: null,
    }),
    buildSignedTx: async () => {
      builtCount++;
      return {
        tx_signature: "sig1",
        recent_blockhash: "bh1",
        last_valid_block_height: 123,
        raw_tx_base64: "raw1",
      };
    },
    setPrepared: async () => {
      setPreparedCount++;
      return { ok: true, status: "prepared" };
    },
  });

  assert.equal(out.claim.claim_acquired, false);
  assert.equal(out.prepared, null);
  assert.equal(out.gate.allowed, false);
  assert.equal(out.gate.reason, "blocked_pending_observer");
  assert.equal(builtCount, 0);
  assert.equal(setPreparedCount, 0);
});

test("fingerprint conflict does not build/sign and returns prepared=null", async () => {
  let builtCount = 0;
  let setPreparedCount = 0;

  const out = await prepareSolanaAnchorPreparedBeforeBroadcast({
    split_id,
    user_id,
    fingerprint_sha256_hex: fp,
    claim: async () => ({
      ok: false,
      status: "conflict",
      claim_acquired: false,
      network: "devnet",
      fingerprint_sha256_hex: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      tx_signature: "sigX",
      recent_blockhash: "bhX",
      last_valid_block_height: 999,
      raw_tx_base64: "rawX",
      anchored_at: null,
      err: null,
    }),
    buildSignedTx: async () => {
      builtCount++;
      return {
        tx_signature: "sig1",
        recent_blockhash: "bh1",
        last_valid_block_height: 123,
        raw_tx_base64: "raw1",
      };
    },
    setPrepared: async () => {
      setPreparedCount++;
      return { ok: true, status: "prepared" };
    },
  });

  assert.equal(out.claim.ok, false);
  assert.equal(out.claim.status, "conflict");
  assert.equal(out.prepared, null);
  assert.equal(out.gate.allowed, false);
  assert.equal(out.gate.reason, "blocked_claim_not_ok");
  assert.equal(builtCount, 0);
  assert.equal(setPreparedCount, 0);
});

test("no broadcast evidence: prepare flow never calls sendRawTransaction", async () => {
  // This is a structural test: prepareSolanaAnchorPreparedBeforeBroadcast has no broadcast dependency.
  const out = await prepareSolanaAnchorPreparedBeforeBroadcast({
    split_id,
    user_id,
    fingerprint_sha256_hex: fp,
    claim: async () => ({
      ok: true,
      status: "pending",
      claim_acquired: true,
      network: "devnet",
      fingerprint_sha256_hex: fp,
      tx_signature: null,
      recent_blockhash: null,
      last_valid_block_height: null,
      raw_tx_base64: null,
      anchored_at: null,
      err: null,
    }),
    buildSignedTx: async () => ({
      tx_signature: "sig1",
      recent_blockhash: "bh1",
      last_valid_block_height: 123,
      raw_tx_base64: "raw1",
    }),
    setPrepared: async () => ({ ok: true, status: "prepared" }),
  });

  assert.ok(out.prepared);
  assert.equal(out.gate.allowed, true);
});

test("observer pending -> active MUST NOT happen (gate blocks activation)", async () => {
  const out = await prepareSolanaAnchorPreparedBeforeBroadcast({
    split_id,
    user_id,
    fingerprint_sha256_hex: fp,
    claim: async () => ({
      ok: true,
      status: "pending",
      claim_acquired: false,
      network: "devnet",
      fingerprint_sha256_hex: fp,
      tx_signature: null,
      recent_blockhash: null,
      last_valid_block_height: null,
      raw_tx_base64: null,
      anchored_at: null,
      err: null,
    }),
    buildSignedTx: async () => {
      throw new Error("MUST NOT build/sign for observer pending");
    },
    setPrepared: async () => {
      throw new Error("MUST NOT set prepared for observer pending");
    },
  });

  assert.equal(out.gate.allowed, false);
  assert.equal(out.gate.reason, "blocked_pending_observer");
  assert.equal(out.prepared, null);
});

test("observer prepared may activate without build/sign", async () => {
  let builtCount = 0;
  let setPreparedCount = 0;

  const out = await prepareSolanaAnchorPreparedBeforeBroadcast({
    split_id,
    user_id,
    fingerprint_sha256_hex: fp,
    claim: async () => ({
      ok: true,
      status: "prepared",
      claim_acquired: false,
      network: "devnet",
      fingerprint_sha256_hex: fp,
      tx_signature: "sig_existing",
      recent_blockhash: "bh_existing",
      last_valid_block_height: 111,
      raw_tx_base64: "raw_existing",
      anchored_at: null,
      err: null,
    }),
    buildSignedTx: async () => {
      builtCount++;
      return {
        tx_signature: "sig1",
        recent_blockhash: "bh1",
        last_valid_block_height: 123,
        raw_tx_base64: "raw1",
      };
    },
    setPrepared: async () => {
      setPreparedCount++;
      return { ok: true, status: "prepared" };
    },
  });

  assert.equal(out.gate.allowed, true);
  assert.equal(out.gate.reason, "observer_prepared");
  assert.equal(out.prepared, null);
  assert.equal(builtCount, 0);
  assert.equal(setPreparedCount, 0);
});
