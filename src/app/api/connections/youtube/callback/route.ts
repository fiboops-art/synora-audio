import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { encryptYouTubeToken } from "@/lib/youtubeTokenCrypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type YouTubeChannelsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

function studioRedirect(
  req: Request,
  params: Record<string, string>
): NextResponse {
  const url = new URL("/studio", req.url);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    return studioRedirect(req, { youtube: "denied" });
  }

  if (!code || !state) {
    return studioRedirect(req, { youtube: "invalid_callback" });
  }

  const clientId = process.env.GOOGLE_YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_YOUTUBE_CLIENT_SECRET;
  const redirectUri = new URL(
    "/api/connections/youtube/callback",
    req.url
  ).toString();

  if (!clientId || !clientSecret) {
    return studioRedirect(req, { youtube: "not_configured" });
  }

  const service = getSupabaseService();

  try {
    const stateHash = createHash("sha256")
      .update(state)
      .digest("hex");

    const now = new Date().toISOString();

    const { data: stateRow, error: stateErr } = await service
      .from("youtube_oauth_states")
      .select("state_hash,user_id,expires_at,consumed_at")
      .eq("state_hash", stateHash)
      .is("consumed_at", null)
      .gt("expires_at", now)
      .maybeSingle();

    if (stateErr || !stateRow) {
      return studioRedirect(req, { youtube: "invalid_state" });
    }

    const { data: consumedRows, error: consumeErr } = await service
      .from("youtube_oauth_states")
      .update({ consumed_at: now })
      .eq("state_hash", stateHash)
      .is("consumed_at", null)
      .select("state_hash");

    if (
      consumeErr ||
      !consumedRows ||
      consumedRows.length !== 1
    ) {
      return studioRedirect(req, { youtube: "invalid_state" });
    }

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
        cache: "no-store",
      }
    );

    const tokenData =
      (await tokenResponse.json()) as GoogleTokenResponse;

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error(
        "YouTube OAuth token exchange failed",
        tokenData.error ?? tokenResponse.status
      );
      return studioRedirect(req, { youtube: "token_error" });
    }

    const channelResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
        cache: "no-store",
      }
    );

    const channelData =
      (await channelResponse.json()) as YouTubeChannelsResponse;

    const channel = channelData.items?.[0];

    if (!channelResponse.ok || !channel?.id) {
      console.error(
        "YouTube channel lookup failed",
        channelData.error?.message ?? channelResponse.status
      );
      return studioRedirect(req, { youtube: "channel_error" });
    }

    const tokenExpiresAt =
      typeof tokenData.expires_in === "number"
        ? new Date(
            Date.now() + tokenData.expires_in * 1000
          ).toISOString()
        : null;

    const scopes = tokenData.scope
      ? tokenData.scope.split(/\s+/).filter(Boolean)
      : [];

    const { data: existingConnection } = await service
      .from("youtube_connections")
      .select("refresh_token_encrypted")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();

    const refreshTokenEncrypted = tokenData.refresh_token
      ? encryptYouTubeToken(tokenData.refresh_token)
      : existingConnection?.refresh_token_encrypted ?? null;

    const { error: saveErr } = await service
      .from("youtube_connections")
      .upsert(
        {
          user_id: stateRow.user_id,
          channel_id: channel.id,
          channel_title: channel.snippet?.title ?? null,
          access_token_encrypted: encryptYouTubeToken(
            tokenData.access_token
          ),
          refresh_token_encrypted: refreshTokenEncrypted,
          token_expires_at: tokenExpiresAt,
          scopes,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (saveErr) {
      console.error(
        "YouTube connection save failed",
        saveErr.message
      );
      return studioRedirect(req, { youtube: "save_error" });
    }

    return studioRedirect(req, { youtube: "connected" });
  } catch (error) {
    console.error(
      "YouTube OAuth callback failed",
      error instanceof Error ? error.message : "Unknown error"
    );

    return studioRedirect(req, { youtube: "callback_error" });
  }
}
