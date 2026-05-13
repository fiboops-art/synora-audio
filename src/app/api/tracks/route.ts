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
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ tracks: data ?? [] });
  } catch (e: unknown) {
    let probe: unknown = null;
    try {
      probe = await probeSupabaseRaw();
    } catch (p: unknown) {
      probe = { error: errMsg(p) };
    }
    return NextResponse.json(
      {
        error: errMsg(e),
        cause:
          e && typeof e === "object" && "cause" in e && (e as { cause?: unknown }).cause
            ? String((e as { cause: unknown }).cause)
            : undefined,
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
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    }

    const body = (await req.json()) as {
      id?: string;
      guardian_status?: string;
      distribution_status?: string;
      guardian_raw?: unknown;
      file_path?: string;
      file_mime?: string;
      file_size?: number;
      deleted_at?: string | null;
    };
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }
    const uid = userData.user.id;

    const { data, error } = await service
      .from("tracks")
      .update({
        guardian_status: body.guardian_status,
        distribution_status: body.distribution_status,
        guardian_raw: body.guardian_raw,
        file_path: body.file_path,
        file_mime: body.file_mime,
        file_size: body.file_size,
        deleted_at: body.deleted_at ?? undefined,
      })
      .eq("id", body.id)
      .eq("user_id", uid)
      .select("id,title,artist,created_at,guardian_status,distribution_status,file_path,file_mime,file_size")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ track: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
