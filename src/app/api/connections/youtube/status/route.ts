import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (
    e &&
    typeof e === "object" &&
    "message" in e &&
    typeof (e as { message?: unknown }).message === "string"
  ) {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization" },
        { status: 401 }
      );
    }

    const service = getSupabaseService();
    const { data: userData, error: userErr } =
      await service.auth.getUser(token);

    if (userErr || !userData.user) {
      return NextResponse.json(
        { error: "Invalid session" },
        { status: 401 }
      );
    }

    const { data, error } = await service
      .from("youtube_connections")
      .select(
        "channel_id,channel_title,connected_at,last_synced_at,updated_at"
      )
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      connected: Boolean(data),
      connection: data ?? null,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e) },
      { status: 500 }
    );
  }
}
