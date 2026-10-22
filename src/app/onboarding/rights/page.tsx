"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "@/lib/auth";
import { ensureOnboardingInitialized, setOnboarding } from "@/lib/onboarding";
import TimelineChips from "@/components/TimelineChips";

type Track = {
  id: string;
  title: string | null;
  artist: string | null;
};

type Recording = {
  id: string;
  track_id: string | null;
  track_title: string | null;
  artist_name: string | null;
};

type Party = {
  id: string;
  display_name: string;
  kind: string;
  email?: string | null;
};

type SplitItem = {
  party_id: string;
  role: string;
  share_bps: number;
};

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Falha ao configurar direitos";
}

export default function OnboardingRightsPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [track, setTrack] = useState<Track | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [parties, setParties] = useState<Party[]>([]);
  const [items, setItems] = useState<SplitItem[]>([]);

  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyEmail, setNewPartyEmail] = useState("");
  const [newPartyKind, setNewPartyKind] = useState<"person" | "company">("person");

  const [busy, setBusy] = useState(false);
  const [creatingParty, setCreatingParty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalBps = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.share_bps || 0), 0),
    [items]
  );

  async function loadParties(accessToken: string) {
    const res = await fetch("/api/parties?limit=500", {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const j = (await res.json()) as { parties?: Party[]; error?: string };
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
    setParties(j.parties ?? []);
  }

  async function loadExistingSplit(accessToken: string, recordingId: string) {
    const res = await fetch(
      `/api/splits/recording?recording_id=${encodeURIComponent(recordingId)}`,
      {
        headers: { authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    const j = (await res.json()) as {
      items?: Array<{ party_id: string; role: string; share_bps: number }>;
      error?: string;
    };

    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

    setItems(
      (j.items ?? []).map((item) => ({
        party_id: String(item.party_id ?? ""),
        role: String(item.role ?? "participant"),
        share_bps: Math.trunc(Number(item.share_bps ?? 0)),
      }))
    );
  }

  useEffect(() => {
    (async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
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

        if (state.onboarding.current_step !== 3) {
          router.replace("/onboarding");
          return;
        }

        const trackId = state.onboarding.track_id;
        if (!trackId) {
          throw new Error(
            "Não foi possível identificar o ativo deste onboarding. Volte ao passo anterior e adicione o ativo novamente."
          );
        }

        setToken(accessToken);

        const trackRes = await fetch(
          `/api/tracks?id=${encodeURIComponent(trackId)}`,
          {
            headers: { authorization: `Bearer ${accessToken}` },
            cache: "no-store",
          }
        );

        const trackJson = (await trackRes.json()) as {
          tracks?: Track[];
          error?: string;
        };

        if (!trackRes.ok) {
          throw new Error(trackJson.error || `HTTP ${trackRes.status}`);
        }

        const currentTrack = trackJson.tracks?.[0] ?? null;
        if (!currentTrack || currentTrack.id !== trackId) {
          throw new Error("Ativo do onboarding não encontrado.");
        }

        setTrack(currentTrack);

        const recRes = await fetch("/api/catalog/recordings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            track_id: currentTrack.id,
            track_title: currentTrack.title,
            artist_name: currentTrack.artist,
          }),
        });

        const recJson = (await recRes.json()) as {
          recording?: Recording;
          error?: string;
        };

        if (!recRes.ok || !recJson.recording?.id) {
          throw new Error(recJson.error || "Falha ao preparar Direitos do ativo.");
        }

        setRecording(recJson.recording);

        await Promise.all([
          loadParties(accessToken),
          loadExistingSplit(accessToken, recJson.recording.id),
        ]);

        setReady(true);
      } catch (e: unknown) {
        setErr(errMsg(e));
        setReady(true);
      }
    })();
  }, [router]);

  async function createParty() {
    if (!token) return;

    setCreatingParty(true);
    setErr(null);

    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: newPartyName,
          kind: newPartyKind,
          email: newPartyEmail,
        }),
      });

      const j = (await res.json()) as { party?: Party; error?: string };
      if (!res.ok || !j.party?.id) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      setNewPartyName("");
      setNewPartyEmail("");
      await loadParties(token);

      setItems((current) => [
        ...current,
        {
          party_id: j.party!.id,
          role: "participant",
          share_bps: current.length === 0 ? 10000 : 0,
        },
      ]);
    } catch (e: unknown) {
      setErr(errMsg(e));
    } finally {
      setCreatingParty(false);
    }
  }

  async function saveAndContinue() {
    if (!token || !recording?.id) return;

    setBusy(true);
    setErr(null);

    try {
      if (!items.length) {
        throw new Error("Adicione ao menos um participante.");
      }

      if (items.some((item) => !item.party_id)) {
        throw new Error("Selecione o participante de cada direito.");
      }

      if (totalBps !== 10000) {
        throw new Error(
          `Os percentuais devem somar 100%. Total atual: ${(totalBps / 100).toFixed(2)}%.`
        );
      }

      const res = await fetch("/api/splits/recording", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recording_id: recording.id,
          items,
        }),
      });

      const j = (await res.json()) as {
        split?: { id?: string };
        error?: string;
      };

      if (!res.ok || !j.split?.id) {
        throw new Error(j.error || `HTTP ${res.status}`);
      }

      await setOnboarding({ current_step: 4 });
      router.replace("/onboarding/library");
    } catch (e: unknown) {
      setErr(errMsg(e));
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
        currentStep={3}
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
        <h1 className="text-xl font-semibold text-white">Direitos</h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-200/95">
          Defina quem participa deste ativo e qual percentual pertence a cada participante.
        </p>

        {track ? (
          <div className="mt-5 rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-400">Ativo</div>
            <div className="mt-1 font-semibold text-white">
              {track.title || "Sem título"}
            </div>
            {track.artist ? (
              <div className="mt-1 text-sm text-slate-300">{track.artist}</div>
            ) : null}
          </div>
        ) : null}

        {recording ? (
          <>
            <div className="mt-6">
              <div className="text-sm font-semibold text-white">
                Participantes e percentuais
              </div>

              <div className="mt-3 grid gap-3">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-md bg-black/20 p-3 sm:grid-cols-[1fr_1fr_130px_auto]"
                  >
                    <select
                      value={item.party_id}
                      onChange={(e) => {
                        const value = e.target.value;
                        setItems((current) =>
                          current.map((x, i) =>
                            i === index ? { ...x, party_id: value } : x
                          )
                        );
                      }}
                      className="syn-select w-full px-3"
                    >
                      <option value="">Participante…</option>
                      {parties.map((party) => (
                        <option key={party.id} value={party.id}>
                          {party.display_name}
                          {party.email ? ` — ${party.email}` : ""}
                        </option>
                      ))}
                    </select>

                    <input
                      value={item.role}
                      onChange={(e) => {
                        const value = e.target.value;
                        setItems((current) =>
                          current.map((x, i) =>
                            i === index ? { ...x, role: value } : x
                          )
                        );
                      }}
                      placeholder="Função"
                      className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
                    />

                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={(item.share_bps / 100).toString()}
                        onChange={(e) => {
                          const bps = Math.round(
                            Number(e.target.value || 0) * 100
                          );
                          setItems((current) =>
                            current.map((x, i) =>
                              i === index ? { ...x, share_bps: bps } : x
                            )
                          );
                        }}
                        className="w-full rounded-md bg-white/10 px-3 py-2 pr-8 text-sm text-slate-100 ring-1 ring-white/10"
                      />
                      <span className="pointer-events-none absolute right-3 top-2 text-sm text-slate-400">
                        %
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setItems((current) =>
                          current.filter((_, i) => i !== index)
                        )
                      }
                      className="syn-btn-ghost"
                    >
                      Remover
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    setItems((current) => [
                      ...current,
                      {
                        party_id: "",
                        role: "participant",
                        share_bps: 0,
                      },
                    ])
                  }
                  className="syn-btn-ghost"
                >
                  + Adicionar participante existente
                </button>
              </div>

              <div className="mt-3 text-sm text-slate-200">
                Total:{" "}
                <strong className={totalBps === 10000 ? "text-emerald-200" : "text-white"}>
                  {(totalBps / 100).toFixed(2)}%
                </strong>
              </div>
            </div>

            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="text-sm font-semibold text-white">
                Novo participante
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <select
                  value={newPartyKind}
                  onChange={(e) =>
                    setNewPartyKind(e.target.value as "person" | "company")
                  }
                  className="syn-select w-full px-3"
                >
                  <option value="person">Pessoa</option>
                  <option value="company">Empresa</option>
                </select>

                <input
                  value={newPartyName}
                  onChange={(e) => setNewPartyName(e.target.value)}
                  placeholder={
                    newPartyKind === "company"
                      ? "Nome da empresa"
                      : "Nome do participante"
                  }
                  className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
                />

                <input
                  type="email"
                  value={newPartyEmail}
                  onChange={(e) => setNewPartyEmail(e.target.value)}
                  placeholder="E-mail"
                  className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 sm:col-span-2"
                />
              </div>

              <button
                type="button"
                onClick={() => void createParty()}
                disabled={
                  creatingParty ||
                  !newPartyName.trim() ||
                  !newPartyEmail.trim()
                }
                className="syn-btn-ghost mt-3"
              >
                {creatingParty ? "Adicionando…" : "Adicionar participante"}
              </button>
            </div>

            <div className="mt-7 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveAndContinue()}
                disabled={busy || !items.length || totalBps !== 10000}
                className="syn-btn-primary"
              >
                {busy ? "Salvando…" : "Salvar direitos e continuar"}
              </button>

              <Link href="/onboarding/asset" className="syn-btn-ghost">
                Voltar
              </Link>
            </div>
          </>
        ) : null}

        {err ? (
          <div className="mt-4 text-xs text-red-200">Erro: {err}</div>
        ) : null}
      </div>
    </main>
  );
}
