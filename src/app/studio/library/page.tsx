"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { getAccessToken } from "@/lib/auth";

type Track = {
  id: string;
  title: string;
  artist: string;
  createdAt: string;
  guardianStatus: "PENDING" | "APPROVED" | "APPROVED_WITH_ADJUSTMENTS" | "BLOCKED";
  distributionStatus: "NOT_SENT" | "QUEUED" | "SENT";
  deletedAt?: string | null;
};

export default function LibraryPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "trash">("active");
  const router = useRouter();

  async function refreshTracks(nextView = view) {
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/tracks?view=${nextView}`, {
        cache: "no-store",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load tracks");
      const rows = (Array.isArray(data?.tracks) ? (data.tracks as unknown[]) : []) as unknown[];
      const mapped: Track[] = rows
        .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : null))
        .filter((r): r is Record<string, unknown> => !!r)
        .map((r) => ({
          id: String(r.id ?? ""),
          title: String(r.title ?? ""),
          artist: String(r.artist ?? ""),
          createdAt: String(r.created_at ?? ""),
          guardianStatus: String(r.guardian_status ?? "PENDING") as Track["guardianStatus"],
          distributionStatus: String(r.distribution_status ?? "NOT_SENT") as Track["distributionStatus"],
          deletedAt: (r.deleted_at ?? null) as string | null,
        }))
        .filter((t) => !!t.id);
      setTracks(mapped);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function trashTrack(id: string) {
    const ok = window.confirm("Excluir esta faixa da sua biblioteca? (Isso não apaga o arquivo do Storage ainda)");
    if (!ok) return;
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const res = await fetch("/api/tracks", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, deleted_at: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao excluir");
      // Optimistic: remove from UI
      setTracks((cur) => cur.filter((t) => t.id !== id));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Erro";
      alert(msg);
    }
  }

  async function restoreTrack(id: string) {
    const ok = window.confirm("Restaurar esta faixa da Lixeira?");
    if (!ok) return;
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const res = await fetch("/api/tracks", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, deleted_at: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao restaurar");

      // Optimistic: remove from trash view
      setTracks((cur) => cur.filter((t) => t.id !== id));
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Erro";
      alert(msg);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      const supabase = getSupabase();
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        router.replace("/login");
        return;
      }

      if (mounted) await refreshTracks("active");
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

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
          <div className="text-sm font-semibold text-slate-50">Biblioteca</div>
          <div className="text-sm text-slate-200">Catálogo local do MVP.</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setView("active");
              await refreshTracks("active");
            }}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition ${
              view === "active"
                ? "bg-white/85 text-slate-950 ring-slate-900/10"
                : "bg-white/60 text-slate-800 ring-slate-900/10 hover:bg-white/75"
            }`}
          >
            Biblioteca
          </button>
          <button
            onClick={async () => {
              setView("trash");
              await refreshTracks("trash");
            }}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ring-1 transition ${
              view === "trash"
                ? "bg-white/85 text-slate-950 ring-slate-900/10"
                : "bg-white/60 text-slate-800 ring-slate-900/10 hover:bg-white/75"
            }`}
          >
            Lixeira
          </button>
          <span className="text-slate-300">•</span>
          <Link href="/studio/upload" className="text-sm text-slate-200 hover:text-white">
            Enviar faixa
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/dashboard" className="text-sm text-slate-200 hover:text-white">
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
            {view === "trash" ? (
              <>Nenhuma faixa na lixeira.</>
            ) : (
              <>Nenhuma faixa ainda. Envie a primeira em <Link className="underline" href="/studio/upload">/studio/upload</Link>.</>
            )}
          </div>
        )}

        {!loading && !error && tracks.map((t) => (
          <div key={t.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
            <div className="col-span-5">
              <div className="font-semibold text-slate-950">{t.title}</div>
              <div className="text-xs text-slate-700">{t.artist} • {t.id}</div>
            </div>
            <div className="col-span-3">
              <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-slate-950 ring-1 ring-slate-900/10">
                {t.guardianStatus}
              </span>
            </div>
            <div className="col-span-2">
              <span className="rounded-full bg-white/80 px-2 py-1 text-xs text-slate-950 ring-1 ring-slate-900/10">
                {t.distributionStatus}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <div className="flex items-center justify-end gap-2">
                {view === "trash" ? (
                  <button
                    onClick={() => restoreTrack(t.id)}
                    className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-emerald-900/20 hover:bg-emerald-800"
                    title="Restaurar"
                  >
                    Restaurar
                  </button>
                ) : (
                  <button
                    onClick={() => trashTrack(t.id)}
                    className="rounded-xl bg-white/80 px-3 py-2 text-xs font-semibold text-slate-950 ring-1 ring-slate-900/10 hover:bg-white"
                    title="Excluir"
                  >
                    🗑️
                  </button>
                )}
                <button
                  onClick={() => markDistribution(t.id)}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-slate-900/20 hover:bg-slate-950"
                >
                  Distribuir (stub)
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
