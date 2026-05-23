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
    const split_id = String(url.searchParams.get("split_id") ?? "").trim();
    if (!split_id) return NextResponse.json({ error: "Missing split_id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data, error } = await service
      .from("recording_split_acceptances")
      .select("id,party_id,email,status,created_at,expires_at,accepted_at")
      .eq("user_id", uid)
      .eq("split_id", split_id)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich party display_name
    const rows = (data ?? []) as Array<{
      id: string;
      party_id: string;
      email: string;
      status: string;
      created_at: string;
      expires_at: string;
      accepted_at: string | null;
    }>;

    const partyIds = Array.from(new Set(rows.map((r) => String(r.party_id ?? "")).filter(Boolean)));
    const partyById = new Map<string, { display_name: string | null; email: string | null }>();
    if (partyIds.length) {
      const { data: parties } = await service
        .from("parties")
        .select("id,display_name,email")
        .eq("user_id", uid)
        .in("id", partyIds);
      for (const p of (parties ?? []) as Array<{ id: string; display_name: string | null; email: string | null }>) {
        partyById.set(String(p.id), { display_name: p.display_name, email: p.email });
      }
    }

    const acceptances = rows.map((r) => ({
      ...r,
      party: partyById.get(String(r.party_id)) ?? null,
    }));

    return NextResponse.json({ acceptances });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

