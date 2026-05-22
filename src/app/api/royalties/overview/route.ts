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

    const { data: ledger, error: ledErr } = await service
      .from("ledger_entries")
      .select("kind,amount_usd")
      .eq("user_id", uid);
    if (ledErr) return NextResponse.json({ error: ledErr.message }, { status: 500 });

    const { data: escrow, error: escErr } = await service
      .from("escrow_buckets")
      .select("amount_usd,resolution_status")
      .eq("user_id", uid)
      .eq("resolution_status", "open");
    if (escErr) return NextResponse.json({ error: escErr.message }, { status: 500 });

    const { data: quarantine, error: qErr } = await service
      .from("royalty_lines")
      .select("id")
      .eq("user_id", uid)
      .eq("status", "quarantined");
    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    let total_in_usd = 0;
    let allocated_usd = 0;
    let unallocated_usd = 0;
    for (const e of (ledger ?? []) as Array<{ kind?: unknown; amount_usd?: unknown }>) {
      const kind = String(e.kind ?? "");
      const amt = Number(e.amount_usd ?? 0);
      if (!Number.isFinite(amt)) continue;
      total_in_usd += amt;
      if (kind === "allocated") allocated_usd += amt;
      if (kind === "unallocated") unallocated_usd += amt;
    }
    let escrow_open_usd = 0;
    for (const x of (escrow ?? []) as Array<{ amount_usd?: unknown }>) {
      const amt = Number(x.amount_usd ?? 0);
      if (Number.isFinite(amt)) escrow_open_usd += amt;
    }

    const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
    return NextResponse.json({
      totals: {
        total_in_usd: round6(total_in_usd),
        allocated_usd: round6(allocated_usd),
        unallocated_usd: round6(unallocated_usd),
        escrow_open_usd: round6(escrow_open_usd),
        quarantine_count: (quarantine ?? []).length,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
