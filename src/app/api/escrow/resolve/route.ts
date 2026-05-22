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

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as { escrow_id?: string; recording_id?: string };
    if (!body.escrow_id) return NextResponse.json({ error: "Missing escrow_id" }, { status: 400 });
    if (!body.recording_id) return NextResponse.json({ error: "Missing recording_id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Load escrow item
    const { data: esc, error: escErr } = await service
      .from("escrow_buckets")
      .select("id,user_id,statement_id,line_id,amount_usd,resolution_status")
      .eq("id", body.escrow_id)
      .eq("user_id", uid)
      .single();
    if (escErr || !esc) return NextResponse.json({ error: escErr?.message ?? "Not found" }, { status: 404 });
    const escRow = esc as unknown as { resolution_status?: unknown; line_id?: unknown; statement_id?: unknown };
    if (String(escRow.resolution_status ?? "") !== "open") {
      return NextResponse.json({ error: "Escrow item is not open" }, { status: 400 });
    }

    // Ensure recording exists
    const { data: rec, error: recErr } = await service
      .from("recordings")
      .select("id")
      .eq("id", body.recording_id)
      .eq("user_id", uid)
      .single();
    if (recErr || !rec) return NextResponse.json({ error: recErr?.message ?? "Recording not found" }, { status: 404 });

    // Update royalty_line to matched
    const { error: lineErr } = await service
      .from("royalty_lines")
      .update({
        status: "matched",
        recording_id: body.recording_id,
        match_method: "manual",
        match_confidence: 1.0,
      })
      .eq("id", String(escRow.line_id ?? ""))
      .eq("user_id", uid);
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

    // Mark escrow resolved
    const { error: updErr } = await service
      .from("escrow_buckets")
      .update({
        resolution_status: "resolved",
        resolved_to_recording_id: body.recording_id,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", body.escrow_id)
      .eq("user_id", uid);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Flip ledger entry from unallocated -> allocated
    const { error: ledErr } = await service
      .from("ledger_entries")
      .update({ kind: "allocated" })
      .eq("user_id", uid)
      .eq("line_id", String(escRow.line_id ?? ""))
      .eq("statement_id", String(escRow.statement_id ?? ""))
      .eq("kind", "unallocated");
    if (ledErr) return NextResponse.json({ error: ledErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
