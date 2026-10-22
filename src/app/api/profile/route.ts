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
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data, error } = await service
      .from("creator_profiles")
      .select("user_id,kind,display_name,tax_id,email,created_at,updated_at")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profile: data ?? null });
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
      kind?: "person" | "company";
      display_name?: string;
      tax_id?: string | null;
      email?: string;
    };

    const kind = body.kind === "company" ? "company" : "person";
    const display_name = (body.display_name ?? "").trim();
    const tax_id = (body.tax_id ?? "").replace(/\D/g, "") || null;
    const email = (body.email ?? "").trim().toLowerCase();

    if (!display_name) return NextResponse.json({ error: "Missing display_name" }, { status: 400 });
    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    if (tax_id) {
      const expected = kind === "company" ? 14 : 11;
      if (tax_id.length !== expected) {
        return NextResponse.json(
          { error: kind === "company" ? "CNPJ inválido" : "CPF inválido" },
          { status: 400 }
        );
      }
    }

    const service = getSupabaseService();
    const { data: userData, error: userErr } = await service.auth.getUser(token);
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { data, error } = await service
      .from("creator_profiles")
      .upsert(
        {
          user_id: userData.user.id,
          kind,
          display_name,
          tax_id,
          email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select("user_id,kind,display_name,tax_id,email,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ profile: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
