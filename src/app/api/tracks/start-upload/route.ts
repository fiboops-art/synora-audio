import { NextResponse } from "next/server";
import { getSupabaseAuthed } from "@/lib/supabaseAuthedServer";

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

    const supabase = getSupabaseAuthed(token);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
