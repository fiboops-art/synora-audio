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

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const params = (await (ctx as { params: Promise<{ id: string }> }).params) as { id: string };
    const id = String(params?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = (await req.json()) as { label?: string; status?: "DISABLED" | "DRAFT" | "PENDING_VERIFICATION" };
    const label = (body.label ?? "").trim();
    const status = body.status;
    if (!label && !status) return NextResponse.json({ error: "No changes" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (label) patch.label = label;
    if (status) patch.status = status;

    const { data, error } = await service
      .from("payout_destinations")
      .update(patch)
      .eq("user_id", uid)
      .eq("id", id)
      .select("id,party_id,provider,label,currency,status,verified_at,verified_by,created_at,updated_at,fingerprint")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, destination: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

