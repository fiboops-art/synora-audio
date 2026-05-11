import Link from "next/link";

export default function StudioHome() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-slate-900/10 backdrop-blur">
        <div className="text-sm font-semibold text-slate-950">Studio</div>
        <div className="mt-1 text-sm text-slate-800">
          Upload, metadata e status (Fase 1).
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/studio/upload"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-slate-900/20 hover:bg-slate-950"
          >
            Enviar faixa
          </Link>
          <Link
            href="/studio/library"
            className="rounded-xl bg-white/70 px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-900/10 backdrop-blur hover:bg-white/85"
          >
            Biblioteca
          </Link>
          <Link
            href="/dashboard"
            className="rounded-xl bg-white/70 px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-900/10 backdrop-blur hover:bg-white/85"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
