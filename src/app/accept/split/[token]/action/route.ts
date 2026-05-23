import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeTokenHash(tokenOrHash: string): string {
  const t = String(tokenOrHash ?? "").trim();
  if (/^[a-f0-9]{64}$/i.test(t)) return t.toLowerCase();
  return sha256Hex(t);
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const token_hash = normalizeTokenHash(token);

  const form = await req.formData().catch(() => null);
  const action = String(form?.get("action") ?? "");
  if (action !== "accept" && action !== "reject") {
    return NextResponse.redirect(new URL(`/accept/split/${encodeURIComponent(token)}?done=error`, req.url));
  }

  const service = getSupabaseService();
  const { data: acc } = await service
    .from("recording_split_acceptances")
    .select("status,expires_at")
    .eq("token_hash", token_hash)
    .single();
  if (!acc) {
    return NextResponse.redirect(new URL(`/accept/split/${encodeURIComponent(token)}?done=invalid`, req.url));
  }

  const exp = new Date(String((acc as unknown as { expires_at?: unknown }).expires_at ?? ""));
  if (Number.isFinite(exp.getTime()) && exp.getTime() < Date.now()) {
    return NextResponse.redirect(new URL(`/accept/split/${encodeURIComponent(token)}?done=expired`, req.url));
  }

  const status = action === "accept" ? "accepted" : "rejected";
  const ua = req.headers.get("user-agent") || null;
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;

  await service
    .from("recording_split_acceptances")
    .update({
      status,
      accepted_at: new Date().toISOString(),
      accepted_user_agent: ua,
      accepted_ip: ip,
    })
    .eq("token_hash", token_hash);

  return NextResponse.redirect(new URL(`/accept/split/${encodeURIComponent(token)}?done=${status}`, req.url));
}

