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

type LedgerRow = { id: string; statement_id: string; line_id: string; kind: string; amount_usd: number };
type ExistingPartyLedgerRow = { ledger_entry_id: string };

export async function POST(req: Request) {
  // Apply active recording splits to allocated ledger entries -> party_ledger_entries
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const body = (await req.json().catch(() => ({}))) as { limit?: number };
    const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 2000);

    // Get allocated ledger entries
    const { data: ledger, error: ledErr } = await service
      .from("ledger_entries")
      .select("id,statement_id,line_id,kind,amount_usd")
      .eq("user_id", uid)
      .eq("kind", "allocated")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (ledErr) return NextResponse.json({ error: ledErr.message }, { status: 500 });

    const ledgerRows = (ledger ?? []) as Array<LedgerRow>;
    if (ledgerRows.length === 0) return NextResponse.json({ ok: true, applied: 0, skipped: 0 });

    // Filter out ledger entries that already have party allocations
    const ledgerIds = ledgerRows.map((x) => x.id);
    const { data: existing, error: exErr } = await service
      .from("party_ledger_entries")
      .select("ledger_entry_id")
      .eq("user_id", uid)
      .in("ledger_entry_id", ledgerIds);
    if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
    const done = new Set(((existing ?? []) as Array<ExistingPartyLedgerRow>).map((x) => String(x.ledger_entry_id ?? "")));

    const pending = ledgerRows.filter((x) => !done.has(x.id));
    if (pending.length === 0) return NextResponse.json({ ok: true, applied: 0, skipped: ledgerRows.length });

    // Load royalty_lines to get recording_id
    const lineIds = Array.from(new Set(pending.map((x) => x.line_id)));
    const { data: lines, error: lineErr } = await service
      .from("royalty_lines")
      .select("id,recording_id")
      .eq("user_id", uid)
      .in("id", lineIds);
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });
    const recordingByLine = new Map<string, string>();
    for (const l of (lines ?? []) as Array<{ id: string; recording_id: string | null }>) {
      if (l.recording_id) recordingByLine.set(l.id, l.recording_id);
    }

    // Load active splits for these recordings
    const recordingIds = Array.from(new Set(Array.from(recordingByLine.values())));
    const { data: splits, error: spErr } = await service
      .from("recording_splits")
      .select("id,recording_id,status")
      .eq("user_id", uid)
      .eq("status", "active")
      .in("recording_id", recordingIds);
    if (spErr) return NextResponse.json({ error: spErr.message }, { status: 500 });
    const activeSplitByRecording = new Map<string, string>();
    for (const s of (splits ?? []) as Array<{ id: string; recording_id: string; status: string }>) {
      activeSplitByRecording.set(s.recording_id, s.id);
    }

    // Load split items
    const splitIds = Array.from(new Set(Array.from(activeSplitByRecording.values())));
    const { data: items, error: itErr } = await service
      .from("recording_split_items")
      .select("split_id,party_id,share_bps")
      .eq("user_id", uid)
      .in("split_id", splitIds);
    if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });

    const itemsBySplit = new Map<string, Array<{ party_id: string; share_bps: number }>>();
    for (const it of (items ?? []) as Array<{ split_id: string; party_id: string; share_bps: number }>) {
      const arr = itemsBySplit.get(it.split_id) ?? [];
      arr.push({ party_id: it.party_id, share_bps: Number(it.share_bps) });
      itemsBySplit.set(it.split_id, arr);
    }

    const inserts: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (const e of pending) {
      const recordingId = recordingByLine.get(e.line_id);
      if (!recordingId) {
        skipped++;
        continue;
      }
      const splitId = activeSplitByRecording.get(recordingId);
      if (!splitId) {
        skipped++;
        continue;
      }
      const splitItems = itemsBySplit.get(splitId) ?? [];
      if (!splitItems.length) {
        skipped++;
        continue;
      }
      for (const si of splitItems) {
        const amt = Math.round((e.amount_usd * (si.share_bps / 10000)) * 1e6) / 1e6;
        inserts.push({
          user_id: uid,
          party_id: si.party_id,
          split_id: splitId,
          statement_id: e.statement_id,
          line_id: e.line_id,
          ledger_entry_id: e.id,
          amount_usd: amt,
        });
      }
    }

    if (inserts.length) {
      const { error: insErr } = await service.from("party_ledger_entries").insert(inserts);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, applied: inserts.length, skipped });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
