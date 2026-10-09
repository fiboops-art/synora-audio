import test from "node:test";
import assert from "node:assert/strict";

import { buildSplitActivationCanonicalPayloadV1, canonicalJsonString, sha256Hex } from "@/lib/splitActivationCanonical";

test("split.activate canonical payload v1 is order-invariant", () => {
  const common = {
    recording_id: "11111111-1111-1111-1111-111111111111",
    split_id: "22222222-2222-2222-2222-222222222222",
    split_version: 3,
    acceptances_required: 2,
    acceptances_accepted: 2,
    guardian_stage: "C",
  } as const;

  const payloadA = buildSplitActivationCanonicalPayloadV1({
    ...common,
    items: [
      { party_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "participant", share_bps: 5000 },
      { party_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "participant", share_bps: 5000 },
    ],
    accepting_party_ids: ["bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    activated_at: "2026-10-08T23:00:00.000Z",
    guardian_correlation_id: "33333333-3333-3333-3333-333333333333",
  });

  const payloadB = buildSplitActivationCanonicalPayloadV1({
    ...common,
    items: [
      { party_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "participant ", share_bps: 5000 },
      { party_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "participant", share_bps: 5000 },
    ],
    accepting_party_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    activated_at: "2026-10-09T00:00:00.000Z",
    guardian_correlation_id: "44444444-4444-4444-4444-444444444444",
  });

  const jsonA = canonicalJsonString(payloadA);
  const jsonB = canonicalJsonString(payloadB);
  assert.equal(jsonA, jsonB);

  const fpA = sha256Hex(jsonA);
  const fpB = sha256Hex(jsonB);
  assert.equal(fpA, fpB);
});

test("split.activate canonical payload v1 ignores activated_at and correlation_id changes", () => {
  const base = {
    recording_id: "11111111-1111-1111-1111-111111111111",
    split_id: "22222222-2222-2222-2222-222222222222",
    split_version: 3,
    items: [
      { party_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "participant", share_bps: 5000 },
      { party_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "participant", share_bps: 5000 },
    ],
    acceptances_required: 2,
    acceptances_accepted: 2,
    accepting_party_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    guardian_stage: "C",
  } as const;

  const p1 = buildSplitActivationCanonicalPayloadV1({
    ...base,
    activated_at: "2026-10-08T23:00:00.000Z",
    guardian_correlation_id: "33333333-3333-3333-3333-333333333333",
  });
  const p2 = buildSplitActivationCanonicalPayloadV1({
    ...base,
    activated_at: "2026-10-09T23:00:00.000Z",
    guardian_correlation_id: "99999999-9999-9999-9999-999999999999",
  });

  const fp1 = sha256Hex(canonicalJsonString(p1));
  const fp2 = sha256Hex(canonicalJsonString(p2));
  assert.equal(fp1, fp2);
});

test("split.activate canonical payload v1 changes fingerprint on material share_bps change", () => {
  const base = {
    recording_id: "11111111-1111-1111-1111-111111111111",
    split_id: "22222222-2222-2222-2222-222222222222",
    split_version: 3,
    acceptances_required: 2,
    acceptances_accepted: 2,
    accepting_party_ids: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"],
    guardian_stage: "C",
  } as const;

  const p1 = buildSplitActivationCanonicalPayloadV1({
    ...base,
    items: [
      { party_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "participant", share_bps: 5000 },
      { party_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "participant", share_bps: 5000 },
    ],
    activated_at: "2026-10-08T23:00:00.000Z",
    guardian_correlation_id: "33333333-3333-3333-3333-333333333333",
  });

  const p2 = buildSplitActivationCanonicalPayloadV1({
    ...base,
    items: [
      { party_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", role: "participant", share_bps: 4999 },
      { party_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", role: "participant", share_bps: 5001 },
    ],
    activated_at: "2026-10-09T00:00:00.000Z",
    guardian_correlation_id: "44444444-4444-4444-4444-444444444444",
  });

  const fp1 = sha256Hex(canonicalJsonString(p1));
  const fp2 = sha256Hex(canonicalJsonString(p2));
  assert.notEqual(fp1, fp2);
});
