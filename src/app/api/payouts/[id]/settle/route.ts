import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { maskDestination, type DestinationProvider } from "@/lib/payoutDestinations";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

function cleanDetails(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object") return {};
  return x as Record<string, unknown>;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  // Create a settlement record (manual ops MVP)
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const params = (await (ctx as { params: Promise<{ id: string }> }).params) as { id: string };
    const payout_id = String(params?.id ?? "").trim();
    if (!payout_id) return NextResponse.json({ error: "Missing payout id" }, { status: 400 });

    const body = (await req.json()) as {
      destination_id?: string;
      settlement_ref?: string;
      status?: "SETTLED" | "FAILED";
      raw?: unknown;
    };
    const destination_id = (body.destination_id ?? "").trim();
    const settlement_ref = String(body.settlement_ref ?? "").trim();
    const status = body.status ?? "SETTLED";

    if (!destination_id) return NextResponse.json({ error: "Missing destination_id" }, { status: 400 });
    if (!settlement_ref) return NextResponse.json({ error: "Missing settlement_ref" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data: payout, error: pErr } = await service
      .from("payout_requests")
      .select("id,status,party_id,amount_usd,correlation_id")
      .eq("user_id", uid)
      .eq("id", payout_id)
      .single();
    if (pErr || !payout) return NextResponse.json({ error: pErr?.message ?? "Payout not found" }, { status: 404 });

    const payoutStatus = String((payout as unknown as { status?: unknown }).status ?? "");
    if (payoutStatus !== "APPROVED") {
      return NextResponse.json({ error: `Payout must be APPROVED to settle (got ${payoutStatus})` }, { status: 400 });
    }

    const { data: dest, error: dErr } = await service
      .from("payout_destinations")
      .select("id,provider,status,details,label,currency,party_id,fingerprint")
      .eq("user_id", uid)
      .eq("id", destination_id)
      .single();
    if (dErr || !dest) return NextResponse.json({ error: dErr?.message ?? "Destination not found" }, { status: 404 });

    const destStatus = String((dest as unknown as { status?: unknown }).status ?? "");
    if (destStatus !== "VERIFIED") {
      return NextResponse.json({ error: "Destination must be VERIFIED" }, { status: 400 });
    }

    const provider = String((dest as unknown as { provider?: unknown }).provider ?? "") as DestinationProvider;
    const details = cleanDetails((dest as unknown as { details?: unknown }).details);
    const destination_snapshot = maskDestination(provider, details);
    const correlation_id = (payout as unknown as { correlation_id?: unknown }).correlation_id ?? crypto.randomUUID();

    const settled_at = status === "SETTLED" ? new Date().toISOString() : null;

    // Create settlement record
    const { data: settlement, error: sErr } = await service
      .from("payout_settlements")
      .insert({
        user_id: uid,
        payout_id,
        destination_id,
        operator_id: uid,
        provider,
        settlement_ref,
        status,
        settled_at,
        destination_snapshot,
        raw: body.raw ?? null,
        correlation_id,
      })
      .select("id,payout_id,destination_id,operator_id,provider,settlement_ref,status,settled_at,created_at,correlation_id")
      .single();
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    // Mirror minimal legacy fields for UI continuity (Phase 2: parallel-write)
    await service
      .from("payout_requests")
      .update({
        status: "SENT",
        payout_method: provider,
        sent_ref: `${provider}: ${settlement_ref.replace(/^[A-Z_]+:\s*/i, "")}`,
        sent_at: settled_at,
        sent_by: uid,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", uid)
      .eq("id", payout_id);

    // Audit event
    await service.from("payout_events").insert({
      user_id: uid,
      payout_id,
      actor_id: uid,
      action: "STATUS_CHANGED",
      from_status: "APPROVED",
      to_status: "SENT",
      payload: {
        provider,
        settlement_ref,
        destination_id,
        settlement_id: (settlement as unknown as { id?: unknown }).id,
      },
    });

    return NextResponse.json({ ok: true, settlement });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

