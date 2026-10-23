"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";
import { ensureOnboardingInitialized } from "@/lib/onboarding";

type YouTubeConnection = {
  channel_id: string;
  channel_title: string | null;
  connected_at: string;
  last_synced_at: string | null;
  updated_at: string;
};

export default function StudioHome() {
  const router = useRouter();
  const [youtubeConnection, setYoutubeConnection] =
    useState<YouTubeConnection | null>(null);
  const [youtubeLoading, setYoutubeLoading] = useState(true);
  const [youtubeConnecting, setYoutubeConnecting] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      const state = await ensureOnboardingInitialized();
      if (!state) return;

      if (!state.onboarding.completed_at) {
        router.replace("/onboarding");
        return;
      }

      try {
        const response = await fetch(
          "/api/connections/youtube/status",
          {
            headers: {
              Authorization: `Bearer ${data.session.access_token}`,
            },
          }
        );

        if (response.ok) {
          const result = await response.json();
          setYoutubeConnection(result.connection ?? null);
        }
      } finally {
        setYoutubeLoading(false);
      }
    })();
  }, [router]);

  async function connectYouTube() {
    setYoutubeConnecting(true);

    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/login");
        return;
      }

      const response = await fetch(
        "/api/connections/youtube/start",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok || !result.url) {
        throw new Error(
          result.error || "Não foi possível iniciar a conexão."
        );
      }

      window.location.assign(result.url);
    } catch (error) {
      console.error(
        "YouTube connection start failed",
        error instanceof Error ? error.message : "Unknown error"
      );
      setYoutubeConnecting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="syn-card p-7">
        <div className="text-sm font-semibold text-white">Studio</div>
        <div className="mt-1 text-sm text-slate-200">
          Upload, metadata e status.
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/studio/upload" className="syn-btn-solid">
            Enviar faixa
          </Link>
          <Link href="/studio/library" className="syn-btn-ghost">
            Biblioteca
          </Link>
          <Link href="/dashboard" className="syn-btn-ghost">
            Dashboard
          </Link>
        </div>
      </div>

      <div className="syn-card mt-6 p-7">
        <div className="text-sm font-semibold text-white">
          Conexões
        </div>
        <div className="mt-1 text-sm text-slate-200">
          Conecte plataformas para importar dados e acompanhar receitas.
        </div>

        <div className="mt-5 flex items-center justify-between gap-6 rounded-xl border border-white/10 bg-slate-950/30 p-5">
          <div>
            <div className="font-semibold text-white">
              YouTube
              {youtubeConnection ? " · Conectado ✓" : ""}
            </div>

            <div className="mt-1 text-sm text-slate-400">
              {youtubeConnection
                ? youtubeConnection.channel_title ||
                  "Canal conectado"
                : "Conecte seu canal para importar métricas e dados de monetização disponíveis."}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              {youtubeLoading
                ? "Verificando conexão..."
                : youtubeConnection
                  ? youtubeConnection.last_synced_at
                    ? `Última sincronização: ${new Date(
                        youtubeConnection.last_synced_at
                      ).toLocaleString("pt-BR")}`
                    : "Conectado · aguardando primeira sincronização"
                  : "Não conectado"}
            </div>
          </div>

          {!youtubeConnection && (
            <button
              type="button"
              onClick={connectYouTube}
              disabled={youtubeLoading || youtubeConnecting}
              className="syn-btn-ghost shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {youtubeConnecting
                ? "Conectando..."
                : "Conectar YouTube"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
