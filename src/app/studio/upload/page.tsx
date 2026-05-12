"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { validateWithGuardian } from "@/lib/guardianClient";
import { getAccessToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [mode, setMode] = useState<"upload" | "ai">("upload");
  const [guardianOut, setGuardianOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [savedTrackId, setSavedTrackId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace("/login");
    })();
  }, [router]);

  const canSubmit = useMemo(() => {
    if (mode === "upload") return !!file && !!title.trim() && !!artist.trim();
    return !!title.trim() && !!artist.trim();
  }, [mode, file, title, artist]);

  async function onValidate() {
    setBusy(true);
    setGuardianOut(null);
    setSavedTrackId(null);
    try {
      if (mode === "upload" && file) {
        // Large files: avoid Vercel request limits by uploading directly to Supabase via signed URL
        const token = await getAccessToken();
        if (!token) {
          setGuardianOut({ error: "Você precisa estar logado para fazer upload" });
          return;
        }
        const startRes = await fetch("/api/tracks/start-upload", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title,
            artist,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
          }),
        });
        const start = await startRes.json();
        if (!startRes.ok) {
          setGuardianOut(start);
          return;
        }

        setSavedTrackId(start.trackId ?? null);

        const up = await fetch(start.signedUrl, {
          method: "PUT",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!up.ok) {
          const t = await up.text().catch(() => "");
          setGuardianOut({
            error: "Upload direto ao Storage falhou",
            status: up.status,
            text: t.slice(0, 500),
          });
          return;
        }

        const finRes = await fetch("/api/tracks/finalize", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            trackId: start.trackId,
            path: start.path,
            file_type: file.type,
            file_size: file.size,
            title,
            artist,
          }),
        });
        const fin = await finRes.json();
        if (!finRes.ok) {
          setGuardianOut(fin);
          return;
        }
        setGuardianOut(fin.guardian ?? fin);
        return;
      }

      // Fallback (no file): only Guardian precheck
      const out = await validateWithGuardian({
        stage: "D",
        content: `Faixa: ${title} — Artista: ${artist}`,
        metadata: {
          tenant_id: "synora-audio-demo",
          purpose: "music_upload_compliance_precheck",
          source: "synora-audio",
          locale: "pt-BR",
          correlation_id: `AUD-${Date.now()}`,
          content_type: "application/json",
        },
        request: {
          operation: "upload_precheck",
          scope: { fields: ["track.title", "track.artist"] },
          subject: { trackId: "T-LOCAL" },
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
                * Upload real: usa URL assinada (não passa pelo limite da Vercel). Requer bucket <span className="font-semibold">tracks</span> no Supabase Storage + <span className="font-semibold">SUPABASE_SERVICE_ROLE_KEY</span> na Vercel.
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

          <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-slate-950/70 p-3 text-xs text-slate-50 ring-1 ring-white/10 backdrop-blur">
            {guardianOut ? JSON.stringify(guardianOut, null, 2) : "(ainda não validado)"}
          </pre>
        </div>
      </div>
    </main>
  );
}
