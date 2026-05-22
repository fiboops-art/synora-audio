import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return "Unknown error";
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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);

    const { data, error } = await service
      .from("parties")
      .select("id,display_name,kind,email,created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ parties: data ?? [] });
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
      display_name?: string;
      kind?: "person" | "company";
      email?: string;
    };
    const display_name = (body.display_name ?? "").trim();
    const kind = (body.kind ?? "person") as "person" | "company";
    const email = (body.email ?? "").trim().toLowerCase();
    if (!display_name) return NextResponse.json({ error: "Missing display_name" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data, error } = await service
      .from("parties")
      .insert({ user_id: uid, display_name, kind, email })
      .select("id,display_name,kind,email,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ party: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });

    const body = (await req.json()) as {
      id?: string;
      display_name?: string;
      kind?: "person" | "company";
      email?: string;
    };
    const id = (body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.display_name === "string") {
      const v = body.display_name.trim();
      if (!v) return NextResponse.json({ error: "display_name cannot be empty" }, { status: 400 });
      patch.display_name = v;
    }
    if (typeof body.kind === "string") patch.kind = body.kind;
    if (typeof body.email === "string") {
      const v = body.email.trim().toLowerCase();
      if (!v) return NextResponse.json({ error: "email cannot be empty" }, { status: 400 });
      patch.email = v;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    const uid = userData.user.id;

    const { data, error } = await service
      .from("parties")
      .update(patch)
      .eq("id", id)
      .eq("user_id", uid)
      .select("id,display_name,kind,email,created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ party: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
