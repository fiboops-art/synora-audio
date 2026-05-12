import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { validateWithGuardian } from "@/lib/guardianClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
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
    const guardian = await validateWithGuardian({
      stage: "D",
      content: `Faixa: ${title} — Artista: ${artist}`,
      metadata: {
        tenant_id: "synora-audio-demo",
        purpose: "music_upload_compliance_precheck",
        source: "synora-audio",
        locale: "pt-BR",
        correlation_id,
        content_type: "application/json",
      },
      request: {
        operation: "upload_precheck",
        scope: { fields: ["track.title", "track.artist", "track.file_path"] },
        subject: { trackId: body.trackId, storagePath: body.path },
        retention: "30d",
        masking: true,
      },
    });

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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
