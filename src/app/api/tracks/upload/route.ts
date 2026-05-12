import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { validateWithGuardian } from "@/lib/guardianClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const title = String(form.get("title") ?? "").trim();
    const artist = String(form.get("artist") ?? "").trim();
    const file = form.get("file") as File | null;

    if (!title || !artist) {
      return NextResponse.json({ error: "Missing title/artist" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const supabase = getSupabaseService();

    // 1) create track row
    const { data: created, error: createErr } = await supabase
      .from("tracks")
      .insert({
        title,
        artist,
        guardian_status: "PENDING",
        distribution_status: "NOT_SENT",
        meta: {
          mode: "upload",
          file_name: file.name,
          file_type: file.type,
          file_size: file.size,
        },
      })
      .select("id,title,artist")
      .single();

    if (createErr || !created) {
      return NextResponse.json({ error: createErr?.message ?? "Create failed" }, { status: 500 });
    }

    // 2) upload file to Storage
    const bucket = "tracks";
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
    const path = `${created.id}/${Date.now()}-${safeName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json(
        {
          error: `Storage upload failed: ${upErr.message}`,
          hint: "Create a bucket named 'tracks' in Supabase Storage (private is ok).",
        },
        { status: 500 }
      );
    }

    // 3) guardian validate
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
        subject: { trackId: created.id, storagePath: path },
        retention: "30d",
        masking: true,
      },
    });

    const guardian_status = guardian.status;

    // 4) persist status + file info
    const { data: updated, error: updErr } = await supabase
      .from("tracks")
      .update({
        guardian_status,
        guardian_raw: guardian,
        file_path: path,
        file_mime: file.type,
        file_size: file.size,
      })
      .eq("id", created.id)
      .select(
        "id,title,artist,created_at,guardian_status,distribution_status,file_path,file_mime,file_size"
      )
      .single();
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ track: updated, guardian });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}

