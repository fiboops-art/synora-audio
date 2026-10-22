import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "Deprecated. Use /api/tracks/start-upload and /api/tracks/finalize.",
    },
    { status: 410 }
  );
}
