import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { computeDestinationFingerprint, maskDestination, type DestinationProvider } from "@/lib/payoutDestinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
}

function cleanDetails(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object") return {};
  return x as Record<string, unknown>;
}

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const url = new URL(req.url);
    const party_id = (url.searchParams.get("party_id") ?? "").trim();
    const status = (url.searchParams.get("status") ?? "").trim();
    const provider = (url.searchParams.get("provider") ?? "").trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

    let q = service
      .from("payout_destinations")
      .select(
        "id,party_id,provider,label,currency,status,verified_at,verified_by,created_at,updated_at,fingerprint,details_masked"
      )
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (party_id) q = q.eq("party_id", party_id);
    if (status) q = q.eq("status", status);
    if (provider) q = q.eq("provider", provider);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const destinations = (data ?? []) as unknown[];

    return NextResponse.json({ destinations });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as {
      party_id?: string;
      provider?: DestinationProvider;
      label?: string;
      currency?: string;
      details?: Record<string, unknown>;
    };
    const party_id = (body.party_id ?? "").trim();
    const provider = (body.provider ?? "") as DestinationProvider;
    const label = (body.label ?? "").trim();
    const currency = (body.currency ?? "USD").trim().toUpperCase();
    const details = cleanDetails(body.details);

    if (!party_id) return NextResponse.json({ error: "Missing party_id" }, { status: 400 });
    if (!provider) return NextResponse.json({ error: "Missing provider" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "Missing label" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    // Validate party belongs to user
    const { data: party, error: partyErr } = await service
      .from("parties")
      .select("id")
      .eq("user_id", uid)
      .eq("id", party_id)
      .single();
    if (partyErr || !party) return NextResponse.json({ error: "Party not found" }, { status: 404 });

    const fingerprint = computeDestinationFingerprint(provider, details);

    const details_masked = maskDestination(provider, details);

    const { data: dest, error: insErr } = await service
      .from("payout_destinations")
      .insert({
        user_id: uid,
        party_id,
        provider,
        label,
        currency,
        details,
        details_masked,
        fingerprint,
        status: "DRAFT",
      })
      .select("id,party_id,provider,label,currency,status,verified_at,verified_by,created_at,updated_at,fingerprint,details_masked")
      .single();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, destination: dest });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
