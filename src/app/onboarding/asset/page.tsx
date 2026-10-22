"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { ensureOnboardingInitialized } from "@/lib/onboarding";
import TimelineChips from "@/components/TimelineChips";

export default function OnboardingAssetPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

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
      if (state.onboarding.current_step !== 2) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
    })();
  }, [router]);

  if (!ready) return null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <TimelineChips
        title="Onboarding — Timeline"
        subtitle=""
        currentStep={2}
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
        <h1 className="text-xl font-semibold text-white">Seu primeiro ativo</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-200/95">
          Agora vamos adicionar seu primeiro ativo ao Synora Creators.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/studio/upload?onboarding=1"
            className="syn-btn-primary"
          >
            Adicionar primeiro ativo
          </Link>
          <Link
            href="/onboarding/profile"
            className="syn-btn-ghost"
          >
            Voltar
          </Link>
        </div>

        <div className="mt-4 text-xs text-slate-300/90">
          Depois que o upload for finalizado com sucesso, você será levado automaticamente para a etapa 3 (Direitos).
        </div>
      </div>
    </main>
  );
}

