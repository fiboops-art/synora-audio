import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import crypto from "crypto";
import { validateWithGuardian } from "@/lib/guardianClient";
import { buildSplitActivationCanonicalPayloadV1, canonicalJsonString, sha256Hex } from "@/lib/splitActivationCanonical";
import { buildSignedAnchorTxDevnet, broadcastPreparedAnchorTxDevnet, isPreparedAnchorBlockhashExpiredDevnet } from "@/lib/solanaAnchor";
import { rpcClaimSolanaAnchorV12, rpcSetPreparedSolanaAnchorV12, rpcSetConfirmedSolanaAnchorV12, rpcSetRecoverySolanaAnchorV12, rpcRetrySolanaAnchorFromExpiredV12 } from "@/lib/solanaAnchorRpc";
import { prepareSolanaAnchorPreparedBeforeBroadcast } from "@/lib/solanaAnchorActivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const url = new URL(req.url);
    const recordingId = (url.searchParams.get("recording_id") ?? "").trim();
    if (!recordingId) return NextResponse.json({ error: "Missing recording_id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data: splits, error: sErr } = await service
      .from("recording_splits")
      .select("id,recording_id,version,status,created_at")
      .eq("user_id", uid)
      .eq("recording_id", recordingId)
      .order("version", { ascending: false })
      .limit(10);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const latest = ((splits ?? [])[0] ?? null) as null | { id?: unknown };
    let items: Array<Record<string, unknown>> = [];
    if (latest?.id) {
      const { data: it, error: itErr } = await service
        .from("recording_split_items")
        .select("id,party_id,role,share_bps,created_at")
        .eq("user_id", uid)
        .eq("split_id", latest.id);
      if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });
      items = (it ?? []) as Array<Record<string, unknown>>;
    }

    // Enrich parties
    const partyIds = Array.from(new Set(items.map((x) => String(x.party_id)).filter(Boolean)));
    const partiesById = new Map<string, Record<string, unknown>>();
    if (partyIds.length) {
      const { data: ps } = await service
        .from("parties")
        .select("id,display_name")
        .eq("user_id", uid)
        .in("id", partyIds);
      for (const p of (ps ?? []) as Array<Record<string, unknown>>) {
        const pid = String(p.id ?? "");
        if (pid) partiesById.set(pid, p);
      }
    }
    const itemsEnriched = items.map((x) => {
      const party_id = String(x.party_id ?? "");
      return { ...x, party: (party_id && partiesById.get(party_id)) || null };
    });

    return NextResponse.json({
      splits: splits ?? [],
      latest_split: latest ?? null,
      items: itemsEnriched,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Create/replace a draft split for a recording (MVP)
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as {
      recording_id?: string;
      items?: Array<{ party_id: string; role?: string; share_bps: number }>;
    };
    const recording_id = (body.recording_id ?? "").trim();
    const items = body.items ?? [];
    if (!recording_id) return NextResponse.json({ error: "Missing recording_id" }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "Missing items" }, { status: 400 });

    const total = items.reduce((acc, it) => acc + Number(it.share_bps ?? 0), 0);
    if (total !== 10000) return NextResponse.json({ error: `Splits must sum to 10000 bps (got ${total})` }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Determine next version
    const { data: existing } = await service
      .from("recording_splits")
      .select("version")
      .eq("user_id", uid)
      .eq("recording_id", recording_id)
      .order("version", { ascending: false })
      .limit(1);
    const last = (existing?.[0] ?? null) as null | { version?: unknown };
    const nextVersion = last?.version ? Number(last.version) + 1 : 1;

    const { data: split, error: splitErr } = await service
      .from("recording_splits")
      .insert({ user_id: uid, recording_id, version: nextVersion, status: "draft" })
      .select("id,recording_id,version,status,created_at")
      .single();
    if (splitErr) return NextResponse.json({ error: splitErr.message }, { status: 500 });

    const split_id = String((split as unknown as { id?: unknown }).id ?? "");
    const ins = items.map((it) => ({
      user_id: uid,
      split_id,
      party_id: it.party_id,
      role: (it.role ?? "participant").trim() || "participant",
      share_bps: Math.trunc(Number(it.share_bps)),
    }));

    const { error: itErr } = await service.from("recording_split_items").insert(ins);
    if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });

    return NextResponse.json({ split });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  // Split lifecycle: propose / activate
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as {
      action?: "propose" | "activate";
      split_id?: string;
      base_url?: string; // optional override for links
    };
    const action = body.action;
    const split_id = (body.split_id ?? "").trim();
    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });
    if (!split_id) return NextResponse.json({ error: "Missing split_id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Load split + items
    const { data: split, error: sErr } = await service
      .from("recording_splits")
      .select("id,recording_id,version,status")
      .eq("id", split_id)
      .eq("user_id", uid)
      .single();
    if (sErr || !split) return NextResponse.json({ error: sErr?.message ?? "Split not found" }, { status: 404 });

    const { data: items, error: itErr } = await service
      .from("recording_split_items")
      .select("party_id,share_bps,role")
      .eq("split_id", split_id)
      .eq("user_id", uid);
    if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });
    const itemRows = (items ?? []) as Array<{ party_id: string; share_bps: number; role: string }>;

    const baseUrl = (body.base_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    const effectiveBase = baseUrl || "";

    if (action === "propose") {
      // Hygiene: if there are older rounds for the same recording, expire their pending tokens
      // and hide previous proposed splits (avoid link confusion across versions).
      const recording_id = String((split as unknown as { recording_id?: unknown }).recording_id ?? "");
      if (recording_id) {
        const { data: otherSplits, error: oErr } = await service
          .from("recording_splits")
          .select("id,status")
          .eq("user_id", uid)
          .eq("recording_id", recording_id)
          .neq("id", split_id);
        if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

        const otherIds = (otherSplits ?? [])
          .map((x) => String((x as unknown as { id?: unknown }).id ?? ""))
          .filter(Boolean);

        if (otherIds.length) {
          await service
            .from("recording_split_acceptances")
            .update({ status: "expired" })
            .eq("user_id", uid)
            .in("split_id", otherIds)
            .eq("status", "pending");

          // Hide previous proposed rounds (keep history but don't surface them by default)
          await service
            .from("recording_splits")
            .update({ status: "superseded" })
            .eq("user_id", uid)
            .eq("recording_id", recording_id)
            .eq("status", "proposed")
            .neq("id", split_id);
        }
      }

      // Invalidate previous pending acceptances for this split (avoid link confusion)
      await service
        .from("recording_split_acceptances")
        .update({ status: "expired" })
        .eq("user_id", uid)
        .eq("split_id", split_id)
        .eq("status", "pending");

      // Validate parties have email
      const partyIds = Array.from(new Set(itemRows.map((x) => x.party_id)));
      const { data: parties, error: pErr } = await service
        .from("parties")
        .select("id,email,display_name")
        .eq("user_id", uid)
        .in("id", partyIds);
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
      const partiesById = new Map<string, { email: string; display_name: string }>();
      for (const p of (parties ?? []) as Array<{ id: string; email: string | null; display_name: string }>) {
        partiesById.set(p.id, { email: (p.email ?? "").toLowerCase(), display_name: p.display_name });
      }
      for (const pid of partyIds) {
        const pe = partiesById.get(pid);
        if (!pe?.email) {
          return NextResponse.json({ error: `Party missing email: ${pid}` }, { status: 400 });
        }
      }

      // Create acceptances (pending) with tokens
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72).toISOString(); // 72h
      const acceptanceLinks: Array<{ party_id: string; email: string; token: string; url: string }> = [];
      const acceptanceInserts: Array<Record<string, unknown>> = [];

      for (const pid of partyIds) {
        const tokenPlain = crypto.randomUUID();
        const token_hash = sha256Hex(tokenPlain);
        const email = partiesById.get(pid)!.email;
        acceptanceInserts.push({
          user_id: uid,
          split_id,
          party_id: pid,
          email,
          token_hash,
          status: "pending",
          expires_at: expiresAt,
        });
        const url = effectiveBase ? `${effectiveBase.replace(/\/$/, "")}/accept/split/${tokenPlain}` : `/accept/split/${tokenPlain}`;
        acceptanceLinks.push({ party_id: pid, email, token: tokenPlain, url });
      }

      const { error: aErr } = await service.from("recording_split_acceptances").insert(acceptanceInserts);
      if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

      const { error: updErr } = await service
        .from("recording_splits")
        .update({ status: "proposed" })
        .eq("id", split_id)
        .eq("user_id", uid);
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

      return NextResponse.json({ ok: true, status: "proposed", acceptance_links: acceptanceLinks });
    }

    if (action === "activate") {
      // Check all acceptances accepted
      const { data: acc, error: accErr } = await service
        .from("recording_split_acceptances")
        .select("status,party_id")
        .eq("user_id", uid)
        .eq("split_id", split_id);
      if (accErr) return NextResponse.json({ error: accErr.message }, { status: 500 });
      const rows = (acc ?? []) as Array<{ status: string; party_id: string | null }>;
      if (rows.length === 0) {
        return NextResponse.json({ error: "No acceptances found. Propose first." }, { status: 400 });
      }
      const pending = rows.filter((r) => r.status !== "accepted").length;
      if (pending > 0) {
        return NextResponse.json({ error: `Cannot activate: ${pending} acceptances not accepted` }, { status: 400 });
      }

      // ✅ FIRST REAL GATE: Guardian must approve BEFORE activation enters the flow.
      // Fail-closed if Guardian is not configured/unavailable.
      if (!process.env.NEXT_PUBLIC_GUARDIAN_URL) {
        return NextResponse.json(
          {
            error: "Guardian não configurado: bloqueado antes de ativar.",
            required_actions: ["Configurar NEXT_PUBLIC_GUARDIAN_URL"],
          },
          { status: 503 }
        );
      }

      const recording_id = String((split as unknown as { recording_id?: unknown }).recording_id ?? "");
      const split_version = Number((split as unknown as { version?: unknown }).version ?? 0) || null;
      const correlation_id = crypto.randomUUID();
      const activated_at = new Date().toISOString();

      const guardianDecision = await validateWithGuardian({
        stage: "C",
        metadata: {
          product: "synora-audio",
          content_type: "recording_split_activation",
          tenant_id: "CREATORS-001",
          purpose: "split.activation",
          event_name: "split.activation",
          correlation_id,
          user_id: uid,
          recording_id,
          split_id,
          split_version,
          acceptances_required: rows.length,
          acceptances_pending: 0,
        },
        proposal: {
          kind: "recording_split",
          split: {
            id: split_id,
            recording_id,
            version: split_version,
            status: (split as unknown as { status?: unknown }).status ?? null,
          },
          items: itemRows,
          acceptances: rows,
        },
      });

      if (guardianDecision.status === "BLOCKED") {
        return NextResponse.json(
          {
            error: "Guardian bloqueou a ativação do split.",
            guardian: guardianDecision,
          },
          { status: 403 }
        );
      }

      const accepting_party_ids = rows
        .map((r) => String(r.party_id ?? "").trim())
        .filter(Boolean);

      const canonicalPayload = buildSplitActivationCanonicalPayloadV1({
        recording_id,
        split_id,
        split_version: split_version ?? 0,
        items: itemRows,
        accepting_party_ids,
        acceptances_required: rows.length,
        acceptances_accepted: rows.length,
        guardian_stage: "C",
        // operational-only (must NOT affect hash)
        activated_at,
        guardian_correlation_id: correlation_id,
      });
      const canonical_json = canonicalJsonString(canonicalPayload);
      const fingerprint_sha256_hex = sha256Hex(canonical_json);

      // =====================================================
      // Solana Anchor Idempotency (V1.2) — PREPARED-BEFORE-BROADCAST (NO BROADCAST IN THIS STEP)
      //
      // Server-only RPCs are called via service-role client, with p_user_id enforced inside RPCs.
      // IMPORTANT (first cycle):
      // - Only claim responses with claim_acquired=true authorize building/signing a new tx.
      // =====================================================
      const { claim, prepared, gate } = await prepareSolanaAnchorPreparedBeforeBroadcast({
        split_id,
        user_id: uid,
        fingerprint_sha256_hex,
        claim: async (args) =>
          rpcClaimSolanaAnchorV12({
            service,
            split_id: args.split_id,
            user_id: args.user_id,
            fingerprint_sha256_hex: args.fingerprint_sha256_hex,
          }),
        buildSignedTx: async (args) => {
          const built = await buildSignedAnchorTxDevnet(args);
          return {
            tx_signature: built.tx_signature,
            recent_blockhash: built.recent_blockhash,
            last_valid_block_height: built.last_valid_block_height,
            raw_tx_base64: built.raw_tx_base64,
          };
        },
        setPrepared: async (args) => {
          const out = await rpcSetPreparedSolanaAnchorV12({
            service,
            split_id: args.split_id,
            user_id: args.user_id,
            fingerprint_sha256_hex: args.fingerprint_sha256_hex,
            tx_signature: args.tx_signature,
            recent_blockhash: args.recent_blockhash,
            last_valid_block_height: args.last_valid_block_height,
            raw_tx_base64: args.raw_tx_base64,
          });
          return { ok: out.ok, status: out.status };
        },
      });

      if (prepared && (!prepared.persisted_ok || prepared.persisted_status !== "prepared")) {
        return NextResponse.json(
          { error: "Failed to persist solana_anchor prepared state", solana_anchor: { claim, prepared, gate } },
          { status: 500 }
        );
      }

      // Final invariant: only CONFIRMED Solana evidence may proceed to split activation.
      if (!gate.allowed) {
        return NextResponse.json(
          {
            error: "Activation blocked by solana_anchor gate",
            solana_anchor: { claim, prepared, gate },
          },
          { status: 409 }
        );
      }

      let confirmedAnchor:
        | {
            tx_signature: string;
            anchored_at: string;
            slot: number | null;
            confirmation_status: string | null;
            explorer_url: string | null;
          }
        | null = null;

      if (claim.status === "confirmed") {
        if (!claim.tx_signature || !claim.anchored_at) {
          return NextResponse.json(
            {
              error: "Confirmed solana_anchor is incomplete",
              solana_anchor: { claim, prepared, gate },
            },
            { status: 500 }
          );
        }

        confirmedAnchor = {
          tx_signature: claim.tx_signature,
          anchored_at: claim.anchored_at,
          slot: null,
          confirmation_status: "confirmed",
          explorer_url: `https://explorer.solana.com/tx/${claim.tx_signature}?cluster=devnet`,
        };
      } else {
        const tx = prepared
          ? {
              tx_signature: prepared.tx_signature,
              recent_blockhash: prepared.recent_blockhash,
              last_valid_block_height: prepared.last_valid_block_height,
              raw_tx_base64: prepared.raw_tx_base64,
            }
          : claim.status === "prepared"
            ? {
                tx_signature: claim.tx_signature,
                recent_blockhash: claim.recent_blockhash,
                last_valid_block_height: claim.last_valid_block_height,
                raw_tx_base64: claim.raw_tx_base64,
              }
            : null;

        if (
          !tx ||
          !tx.tx_signature ||
          !tx.recent_blockhash ||
          tx.last_valid_block_height == null ||
          !tx.raw_tx_base64
        ) {
          return NextResponse.json(
            {
              error: "Prepared solana_anchor is incomplete",
              solana_anchor: { claim, prepared, gate },
            },
            { status: 500 }
          );
        }

        const expired = await isPreparedAnchorBlockhashExpiredDevnet({
          last_valid_block_height: tx.last_valid_block_height,
        });

        if (expired) {
          const recovery = await rpcSetRecoverySolanaAnchorV12({
            service,
            split_id,
            user_id: uid,
            fingerprint_sha256_hex,
            tx_signature: tx.tx_signature,
            to_status: "expired",
            err: null,
          });

          if (!(recovery.ok && recovery.status === "expired")) {
            return NextResponse.json(
              {
                error: "Failed to mark expired solana_anchor",
                solana_anchor: {
                  claim,
                  prepared,
                  gate,
                  recovery,
                },
              },
              { status: 409 }
            );
          }

          const retry = await rpcRetrySolanaAnchorFromExpiredV12({
            service,
            split_id,
            user_id: uid,
            fingerprint_sha256_hex,
            prev_tx_signature: tx.tx_signature,
            prev_recent_blockhash: tx.recent_blockhash,
            prev_last_valid_block_height: tx.last_valid_block_height,
          });

          return NextResponse.json(
            {
              error: "Solana anchor expired; retry prepared",
              retryable: retry.ok && retry.status === "pending",
              solana_anchor: {
                claim,
                prepared,
                gate,
                recovery,
                retry,
              },
            },
            { status: 409 }
          );
        }

        const broadcast = await broadcastPreparedAnchorTxDevnet({
          raw_tx_base64: tx.raw_tx_base64,
          tx_signature: tx.tx_signature,
          recent_blockhash: tx.recent_blockhash,
          last_valid_block_height: tx.last_valid_block_height,
        });

        const confirmed = await rpcSetConfirmedSolanaAnchorV12({
          service,
          split_id,
          user_id: uid,
          fingerprint_sha256_hex,
          tx_signature: broadcast.tx_signature,
          anchored_at: broadcast.anchored_at,
          confirmation: broadcast.confirmation,
        });

        if (!(confirmed.ok && confirmed.status === "confirmed")) {
          return NextResponse.json(
            {
              error: "Solana transaction confirmed but persistence failed",
              solana_anchor: {
                claim,
                prepared,
                gate,
                broadcast,
                confirmed,
              },
            },
            { status: 500 }
          );
        }

        confirmedAnchor = {
          tx_signature: broadcast.tx_signature,
          anchored_at: broadcast.anchored_at,
          slot: broadcast.confirmation.slot,
          confirmation_status: broadcast.confirmation.confirmationStatus,
          explorer_url: broadcast.explorer_url,
        };
      }

      // Supersede previous active splits for this recording
      if (recording_id) {
        await service
          .from("recording_splits")
          .update({ status: "superseded" })
          .eq("user_id", uid)
          .eq("recording_id", recording_id)
          .eq("status", "active")
          .neq("id", split_id);

        // Hygiene: expire any pending acceptances from older rounds (if any).
        const { data: otherSplits } = await service
          .from("recording_splits")
          .select("id")
          .eq("user_id", uid)
          .eq("recording_id", recording_id)
          .neq("id", split_id);
        const otherIds = (otherSplits ?? [])
          .map((x) => String((x as unknown as { id?: unknown }).id ?? ""))
          .filter(Boolean);
        if (otherIds.length) {
          await service
            .from("recording_split_acceptances")
            .update({ status: "expired" })
            .eq("user_id", uid)
            .in("split_id", otherIds)
            .eq("status", "pending");
        }
      }

      const { error: actErr } = await service
        .from("recording_splits")
        .update({ status: "active" })
        .eq("id", split_id)
        .eq("user_id", uid);
      if (actErr) return NextResponse.json({ error: actErr.message }, { status: 500 });

      return NextResponse.json({
        ok: true,
        status: "active",
        evidence: {
          kind: canonicalPayload.kind,
          v: canonicalPayload.v,
          canonical_json,
          fingerprint_sha256_hex,
        },
        solana_anchor: {
          claim,
          prepared: prepared
            ? {
                tx_signature: prepared.tx_signature,
                recent_blockhash: prepared.recent_blockhash,
                last_valid_block_height: prepared.last_valid_block_height,
                raw_tx_base64: prepared.raw_tx_base64,
              }
            : null,
          gate,
          confirmed: confirmedAnchor,
          broadcast: {
            attempted: claim.status !== "confirmed",
            tx_signature: confirmedAnchor?.tx_signature ?? null,
            explorer_url: confirmedAnchor?.explorer_url ?? null,
          },
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
