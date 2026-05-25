import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { maskDestination, type DestinationProvider } from "@/lib/payoutDestinations";

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

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> | { id: string } }) {
  // Get the latest settlement for a payout (Phase 2 source-of-truth)
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const params = (await (ctx as { params: Promise<{ id: string }> }).params) as { id: string };
    const payout_id = String(params?.id ?? "").trim();
    if (!payout_id) return NextResponse.json({ error: "Missing payout id" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data, error } = await service
      .from("payout_settlements")
      .select(
        "id,payout_id,destination_id,operator_id,provider,settlement_ref,status,settled_at,created_at,updated_at,correlation_id, destination:payout_destinations(id,provider,label,status,details)"
      )
      .eq("user_id", uid)
      .eq("payout_id", payout_id)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const row = (data ?? [])[0] as unknown;
    const settlement = row as
      | (Record<string, unknown> & { destination?: Array<Record<string, unknown>> | Record<string, unknown> | null })
      | undefined;

    if (!settlement) return NextResponse.json({ settlement: null });

    const destRow = Array.isArray((settlement as { destination?: unknown }).destination)
      ? ((settlement as { destination?: Array<Record<string, unknown>> }).destination?.[0] ?? null)
      : (((settlement as { destination?: unknown }).destination as Record<string, unknown>) ?? null);

    const dest = (destRow ?? null) as null | { provider?: unknown; details?: unknown; label?: unknown; status?: unknown; id?: unknown };
    let destination_masked: unknown = null;
    if (dest?.provider) {
      const provider = String(dest.provider) as DestinationProvider;
      destination_masked = {
        id: dest.id ?? null,
        provider,
        label: dest.label ?? null,
        status: dest.status ?? null,
        details_masked: maskDestination(provider, cleanDetails(dest.details)),
      };
    }

    return NextResponse.json({ settlement: { ...settlement, destination_masked } });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
