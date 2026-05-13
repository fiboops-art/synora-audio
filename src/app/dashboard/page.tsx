"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function Dashboard() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) router.replace("/login");
    })();
  }, [router]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Dashboard (Fase 1)</div>
          <div className="text-sm text-slate-200/90">
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
        <div className="syn-card p-6">
          <div className="text-xs text-slate-300">Uploads hoje</div>
          <div className="mt-1 text-2xl font-semibold text-white">1</div>
          <div className="mt-2 text-xs text-slate-300/80">MVP: contadores estáticos.</div>
        </div>
        <div className="syn-card p-6">
          <div className="text-xs text-slate-300">Guardian</div>
          <div className="mt-1 text-2xl font-semibold text-white">Online</div>
          <div className="mt-2 text-xs text-slate-300/80">
            Configure <code className="rounded bg-white/10 px-1 py-0.5 ring-1 ring-white/10">NEXT_PUBLIC_GUARDIAN_URL</code>
          </div>
        </div>
        <div className="syn-card p-6">
          <div className="text-xs text-slate-300">Distribuição</div>
          <div className="mt-1 text-2xl font-semibold text-white">Stub</div>
          <div className="mt-2 text-xs text-slate-300/80">Integração DSP fica para fase 2.</div>
        </div>
      </div>

      <div className="mt-6 syn-card-soft p-6">
        <div className="text-sm font-semibold text-white">Próximos passos (dev)</div>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-200/90">
          <li>Persistência: salvar faixas em banco (Postgres) + storage (R2/S3).</li>
          <li>Guardian Stage específico para música (copyright/similaridade + provenance).</li>
          <li>Fila async de distribuição (Skipper) + status por DSP.</li>
        </ul>
      </div>
    </main>
  );
}
