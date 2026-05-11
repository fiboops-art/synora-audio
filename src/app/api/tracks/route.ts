import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabaseClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function probeSupabaseRaw() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error("missing supabase env");

  const url = `${base.replace(/\/$/, "")}/rest/v1/tracks?select=id&limit=1`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text: text.slice(0, 500) };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tracks")
      .select("id,title,artist,created_at,guardian_status,distribution_status")
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ tracks: data ?? [] });
  } catch (e: any) {
    let probe: any = null;
    try {
      probe = await probeSupabaseRaw();
    } catch (p: any) {
      probe = { error: p?.message ?? String(p) };
    }
    return NextResponse.json(
      {
        error: e?.message ?? "Unknown error",
        cause: e?.cause ? String(e.cause) : undefined,
        probe,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string; artist?: string; meta?: any };
    const title = (body.title ?? "").trim();
    const artist = (body.artist ?? "").trim();
    if (!title || !artist) {
      return NextResponse.json({ error: "Missing title/artist" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tracks")
      .insert({ title, artist, meta: body.meta ?? {} })
      .select("id,title,artist,created_at,guardian_status,distribution_status")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ track: data });
  } catch (e: any) {
    let probe: any = null;
    try {
      probe = await probeSupabaseRaw();
    } catch (p: any) {
      probe = { error: p?.message ?? String(p) };
    }
    return NextResponse.json(
      {
        error: e?.message ?? "Unknown error",
        cause: e?.cause ? String(e.cause) : undefined,
        probe,
      },
      { status: 500 }
    );
  }
}
