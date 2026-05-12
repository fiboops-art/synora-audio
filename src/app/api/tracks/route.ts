import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";

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

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    }

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const uid = userData.user.id;
    const { data, error } = await service
      .from("tracks")
      .select("id,title,artist,created_at,guardian_status,distribution_status")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

export async function POST() {
  return NextResponse.json(
    { error: "Deprecated. Use /api/tracks/start-upload and /api/tracks/finalize." },
    { status: 410 }
  );
}

export async function PATCH(req: Request) {
  // MVP: server-side update helper (guardian status, distribution status, etc.)
  try {
    const body = (await req.json()) as {
      id?: string;
      guardian_status?: string;
      distribution_status?: string;
      guardian_raw?: any;
      file_path?: string;
      file_mime?: string;
      file_size?: number;
    };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = getSupabaseService();
    const { data, error } = await supabase
      .from("tracks")
      .update({
        guardian_status: body.guardian_status,
        distribution_status: body.distribution_status,
        guardian_raw: body.guardian_raw,
        file_path: body.file_path,
        file_mime: body.file_mime,
        file_size: body.file_size,
      })
      .eq("id", body.id)
      .select("id,title,artist,created_at,guardian_status,distribution_status,file_path,file_mime,file_size")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ track: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
