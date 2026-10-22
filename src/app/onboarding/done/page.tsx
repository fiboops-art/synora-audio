"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { ensureOnboardingInitialized, setOnboarding } from "@/lib/onboarding";
import TimelineChips from "@/components/TimelineChips";

export default function OnboardingDonePage() {
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
      if (state.onboarding.current_step !== 5) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
    })();
  }, [router]);

  async function finish() {
    setBusy(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      await setOnboarding({ completed_at: new Date().toISOString() });
      router.replace("/dashboard");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Falha ao concluir";
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
        currentStep={5}
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
        <h1 className="text-xl font-semibold text-white">Concluído</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-200/95">
          Pronto. Agora o Dashboard vira sua home.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            onClick={() => void finish()}
            disabled={busy}
            className="syn-btn-primary"
          >
            {busy ? "Concluindo…" : "Ir para Dashboard"}
          </button>
        </div>

        {err ? <div className="mt-4 text-xs text-red-200">Erro: {err}</div> : null}
      </div>
    </main>
  );
}

