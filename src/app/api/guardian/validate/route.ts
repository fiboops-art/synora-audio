import { NextResponse } from "next/server";
import { validateWithGuardian } from "@/lib/guardianClient";

export async function POST(req: Request) {
  const body = await req.json();
  const decision = await validateWithGuardian(body);
  return NextResponse.json(decision);
}

