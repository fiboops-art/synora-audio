"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Track = {
  id: string;
  title: string;
  artist: string;
  createdAt: string;
  guardianStatus: "PENDING" | "APPROVED" | "APPROVED_WITH_ADJUSTMENTS" | "BLOCKED";
  distributionStatus: "NOT_SENT" | "QUEUED" | "SENT";
};

export default function LibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/tracks", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load tracks");
        const rows = (data.tracks ?? []) as any[];
        const mapped: Track[] = rows.map((r) => ({
          id: r.id,
          title: r.title,
          artist: r.artist,
          createdAt: r.created_at,
          guardianStatus: r.guardian_status,
          distributionStatus: r.distribution_status,
        }));
        if (mounted) setTracks(mapped);
      } catch (e: any) {
        if (mounted) setError(e?.message ?? "Error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const total = tracks.length;
    const approved = tracks.filter((t) => t.guardianStatus.startsWith("APPROVED")).length;
    const blocked = tracks.filter((t) => t.guardianStatus === "BLOCKED").length;
    return { total, approved, blocked };
  }, [tracks]);

  function markDistribution(id: string) {
    setTracks((cur) =>
      cur.map((t) => (t.id === id ? { ...t, distributionStatus: "QUEUED" } : t))
    );
    setTimeout(() => {
      setTracks((cur) =>
        cur.map((t) => (t.id === id ? { ...t, distributionStatus: "SENT" } : t))
      );
    }, 900);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-950">Biblioteca</div>
          <div className="text-sm text-slate-800">Catálogo local do MVP.</div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/studio/upload" className="text-sm text-slate-700 hover:text-slate-950">
            Enviar faixa
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/dashboard" className="text-sm text-slate-700 hover:text-slate-950">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs text-slate-700">Faixas</div>
          <div className="text-xl font-semibold text-slate-950">{stats.total}</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs text-slate-700">Aprovadas</div>
          <div className="text-xl font-semibold text-slate-950">{stats.approved}</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs text-slate-700">Bloqueadas</div>
          <div className="text-xl font-semibold text-slate-950">{stats.blocked}</div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-white/60 ring-1 ring-slate-900/10 backdrop-blur">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-900/10 px-4 py-3 text-xs font-semibold text-slate-700">
          <div className="col-span-5">Faixa</div>
          <div className="col-span-3">Guardian</div>
          <div className="col-span-2">Distribuição</div>
          <div className="col-span-2 text-right">Ações</div>
        </div>

        {loading && (
          <div className="px-4 py-6 text-sm text-slate-800">Carregando…</div>
        )}
        {error && (
          <div className="px-4 py-6 text-sm text-red-100">
            Erro: {error}
            <div className="mt-1 text-xs text-slate-200/80">
              Dica: configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.
            </div>
          </div>
        )}

        {!loading && !error && tracks.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-800">
            Nenhuma faixa ainda. Envie a primeira em <Link className="underline" href="/studio/upload">/studio/upload</Link>.
          </div>
        )}

        {!loading && !error && tracks.map((t) => (
          <div key={t.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
            <div className="col-span-5">
              <div className="font-semibold text-slate-950">{t.title}</div>
              <div className="text-xs text-slate-700">{t.artist} • {t.id}</div>
            </div>
            <div className="col-span-3">
              <span className="rounded-full bg-white/80 px-2 py-1 text-xs ring-1 ring-slate-900/10">
                {t.guardianStatus}
              </span>
            </div>
            <div className="col-span-2">
              <span className="rounded-full bg-white/80 px-2 py-1 text-xs ring-1 ring-slate-900/10">
                {t.distributionStatus}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <button
                onClick={() => markDistribution(t.id)}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-slate-900/20 hover:bg-slate-950"
              >
                Distribuir (stub)
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
