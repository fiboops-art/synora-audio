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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const uid = userData.user.id;
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 200), 1), 1000);

    const { data: statement, error: stmtErr } = await service
      .from("royalty_statements")
      .select("id,source,report_month,imported_at,parsing_status,file_hash,line_count,created_at,correlation_id")
      .eq("id", id)
      .eq("user_id", uid)
      .single();
    if (stmtErr || !statement) return NextResponse.json({ error: stmtErr?.message ?? "Not found" }, { status: 404 });

    const { data: lines, error: linesErr } = await service
      .from("royalty_lines")
      .select(
        "id,row_index,parsing_status,status,warning_codes,error_details,dsp,territory,original_currency,net_amount_original,fx_rate,fx_timestamp,net_amount_base,isrc,track_title,artist_name,release_title"
      )
      .eq("statement_id", id)
      .eq("user_id", uid)
      .order("row_index", { ascending: true })
      .limit(limit);
    if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

    return NextResponse.json({ statement, lines: lines ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

