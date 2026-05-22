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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);

    const { data, error } = await service
      .from("recordings")
      .select("id,isrc,track_title,artist_name,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ recordings: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as { isrc?: string | null; track_title?: string | null; artist_name?: string | null };

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const isrc = (body.isrc ?? "").trim() || null;
    const track_title = (body.track_title ?? "").trim() || null;
    const artist_name = (body.artist_name ?? "").trim() || null;

    if (!isrc && !track_title) {
      return NextResponse.json({ error: "Provide isrc or track_title" }, { status: 400 });
    }

    const { data, error } = await service
      .from("recordings")
      .insert({ user_id: uid, isrc, track_title, artist_name })
      .select("id,isrc,track_title,artist_name,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ recording: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

