"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function Dashboard() {
  const router = useRouter();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [statements, setStatements] = useState<
    Array<{
      id: string;
      source: string;
      report_month: string;
      imported_at: string;
      parsing_status: string;
      line_count: number;
      created_at: string;
    }>
  >([]);
  const [showEmptyStatements, setShowEmptyStatements] = useState(false);
  const [loadingStatements, setLoadingStatements] = useState(false);

  const [csvText, setCsvText] = useState<string>("source,report_month,imported_at,dsp,territory,original_currency,net_amount_original,ISRC,track_title,artist_name\n");
  const [numberFormat, setNumberFormat] = useState<"auto" | "en_US" | "pt_BR">("auto");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const canImport = useMemo(() => csvText.trim().length > 0 && !!sessionToken, [csvText, sessionToken]);

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

  const refreshStatements = useCallback(async (token: string) => {
    setLoadingStatements(true);
    try {
      const res = await fetch(`/api/royalties/statements?limit=20`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as {
        statements?: Array<{
          id: string;
          source: string;
          report_month: string;
          imported_at: string;
          parsing_status: string;
          line_count: number;
          created_at: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setStatements(j.statements ?? []);
    } catch (e: unknown) {
      // keep silent; dashboard should remain usable
      console.error(e);
    } finally {
      setLoadingStatements(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshStatements(sessionToken);
    })();
  }, [sessionToken, refreshStatements]);

  async function onPickCsvFile(file: File) {
    const text = await file.text();
    setCsvText(text);
  }

  async function importRoyalties() {
    if (!sessionToken) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch(`/api/royalties/statements/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          source: "mock_v0",
          report_month: new Date().toISOString().slice(0, 7),
          number_format: numberFormat,
          csv: csvText,
          file_name: "dashboard-import.csv",
        }),
      });
      const j = (await res.json()) as { statement?: unknown; error?: string };
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setImportResult(JSON.stringify(j, null, 2));
      await refreshStatements(sessionToken);
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Dashboard (Fase 1)</div>
          <div className="text-sm text-slate-200/90">
            Status operacional: uploads, Guardian e distribuição.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm text-slate-200 hover:text-white">
            Home
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/studio" className="text-sm text-slate-200 hover:text-white">
            Studio
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="syn-card p-6">
          <div className="text-xs text-slate-300">Uploads hoje</div>
          <div className="mt-1 text-2xl font-semibold text-white">1</div>
          <div className="mt-2 text-xs text-slate-300/80">MVP: contadores estáticos.</div>
        </div>
        <div className="syn-card p-6">
          <div className="text-xs text-slate-300">Guardian</div>
          <div className="mt-1 text-2xl font-semibold text-white">Online</div>
          <div className="mt-2 text-xs text-slate-300/80">
            Configure <code className="rounded bg-white/10 px-1 py-0.5 ring-1 ring-white/10">NEXT_PUBLIC_GUARDIAN_URL</code>
          </div>
        </div>
        <div className="syn-card p-6">
          <div className="text-xs text-slate-300">Distribuição</div>
          <div className="mt-1 text-2xl font-semibold text-white">Stub</div>
          <div className="mt-2 text-xs text-slate-300/80">Integração DSP fica para fase 2.</div>
        </div>
      </div>

      <div className="mt-6 syn-card-soft p-6">
        <div className="text-sm font-semibold text-white">Próximos passos (dev)</div>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-200/90">
          <li>Persistência: salvar faixas em banco (Postgres) + storage (R2/S3).</li>
          <li>Guardian Stage específico para música (copyright/similaridade + provenance).</li>
          <li>Fila async de distribuição (Skipper) + status por DSP.</li>
        </ul>
      </div>

      <div className="mt-6 syn-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Royalties (MVP) — Import CSV</div>
            <div className="text-sm text-slate-200/90">
              CSV-first, API-ready. Normaliza números, aplica FX (ECB→USD), cria statement e linhas com audit trail.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 hover:bg-white/15">
              Escolher arquivo CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickCsvFile(f);
                }}
              />
            </label>
            <select
              value={numberFormat}
              onChange={(e) => setNumberFormat(e.target.value as "auto" | "en_US" | "pt_BR")}
              className="rounded-md bg-white/10 px-2 py-2 text-sm text-slate-100 ring-1 ring-white/10"
            >
              <option value="auto">auto</option>
              <option value="en_US">en_US</option>
              <option value="pt_BR">pt_BR</option>
            </select>
            <button
              disabled={!canImport || importing}
              onClick={() => void importRoyalties()}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="text-xs text-slate-300">CSV</div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              className="mt-2 w-full rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10"
            />
            <div className="mt-2 text-xs text-slate-300/80">
              Dica: cole aqui o CSV ou use “Escolher arquivo”.
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300">Resultado</div>
            {importError ? (
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">
                {importError}
              </pre>
            ) : (
              <pre className="mt-2 max-h-[260px] overflow-auto rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10">
                {importResult ?? "—"}
              </pre>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">Statements recentes</div>
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-200/90">
                    <input
                      type="checkbox"
                      checked={showEmptyStatements}
                      onChange={(e) => setShowEmptyStatements(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/10"
                    />
                    mostrar vazios/failed
                  </label>
                  <button
                    onClick={() => sessionToken && void refreshStatements(sessionToken)}
                    className="text-xs text-slate-200 hover:text-white"
                  >
                    {loadingStatements ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>
              </div>
              <div className="mt-2 overflow-hidden rounded-md ring-1 ring-white/10">
                <table className="w-full text-left text-xs text-slate-200/90">
                  <thead className="bg-white/5 text-slate-200">
                    <tr>
                      <th className="px-3 py-2">Mês</th>
                      <th className="px-3 py-2">Fonte</th>
                      <th className="px-3 py-2">Linhas</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showEmptyStatements ? statements : statements.filter((s) => s.line_count > 0)).length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-slate-300" colSpan={4}>
                          Nenhum statement ainda.
                        </td>
                      </tr>
                    ) : (
                      (showEmptyStatements ? statements : statements.filter((s) => s.line_count > 0)).map((s) => (
                        <tr key={s.id} className="border-t border-white/10">
                          <td className="px-3 py-2">{s.report_month}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/dashboard/royalties/${s.id}`}
                              className="text-slate-100 hover:underline"
                            >
                              {s.source}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{s.line_count}</td>
                          <td className="px-3 py-2">{s.parsing_status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
