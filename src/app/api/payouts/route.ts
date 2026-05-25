import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import crypto from "crypto";
import { validateWithGuardian } from "@/lib/guardianClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

export async function GET(req: Request) {
  // List payout requests (MVP)
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "").trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    let q = service
      .from("payout_requests")
      .select("id,party_id,amount_usd,status,created_at,correlation_id, party:parties(id,display_name,email)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ payouts: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

async function getPartyBalanceUsd(service: ReturnType<typeof getSupabaseService>, uid: string, party_id: string) {
  // Note: this is MVP math (no FX at payout time, no holds/chargebacks yet).
  const { data: entries, error: eErr } = await service
    .from("party_ledger_entries")
    .select("amount_usd")
    .eq("user_id", uid)
    .eq("party_id", party_id);
  if (eErr) throw new Error(eErr.message);

  const earned = (entries ?? []).reduce((acc, r) => acc + Number((r as { amount_usd?: unknown }).amount_usd ?? 0), 0);

  const { data: payouts, error: pErr } = await service
    .from("payout_requests")
    .select("amount_usd,status")
    .eq("user_id", uid)
    .eq("party_id", party_id)
    .in("status", ["PENDING", "APPROVED", "SENT"]);
  if (pErr) throw new Error(pErr.message);

  const reserved = (payouts ?? []).reduce((acc, r) => acc + Number((r as { amount_usd?: unknown }).amount_usd ?? 0), 0);
  return { earned, reserved, available: earned - reserved };
}

export async function POST(req: Request) {
  // Create a payout request (MVP).
  // ✅ SECOND REAL GATE: Guardian must approve BEFORE we authorize payout.
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as { party_id?: string; amount_usd?: number; memo?: string };
    const party_id = (body.party_id ?? "").trim();
    const amount_usd = Number(body.amount_usd ?? 0);
    const memo = String(body.memo ?? "").trim() || null;
    if (!party_id) return NextResponse.json({ error: "Missing party_id" }, { status: 400 });
    if (!Number.isFinite(amount_usd) || amount_usd <= 0)
      return NextResponse.json({ error: "Invalid amount_usd" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Validate party belongs to user
    const { data: party, error: partyErr } = await service
      .from("parties")
      .select("id,display_name,email")
      .eq("user_id", uid)
      .eq("id", party_id)
      .single();
    if (partyErr || !party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

    const bal = await getPartyBalanceUsd(service, uid, party_id);
    if (amount_usd > bal.available + 1e-9) {
      return NextResponse.json(
        {
          error: "Insufficient available balance",
          balance: bal,
        },
        { status: 400 }
      );
    }

    // Fail-closed if Guardian is not configured.
    if (!process.env.NEXT_PUBLIC_GUARDIAN_URL) {
      return NextResponse.json(
        {
          error: "Guardian não configurado: bloqueado antes do payout.",
          required_actions: ["Configurar NEXT_PUBLIC_GUARDIAN_URL"],
        },
        { status: 503 }
      );
    }

    const correlation_id = crypto.randomUUID();

    const guardianDecision = await validateWithGuardian({
      stage: "D",
      metadata: {
        product: "synora-audio",
        content_type: "payout_request",
        correlation_id,
        user_id: uid,
        party_id,
        party_display_name: (party as unknown as { display_name?: unknown }).display_name ?? null,
        amount_usd,
        balance: bal,
      },
      proposal: {
        kind: "payout_request",
        party: {
          id: party_id,
          display_name: (party as unknown as { display_name?: unknown }).display_name ?? null,
          email: (party as unknown as { email?: unknown }).email ?? null,
        },
        amount_usd,
        memo,
      },
    });

    const status = guardianDecision.status === "BLOCKED" ? "BLOCKED" : "APPROVED";

    // Always persist the request for audit trail (even if blocked).
    const { data: payout, error: insErr } = await service
      .from("payout_requests")
      .insert({
        user_id: uid,
        party_id,
        amount_usd,
        status,
        correlation_id,
        guardian_raw: guardianDecision,
        meta: memo ? { memo } : null,
      })
      .select("id,user_id,party_id,amount_usd,status,created_at,correlation_id")
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    if (guardianDecision.status === "BLOCKED") {
      return NextResponse.json(
        {
          error: "Guardian bloqueou o payout.",
          payout,
          guardian: guardianDecision,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ ok: true, payout, guardian: guardianDecision, balance: bal });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
