import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { validateWithGuardian } from "@/lib/guardianClient";

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
      trackId?: string;
      path?: string;
      file_type?: string;
      file_size?: number;
      title?: string;
      artist?: string;
    };
    if (!body.trackId || !body.path) {
      return NextResponse.json({ error: "Missing trackId/path" }, { status: 400 });
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

    // fetch basic track info (fallback if title/artist not sent)
    let title = (body.title ?? "").trim();
    let artist = (body.artist ?? "").trim();
    if (!title || !artist) {
      const { data: row, error: getErr } = await supabase
        .from("tracks")
        .select("title,artist")
        .eq("id", body.trackId)
        .eq("user_id", uid)
        .single();
      if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });
      title = row?.title ?? title;
      artist = row?.artist ?? artist;
    }

    // guardian validate
    const correlation_id = `AUD-${Date.now()}`;
    const guardianInput = {
      // Synora-Audio is not a debt/proposal flow.
      // Use Stage A (onboarding/LGPD validation) to avoid proposal-specific rules.
      stage: "A",
      content: `Faixa: ${title} — Artista: ${artist}`,
      metadata: {
        tenant_id: "synora-audio-demo",
        purpose: "music_upload_compliance_precheck",
        source: "synora-audio",
        locale: "pt-BR",
        correlation_id,
        content_type: "application/json",
      },
      // Guardian Stage A in our current middleware expects minimal "debtor" fields.
      // Synora-Audio has no debtor; provide a non-PII demo stub to satisfy schema.
      debtor: {
        full_name: "DEMO_USER",
        document_type: "OTHER",
        document_id: "DEMO",
      },
      request: {
        operation: "upload_precheck",
        // Explicitly mark as single-item validation (not an aggregated export).
        scope: { fields: ["track.title", "track.artist", "track.file_path"] },
        subject: {
          kind: "single_track",
          trackId: body.trackId,
          storagePath: body.path,
        },
        justification:
          "Validação de compliance para upload individual de uma faixa (MVP). Não é exportação em massa.",
        approver: "system:synora-audio-mvp",
        retention: "30d",
        masking: true,
      },
    } as const;

    const guardian = await validateWithGuardian(guardianInput);

    // NOTE: keep production response clean (no debug echo).

    const guardian_status = guardian.status;

    const { data: updated, error: updErr } = await supabase
      .from("tracks")
      .update({
        guardian_status,
        guardian_raw: guardian,
        file_path: body.path,
        file_mime: body.file_type,
        file_size: body.file_size,
      })
      .eq("id", body.trackId)
      .eq("user_id", uid)
      .select(
        "id,title,artist,created_at,guardian_status,distribution_status,file_path,file_mime,file_size"
      )
      .single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ track: updated, guardian });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
