"use client";

import { useEffect, useMemo, useState } from "react";

type AcceptanceView = {
  acceptance: { email: string; status: string; expires_at: string; accepted_at: string | null };
  split: { id: string; recording_id: string; version: number; status: string };
  recording: { id: string; isrc: string | null; track_title: string | null; artist_name: string | null } | null;
  items: Array<{ party_id: string; role: string; share_bps: number }>;
};

export default function AcceptSplitPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AcceptanceView | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        // Cache-buster: avoids any edge/proxy weirdness returning stale 404s for fresh tokens
        const res = await fetch(`/api/accept/split/${encodeURIComponent(token)}?_ts=${Date.now()}`, { cache: "no-store" });
        const j = (await res.json()) as AcceptanceView & { error?: string };
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        setData(j);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const totalBps = useMemo(() => {
    const items = data?.items ?? [];
    return items.reduce((acc, it) => acc + Number(it.share_bps ?? 0), 0);
  }, [data]);

  async function submit(action: "accept" | "reject") {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/accept/split/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setDone(action === "accept" ? "Aceito. Obrigado!" : "Rejeitado." );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="syn-card p-6">
        <div className="text-lg font-semibold text-white">Synora — Split Review</div>
        <div className="mt-1 text-sm text-slate-200/90">
          Revise e aceite (ou rejeite) a proposta de splits.
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-slate-200/90">Carregando…</div>
        ) : error ? (
          <div className="mt-6 text-sm text-red-200">{error}</div>
        ) : done ? (
          <div className="mt-6 text-sm text-emerald-200">{done}</div>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
                <div className="text-xs text-slate-300">Recording</div>
                <div className="mt-1 text-sm text-slate-100">{data?.recording?.track_title ?? "—"}</div>
                <div className="text-xs text-slate-300">{data?.recording?.artist_name ?? ""}</div>
                <div className="mt-2 text-xs text-slate-300">ISRC: {data?.recording?.isrc ?? "—"}</div>
              </div>
              <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
                <div className="text-xs text-slate-300">Split</div>
                <div className="mt-1 text-sm text-slate-100">v{data?.split?.version} ({data?.split?.status})</div>
                <div className="mt-2 text-xs text-slate-300">Total: {totalBps} bps</div>
                <div className="text-xs text-slate-300">Expira: {data?.acceptance?.expires_at}</div>
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
                  {(data?.items ?? []).map((it, idx) => (
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
              <button
                disabled={submitting}
                onClick={() => void submit("accept")}
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Aceitar
              </button>
              <button
                disabled={submitting}
                onClick={() => void submit("reject")}
                className="rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Rejeitar
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
