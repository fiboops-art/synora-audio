import { getSupabase } from "@/lib/supabaseClient";

export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = getSupabase();

    // Ensure token is fresh enough for server-side validation.
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    if (!s) return null;

    const expiresAt = (s.expires_at ?? 0) * 1000;
    const skewMs = 60_000; // refresh when < 60s from expiring
    if (expiresAt && Date.now() > expiresAt - skewMs) {
      const refreshed = await supabase.auth.refreshSession();
      return refreshed.data.session?.access_token ?? null;
    }

    return s.access_token ?? null;
  } catch {
    return null;
  }
}

