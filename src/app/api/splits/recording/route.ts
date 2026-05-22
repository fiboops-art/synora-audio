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

    const url = new URL(req.url);
    const recordingId = (url.searchParams.get("recording_id") ?? "").trim();
    if (!recordingId) return NextResponse.json({ error: "Missing recording_id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data: splits, error: sErr } = await service
      .from("recording_splits")
      .select("id,recording_id,version,status,created_at")
      .eq("user_id", uid)
      .eq("recording_id", recordingId)
      .order("version", { ascending: false })
      .limit(10);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });

    const latest = ((splits ?? [])[0] ?? null) as null | { id?: unknown };
    let items: Array<Record<string, unknown>> = [];
    if (latest?.id) {
      const { data: it, error: itErr } = await service
        .from("recording_split_items")
        .select("id,party_id,role,share_bps,created_at")
        .eq("user_id", uid)
        .eq("split_id", latest.id);
      if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });
      items = (it ?? []) as Array<Record<string, unknown>>;
    }

    // Enrich parties
    const partyIds = Array.from(new Set(items.map((x) => String(x.party_id)).filter(Boolean)));
    const partiesById = new Map<string, Record<string, unknown>>();
    if (partyIds.length) {
      const { data: ps } = await service
        .from("parties")
        .select("id,display_name")
        .eq("user_id", uid)
        .in("id", partyIds);
      for (const p of (ps ?? []) as Array<Record<string, unknown>>) {
        const pid = String(p.id ?? "");
        if (pid) partiesById.set(pid, p);
      }
    }
    const itemsEnriched = items.map((x) => {
      const party_id = String(x.party_id ?? "");
      return { ...x, party: (party_id && partiesById.get(party_id)) || null };
    });

    return NextResponse.json({
      splits: splits ?? [],
      latest_split: latest ?? null,
      items: itemsEnriched,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Create/replace a draft split for a recording (MVP)
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as {
      recording_id?: string;
      items?: Array<{ party_id: string; role?: string; share_bps: number }>;
    };
    const recording_id = (body.recording_id ?? "").trim();
    const items = body.items ?? [];
    if (!recording_id) return NextResponse.json({ error: "Missing recording_id" }, { status: 400 });
    if (!items.length) return NextResponse.json({ error: "Missing items" }, { status: 400 });

    const total = items.reduce((acc, it) => acc + Number(it.share_bps ?? 0), 0);
    if (total !== 10000) return NextResponse.json({ error: `Splits must sum to 10000 bps (got ${total})` }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Determine next version
    const { data: existing } = await service
      .from("recording_splits")
      .select("version")
      .eq("user_id", uid)
      .eq("recording_id", recording_id)
      .order("version", { ascending: false })
      .limit(1);
    const last = (existing?.[0] ?? null) as null | { version?: unknown };
    const nextVersion = last?.version ? Number(last.version) + 1 : 1;

    const { data: split, error: splitErr } = await service
      .from("recording_splits")
      .insert({ user_id: uid, recording_id, version: nextVersion, status: "draft" })
      .select("id,recording_id,version,status,created_at")
      .single();
    if (splitErr) return NextResponse.json({ error: splitErr.message }, { status: 500 });

    const split_id = String((split as unknown as { id?: unknown }).id ?? "");
    const ins = items.map((it) => ({
      user_id: uid,
      split_id,
      party_id: it.party_id,
      role: (it.role ?? "participant").trim() || "participant",
      share_bps: Math.trunc(Number(it.share_bps)),
    }));

    const { error: itErr } = await service.from("recording_split_items").insert(ins);
    if (itErr) return NextResponse.json({ error: itErr.message }, { status: 500 });

    return NextResponse.json({ split });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
