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

export async function GET(req: Request, ctx: { params: Promise<{ party_id: string }> }) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const { party_id } = await ctx.params;
    const partyId = String(party_id ?? "").trim();
    if (!partyId) return NextResponse.json({ error: "Missing party_id" }, { status: 400 });

    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Ensure party belongs to user (avoid leaking IDs)
    const { data: party, error: pErr } = await service
      .from("parties")
      .select("id,display_name,email")
      .eq("user_id", uid)
      .eq("id", partyId)
      .single();
    if (pErr || !party) return NextResponse.json({ error: pErr?.message ?? "Party not found" }, { status: 404 });

    const { data: entries, error: eErr } = await service
      .from("party_ledger_entries")
      .select("party_id,split_id,statement_id,line_id,ledger_entry_id,amount_usd,created_at")
      .eq("user_id", uid)
      .eq("party_id", partyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

    const entryRows = (entries ?? []) as Array<{
      party_id: string;
      split_id: string;
      statement_id: string;
      line_id: string;
      ledger_entry_id: string;
      amount_usd: number;
      created_at: string;
    }>;

    const lineIds = Array.from(new Set(entryRows.map((x) => String(x.line_id ?? "")).filter(Boolean)));
    const statementIds = Array.from(new Set(entryRows.map((x) => String(x.statement_id ?? "")).filter(Boolean)));

    const linesById = new Map<string, Record<string, unknown>>();
    if (lineIds.length) {
      const { data: lines, error: lErr } = await service
        .from("royalty_lines")
        .select("id,track_title,artist_name,isrc,dsp,territory,report_month,recording_id,net_amount_base")
        .eq("user_id", uid)
        .in("id", lineIds);
      if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
      for (const l of (lines ?? []) as Array<Record<string, unknown>>) {
        const id = String(l.id ?? "");
        if (id) linesById.set(id, l);
      }
    }

    const statementsById = new Map<string, Record<string, unknown>>();
    if (statementIds.length) {
      const { data: stmts, error: sErr } = await service
        .from("royalty_statements")
        .select("id,source,report_month,imported_at,file_name")
        .eq("user_id", uid)
        .in("id", statementIds);
      if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
      for (const s of (stmts ?? []) as Array<Record<string, unknown>>) {
        const id = String(s.id ?? "");
        if (id) statementsById.set(id, s);
      }
    }

    const enriched = entryRows.map((e) => {
      const line_id = String(e.line_id ?? "");
      const statement_id = String(e.statement_id ?? "");
      return {
        ...e,
        line: (line_id && linesById.get(line_id)) || null,
        statement: (statement_id && statementsById.get(statement_id)) || null,
      };
    });

    const total_usd = enriched.reduce((acc, x) => acc + Number(x.amount_usd ?? 0), 0);

    return NextResponse.json({ party, entries: enriched, total_usd });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

