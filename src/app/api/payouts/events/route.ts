import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

export async function GET(req: Request) {
  // List payout events (audit trail)
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const url = new URL(req.url);
    const payout_id = (url.searchParams.get("payout_id") ?? "").trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));

    let q = service
      .from("payout_events")
      .select("id,payout_id,actor_id,action,from_status,to_status,payload,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (payout_id) q = q.eq("payout_id", payout_id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ events: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

