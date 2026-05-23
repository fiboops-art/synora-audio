import crypto from "crypto";
import { getSupabaseService } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AcceptanceView = {
  acceptance: { email: string; status: string; expires_at: string; accepted_at: string | null };
  split: { id: string; recording_id: string; version: number; status: string };
  recording: { id: string; isrc: string | null; track_title: string | null; artist_name: string | null } | null;
  items: Array<{ party_id: string; role: string; share_bps: number }>;
};

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeTokenHash(tokenOrHash: string): string {
  const t = String(tokenOrHash ?? "").trim();
  if (/^[a-f0-9]{64}$/i.test(t)) return t.toLowerCase();
  return sha256Hex(t);
}

async function loadView(token: string): Promise<AcceptanceView | null> {
  const token_hash = normalizeTokenHash(token);
  const service = getSupabaseService();

  const { data: acc } = await service
    .from("recording_split_acceptances")
    .select("id,user_id,split_id,party_id,email,status,expires_at,accepted_at")
    .eq("token_hash", token_hash)
    .single();
  if (!acc) return null;

  const accRow = acc as unknown as {
    user_id: string;
    split_id: string;
    email: string;
    status: string;
    expires_at: string;
    accepted_at: string | null;
  };

  const uid = String(accRow.user_id);
  const splitId = String(accRow.split_id);

  const { data: split } = await service
    .from("recording_splits")
    .select("id,recording_id,version,status")
    .eq("id", splitId)
    .eq("user_id", uid)
    .single();
  if (!split) return null;

  const { data: items } = await service
    .from("recording_split_items")
    .select("party_id,role,share_bps")
    .eq("split_id", splitId)
    .eq("user_id", uid);

  const splitRow = split as unknown as { id: string; recording_id: string; version: number; status: string };

  const { data: rec } = await service
    .from("recordings")
    .select("id,isrc,track_title,artist_name")
    .eq("id", String(splitRow.recording_id))
    .eq("user_id", uid)
    .single();

  return {
    acceptance: {
      email: accRow.email,
      status: accRow.status,
      expires_at: accRow.expires_at,
      accepted_at: accRow.accepted_at,
    },
    split: splitRow,
    recording: (rec ?? null) as AcceptanceView["recording"],
    items: (items ?? []) as AcceptanceView["items"],
  };
}

export default async function AcceptSplitPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const view = await loadView(token);
  if (!view) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="syn-card p-6">
          <div className="text-lg font-semibold text-white">Synora — Split Review</div>
          <div className="mt-1 text-sm text-slate-200/90">Revise e aceite (ou rejeite) a proposta de splits.</div>
          <div className="mt-6 text-sm text-red-200">Invalid token</div>
        </div>
      </main>
    );
  }

  const totalBps = (view.items ?? []).reduce((acc, it) => acc + Number(it.share_bps ?? 0), 0);
  const exp = new Date(String(view.acceptance.expires_at));
  // Keep render pure/idempotent: compare to a fixed server timestamp.
  const serverNow = new Date();
  const isExpired = Number.isFinite(exp.getTime()) && exp.getTime() < serverNow.getTime();

  const done = String(sp.done ?? "");
  const doneMsg = done === "accepted" ? "Aceito. Obrigado!" : done === "rejected" ? "Rejeitado." : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="syn-card p-6">
        <div className="text-lg font-semibold text-white">Synora — Split Review</div>
        <div className="mt-1 text-sm text-slate-200/90">Revise e aceite (ou rejeite) a proposta de splits.</div>

        {doneMsg ? <div className="mt-6 text-sm text-emerald-200">{doneMsg}</div> : null}
        {isExpired ? <div className="mt-6 text-sm text-rose-200">Token expired</div> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Recording</div>
            <div className="mt-1 text-sm text-slate-100">{view.recording?.track_title ?? "—"}</div>
            <div className="text-xs text-slate-300">{view.recording?.artist_name ?? ""}</div>
            <div className="mt-2 text-xs text-slate-300">ISRC: {view.recording?.isrc ?? "—"}</div>
          </div>
          <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Split</div>
            <div className="mt-1 text-sm text-slate-100">
              v{view.split.version} ({view.split.status})
            </div>
            <div className="mt-2 text-xs text-slate-300">Total: {totalBps} bps</div>
            <div className="text-xs text-slate-300">Expira: {view.acceptance.expires_at}</div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-md ring-1 ring-white/10">
          <table className="w-full text-left text-xs text-slate-200/90">
            <thead className="bg-white/5 text-slate-200">
              <tr>
                <th className="px-3 py-2">Party</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Share</th>
              </tr>
            </thead>
            <tbody>
              {(view.items ?? []).map((it, idx) => (
                <tr key={idx} className="border-t border-white/10">
                  <td className="px-3 py-2">{String(it.party_id)}</td>
                  <td className="px-3 py-2">{it.role}</td>
                  <td className="px-3 py-2">{it.share_bps} bps</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <form action={`/accept/split/${encodeURIComponent(token)}/action`} method="post">
            <input type="hidden" name="action" value="accept" />
            <button
              disabled={isExpired}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              type="submit"
            >
              Aceitar
            </button>
          </form>
          <form action={`/accept/split/${encodeURIComponent(token)}/action`} method="post">
            <input type="hidden" name="action" value="reject" />
            <button
              disabled={isExpired}
              className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              type="submit"
            >
              Rejeitar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
