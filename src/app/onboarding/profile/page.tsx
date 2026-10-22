"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { ensureOnboardingInitialized, setOnboarding } from "@/lib/onboarding";
import TimelineChips from "@/components/TimelineChips";

export default function OnboardingProfilePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [kind, setKind] = useState<"person" | "company">("person");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
      if (state.onboarding.current_step !== 1) {
        const map: Record<number, string> = {
          2: "/onboarding/asset",
          3: "/onboarding/rights",
          4: "/onboarding/library",
          5: "/onboarding/done",
        };
        router.replace(map[state.onboarding.current_step] ?? "/onboarding");
        return;
      }
      setReady(true);
    })();
  }, [router]);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          display_name: displayName,
          tax_id: taxId,
          email,
          kind,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      await setOnboarding({ current_step: 2 });
      router.replace("/onboarding/asset");
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Falha ao salvar";
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
        currentStep={1}
        totalSteps={5}
        items={[
          { step: 1, href: "/onboarding/profile", label: "1) Perfil" },
          { step: 2, href: "/onboarding/asset", label: "2) Primeiro ativo" },
          { step: 3, href: "/onboarding/rights", label: "3) Direitos" },
          { step: 4, href: "/onboarding/library", label: "4) Biblioteca" },
          { step: 5, href: "/onboarding/done", label: "5) Concluído" },
        ]}
      />

      <div className="syn-card p-7">
        <div className="text-sm font-semibold text-white">Configuração inicial</div>
        <div className="mt-1 text-sm text-slate-200/90">
          Preencha seu perfil. Você poderá alterar depois.
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold text-slate-200">Tipo</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "person" | "company")}
            className="syn-input"
          >
            <option className="bg-slate-900 text-white" value="person">Pessoa</option>
            <option className="bg-slate-900 text-white" value="company">Empresa</option>
          </select>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-200">Nome</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={kind === "company" ? "Nome da empresa" : "Seu nome"}
            className="syn-input"
            autoComplete="name"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-200">
            {kind === "company" ? "CNPJ" : "CPF"} <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            value={taxId}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, kind === "company" ? 14 : 11);
              const formatted =
                kind === "company"
                  ? digits
                      .replace(/^(\d{2})(\d)/, "$1.$2")
                      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
                      .replace(/\.(\d{3})(\d)/, ".$1/$2")
                      .replace(/(\d{4})(\d)/, "$1-$2")
                  : digits
                      .replace(/^(\d{3})(\d)/, "$1.$2")
                      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
                      .replace(/(\d{3})(\d)/, "$1-$2");
              setTaxId(formatted);
            }}
            placeholder={kind === "company" ? "00.000.000/0000-00" : "000.000.000-00"}
            className="syn-input"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-slate-200">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="syn-input"
            inputMode="email"
            autoComplete="email"
          />
        </div>

        {err && <div className="mt-3 text-xs text-red-200">Erro: {err}</div>}

        <button
          onClick={save}
          disabled={busy || !displayName.trim() || !email.trim()}
          className="mt-5 w-full syn-btn-primary"
        >
          {busy ? "Salvando…" : "Continuar"}
        </button>
      </div>
    </main>
  );
}
