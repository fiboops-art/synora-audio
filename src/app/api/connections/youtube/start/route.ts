import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
];

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

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return NextResponse.json(
        { error: "Missing Authorization" },
        { status: 401 }
      );
    }

    const clientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID;
    const redirectUri = new URL(
      "/api/connections/youtube/callback",
      req.url
    ).toString();

    if (!clientId) {
      return NextResponse.json(
        { error: "YouTube OAuth is not configured" },
        { status: 503 }
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

    const state = randomBytes(32).toString("base64url");
    const stateHash = createHash("sha256")
      .update(state)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000
    ).toISOString();

    const { error: stateErr } = await service
      .from("youtube_oauth_states")
      .insert({
        state_hash: stateHash,
        user_id: userData.user.id,
        expires_at: expiresAt,
      });

    if (stateErr) {
      return NextResponse.json(
        { error: stateErr.message },
        { status: 500 }
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: SCOPES.join(" "),
      state,
      include_granted_scopes: "true",
    });

    return NextResponse.json({
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: errMsg(e) },
      { status: 500 }
    );
  }
}
