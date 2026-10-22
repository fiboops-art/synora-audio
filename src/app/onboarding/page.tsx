"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { ensureOnboardingInitialized } from "@/lib/onboarding";

export default function OnboardingWelcomePage() {
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

      if (state.onboarding.current_step > 1) {
        const map: Record<number, string> = {
          2: "/onboarding/asset",
          3: "/onboarding/rights",
          4: "/onboarding/library",
          5: "/onboarding/done",
        };
        router.replace(map[state.onboarding.current_step] ?? "/onboarding/profile");
        return;
      }

      setReady(true);
    })();
  }, [router]);

  if (!ready) return null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="syn-card p-7">
        <h1 className="text-xl font-semibold text-white">Bem-vindo ao Synora Creators.</h1>

        <p className="mt-4 text-sm leading-relaxed text-slate-200/95">
          A partir daqui, você começa a organizar seus ativos, direitos, receitas e conexões em um único ambiente.
        </p>

        <p className="mt-4 text-sm leading-relaxed text-slate-200/95">
          Para começar, vamos configurar seu perfil e entender como você trabalha. Leva apenas alguns minutos e você
          poderá completar ou alterar essas informações depois.
        </p>

        <div className="mt-6">
          <Link
            href="/onboarding/profile"
            className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-white/20 transition hover:bg-slate-50"
          >
            Começar configuração
          </Link>
        </div>
      </div>
    </main>
  );
}
