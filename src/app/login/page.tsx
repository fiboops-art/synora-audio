"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/studio");
    })();
  }, [router]);

  async function sendLink() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = getSupabase();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/studio`,
        },
      });
      if (error) throw error;
      setSent(true);
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string"
          ? (e as { message: string }).message
          : "Falha ao enviar link";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-12">
      <div className="rounded-2xl bg-white/10 p-6 text-slate-50 ring-1 ring-white/15 backdrop-blur">
        <div className="text-sm font-semibold">Entrar</div>
        <div className="mt-1 text-sm text-slate-200">
          Receba um link mágico por email para acessar o Synora Audio.
        </div>

        <div className="mt-5">
          <label className="text-xs font-semibold text-slate-200">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            className="mt-1 block w-full rounded-xl bg-white/80 p-2 text-sm text-slate-950 placeholder:text-slate-500 ring-1 ring-white/20"
            inputMode="email"
            autoComplete="email"
          />
        </div>

        {err && <div className="mt-3 text-xs text-red-200">Erro: {err}</div>}

        <button
          onClick={sendLink}
          disabled={busy || !email.trim()}
          className="mt-5 w-full rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20 disabled:opacity-50"
        >
          {busy ? "Enviando…" : sent ? "Link enviado ✅" : "Enviar Magic Link"}
        </button>

        <div className="mt-3 text-xs text-slate-300">
          Dica: confira spam/promotions. O link expira.
        </div>
      </div>
    </main>
  );
}
