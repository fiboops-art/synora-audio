export type GuardianDecision = {
  status: "APPROVED" | "APPROVED_WITH_ADJUSTMENTS" | "APPROVED_WITH_REDACTIONS" | "BLOCKED";
  risk_score?: number;
  issues?: Array<{ code?: string; message?: string; severity?: string; field?: string }>;
  required_actions?: string[];
  redactions?: any[];
  allowed_scope?: any;
  audit_log?: any;
  correlation_id?: string;
};

export async function validateWithGuardian(input: {
  stage: "A" | "B" | "C" | "D";
  content?: string;
  metadata: Record<string, any>;
  proposal?: any;
  debtor?: any;
  request?: any;
}): Promise<GuardianDecision> {
  // MVP: keep guardian optional. Fail-closed behavior should be enforced server-side in production.
  const rawUrl = process.env.NEXT_PUBLIC_GUARDIAN_URL;
  if (!rawUrl) {
    return {
      status: "APPROVED_WITH_ADJUSTMENTS",
      risk_score: 30,
      issues: [{ code: "GUARDIAN_NOT_CONFIGURED", message: "Guardian não configurado no ambiente" }],
      required_actions: ["Configurar NEXT_PUBLIC_GUARDIAN_URL"],
    };
  }

  // Accept either a full validate endpoint URL or a base URL.
  // If user provided a base (e.g. https://synora-guardian.vercel.app), append the expected path.
  let url = rawUrl.trim();
  if (!/\/middleware\/guardian\/validate$/.test(url) && !/\/guardian\/validate$/.test(url)) {
    url = url.replace(/\/+$/, "") + "/middleware/guardian/validate";
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = (await res.json()) as GuardianDecision;
    return data;
  } catch (e: any) {
    return {
      status: "BLOCKED",
      risk_score: 100,
      issues: [{ code: "GUARDIAN_UNAVAILABLE", message: "Guardian indisponível/timeout" }],
      required_actions: ["Tentar novamente", "Acionar revisão humana"],
    };
  } finally {
    clearTimeout(t);
  }
}

