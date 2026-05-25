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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const params = (await (ctx as { params: Promise<{ id: string }> }).params) as { id: string };
    const payout_id = String(params?.id ?? "").trim();
    if (!payout_id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data, error } = await service
      .from("payout_requests")
      .select(
        "id,user_id,party_id,amount_usd,status,created_at,updated_at,sent_at,sent_ref,payout_method,sent_by,correlation_id, meta, guardian_raw, party:parties(id,display_name,email)"
      )
      .eq("user_id", uid)
      .eq("id", payout_id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ payout: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

