import { getSupabase } from "@/lib/supabaseClient";

export type OnboardingV1 = {
  version: 1;
  current_step: number; // next required step (1..5)
  completed_at: string | null;
  track_id: string | null;
};

export type OnboardingState = {
  onboarding: OnboardingV1;
  user_metadata: Record<string, unknown>;
};

const DEFAULT_ONBOARDING_V1: OnboardingV1 = {
  version: 1,
  current_step: 1,
  completed_at: null,
  track_id: null,
};

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceOnboardingV1(v: unknown): OnboardingV1 | null {
  if (!isObject(v)) return null;
  const version = v.version;
  const current_step = v.current_step;
  const completed_at = v.completed_at;
  const track_id = typeof v.track_id === "string" && v.track_id.trim() ? v.track_id : null;
  if (version !== 1) return null;
  const stepNum = typeof current_step === "number" ? current_step : Number(current_step);
  if (!Number.isFinite(stepNum) || stepNum < 1) return null;
  if (!(completed_at === null || typeof completed_at === "string")) return null;
  return {
    version: 1,
    current_step: Math.floor(stepNum),
    completed_at,
    track_id,
  };
}

export async function getOnboardingState(): Promise<OnboardingState | null> {
  const supabase = getSupabase();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user_metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const onboarding = coerceOnboardingV1(user_metadata.onboarding) ?? DEFAULT_ONBOARDING_V1;

  return { onboarding, user_metadata };
}

export async function ensureOnboardingInitialized(): Promise<OnboardingState | null> {
  const state = await getOnboardingState();
  if (!state) return null;
  const existing = coerceOnboardingV1(state.user_metadata.onboarding);
  if (existing) return state;

  const supabase = getSupabase();
  const merged = { ...state.user_metadata, onboarding: DEFAULT_ONBOARDING_V1 };
  const { data, error } = await supabase.auth.updateUser({ data: merged });
  if (error || !data.user) return null;

  const user_metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const onboarding = coerceOnboardingV1(user_metadata.onboarding) ?? DEFAULT_ONBOARDING_V1;
  return { onboarding, user_metadata };
}

export async function setOnboarding(patch: Partial<OnboardingV1>): Promise<OnboardingState | null> {
  const state = await ensureOnboardingInitialized();
  if (!state) return null;

  const next: OnboardingV1 = {
    ...state.onboarding,
    ...patch,
    version: 1,
  };

  const supabase = getSupabase();
  const merged = { ...state.user_metadata, onboarding: next };
  const { data, error } = await supabase.auth.updateUser({ data: merged });
  if (error || !data.user) return null;

  const user_metadata = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const onboarding = coerceOnboardingV1(user_metadata.onboarding) ?? next;
  return { onboarding, user_metadata };
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const state = await ensureOnboardingInitialized();
  return !!state?.onboarding.completed_at;
}

export async function canAccessStep(routeStep: number): Promise<{
  ok: boolean;
  state: OnboardingState | null;
}> {
  const state = await ensureOnboardingInitialized();
  if (!state) return { ok: false, state: null };
  if (state.onboarding.completed_at) return { ok: true, state };
  return { ok: state.onboarding.current_step === routeStep, state };
}

