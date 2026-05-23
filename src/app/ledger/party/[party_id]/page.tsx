"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function PartyLedgerPage({ params }: { params: { party_id: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const partyIdFromParams = String(params.party_id ?? "").trim();
  const partyIdFromPath = String(pathname.split("/").filter(Boolean).pop() ?? "").trim();
  const partyId = partyIdFromParams || partyIdFromPath;

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<
    | null
    | {
        party: { id: string; display_name: string; email: string | null };
        entries: Array<{
          amount_usd: number;
          created_at: string;
          line: null | {
            track_title: string | null;
            artist_name: string | null;
            isrc: string | null;
            dsp: string | null;
            territory: string | null;
            report_month: string | null;
          };
          statement: null | {
            id: string;
            source: string | null;
            report_month: string | null;
            imported_at: string | null;
            file_name: string | null;
          };
        }>;
        total_usd: number;
      }
  >(null);

  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [statementFilter, setStatementFilter] = useState<string>("all");
  const [q, setQ] = useState<string>("");

  const usdFmt = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const months = useMemo(() => {
    const s = new Set<string>();
    for (const e of data?.entries ?? []) {
      const m = (e.line?.report_month ?? e.statement?.report_month ?? "").trim();
      if (m) s.add(m);
    }
    return Array.from(s).sort().reverse();
  }, [data]);

  const statements = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const e of data?.entries ?? []) {
      const st = e.statement;
      if (!st?.id) continue;
      const label = `${st.source ?? "—"} • ${st.file_name ?? st.id}`;
      map.set(st.id, { id: st.id, label });
    }
    return Array.from(map.values());
  }, [data]);

  const filteredEntries = useMemo(() => {
    const src = data?.entries ?? [];
    const needle = q.trim().toLowerCase();
    return src.filter((e) => {
      const m = (e.line?.report_month ?? e.statement?.report_month ?? "").trim();
      if (monthFilter !== "all" && m !== monthFilter) return false;
      const sid = String(e.statement?.id ?? "");
      if (statementFilter !== "all" && sid !== statementFilter) return false;

      if (needle) {
        const track = String(e.line?.track_title ?? "").toLowerCase();
        const artist = String(e.line?.artist_name ?? "").toLowerCase();
        const isrc = String(e.line?.isrc ?? "").toLowerCase();
        if (!track.includes(needle) && !artist.includes(needle) && !isrc.includes(needle)) return false;
      }
      return true;
    });
  }, [data, monthFilter, statementFilter, q]);

  const filteredTotalUsd = useMemo(
    () => filteredEntries.reduce((acc, x) => acc + Number(x.amount_usd ?? 0), 0),
    [filteredEntries]
  );

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionToken(data.session.access_token);
    })();
  }, [router]);

  useEffect(() => {
    if (!sessionToken) return;
    if (!partyId) return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/ledger/party/${encodeURIComponent(partyId)}?limit=200`, {
          headers: { authorization: `Bearer ${sessionToken}` },
          cache: "no-store",
        });
        const j = (await res.json()) as { error?: string } & NonNullable<typeof data>;
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setData(j);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erro ao carregar extrato");
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionToken, partyId]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Extrato por party</div>
          <div className="text-sm text-slate-200/90">Drill-down do sub-ledger (USD).</div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-slate-200 hover:text-white">
            ← Voltar
          </Link>
        </div>
      </div>

      <div className="mt-4 syn-card p-5">
        {!partyId ? (
          <pre className="whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">
            party_id inválido
            {"\n"}path: {pathname}
          </pre>
        ) : loading ? (
          <div className="text-sm text-slate-200/90">Carregando…</div>
        ) : error ? (
          <pre className="whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">{error}</pre>
        ) : !data ? (
          <div className="text-sm text-slate-200/80">—</div>
        ) : (
          <>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">{data.party.display_name}</div>
                <div className="text-xs text-slate-300">{data.party.email ?? data.party.id}</div>
                <div className="text-[11px] text-slate-400">party_id: {data.party.id}</div>
              </div>
              <div className="text-sm font-semibold text-emerald-200">Total (no recorte): {usdFmt.format(filteredTotalUsd)}</div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="text-xs text-slate-300">Filtros</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar track / artista / ISRC"
                className="w-full rounded-md bg-white/10 px-3 py-2 text-xs text-slate-100 ring-1 ring-white/10 placeholder:text-slate-400 sm:w-[260px]"
              />
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="syn-select"
              >
                <option value="all">Mês (todos)</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={statementFilter}
                onChange={(e) => setStatementFilter(e.target.value)}
                className="syn-select"
              >
                <option value="all">Statement (todos)</option>
                {statements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setMonthFilter("all");
                  setStatementFilter("all");
                  setQ("");
                }}
                className="rounded-md bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
              >
                Limpar
              </button>
            </div>

            <div className="mt-2 text-[11px] text-slate-400">
              Linhas: {filteredEntries.length}{data.entries.length !== filteredEntries.length ? ` (de ${data.entries.length})` : ""}
            </div>

            <div className="mt-4 overflow-hidden rounded-md ring-1 ring-white/10">
              <table className="w-full text-left text-xs text-slate-200/90">
                <thead className="bg-white/5 text-slate-200">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Track</th>
                    <th className="px-3 py-2">Fonte</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((e, idx) => (
                    <tr key={idx} className="border-t border-white/10">
                      <td className="px-3 py-2 whitespace-nowrap">{String(e.created_at).slice(0, 10)}</td>
                      <td className="px-3 py-2">
                        <div className="text-slate-100">{e.line?.track_title ?? "—"}</div>
                        <div className="text-[11px] text-slate-300">
                          {(e.line?.artist_name ?? "").trim()} {e.line?.isrc ? `• ${e.line.isrc}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-slate-100">{e.statement?.source ?? "—"}</div>
                        <div className="text-[11px] text-slate-300">{e.statement?.file_name ?? ""}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-200">{usdFmt.format(Number(e.amount_usd ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
