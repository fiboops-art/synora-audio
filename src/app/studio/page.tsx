"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function StudioHome() {
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
      <div className="syn-card p-7">
        <div className="text-sm font-semibold text-white">Studio</div>
        <div className="mt-1 text-sm text-slate-200">
          Upload, metadata e status (Fase 1).
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/studio/upload"
            className="syn-btn-solid"
          >
            Enviar faixa
          </Link>
          <Link
            href="/studio/library"
            className="syn-btn-ghost"
          >
            Biblioteca
          </Link>
          <Link
            href="/dashboard"
            className="syn-btn-ghost"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
