import Link from "next/link";
import Image from "next/image";

function Header() {
  return (
    <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
      <div className="flex items-center gap-3">
        <Image
          src="/synora-logo-256.png"
          alt="Synora"
          width={44}
          height={44}
          className="h-11 w-11 drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)]"
          priority
        />
        <div>
          <div className="text-sm font-semibold leading-tight text-slate-50">
            Synora Audio
          </div>
          <div className="text-sm text-slate-200">
            Infraestrutura para creators de música IA
          </div>
        </div>
      </div>

      <nav className="flex items-center gap-2">
        <Link
          href="/studio"
          className="rounded-xl bg-white/10 px-3 py-2 text-xs text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15"
        >
          Studio
        </Link>
        <Link
          href="/dashboard"
          className="rounded-xl bg-white/15 px-3 py-2 text-xs font-semibold text-white shadow-sm ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
        >
          Dashboard
        </Link>
      </nav>
    </header>
  );
}

export default function Home() {
  return (
    <main>
      <Header />

      <section className="relative mx-auto w-full max-w-6xl px-4 pb-10 pt-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl bg-white/70 p-6 ring-1 ring-slate-900/10 backdrop-blur">
            <h1 className="text-2xl font-semibold tracking-tight">
              Distribuição, monetização e compliance — para música IA.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">
              A Synora Audio não é um streaming. É a camada de infraestrutura entre o
              creator e as plataformas: valida (Guardian), organiza metadata,
              prepara distribuição e consolida status e indicadores.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/studio/upload"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-slate-900/20 hover:bg-slate-950"
              >
                Enviar faixa (MVP)
              </Link>
              <Link
                href="/studio/library"
                className="rounded-xl bg-white/70 px-4 py-2 text-sm text-slate-900 ring-1 ring-slate-900/10 backdrop-blur hover:bg-white/85"
              >
                Ver biblioteca
              </Link>
            </div>

            <div className="mt-4 text-xs text-slate-700">
              MVP Fase 1: upload + player + perfil + metadata assistida + Guardian +
              distribuição (stub) + dashboard.
            </div>
          </div>

          <div className="rounded-2xl bg-white/60 p-6 ring-1 ring-slate-900/10 backdrop-blur">
            <div className="text-sm font-semibold">Fluxo (Fase 1)</div>
            <ol className="mt-3 grid gap-2 text-sm text-slate-800">
              <li>
                <span className="font-semibold text-slate-950">1)</span> Upload (WAV/MP3)
              </li>
              <li>
                <span className="font-semibold text-slate-950">2)</span> Metadata assistida (IA)
              </li>
              <li>
                <span className="font-semibold text-slate-950">3)</span> Guardian: aprovação/bloqueio + auditoria
              </li>
              <li>
                <span className="font-semibold text-slate-950">4)</span> Distribuição (stub)
              </li>
              <li>
                <span className="font-semibold text-slate-950">5)</span> Dashboard de status
              </li>
            </ol>

            <div className="mt-5 rounded-xl bg-white/70 p-4 ring-1 ring-slate-900/10">
              <div className="text-xs font-semibold text-slate-950">
                Guardian (Compliance)
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-700">
                Gera decisão determinística com trilha auditável e falha fechada.
                No MVP, usamos validações essenciais e reason codes.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
