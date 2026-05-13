import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Keep a single browser client instance so autoRefreshToken can actually run.
// (Creating a new client on each call often leads to expired access tokens.)
function getSingleton(): SupabaseClient | null {
  const g = globalThis as any;
  return (g.__synora_supabase_client as SupabaseClient | undefined) ?? null;
}

function setSingleton(client: SupabaseClient) {
  const g = globalThis as any;
  g.__synora_supabase_client = client;
}

export function getSupabase(): SupabaseClient {
  const existing = getSingleton();
  if (existing) return existing;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Supabase env missing: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  const client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  setSingleton(client);
  return client;
}
