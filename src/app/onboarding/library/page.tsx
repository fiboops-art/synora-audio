"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { ensureOnboardingInitialized, setOnboarding } from "@/lib/onboarding";
import TimelineChips from "@/components/TimelineChips";

export default function OnboardingLibraryPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        router.replace("/login");
        return;
      }
      const state = await ensureOnboardingInitialized();
      if (!state) {
        router.replace("/login");
        return;
      }
      if (state.onboarding.completed_at) {
        router.replace("/dashboard");
        return;
      }
      if (state.onboarding.current_step !== 4) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
    })();
  }, [router]);

  async function continueIfReady() {
    setBusy(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const state = await ensureOnboardingInitialized();
      const trackId = state?.onboarding.track_id;
      if (!trackId) {
        throw new Error("Ativo do onboarding não identificado. Retorne à etapa 2.");
      }

      const res = await fetch(`/api/tracks?view=active&id=${encodeURIComponent(trackId)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as { tracks?: unknown[]; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

      const hasTrack =
        Array.isArray(j.tracks) &&
        j.tracks.some((track) =>
          typeof track === "object" &&
          track !== null &&
          "id" in track &&
          (track as { id?: unknown }).id === trackId
        );

      if (!hasTrack) {
        throw new Error("O ativo criado neste onboarding não foi encontrado na Biblioteca.");
      }

      await setOnboarding({ current_step: 5 });
      router.replace("/onboarding/done");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Falha ao validar etapa";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <TimelineChips
        title="Onboarding — Timeline"
        subtitle=""
        currentStep={4}
        totalSteps={5}
        items={[
          { step: 1, href: "/onboarding/profile", label: "1) Perfil" },
          { step: 2, href: "/onboarding/asset", label: "2) Primeiro ativo" },
          { step: 3, href: "/onboarding/rights", label: "3) Direitos" },
          { step: 4, href: "/onboarding/library", label: "4) Biblioteca" },
          { step: 5, href: "/onboarding/done", label: "5) Concluído" },
        ]}
      />

      <div className="mt-4 syn-card p-7">
        <h1 className="text-xl font-semibold text-white">Biblioteca</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-200/95">
          A Biblioteca é a confirmação visual do que você fez: aqui você deve conseguir reconhecer o ativo que acabou de adicionar.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/studio/library?onboarding=1"
            className="syn-btn-primary"
          >
            Abrir Biblioteca
          </Link>
          <button
            onClick={() => void continueIfReady()}
            disabled={busy}
            className="syn-btn-ghost"
          >
            {busy ? "Validando…" : "Continuar"}
          </button>
          <Link
            href="/onboarding/rights"
            className="syn-btn-ghost"
          >
            Voltar
          </Link>
        </div>

        {err ? <div className="mt-4 text-xs text-red-200">Erro: {err}</div> : null}
      </div>
    </main>
  );
}

