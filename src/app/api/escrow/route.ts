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

    const url = new URL(req.url);
    const status = (url.searchParams.get("status") ?? "open").toLowerCase();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

    const { data, error } = await service
      .from("escrow_buckets")
      .select("id,statement_id,line_id,amount_usd,resolution_status,created_at")
      .eq("user_id", uid)
      .eq("resolution_status", status)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with line metadata (best-effort)
    const lineIds = Array.from(
      new Set(
        (data ?? [])
          .map((x) => String((x as unknown as { line_id?: unknown }).line_id ?? ""))
          .filter((v) => v.length > 0)
      )
    );
    const linesById = new Map<string, Record<string, unknown>>();
    if (lineIds.length) {
      const { data: lines, error: lErr } = await service
        .from("royalty_lines")
        .select("id,isrc,track_title,artist_name,dsp,territory,status,recording_id")
        .eq("user_id", uid)
        .in("id", lineIds);
      if (!lErr) {
        for (const l of (lines ?? []) as Array<Record<string, unknown>>) {
          const id = String(l.id ?? "");
          if (id) linesById.set(id, l);
        }
      }
    }

    const items = (data ?? []).map((e) => {
      const lineId = String((e as unknown as { line_id?: unknown }).line_id ?? "");
      const line = (lineId && linesById.get(lineId)) || null;
      return { ...e, line };
    });

    return NextResponse.json({ escrow: items });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
