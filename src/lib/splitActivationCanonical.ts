import crypto from "crypto";

export type SplitActivationItemV1 = {
  party_id: string;
  role: string;
  share_bps: number;
};

export type SplitActivationCanonicalPayloadV1 = {
  kind: "synora.creators.recording_split_activation";
  v: 1;
  recording_id: string;
  split_id: string;
  split_version: number;
  items: Array<SplitActivationItemV1>;
  acceptances: { required: number; accepted: number };
  accepting_party_ids: Array<string>;
  guardian: { stage: "C" };
};

function normalizeInt(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.trunc(num);
}

function normalizeString(s: unknown): string {
  return String(s ?? "").trim();
}

function sortLexAsc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildSplitActivationCanonicalPayloadV1(input: {
  recording_id: string;
  split_id: string;
  split_version: number;
  items: Array<{ party_id: unknown; role: unknown; share_bps: unknown }>;
  accepting_party_ids: Array<unknown>;
  acceptances_required: number;
  acceptances_accepted: number;
  guardian_stage: "C";
  // NOTE: operational-only context (must NOT affect hash)
  activated_at?: string;
  guardian_correlation_id?: string;
}): SplitActivationCanonicalPayloadV1 {
  const items: Array<SplitActivationItemV1> = (input.items ?? [])
    .map((it) => ({
      party_id: normalizeString(it.party_id),
      role: normalizeString(it.role),
      share_bps: normalizeInt(it.share_bps),
    }))
    .filter((it) => it.party_id.length > 0)
    .sort((a, b) => sortLexAsc(a.party_id, b.party_id) || sortLexAsc(a.role, b.role));

  const accepting_party_ids = (input.accepting_party_ids ?? [])
    .map((x) => normalizeString(x))
    .filter(Boolean)
    .sort(sortLexAsc);

  return {
    kind: "synora.creators.recording_split_activation",
    v: 1,
    recording_id: normalizeString(input.recording_id),
    split_id: normalizeString(input.split_id),
    split_version: normalizeInt(input.split_version),
    items,
    acceptances: {
      required: normalizeInt(input.acceptances_required),
      accepted: normalizeInt(input.acceptances_accepted),
    },
    accepting_party_ids,
    guardian: { stage: input.guardian_stage },
  };
}

function canonicalizeValue(value: unknown): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === "string") return value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) return null;
    return value;
  }
  if (t === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => canonicalizeValue(v));
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort(sortLexAsc)) {
      const v = obj[k];
      if (v === undefined) continue;
      out[k] = canonicalizeValue(v);
    }
    return out;
  }
  return null;
}

export function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalizeValue(value));
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
