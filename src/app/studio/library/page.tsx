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

function fmtDeletedAgo(iso?: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "agora";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

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

  async function hardDeleteTrack(id: string) {
    const first = window.confirm(
      "Excluir definitivamente? Isso remove do banco e tenta apagar o arquivo do Storage. (Ação irreversível)"
    );
    if (!first) return;

    const typed = window.prompt('Para confirmar, digite EXCLUIR');
    if ((typed ?? "").trim().toUpperCase() !== "EXCLUIR") {
      alert("Confirmação cancelada.");
      return;
    }
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const res = await fetch("/api/tracks", {
        method: "DELETE",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Falha ao excluir definitivamente");

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
                ? "bg-white/10 text-white ring-white/15"
                : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
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
                ? "bg-white/10 text-white ring-white/15"
                : "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
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
        <div className="syn-card p-5">
          <div className="text-xs text-slate-300">Faixas</div>
          <div className="text-xl font-semibold text-white">{stats.total}</div>
        </div>
        <div className="syn-card p-5">
          <div className="text-xs text-slate-300">Aprovadas</div>
          <div className="text-xl font-semibold text-white">{stats.approved}</div>
        </div>
        <div className="syn-card p-5">
          <div className="text-xs text-slate-300">Bloqueadas</div>
          <div className="text-xl font-semibold text-white">{stats.blocked}</div>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30 shadow-[0_18px_50px_-26px_rgba(0,0,0,0.7)] backdrop-blur">
        <div className="grid grid-cols-12 gap-2 border-b border-white/10 px-4 py-3 text-xs font-semibold text-slate-200/90">
          <div className="col-span-5">Faixa</div>
          <div className="col-span-3">Guardian</div>
          <div className="col-span-2">Distribuição</div>
          <div className="col-span-2 text-right">Ações</div>
        </div>

        {loading && (
          <div className="px-4 py-6 text-sm text-slate-200/90">Carregando…</div>
        )}
        {error && (
          <div className="px-4 py-6 text-sm text-rose-100">
            Erro: {error}
            <div className="mt-1 text-xs text-slate-300/80">
              Dica: configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel.
            </div>
          </div>
        )}

        {!loading && !error && tracks.length === 0 && (
          <div className="px-4 py-6 text-sm text-slate-200/90">
            {view === "trash" ? (
              <>Nenhuma faixa na lixeira.</>
            ) : (
              <>Nenhuma faixa ainda. Envie a primeira em <Link className="underline" href="/studio/upload">/studio/upload</Link>.</>
            )}
          </div>
        )}

        {!loading && !error && tracks.map((t) => (
          <div key={t.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm hover:bg-white/[0.04] transition">
            <div className="col-span-5">
              <div className="font-semibold text-white">{t.title}</div>
              <div className="text-xs text-slate-300/80">
                {t.artist} • {t.id}
                {view === "trash" && t.deletedAt ? (
                  <span className="text-slate-400"> • apagada há {fmtDeletedAgo(t.deletedAt)}</span>
                ) : null}
              </div>
            </div>
            <div className="col-span-3">
              <span className="syn-badge-neutral">
                {t.guardianStatus}
              </span>
            </div>
            <div className="col-span-2">
              <span className="syn-badge-neutral">
                {t.distributionStatus}
              </span>
            </div>
            <div className="col-span-2 text-right">
              <div className="flex items-center justify-end gap-2">
                {view === "trash" ? (
                  <>
                    <button
                      onClick={() => restoreTrack(t.id)}
                      className="syn-btn-cta px-3 py-2 text-xs"
                      title="Restaurar"
                    >
                      Restaurar
                    </button>
                    <button
                      onClick={() => hardDeleteTrack(t.id)}
                      className="syn-btn-danger px-3 py-2 text-xs"
                      title="Excluir definitivamente"
                    >
                      Excluir
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => trashTrack(t.id)}
                    className="syn-btn-ghost px-3 py-2 text-xs"
                    title="Excluir"
                  >
                    🗑️
                  </button>
                )}
                <button
                  onClick={() => markDistribution(t.id)}
                  className="syn-btn-solid px-3 py-2 text-xs"
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
