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
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data, error } = await service
      .from("party_ledger_entries")
      .select("party_id, amount_usd, parties:party_id(id,display_name,email)")
      .eq("user_id", uid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Supabase returns nested join as array by default
    const rows = (data ?? []) as unknown as Array<{
      party_id: string;
      amount_usd: number;
      parties?: Array<{ id: string; display_name: string; email: string | null }> | null;
    }>;

    const map = new Map<
      string,
      { party_id: string; display_name: string; email: string | null; balance_usd: number }
    >();

    for (const r of rows) {
      const pid = String(r.party_id);
      const p = (r.parties && r.parties[0]) ? r.parties[0] : null;
      const cur = map.get(pid) ?? {
        party_id: pid,
        display_name: p?.display_name ?? pid,
        email: p?.email ?? null,
        balance_usd: 0,
      };
      cur.balance_usd += Number(r.amount_usd ?? 0);
      map.set(pid, cur);
    }

    const balances = Array.from(map.values()).sort((a, b) => b.balance_usd - a.balance_usd);
    const total_usd = balances.reduce((acc, x) => acc + x.balance_usd, 0);

    return NextResponse.json({ balances, total_usd });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
