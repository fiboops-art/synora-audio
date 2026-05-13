import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

function pickJwt(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  const get = (k: string) => (k in payload ? payload[k] : null);
  const asStr = (v: unknown) => (typeof v === "string" ? v : null);
  const asNum = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    iss: asStr(get("iss")),
    aud: asStr(get("aud")),
    sub: asStr(get("sub")),
    exp: asNum(get("exp")),
    iat: asNum(get("iat")),
    role: asStr(get("role")),
  };
}


export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    }

    const body = (await req.json()) as {
      title?: string;
      artist?: string;
      file_name?: string;
      file_type?: string;
      file_size?: number;
    };

    const title = (body.title ?? "").trim();
    const artist = (body.artist ?? "").trim();
    if (!title || !artist) {
      return NextResponse.json({ error: "Missing title/artist" }, { status: 400 });
    }

    const supabase = getSupabaseService();

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      const payload = decodeJwtPayload(token);
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null;
      return NextResponse.json(
        {
          error: "Invalid session",
          diag: {
            now: new Date().toISOString(),
            jwt: pickJwt(payload),
            supabaseUrlHost: url ? (() => {
              try {
                return new URL(url).host;
              } catch {
                return null;
              }
            })() : null,
            userErr: userErr?.message ?? null,
          },
        },
        { status: 401 }
      );
    }
    const uid = userData.user.id;

    // 1) create track row
    const { data: created, error: createErr } = await supabase
      .from("tracks")
      .insert({
        title,
        artist,
        user_id: uid,
        guardian_status: "PENDING",
        distribution_status: "NOT_SENT",
        meta: {
          mode: "upload",
          file_name: body.file_name,
          file_type: body.file_type,
          file_size: body.file_size,
        },
      })
      .select("id")
      .single();

    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "Create failed" }, { status: 500 });
    }

    // 2) create signed upload URL
    const bucket = "tracks";
    const safeName = String(body.file_name ?? "track.mp3")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .slice(0, 80);
    const path = `${uid}/${created.id}/${Date.now()}-${safeName}`;

    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        {
          error: signErr?.message ?? "Signed URL failed",
          hint: "Check if Storage bucket 'tracks' exists.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      trackId: created.id,
      path,
      signedUrl: signed.signedUrl,
      token: signed.token,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
