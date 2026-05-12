"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { validateWithGuardian } from "@/lib/guardianClient";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [mode, setMode] = useState<"upload" | "ai">("upload");
  const [guardianOut, setGuardianOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [savedTrackId, setSavedTrackId] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (mode === "upload") return !!file && !!title.trim() && !!artist.trim();
    return !!title.trim() && !!artist.trim();
  }, [mode, file, title, artist]);

  async function onValidate() {
    setBusy(true);
    setGuardianOut(null);
    setSavedTrackId(null);
    try {
      // 1) Persist minimal track row (MVP)
      const createRes = await fetch("/api/tracks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          artist,
          meta: {
            mode,
            file_name: file?.name,
            file_type: file?.type,
            file_size: file?.size,
          },
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        setGuardianOut(created);
        return;
      }
      setSavedTrackId(created.track?.id ?? null);

      const correlation_id = `AUD-${Date.now()}`;
      const out = await validateWithGuardian({
        stage: "D",
        content: `Faixa: ${title} — Artista: ${artist}`,
        metadata: {
          tenant_id: "synora-audio-demo",
          purpose: "music_upload_compliance_precheck",
          source: "synora-audio",
          locale: "pt-BR",
          correlation_id,
          content_type: "application/json",
        },
        request: {
          operation: "upload_precheck",
          scope: { fields: ["track.title", "track.artist", "track.file_hash"] },
          subject: { trackId: created.track?.id ?? "T-LOCAL" },
          retention: "30d",
          masking: true,
        },
      });
      setGuardianOut(out);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-50">Enviar faixa (MVP)</div>
          <div className="text-sm text-slate-200">Upload + metadata + Guardian (stub).</div>
        </div>
        <Link href="/studio" className="text-sm text-slate-200 hover:text-white">
          Voltar
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs font-semibold text-slate-950">Origem</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => setMode("upload")}
              className={`rounded-xl px-3 py-2 text-xs ring-1 transition ${
                mode === "upload"
                  ? "bg-white/85 text-slate-950 ring-slate-900/10"
                  : "bg-white/60 text-slate-800 ring-slate-900/10 hover:bg-white/75"
              }`}
            >
              Upload (MP3/WAV)
            </button>
            <button
              onClick={() => setMode("ai")}
              className={`rounded-xl px-3 py-2 text-xs ring-1 transition ${
                mode === "ai"
                  ? "bg-white/85 text-slate-950 ring-slate-900/10"
                  : "bg-white/60 text-slate-800 ring-slate-900/10 hover:bg-white/75"
              }`}
            >
              Gerar com IA (stub)
            </button>
          </div>

          {mode === "upload" && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700">Arquivo</label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full rounded-xl bg-white/70 p-2 text-sm text-slate-950 file:text-slate-950 ring-1 ring-slate-900/10"
              />
              <div className="mt-1 text-xs text-slate-600">
                * Neste MVP não fazemos upload real ainda.
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">Título</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Midnight Circuit"
                className="mt-1 block w-full rounded-xl bg-white/70 p-2 text-sm text-slate-950 placeholder:text-slate-500 ring-1 ring-slate-900/10"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Artista</label>
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ex.: Claudio / Synora Lab"
                className="mt-1 block w-full rounded-xl bg-white/70 p-2 text-sm text-slate-950 placeholder:text-slate-500 ring-1 ring-slate-900/10"
              />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              disabled={!canSubmit || busy}
              onClick={onValidate}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-slate-900/20 disabled:opacity-50"
            >
              {busy ? "Validando…" : "Validar com Guardian"}
            </button>
            <Link
              href="/studio/library"
              className="rounded-xl bg-white/70 px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-900/10 backdrop-blur hover:bg-white/85"
            >
              Ir para biblioteca
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-white/60 p-6 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs font-semibold text-slate-950">Saída do Guardian</div>
          <div className="mt-2 text-xs text-slate-700">
            Status esperado: APPROVED / APPROVED_WITH_ADJUSTMENTS / BLOCKED.
          </div>

          {savedTrackId && (
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-xs ring-1 ring-slate-900/10">
              Track salva: <span className="font-semibold text-slate-950">{savedTrackId}</span>
            </div>
          )}

          <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-white/70 p-3 text-xs ring-1 ring-slate-900/10">
            {guardianOut ? JSON.stringify(guardianOut, null, 2) : "(ainda não validado)"}
          </pre>
        </div>
      </div>
    </main>
  );
}
