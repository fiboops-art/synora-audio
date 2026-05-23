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
            source: string | null;
            report_month: string | null;
            imported_at: string | null;
            file_name: string | null;
          };
        }>;
        total_usd: number;
      }
  >(null);

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
              </div>
              <div className="text-sm font-semibold text-emerald-200">Total (no recorte): {usdFmt.format(data.total_usd)}</div>
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
                  {data.entries.map((e, idx) => (
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
