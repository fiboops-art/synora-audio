import { getSupabase } from "@/lib/supabaseClient";

export async function getAccessToken(): Promise<string | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

