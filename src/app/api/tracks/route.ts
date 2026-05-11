import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabaseClient";

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
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
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
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

