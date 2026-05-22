import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const token_hash = sha256Hex(token);

    const service = getSupabaseService();
    const { data: acc, error: aErr } = await service
      .from("recording_split_acceptances")
      .select("id,user_id,split_id,party_id,email,status,expires_at,accepted_at")
      .eq("token_hash", token_hash)
      .single();
    if (aErr || !acc) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

    const accRow = acc as unknown as {
      id: string;
      user_id: string;
      split_id: string;
      email: string;
      status: string;
      expires_at: string;
      accepted_at: string | null;
    };

    // Expiry
    const exp = new Date(String(accRow.expires_at));
    if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
      return NextResponse.json({
        error: "Token expired",
        acceptance: { status: "expired", email: accRow.email },
      }, { status: 410 });
    }

    // Load split items for review
    const uid = String(accRow.user_id);
    const splitId = String(accRow.split_id);

    const { data: split, error: sErr } = await service
      .from("recording_splits")
      .select("id,recording_id,version,status")
      .eq("id", splitId)
      .eq("user_id", uid)
      .single();
    if (sErr || !split) return NextResponse.json({ error: "Split not found" }, { status: 404 });

    const splitRow = split as unknown as { id: string; recording_id: string; version: number; status: string };

    const { data: items, error: itErr } = await service
      .from("recording_split_items")
      .select("party_id,role,share_bps")
      .eq("split_id", splitId)
      .eq("user_id", uid);
    if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });

    const { data: rec } = await service
      .from("recordings")
      .select("id,isrc,track_title,artist_name")
      .eq("id", String(splitRow.recording_id))
      .eq("user_id", uid)
      .single();

    return NextResponse.json({
      acceptance: {
        id: accRow.id,
        email: accRow.email,
        status: accRow.status,
        expires_at: accRow.expires_at,
        accepted_at: accRow.accepted_at,
      },
      split: splitRow,
      recording: rec ?? null,
      items: (items ?? []) as Array<{ party_id: string; role: string; share_bps: number }>,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  // Accept split without login (magic token)
  try {
    const { token } = await ctx.params;
    const token_hash = sha256Hex(token);

    const { action } = (await req.json()) as { action?: "accept" | "reject" };
    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    const service = getSupabaseService();
    const { data: acc, error: aErr } = await service
      .from("recording_split_acceptances")
      .select("id,status,expires_at")
      .eq("token_hash", token_hash)
      .single();
    if (aErr || !acc) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

    const accRow = acc as unknown as { status: string; expires_at: string };

    const exp = new Date(String(accRow.expires_at));
    if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    if (String(accRow.status) === "accepted") {
      return NextResponse.json({ ok: true, status: "accepted" });
    }

    const ua = req.headers.get("user-agent") || null;
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const status = action === "accept" ? "accepted" : "rejected";

    const { error: updErr } = await service
      .from("recording_split_acceptances")
      .update({
        status,
        accepted_at: new Date().toISOString(),
        accepted_user_agent: ua,
        accepted_ip: ip,
      })
      .eq("token_hash", token_hash);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, status });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
