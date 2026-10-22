import { NextResponse } from "next/server";
import { getSupabaseService } from "@/lib/supabaseServer";
import { validateWithGuardian } from "@/lib/guardianClient";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  const service = getSupabaseService();
  const { data, error } = await service.auth.getUser(match[1]);

  if (error || !data.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const body = await req.json();
  const decision = await validateWithGuardian(body);
  return NextResponse.json(decision);
}
