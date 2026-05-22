"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function RoyaltyStatementDetail() {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const id = params?.id;

  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type ApiDetail = {
    statement: {
      id: string;
      source: string;
      report_month: string;
      parsing_status: string;
      correlation_id: string;
      file_hash: string;
      line_count: number;
      created_at: string;
    };
    lines: Array<{
      id: string;
      row_index: number;
      parsing_status: string;
      status: string;
      warning_codes: string[];
      error_details: string | null;
      dsp: string | null;
      territory: string | null;
      original_currency: string;
      net_amount_original: number | null;
      fx_rate: number | null;
      fx_timestamp: string | null;
      net_amount_base: number | null;
      isrc: string | null;
      track_title: string | null;
      artist_name: string | null;
      release_title: string | null;
    }>;
  };

  const [data, setData] = useState<ApiDetail | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setToken(data.session.access_token);
    })();
  }, [router]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      setError(null);
      if (!id) {
        setError("Missing statement id");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/royalties/statements/${encodeURIComponent(id)}?limit=500`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const j = (await res.json()) as ApiDetail & { error?: string };
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        setData(j);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar statement");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, id]);

  const totals = useMemo(() => {
    const lines = data?.lines ?? [];
    let usd = 0;
    let quarantined = 0;
    let warnings = 0;
    for (const l of lines) {
      if (l.parsing_status === "error" || l.status === "quarantined") quarantined++;
      if ((l.warning_codes ?? []).length) warnings++;
      if (typeof l.net_amount_base === "number") usd += l.net_amount_base;
    }
    return { usd: Math.round(usd * 1e6) / 1e6, quarantined, warnings, count: lines.length };
  }, [data]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Royalties — Statement</div>
          <div className="text-sm text-slate-200/90">Detalhe operacional (linhas + FX + parsing).</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-sm text-slate-200 hover:text-white">
            Dashboard
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/studio" className="text-sm text-slate-200 hover:text-white">
            Studio
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 syn-card-soft p-6 text-sm text-slate-200/90">Carregando…</div>
      ) : error ? (
        <div className="mt-6 syn-card-soft p-6 text-sm text-red-200">{error}</div>
      ) : !data ? (
        <div className="mt-6 syn-card-soft p-6 text-sm text-slate-200/90">Sem dados.</div>
      ) : (
        <>
          <div className="mt-6 syn-card p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-slate-300">Mês</div>
                <div className="mt-1 text-sm font-semibold text-white">{data.statement.report_month}</div>
              </div>
              <div>
                <div className="text-xs text-slate-300">Fonte</div>
                <div className="mt-1 text-sm font-semibold text-white">{data.statement.source}</div>
              </div>
              <div>
                <div className="text-xs text-slate-300">Status</div>
                <div className="mt-1 text-sm font-semibold text-white">{data.statement.parsing_status}</div>
              </div>
              <div>
                <div className="text-xs text-slate-300">Total (USD)</div>
                <div className="mt-1 text-sm font-semibold text-white">{totals.usd}</div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-md bg-black/30 p-3 text-xs text-slate-200 ring-1 ring-white/10">
                <div className="text-slate-300">correlation_id</div>
                <div className="mt-1 break-all text-slate-100">{data.statement.correlation_id}</div>
              </div>
              <div className="rounded-md bg-black/30 p-3 text-xs text-slate-200 ring-1 ring-white/10">
                <div className="text-slate-300">file_hash</div>
                <div className="mt-1 break-all text-slate-100">{data.statement.file_hash}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-200/90">
              <div className="rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">linhas: {totals.count}</div>
              <div className="rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">warnings: {totals.warnings}</div>
              <div className="rounded-md bg-white/5 px-3 py-2 ring-1 ring-white/10">quarantine: {totals.quarantined}</div>
            </div>
          </div>

          <div className="mt-6 syn-card p-6">
            <div className="text-sm font-semibold text-white">Linhas</div>
            <div className="mt-3 overflow-hidden rounded-md ring-1 ring-white/10">
              <table className="w-full text-left text-xs text-slate-200/90">
                <thead className="bg-white/5 text-slate-200">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Track</th>
                    <th className="px-3 py-2">ISRC</th>
                    <th className="px-3 py-2">DSP</th>
                    <th className="px-3 py-2">Terr</th>
                    <th className="px-3 py-2">Orig</th>
                    <th className="px-3 py-2">FX</th>
                    <th className="px-3 py-2">USD</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.id} className="border-t border-white/10">
                      <td className="px-3 py-2 text-slate-300">{l.row_index}</td>
                      <td className="px-3 py-2">
                        <div className="text-slate-100">{l.track_title ?? "—"}</div>
                        <div className="text-slate-300">{l.artist_name ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-300">{l.isrc ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{l.dsp ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">{l.territory ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {l.net_amount_original ?? "—"} {l.original_currency}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{l.fx_rate ?? "—"}</td>
                      <td className="px-3 py-2 text-slate-100">{l.net_amount_base ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="text-slate-100">{l.status}</div>
                        {l.parsing_status !== "ok" ? (
                          <div className="text-slate-300">{l.parsing_status}</div>
                        ) : null}
                        {l.error_details ? (
                          <div className="text-red-200">{l.error_details}</div>
                        ) : null}
                        {(l.warning_codes ?? []).length ? (
                          <div className="text-amber-200">{l.warning_codes.join(", ")}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
