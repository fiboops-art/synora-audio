import Link from "next/link";

export default function Dashboard() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-50">Dashboard (Fase 1)</div>
          <div className="text-sm text-slate-200">
            Status operacional: uploads, Guardian e distribuição.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm text-slate-200 hover:text-white">
            Home
          </Link>
          <span className="text-slate-300">•</span>
          <Link href="/studio" className="text-sm text-slate-200 hover:text-white">
            Studio
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs text-slate-700">Uploads hoje</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">1</div>
          <div className="mt-2 text-xs text-slate-600">MVP: contadores estáticos.</div>
        </div>
        <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs text-slate-700">Guardian</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">Online</div>
          <div className="mt-2 text-xs text-slate-600">
            Configure <code className="rounded bg-white/70 px-1 py-0.5 ring-1 ring-slate-900/10">NEXT_PUBLIC_GUARDIAN_URL</code>
          </div>
        </div>
        <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-slate-900/10 backdrop-blur">
          <div className="text-xs text-slate-700">Distribuição</div>
          <div className="mt-1 text-2xl font-semibold text-slate-950">Stub</div>
          <div className="mt-2 text-xs text-slate-600">Integração DSP fica para fase 2.</div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white/60 p-6 ring-1 ring-slate-900/10 backdrop-blur">
        <div className="text-sm font-semibold text-slate-950">Próximos passos (dev)</div>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-800">
          <li>Persistência: salvar faixas em banco (Postgres) + storage (R2/S3).</li>
          <li>Guardian Stage específico para música (copyright/similaridade + provenance).</li>
          <li>Fila async de distribuição (Skipper) + status por DSP.</li>
        </ul>
      </div>
    </main>
  );
}
