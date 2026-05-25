"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabaseClient";

export default function Dashboard() {
  const router = useRouter();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [statements, setStatements] = useState<
    Array<{
      id: string;
      source: string;
      report_month: string;
      imported_at: string;
      parsing_status: string;
      line_count: number;
      created_at: string;
    }>
  >([]);
  const [showEmptyStatements, setShowEmptyStatements] = useState(false);
  const [loadingStatements, setLoadingStatements] = useState(false);

  const [csvText, setCsvText] = useState<string>("source,report_month,imported_at,dsp,territory,original_currency,net_amount_original,ISRC,track_title,artist_name\n");
  const [numberFormat, setNumberFormat] = useState<"auto" | "en_US" | "pt_BR">("auto");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [recordings, setRecordings] = useState<
    Array<{ id: string; isrc: string | null; track_title: string | null; artist_name: string | null; created_at: string }>
  >([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [recIsrc, setRecIsrc] = useState("BR-ABC-26-00001");
  const [recTitle, setRecTitle] = useState("Minha Faixa");
  const [recArtist, setRecArtist] = useState("Claudio");
  const [creatingRec, setCreatingRec] = useState(false);
  const [recError, setRecError] = useState<string | null>(null);

  const [overview, setOverview] = useState<
    | {
        total_in_usd: number;
        allocated_usd: number;
        unallocated_usd: number;
        escrow_open_usd: number;
        quarantine_count: number;
      }
    | null
  >(null);

  const [partyBalances, setPartyBalances] = useState<
    Array<{ party_id: string; display_name: string; email: string | null; balance_usd: number }>
  >([]);
  const [partyBalancesTotal, setPartyBalancesTotal] = useState<number | null>(null);
  const [loadingPartyBalances, setLoadingPartyBalances] = useState(false);
  const [partyBalancesErr, setPartyBalancesErr] = useState<string | null>(null);

  // Payouts (MVP)
  const [payoutAmountByParty, setPayoutAmountByParty] = useState<Record<string, string>>({});
  const [payoutMemoByParty, setPayoutMemoByParty] = useState<Record<string, string>>({});
  const [payoutBusyPartyId, setPayoutBusyPartyId] = useState<string | null>(null);
  const [payoutResult, setPayoutResult] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<
    Array<{
      id: string;
      party_id: string;
      amount_usd: number;
      status: string;
      created_at: string;
      updated_at?: string;
      sent_at?: string | null;
      sent_ref?: string | null;
      payout_method?: string | null;
      sent_by?: string | null;
      correlation_id: string | null;
      meta?: unknown;
      party: null | { id: string; display_name: string | null; email: string | null };
    }>
  >([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  const [payoutsErr, setPayoutsErr] = useState<string | null>(null);

  const [payoutSentRefById, setPayoutSentRefById] = useState<Record<string, string>>({});
  const [payoutMethodById, setPayoutMethodById] = useState<Record<string, string>>({});
  const [payoutUpdatingId, setPayoutUpdatingId] = useState<string | null>(null);
  const [payoutRowErrById, setPayoutRowErrById] = useState<Record<string, { message: string; duplicate_payout_id?: string | null }>>({});

  const [payoutsStatusFilter, setPayoutsStatusFilter] = useState<string>("all");
  const [payoutsMethodFilter, setPayoutsMethodFilter] = useState<string>("all");
  const [payoutsSearch, setPayoutsSearch] = useState<string>("");

  const payoutMethods = useMemo(
    () => ["PIX", "TRANSFERENCIA", "WISE", "STRIPE", "PAYPAL", "CRYPTO", "OUTRO"] as const,
    []
  );
  const payoutMethodLabel: Record<string, string> = {
    PIX: "PIX",
    TRANSFERENCIA: "Transferência Bancária",
    WISE: "Wise",
    STRIPE: "Stripe",
    PAYPAL: "PayPal",
    CRYPTO: "Cripto",
    OUTRO: "Outro",
  };
  const payoutMethodPrefix: Record<string, string> = {
    PIX: "PIX: ",
    TRANSFERENCIA: "TRANSFERENCIA: ",
    WISE: "WISE: ",
    STRIPE: "STRIPE: ",
    PAYPAL: "PAYPAL: ",
    CRYPTO: "CRYPTO: ",
    OUTRO: "OUTRO: ",
  };

  function payoutRefPlaceholder(method: string) {
    switch (method) {
      case "PIX":
        return "Cole E2E ID / TXID do PIX";
      case "TRANSFERENCIA":
        return "Cole NSU/autenticação bancária";
      case "WISE":
        return "Cole transfer_id";
      case "STRIPE":
        return "Cole payout_id/transfer_id";
      case "PAYPAL":
        return "Cole payout_id/payout_batch_id";
      case "CRYPTO":
        return "Cole tx_hash";
      case "OUTRO":
        return "Cole referência operacional";
      default:
        return "ref/comprovante";
    }
  }

  const payoutRefTooltip =
    "Identificador utilizado para comprovar e reconciliar o envio do payout (PIX E2E, transfer_id, tx_hash, payout_batch_id etc).";

  // Payout audit trail modal
  const [eventsPayoutId, setEventsPayoutId] = useState<string | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsErr, setEventsErr] = useState<string | null>(null);
  const [events, setEvents] = useState<
    Array<{ id: string; action: string; from_status: string | null; to_status: string | null; actor_id: string; created_at: string; payload: unknown }>
  >([]);

  // Settlement details panel (drawer)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsPayoutId, setDetailsPayoutId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsErr, setDetailsErr] = useState<string | null>(null);
  const [detailsPayout, setDetailsPayout] = useState<null | {
    id: string;
    party_id: string;
    amount_usd: number;
    status: string;
    created_at: string;
    updated_at?: string;
    sent_at?: string | null;
    sent_ref?: string | null;
    payout_method?: string | null;
    sent_by?: string | null;
    correlation_id: string | null;
    meta?: unknown;
    guardian_raw?: unknown;
    party: null | { id: string; display_name: string | null; email: string | null };
  }>(null);

  const [detailsEventsLoading, setDetailsEventsLoading] = useState(false);
  const [detailsEventsErr, setDetailsEventsErr] = useState<string | null>(null);
  const [detailsEvents, setDetailsEvents] = useState<typeof events>([]);

  const openPayoutDetails = useCallback(
    async (payout_id: string) => {
      if (!sessionToken) return;
      setDetailsOpen(true);
      setDetailsPayoutId(payout_id);
      setDetailsErr(null);
      setDetailsLoading(true);
      setDetailsPayout(null);
      setDetailsEventsErr(null);
      setDetailsEventsLoading(true);
      setDetailsEvents([]);
      try {
        const [pRes, eRes] = await Promise.all([
          fetch(`/api/payouts/${encodeURIComponent(payout_id)}`, {
            headers: { authorization: `Bearer ${sessionToken}` },
            cache: "no-store",
          }),
          fetch(`/api/payouts/events?payout_id=${encodeURIComponent(payout_id)}&limit=50`, {
            headers: { authorization: `Bearer ${sessionToken}` },
            cache: "no-store",
          }),
        ]);

        const pj = (await pRes.json()) as { payout?: unknown; error?: string };
        if (!pRes.ok) throw new Error(pj.error || `HTTP ${pRes.status}`);
        setDetailsPayout(pj.payout as typeof detailsPayout);

        const ej = (await eRes.json()) as { events?: unknown[]; error?: string };
        if (!eRes.ok) throw new Error(ej.error || `HTTP ${eRes.status}`);
        setDetailsEvents((ej.events ?? []) as typeof events);
      } catch (e: unknown) {
        setDetailsErr(e instanceof Error ? e.message : "Erro ao carregar detalhes");
      } finally {
        setDetailsLoading(false);
        setDetailsEventsLoading(false);
      }
    },
    [sessionToken]
  );

  const openPayoutEvents = useCallback(
    async (payout_id: string) => {
      if (!sessionToken) return;
      setEventsPayoutId(payout_id);
      setEventsOpen(true);
      setLoadingEvents(true);
      setEventsErr(null);
      setEvents([]);
      try {
        const res = await fetch(`/api/payouts/events?payout_id=${encodeURIComponent(payout_id)}&limit=50`, {
          headers: { authorization: `Bearer ${sessionToken}` },
          cache: "no-store",
        });
        const j = (await res.json()) as { events?: unknown[]; error?: string };
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
        setEvents((j.events ?? []) as typeof events);
      } catch (e: unknown) {
        setEventsErr(e instanceof Error ? e.message : "Erro ao carregar eventos");
      } finally {
        setLoadingEvents(false);
      }
    },
    [sessionToken]
  );

  function splitKnownPrefix(value: string): { prefixKey: string | null; rest: string } {
    const v = (value ?? "").trim();
    const m = v.match(/^([A-Z_]+):\s*(.*)$/);
    if (!m) return { prefixKey: null, rest: v };
    const key = m[1] ?? "";
    const rest = (m[2] ?? "").trim();
    if (!payoutMethods.includes(key as (typeof payoutMethods)[number])) return { prefixKey: null, rest: v };
    return { prefixKey: key, rest };
  }

  function jwtSub(token: string | null): string | null {
    try {
      if (!token) return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = JSON.parse(atob(payload));
      return typeof json?.sub === "string" ? json.sub : null;
    } catch {
      return null;
    }
  }

  const sessionUserId = useMemo(() => jwtSub(sessionToken), [sessionToken]);

  function actorLabel(actor_id: string) {
    if (sessionUserId && actor_id === sessionUserId) return "you";
    return String(actor_id).slice(0, 8);
  }

  const [applyingSplits, setApplyingSplits] = useState(false);
  const [applySplitsMsg, setApplySplitsMsg] = useState<string | null>(null);
  const [applySplitsErr, setApplySplitsErr] = useState<string | null>(null);

  const [escrow, setEscrow] = useState<
    Array<{
      id: string;
      amount_usd: number;
      resolution_status: string;
      created_at: string;
      line: {
        id: string;
        isrc: string | null;
        track_title: string | null;
        artist_name: string | null;
        dsp: string | null;
        territory: string | null;
        status: string;
        recording_id: string | null;
      } | null;
    }>
  >([]);
  const [loadingEscrow, setLoadingEscrow] = useState(false);
  const [escrowError, setEscrowError] = useState<string | null>(null);
  const [resolvingEscrowId, setResolvingEscrowId] = useState<string | null>(null);
  const [resolveRecordingId, setResolveRecordingId] = useState<string>("");

  const [parties, setParties] = useState<Array<{ id: string; display_name: string; kind: string; email?: string | null }>>([]);
  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyEmail, setNewPartyEmail] = useState("");
  const [newPartyKind, setNewPartyKind] = useState<"person" | "company">("person");
  const [partyError, setPartyError] = useState<string | null>(null);
  const [creatingParty, setCreatingParty] = useState(false);

  const [splitRecordingId, setSplitRecordingId] = useState<string>("");
  const [splitItems, setSplitItems] = useState<Array<{ party_id: string; role: string; share_bps: number }>>([]);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [savingSplit, setSavingSplit] = useState(false);
  const [splitSuccess, setSplitSuccess] = useState<string | null>(null);
  const [loadingSplit, setLoadingSplit] = useState(false);
  const [loadedSplitInfo, setLoadedSplitInfo] = useState<string | null>(null);
  const [loadedSplitId, setLoadedSplitId] = useState<string | null>(null);
  const [loadedSplitStatus, setLoadedSplitStatus] = useState<string | null>(null);
  const [proposeLinks, setProposeLinks] = useState<Array<{ email: string; url: string }> | null>(null);

  const [acceptances, setAcceptances] = useState<
    Array<{
      id: string;
      party_id: string;
      email: string;
      status: string;
      created_at: string;
      expires_at: string;
      accepted_at: string | null;
      party: null | { display_name: string | null; email: string | null };
    }>
  >([]);
  const [loadingAcceptances, setLoadingAcceptances] = useState(false);
  const [acceptancesErr, setAcceptancesErr] = useState<string | null>(null);

  const [activatingSplit, setActivatingSplit] = useState(false);
  const [activateErr, setActivateErr] = useState<string | null>(null);
  const [activateMsg, setActivateMsg] = useState<string | null>(null);

  const refreshAcceptances = useCallback(async (token: string, splitId: string) => {
    setLoadingAcceptances(true);
    setAcceptancesErr(null);
    try {
      const res = await fetch(`/api/splits/acceptances?split_id=${encodeURIComponent(splitId)}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as { acceptances?: typeof acceptances; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setAcceptances(j.acceptances ?? []);
    } catch (e: unknown) {
      setAcceptancesErr(e instanceof Error ? e.message : "Erro ao carregar acceptances");
    } finally {
      setLoadingAcceptances(false);
    }
  }, []);

  const canActivateSplit = useMemo(() => {
    if (!loadedSplitId) return false;
    if (loadedSplitStatus === "active") return false;
    if (acceptances.length === 0) return false;
    return acceptances.every((a) => a.status === "accepted");
  }, [loadedSplitId, loadedSplitStatus, acceptances]);

  const partiesWithEmail = useMemo(
    () => parties.filter((p) => (p.email ?? "").trim().length > 0),
    [parties]
  );

  const canImport = useMemo(() => csvText.trim().length > 0 && !!sessionToken, [csvText, sessionToken]);

  // Debug: show raw server responses (Guardian payloads, etc.)
  // Enable by adding ?debug=1 to the URL (or setting NEXT_PUBLIC_DEBUG_GUARDIAN=1).
  const debugMode = useMemo(() => {
    if (typeof window === "undefined") return false;
    const qp = new URLSearchParams(window.location.search);
    if (qp.get("debug") === "1") return true;
    return String(process.env.NEXT_PUBLIC_DEBUG_GUARDIAN ?? "") === "1";
  }, []);

  const usdFmt = useMemo(
    () =>
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const splitFlowStep = useMemo(() => {
    // 1 propose -> 2 accept -> 3 activate -> 4 apply -> 5 balances
    const hasBalances = (partyBalances?.length ?? 0) > 0 && typeof partyBalancesTotal === "number";
    if (!loadedSplitId) return 1;
    if (loadedSplitStatus === "active") return hasBalances ? 5 : 4;
    if ((loadedSplitStatus ?? "") === "proposed") {
      const allAccepted = acceptances.length > 0 && acceptances.every((a) => a.status === "accepted");
      return allAccepted ? 3 : 2;
    }
    return 1;
  }, [loadedSplitId, loadedSplitStatus, acceptances, partyBalances, partyBalancesTotal]);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setSessionToken(data.session.access_token);
    })();
  }, [router]);

  const refreshStatements = useCallback(async (token: string) => {
    setLoadingStatements(true);
    try {
      const res = await fetch(`/api/royalties/statements?limit=20`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as {
        statements?: Array<{
          id: string;
          source: string;
          report_month: string;
          imported_at: string;
          parsing_status: string;
          line_count: number;
          created_at: string;
        }>;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setStatements(j.statements ?? []);
    } catch (e: unknown) {
      // keep silent; dashboard should remain usable
      console.error(e);
    } finally {
      setLoadingStatements(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshStatements(sessionToken);
    })();
  }, [sessionToken, refreshStatements]);

  const refreshOverview = useCallback(async (token: string) => {
    try {
      const res = await fetch(`/api/royalties/overview`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as {
        totals?: {
          total_in_usd: number;
          allocated_usd: number;
          unallocated_usd: number;
          escrow_open_usd: number;
          quarantine_count: number;
        };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setOverview(j.totals ?? null);
    } catch (e: unknown) {
      console.error(e);
    }
  }, []);

  const refreshPartyBalances = useCallback(async (token: string) => {
    setLoadingPartyBalances(true);
    setPartyBalancesErr(null);
    try {
      const res = await fetch(`/api/ledger/party-balances`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as {
        balances?: Array<{ party_id: string; display_name: string; email: string | null; balance_usd: number }>;
        total_usd?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPartyBalances(j.balances ?? []);
      setPartyBalancesTotal(typeof j.total_usd === "number" ? j.total_usd : null);
    } catch (e: unknown) {
      setPartyBalancesErr(e instanceof Error ? e.message : "Erro ao carregar saldos por party");
    } finally {
      setLoadingPartyBalances(false);
    }
  }, []);

  const refreshPayouts = useCallback(async (token: string) => {
    setLoadingPayouts(true);
    setPayoutsErr(null);
    try {
      const res = await fetch(`/api/payouts?limit=50`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as { payouts?: unknown[]; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setPayouts((j.payouts ?? []) as typeof payouts);
    } catch (e: unknown) {
      setPayoutsErr(e instanceof Error ? e.message : "Erro ao carregar payouts");
    } finally {
      setLoadingPayouts(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshPayouts(sessionToken);
    })();
  }, [sessionToken, refreshPayouts]);

  const applySplitsToLedger = useCallback(async () => {
    if (!sessionToken) return;
    setApplyingSplits(true);
    setApplySplitsMsg(null);
    setApplySplitsErr(null);
    try {
      const res = await fetch(`/api/ledger/apply-splits`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ limit: 500 }),
      });
      const j = (await res.json()) as { ok?: boolean; applied?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setApplySplitsMsg(`Aplicado: ${j.applied ?? 0} | Já aplicado (skip): ${j.skipped ?? 0}`);
      await refreshOverview(sessionToken);
      await refreshPartyBalances(sessionToken);
    } catch (e: unknown) {
      setApplySplitsErr(e instanceof Error ? e.message : "Erro ao aplicar splits");
    } finally {
      setApplyingSplits(false);
    }
  }, [sessionToken, refreshOverview, refreshPartyBalances]);

  const refreshEscrow = useCallback(async (token: string) => {
    setLoadingEscrow(true);
    setEscrowError(null);
    try {
      const res = await fetch(`/api/escrow?status=open&limit=50`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as { escrow?: typeof escrow; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setEscrow(j.escrow ?? []);
    } catch (e: unknown) {
      setEscrowError(e instanceof Error ? e.message : "Erro ao carregar escrow");
    } finally {
      setLoadingEscrow(false);
    }
  }, []);

  const refreshParties = useCallback(async (token: string) => {
    setPartyError(null);
    try {
      const res = await fetch(`/api/parties?limit=200`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as {
        parties?: Array<{ id: string; display_name: string; kind: string; email?: string | null }>;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setParties(j.parties ?? []);
    } catch (e: unknown) {
      setPartyError(e instanceof Error ? e.message : "Erro ao carregar parties");
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshOverview(sessionToken);
    })();
  }, [sessionToken, refreshOverview]);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshPartyBalances(sessionToken);
    })();
  }, [sessionToken, refreshPartyBalances]);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshEscrow(sessionToken);
    })();
  }, [sessionToken, refreshEscrow]);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshParties(sessionToken);
    })();
  }, [sessionToken, refreshParties]);

  const refreshRecordings = useCallback(async (token: string) => {
    setLoadingRecordings(true);
    setRecError(null);
    try {
      const res = await fetch(`/api/catalog/recordings?limit=50`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const j = (await res.json()) as {
        recordings?: Array<{ id: string; isrc: string | null; track_title: string | null; artist_name: string | null; created_at: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setRecordings(j.recordings ?? []);
    } catch (e: unknown) {
      setRecError(e instanceof Error ? e.message : "Erro ao listar recordings");
    } finally {
      setLoadingRecordings(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) return;
    void (async () => {
      await refreshRecordings(sessionToken);
    })();
  }, [sessionToken, refreshRecordings]);

  async function createRecording() {
    if (!sessionToken) return;
    setCreatingRec(true);
    setRecError(null);
    try {
      const res = await fetch(`/api/catalog/recordings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ isrc: recIsrc, track_title: recTitle, artist_name: recArtist }),
      });
      const j = (await res.json()) as { recording?: unknown; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      await refreshRecordings(sessionToken);
    } catch (e: unknown) {
      setRecError(e instanceof Error ? e.message : "Erro ao criar recording");
    } finally {
      setCreatingRec(false);
    }
  }

  async function onPickCsvFile(file: File) {
    const text = await file.text();
    setCsvText(text);
  }

  async function importRoyalties() {
    if (!sessionToken) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await fetch(`/api/royalties/statements/import`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          source: "mock_v0",
          report_month: new Date().toISOString().slice(0, 7),
          number_format: numberFormat,
          csv: csvText,
          file_name: "dashboard-import.csv",
        }),
      });
      const j = (await res.json()) as { statement?: unknown; error?: string };
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
      setImportResult(JSON.stringify(j, null, 2));
      await refreshStatements(sessionToken);
      await refreshOverview(sessionToken);
      await refreshEscrow(sessionToken);
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      setImporting(false);
    }
  }

  async function resolveEscrow() {
    if (!sessionToken || !resolvingEscrowId) return;
    try {
      const res = await fetch(`/api/escrow/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ escrow_id: resolvingEscrowId, recording_id: resolveRecordingId }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setResolvingEscrowId(null);
      setResolveRecordingId("");
      await refreshEscrow(sessionToken);
      await refreshOverview(sessionToken);
    } catch (e: unknown) {
      setEscrowError(e instanceof Error ? e.message : "Erro ao resolver escrow");
    }
  }

  async function requestPayout(party_id: string) {
    if (!sessionToken) return;
    setPayoutBusyPartyId(party_id);
    setPayoutError(null);
    setPayoutResult(null);
    try {
      const raw = (payoutAmountByParty[party_id] ?? "").trim();
      const amount_usd = Number(raw);
      if (!raw || !Number.isFinite(amount_usd) || amount_usd <= 0) {
        throw new Error("Informe um valor válido (USD)");
      }
      const memo = (payoutMemoByParty[party_id] ?? "").trim();

      const res = await fetch(`/api/payouts`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ party_id, amount_usd, memo: memo || undefined }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; payout?: unknown; guardian?: unknown; balance?: unknown };
      if (!res.ok) {
        // keep full payload for debugging (Guardian issues, required_actions, etc.)
        setPayoutResult(JSON.stringify(j, null, 2));
        throw new Error(j?.error || `HTTP ${res.status}`);
      }
      setPayoutResult(JSON.stringify(j, null, 2));
      await refreshPayouts(sessionToken);
      await refreshPartyBalances(sessionToken);
      await refreshOverview(sessionToken);
    } catch (e: unknown) {
      setPayoutError(e instanceof Error ? e.message : "Erro ao solicitar payout");
    } finally {
      setPayoutBusyPartyId(null);
    }
  }

  async function markPayoutSent(payout_id: string) {
    if (!sessionToken) return;
    setPayoutUpdatingId(payout_id);
    setPayoutError(null);
    setPayoutRowErrById((cur) => {
      const next = { ...cur };
      delete next[payout_id];
      return next;
    });
    try {
      const method = (payoutMethodById[payout_id] ?? "").trim();
      if (!method) throw new Error("Selecione o método de pagamento");
      const sent_ref = (payoutSentRefById[payout_id] ?? "").trim();
      if (!sent_ref) throw new Error("Informe uma referência (sent_ref) antes de marcar como SENT");
      const prefix = payoutMethodPrefix[method] ?? "";
      if (prefix && sent_ref === prefix.trim()) throw new Error("Complete o identificador após o prefixo");
      const res = await fetch(`/api/payouts`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ payout_id, status: "SENT", payout_method: method, sent_ref: sent_ref || undefined }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; duplicate_payout_id?: string | null };
      if (!res.ok) {
        const msg = j.error || `HTTP ${res.status}`;
        setPayoutRowErrById((cur) => ({ ...cur, [payout_id]: { message: msg, duplicate_payout_id: j.duplicate_payout_id ?? null } }));
        throw new Error(msg);
      }
      await refreshPayouts(sessionToken);
      await refreshPartyBalances(sessionToken);
      await refreshOverview(sessionToken);
    } catch (e: unknown) {
      // Keep global error for unexpected issues, but prefer inline row errors.
      if (!(e instanceof Error)) setPayoutError("Erro ao marcar payout como SENT");
    } finally {
      setPayoutUpdatingId(null);
    }
  }

  const filteredPayouts = useMemo(() => {
    const q = payoutsSearch.trim().toLowerCase();
    return payouts.filter((p) => {
      if (payoutsStatusFilter !== "all" && p.status !== payoutsStatusFilter) return false;
      if (payoutsMethodFilter !== "all" && String(p.payout_method ?? "") !== payoutsMethodFilter) return false;
      if (!q) return true;
      const hay = [
        p.id,
        p.party?.display_name ?? "",
        p.party?.email ?? "",
        p.party_id,
        p.sent_ref ?? "",
        p.payout_method ?? "",
      ]
        .join(" | ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [payouts, payoutsSearch, payoutsStatusFilter, payoutsMethodFilter]);

  async function createParty() {
    if (!sessionToken) return;
    setCreatingParty(true);
    setPartyError(null);
    try {
      const res = await fetch(`/api/parties`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ display_name: newPartyName, kind: newPartyKind, email: newPartyEmail }),
      });
      const j = (await res.json()) as { party?: unknown; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setNewPartyName("");
      setNewPartyEmail("");
      await refreshParties(sessionToken);
    } catch (e: unknown) {
      setPartyError(e instanceof Error ? e.message : "Erro ao criar party");
    } finally {
      setCreatingParty(false);
    }
  }

  function splitTotalBps() {
    return splitItems.reduce((acc, it) => acc + Number(it.share_bps ?? 0), 0);
  }

  async function saveSplitDraft() {
    if (!sessionToken) return;
    setSavingSplit(true);
    setSplitError(null);
    setSplitSuccess(null);
    try {
      if (!splitRecordingId) throw new Error("Selecione um Recording");
      const total = splitTotalBps();
      if (total !== 10000) throw new Error(`Splits devem somar 10000 bps (agora: ${total})`);

      const res = await fetch(`/api/splits/recording`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ recording_id: splitRecordingId, items: splitItems }),
      });
      const j = (await res.json()) as {
        split?: { id?: string; version?: number; status?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setSplitSuccess("Draft salvo com sucesso.");
      if (j.split?.id) {
        setLoadedSplitId(j.split.id);
        if (typeof j.split.version === "number" && typeof j.split.status === "string") {
          setLoadedSplitInfo(`Split carregado: v${j.split.version} (${j.split.status})`);
        }
      }
    } catch (e: unknown) {
      setSplitError(e instanceof Error ? e.message : "Erro ao salvar split");
    } finally {
      setSavingSplit(false);
    }
  }

  const loadSplitForRecording = useCallback(
    async (token: string, recordingId: string) => {
      setLoadingSplit(true);
      setLoadedSplitInfo(null);
      setLoadedSplitId(null);
      setLoadedSplitStatus(null);
      setProposeLinks(null);
      setSplitError(null);
      try {
        const res = await fetch(`/api/splits/recording?recording_id=${encodeURIComponent(recordingId)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const j = (await res.json()) as {
          latest_split?: { id: string; version: number; status: string } | null;
          items?: Array<{ party_id: string; role: string; share_bps: number } & { party?: { display_name?: string } | null }>;
          error?: string;
        };
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);

        const items = (j.items ?? []).map((it) => ({
          party_id: String(it.party_id ?? ""),
          role: String(it.role ?? "participant"),
          share_bps: Math.trunc(Number(it.share_bps ?? 0)),
        }));
        setSplitItems(items);

        if (j.latest_split?.id) {
          setLoadedSplitId(j.latest_split.id);
          setLoadedSplitStatus(j.latest_split.status);
          setLoadedSplitInfo(`Split carregado: v${j.latest_split.version} (${j.latest_split.status})`);
          // If already proposed/active, show current acceptance statuses.
          await refreshAcceptances(token, j.latest_split.id);
        } else {
          setLoadedSplitInfo("Nenhum split salvo ainda para este recording.");
          setLoadedSplitStatus(null);
          setAcceptances([]);
        }
      } catch (e: unknown) {
        setSplitError(e instanceof Error ? e.message : "Erro ao carregar split");
      } finally {
        setLoadingSplit(false);
      }
    },
    [refreshAcceptances]
  );

  async function proposeSplit() {
    if (!sessionToken) return;
    if (!loadedSplitId) {
      setSplitError("Nenhum split carregado para propor. Salve um draft primeiro.");
      return;
    }
    setSplitError(null);
    setProposeLinks(null);
    try {
      const res = await fetch(`/api/splits/recording`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({
          action: "propose",
          split_id: loadedSplitId,
          base_url: typeof window !== "undefined" ? window.location.origin : undefined,
        }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        acceptance_links?: Array<{ email: string; url: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setProposeLinks(j.acceptance_links ?? []);
      // Refresh acceptance statuses (server-side source of truth)
      if (loadedSplitId) await refreshAcceptances(sessionToken, loadedSplitId);
    } catch (e: unknown) {
      setSplitError(e instanceof Error ? e.message : "Erro ao propor split");
    }
  }

  async function activateSplit() {
    if (!sessionToken || !loadedSplitId) return;
    if (loadedSplitStatus === "active") return;
    if (!canActivateSplit) {
      setActivateErr("Não dá pra ativar ainda: existem acceptances pendentes/rejeitadas/expiradas.");
      return;
    }
    setActivatingSplit(true);
    setActivateErr(null);
    setActivateMsg(null);
    try {
      const res = await fetch(`/api/splits/recording`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ action: "activate", split_id: loadedSplitId }),
      });
      const j = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setActivateMsg("Split ativado ✅");
      setLoadedSplitStatus("active");
      setLoadedSplitInfo((cur) => {
        const base = cur ?? "";
        return base.includes("(active)") || base.includes("ativo") ? base : `${base} | ativo`;
      });
      await refreshAcceptances(sessionToken, loadedSplitId);
    } catch (e: unknown) {
      setActivateErr(e instanceof Error ? e.message : "Erro ao ativar split");
    } finally {
      setActivatingSplit(false);
    }
  }

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

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="syn-card p-4">
          <div className="text-xs text-slate-300">Total in (USD)</div>
          <div className="mt-1 text-lg font-semibold text-white">{overview ? overview.total_in_usd : "—"}</div>
        </div>
        <div className="syn-card p-4">
          <div className="text-xs text-slate-300">Allocated (USD)</div>
          <div className="mt-1 text-lg font-semibold text-white">{overview ? overview.allocated_usd : "—"}</div>
        </div>
        <div className="syn-card p-4">
          <div className="text-xs text-slate-300">Unallocated (USD)</div>
          <div className="mt-1 text-lg font-semibold text-white">{overview ? overview.unallocated_usd : "—"}</div>
        </div>
        <div className="syn-card p-4">
          <div className="text-xs text-slate-300">Escrow open (USD)</div>
          <div className="mt-1 text-lg font-semibold text-white">{overview ? overview.escrow_open_usd : "—"}</div>
        </div>
        <div className="syn-card p-4">
          <div className="text-xs text-slate-300">Quarantine</div>
          <div className="mt-1 text-lg font-semibold text-white">{overview ? overview.quarantine_count : "—"}</div>
        </div>
      </div>

      <div className="mt-4 syn-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Split → Ledger — Timeline</div>
            <div className="text-sm text-slate-200/90">Guia rápido do fluxo operacional (MVP).</div>
          </div>
          <div className="text-xs text-slate-300">Passo atual: {splitFlowStep}/5</div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <a
            href="#splits"
            className={
              "rounded-full px-3 py-1 ring-1 ring-white/10 hover:bg-white/15 " +
              (splitFlowStep === 1
                ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
                : splitFlowStep > 1
                  ? "bg-white/10 text-slate-200"
                  : "bg-black/20 text-slate-400")
            }
          >
            1) Propor (propose)
          </a>
          <span className="text-slate-500">→</span>
          <a
            href="#accept"
            className={
              "rounded-full px-3 py-1 ring-1 ring-white/10 hover:bg-white/15 " +
              (splitFlowStep === 2
                ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
                : splitFlowStep > 2
                  ? "bg-white/10 text-slate-200"
                  : "bg-black/20 text-slate-400")
            }
          >
            2) Aceitar (accept)
          </a>
          <span className="text-slate-500">→</span>
          <a
            href="#activate"
            className={
              "rounded-full px-3 py-1 ring-1 ring-white/10 hover:bg-white/15 " +
              (splitFlowStep === 3
                ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
                : splitFlowStep > 3
                  ? "bg-white/10 text-slate-200"
                  : "bg-black/20 text-slate-400")
            }
          >
            3) Ativar (activate)
          </a>
          <span className="text-slate-500">→</span>
          <a
            href="#apply-ledger"
            className={
              "rounded-full px-3 py-1 ring-1 ring-white/10 hover:bg-white/15 " +
              (splitFlowStep === 4
                ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
                : splitFlowStep > 4
                  ? "bg-white/10 text-slate-200"
                  : "bg-black/20 text-slate-400")
            }
          >
            4) Aplicar no ledger (apply)
          </a>
          <span className="text-slate-500">→</span>
          <a
            href="#balances"
            className={
              "rounded-full px-3 py-1 ring-1 ring-white/10 hover:bg-white/15 " +
              (splitFlowStep === 5
                ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
                : splitFlowStep > 5
                  ? "bg-white/10 text-slate-200"
                  : "bg-black/20 text-slate-400")
            }
          >
            5) Saldos por party (balances)
          </a>
        </div>
      </div>

      <div id="apply-ledger" className="mt-4 syn-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Ledger — Aplicar splits (party sub-ledger)</div>
            <div className="text-sm text-slate-200/90">
              Gera lançamentos por party a partir do split <span className="font-semibold">active</span> de cada recording.
            </div>
          </div>
          <button
            disabled={!sessionToken || applyingSplits}
            onClick={() => void applySplitsToLedger()}
            className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
          >
            {applyingSplits ? "Aplicando..." : "Aplicar splits"}
          </button>
        </div>
        {applySplitsErr ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">{applySplitsErr}</pre>
        ) : applySplitsMsg ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10">{applySplitsMsg}</pre>
        ) : null}
      </div>

      <div id="balances" className="mt-4 syn-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Saldos por party (USD)</div>
            <div className="text-sm text-slate-200/90">Sub-ledger gerado a partir dos splits ativos.</div>
          </div>
          <button
            disabled={!sessionToken || loadingPartyBalances}
            onClick={() => sessionToken && void refreshPartyBalances(sessionToken)}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-50"
          >
            {loadingPartyBalances ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {partyBalancesErr ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">
            {partyBalancesErr}
          </pre>
        ) : (
          <div className="mt-3">
            <div className="text-xs text-slate-300">
              Total: {partyBalancesTotal === null ? "—" : usdFmt.format(partyBalancesTotal)}
            </div>

            {payoutError ? (
              <div className="mt-3 rounded-md bg-red-500/10 p-3 ring-1 ring-red-500/20">
                <div className="text-xs font-semibold text-red-200">{payoutError}</div>
                {debugMode && payoutResult ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-red-200/90">ver detalhes (debug)</summary>
                    <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10">
                      {payoutResult}
                    </pre>
                  </details>
                ) : null}
              </div>
            ) : debugMode && payoutResult ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-slate-300">payout response (debug)</summary>
                <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10">
                  {payoutResult}
                </pre>
              </details>
            ) : null}

            <div className="mt-3 grid gap-2">
              {partyBalances.length === 0 ? (
                <div className="text-sm text-slate-200/80">Nenhum lançamento por party ainda. Clique em “Aplicar splits”.</div>
              ) : (
                partyBalances.map((b) =>
                  b.party_id ? (
                    <div
                      key={b.party_id}
                      className="flex flex-col gap-2 rounded-md bg-black/20 px-3 py-2 ring-1 ring-white/10"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <Link href={`/ledger/party/${b.party_id}`} className="truncate text-sm font-semibold text-white hover:underline">
                            {b.display_name}
                          </Link>
                          <div className="truncate text-xs text-slate-300">{b.email ?? b.party_id}</div>
                        </div>
                        <div className="ml-4 shrink-0 text-sm font-semibold text-emerald-200">{usdFmt.format(b.balance_usd)}</div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <input
                          inputMode="decimal"
                          placeholder="Payout (USD)"
                          value={payoutAmountByParty[b.party_id] ?? ""}
                          onChange={(e) =>
                            setPayoutAmountByParty((cur) => ({
                              ...cur,
                              [b.party_id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-400 sm:w-[180px]"
                        />
                        <input
                          placeholder="Memo (opcional)"
                          value={payoutMemoByParty[b.party_id] ?? ""}
                          onChange={(e) =>
                            setPayoutMemoByParty((cur) => ({
                              ...cur,
                              [b.party_id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-400"
                        />
                        <button
                          disabled={!sessionToken || payoutBusyPartyId === b.party_id}
                          onClick={() => void requestPayout(b.party_id)}
                          className="rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
                        >
                          {payoutBusyPartyId === b.party_id ? "Solicitando..." : "Solicitar payout"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPayoutAmountByParty((cur) => ({
                              ...cur,
                              [b.party_id]: String(Math.max(0, Math.round((b.balance_usd + Number.EPSILON) * 100) / 100)),
                            }))
                          }
                          className="rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
                        >
                          Max
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={String(b.display_name)}
                      className="flex items-center justify-between rounded-md bg-black/10 px-3 py-2 ring-1 ring-white/10"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{b.display_name}</div>
                        <div className="truncate text-xs text-slate-300">party_id ausente</div>
                      </div>
                      <div className="ml-4 text-sm font-semibold text-slate-300">{usdFmt.format(b.balance_usd)}</div>
                    </div>
                  )
                )
              )}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">Payout requests (recentes)</div>
                <div className="flex items-center gap-2">
                  <select
                    value={payoutsStatusFilter}
                    onChange={(e) => setPayoutsStatusFilter(e.target.value)}
                    className="syn-select h-8 px-2 text-xs"
                    title="Filtrar por status"
                  >
                    <option value="all">status: todos</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="SENT">SETTLED</option>
                    <option value="BLOCKED">BLOCKED</option>
                    <option value="FAILED">FAILED</option>
                    <option value="CANCELED">CANCELED</option>
                  </select>

                  <select
                    value={payoutsMethodFilter}
                    onChange={(e) => setPayoutsMethodFilter(e.target.value)}
                    className="syn-select h-8 px-2 text-xs"
                    title="Filtrar por método"
                  >
                    <option value="all">método: todos</option>
                    {payoutMethods.map((m) => (
                      <option key={m} value={m}>
                        {payoutMethodLabel[m]}
                      </option>
                    ))}
                  </select>

                  <input
                    value={payoutsSearch}
                    onChange={(e) => setPayoutsSearch(e.target.value)}
                    placeholder="buscar ref/party"
                    className="h-8 w-[160px] rounded-md bg-white/10 px-2 text-xs text-slate-100 ring-1 ring-white/10 placeholder:text-slate-400"
                  />

                  <button
                    disabled={!sessionToken || loadingPayouts}
                    onClick={() => sessionToken && void refreshPayouts(sessionToken)}
                    className="text-xs text-slate-200 hover:text-white disabled:opacity-50"
                  >
                    {loadingPayouts ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>
              </div>

              {payoutsErr ? (
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">
                  {payoutsErr}
                </pre>
              ) : filteredPayouts.length === 0 ? (
                <div className="mt-2 text-sm text-slate-200/80">Nenhum payout solicitado ainda.</div>
              ) : (
                <div className="mt-2 overflow-hidden rounded-md ring-1 ring-white/10">
                  <table className="w-full text-left text-xs text-slate-200/90">
                    <thead className="bg-white/5 text-slate-200">
                      <tr>
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Party</th>
                        <th className="px-3 py-2">Valor (USD)</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Detalhes</th>
                        <th className="px-3 py-2">Ação</th>
                        <th className="px-3 py-2">Audit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayouts.map((p) => (
                        <tr key={p.id} className="border-t border-white/10">
                          <td className="px-3 py-2 text-slate-300">{new Date(p.created_at).toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <div className="truncate text-slate-100">{p.party?.display_name ?? p.party_id}</div>
                            <div className="truncate text-[11px] text-slate-400">{p.party?.email ?? ""}</div>
                          </td>
                          <td className="px-3 py-2 font-semibold text-emerald-200">{usdFmt.format(Number(p.amount_usd ?? 0))}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] ring-1 ring-white/10">{p.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={!sessionToken}
                              onClick={() => void openPayoutDetails(p.id)}
                              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-50"
                              title="Abrir settlement details panel"
                            >
                              detalhes
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            {p.status === "APPROVED" ? (
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <select
                                  value={payoutMethodById[p.id] ?? ""}
                                  onChange={(e) => {
                                    const method = e.target.value;
                                    setPayoutMethodById((cur) => ({ ...cur, [p.id]: method }));
                                    const prefix = payoutMethodPrefix[method] ?? "";
                                    if (!prefix) return;
                                    setPayoutSentRefById((cur) => {
                                      const existing = String(cur[p.id] ?? "");
                                      const { prefixKey, rest } = splitKnownPrefix(existing);

                                      // If user only had a prefix (PIX:) or empty, just set the new prefix.
                                      if (!rest) return { ...cur, [p.id]: prefix };

                                      // If it already has the same prefix, keep as-is.
                                      if (prefixKey && payoutMethodPrefix[prefixKey] === prefix) return cur;

                                      // If it had another known prefix, replace it with the new prefix and preserve the identifier part.
                                      if (prefixKey) return { ...cur, [p.id]: prefix + rest };

                                      // If it had no known prefix, assume the existing value is the identifier.
                                      return { ...cur, [p.id]: prefix + rest };
                                    });
                                  }}
                                  className="syn-select h-8 px-2 text-xs sm:w-[190px]"
                                  title="Método de pagamento"
                                >
                                  <option value="">método…</option>
                                  {payoutMethods.map((m) => (
                                    <option key={m} value={m}>
                                      {payoutMethodLabel[m]}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  placeholder={
                                    (payoutMethodById[p.id] ?? "").trim()
                                      ? payoutRefPlaceholder((payoutMethodById[p.id] ?? "").trim())
                                      : "ref/comprovante"
                                  }
                                  value={payoutSentRefById[p.id] ?? ""}
                                  onChange={(e) =>
                                    setPayoutSentRefById((cur) => ({
                                      ...cur,
                                      [p.id]: e.target.value,
                                    }))
                                  }
                                  title={payoutRefTooltip}
                                  className="w-full rounded-md bg-white/10 px-2 py-1 text-xs text-slate-100 ring-1 ring-white/10 placeholder:text-slate-400 sm:w-[220px]"
                                />
                                <button
                                  disabled={
                                    !sessionToken ||
                                    payoutUpdatingId === p.id ||
                                    !(payoutSentRefById[p.id] ?? "").trim() ||
                                    !(payoutMethodById[p.id] ?? "").trim() ||
                                    ((): boolean => {
                                      const m = (payoutMethodById[p.id] ?? "").trim();
                                      const v = (payoutSentRefById[p.id] ?? "").trim();
                                      const px = payoutMethodPrefix[m] ?? "";
                                      return !!px && v === px.trim();
                                    })()
                                  }
                                  onClick={() => void markPayoutSent(p.id)}
                                  className="rounded-md bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-900 disabled:opacity-50"
                                >
                                  {payoutUpdatingId === p.id ? "Salvando..." : "Marcar como SENT"}
                                </button>

                                {payoutRowErrById[p.id]?.message ? (
                                  <div className="text-[11px] text-red-200/90">
                                    {payoutRowErrById[p.id]?.message}
                                    {payoutRowErrById[p.id]?.duplicate_payout_id ? (
                                      <button
                                        type="button"
                                        onClick={() => void openPayoutEvents(String(payoutRowErrById[p.id]!.duplicate_payout_id))}
                                        className="ml-2 rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
                                        title="Abrir audit trail do payout duplicado"
                                      >
                                        ver duplicado
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            ) : p.status === "SENT" ? (
                              <div className="space-y-1 text-[11px] text-slate-300">
                                <div>
                                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-200 ring-1 ring-emerald-500/20">SETTLED</span>
                                </div>
                                <div className="text-slate-200/90">
                                  {p.payout_method ? payoutMethodLabel[String(p.payout_method)] ?? p.payout_method : "—"}
                                  {p.sent_at ? ` • ${new Date(p.sent_at).toLocaleString()}` : ""}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="truncate">{p.sent_ref ?? "—"}</span>
                                  {p.sent_ref ? (
                                    <button
                                      type="button"
                                      onClick={() => void navigator.clipboard?.writeText(p.sent_ref ?? "")}
                                      className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
                                      title="Copiar referência"
                                    >
                                      copiar
                                    </button>
                                  ) : null}
                                </div>
                                <div className="text-slate-400">
                                  by: {p.sent_by ? (sessionUserId && p.sent_by === sessionUserId ? "you" : String(p.sent_by).slice(0, 8)) : "—"}
                                </div>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-400">—</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={!sessionToken}
                              onClick={() => void openPayoutEvents(p.id)}
                              className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15 disabled:opacity-50"
                            >
                              histórico
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {eventsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl overflow-hidden rounded-xl bg-slate-950 ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-white">Payout — Audit trail</div>
                <div className="text-xs text-slate-300">{eventsPayoutId}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEventsOpen(false);
                  setEventsPayoutId(null);
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
              >
                fechar
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto p-4">
              {loadingEvents ? (
                <div className="text-sm text-slate-200/80">Carregando…</div>
              ) : eventsErr ? (
                <pre className="whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">{eventsErr}</pre>
              ) : events.length === 0 ? (
                <div className="text-sm text-slate-200/80">Nenhum evento.</div>
              ) : (
                <div className="space-y-2">
                  {events
                    .slice()
                    .reverse()
                    .map((ev) => (
                      <div key={ev.id} className="rounded-md bg-white/5 p-3 ring-1 ring-white/10">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-white">
                            {ev.action}
                            {ev.from_status || ev.to_status ? (
                              <span className="ml-2 text-slate-300">
                                {ev.from_status ?? "—"} → {ev.to_status ?? "—"}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-400">{new Date(ev.created_at).toLocaleString()}</div>
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">actor: {actorLabel(ev.actor_id)}</div>

                        {ev.action === "STATUS_CHANGED" && ev.to_status === "SENT" && ev.payload && typeof ev.payload === "object" ? (
                          <div className="mt-2 text-[11px] text-slate-200/90">
                            <span className="rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/10">
                              {String((ev.payload as { payout_method?: unknown }).payout_method ?? "—")}
                            </span>
                            <span className="ml-2 text-slate-300">{String((ev.payload as { sent_ref?: unknown }).sent_ref ?? "—")}</span>
                          </div>
                        ) : null}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-300">payload</summary>
                          <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-3 text-[11px] text-slate-100 ring-1 ring-white/10">
                            {JSON.stringify(ev.payload ?? null, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {detailsOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setDetailsOpen(false);
              setDetailsPayoutId(null);
            }}
            aria-label="Fechar detalhes"
          />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl overflow-auto bg-slate-950 ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-white">Settlement details</div>
                <div className="mt-1 truncate text-xs text-slate-300">{detailsPayoutId}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDetailsOpen(false);
                  setDetailsPayoutId(null);
                }}
                className="rounded-md bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
              >
                fechar
              </button>
            </div>

            <div className="space-y-4 p-4">
              {detailsLoading ? (
                <div className="text-sm text-slate-200/80">Carregando…</div>
              ) : detailsErr ? (
                <pre className="whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">{detailsErr}</pre>
              ) : detailsPayout ? (
                <>
                  <div className="syn-card p-4">
                    <div className="text-xs text-slate-300">Payout info</div>
                    <div className="mt-2 grid gap-2 text-xs text-slate-100">
                      <div>
                        <span className="text-slate-400">Party:</span> {detailsPayout.party?.display_name ?? detailsPayout.party_id}
                      </div>
                      <div>
                        <span className="text-slate-400">Amount:</span> {usdFmt.format(Number(detailsPayout.amount_usd ?? 0))}
                      </div>
                      <div>
                        <span className="text-slate-400">Status:</span> {detailsPayout.status}
                      </div>
                      <div>
                        <span className="text-slate-400">Created:</span> {new Date(detailsPayout.created_at).toLocaleString()}
                      </div>
                      <div>
                        <span className="text-slate-400">Correlation:</span> {detailsPayout.correlation_id ?? "—"}
                      </div>
                    </div>
                  </div>

                  <div className="syn-card p-4">
                    <div className="text-xs text-slate-300">Settlement info</div>
                    <div className="mt-2 grid gap-2 text-xs text-slate-100">
                      <div>
                        <span className="text-slate-400">Method:</span> {detailsPayout.payout_method ? payoutMethodLabel[String(detailsPayout.payout_method)] ?? detailsPayout.payout_method : "—"}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Proof:</span>
                        <span className="truncate">{detailsPayout.sent_ref ?? "—"}</span>
                        {detailsPayout.sent_ref ? (
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard?.writeText(detailsPayout.sent_ref ?? "")}
                            className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
                          >
                            copiar
                          </button>
                        ) : null}
                      </div>
                      <div>
                        <span className="text-slate-400">Settled at:</span> {detailsPayout.sent_at ? new Date(detailsPayout.sent_at).toLocaleString() : "—"}
                      </div>
                      <div>
                        <span className="text-slate-400">Operator:</span> {detailsPayout.sent_by ? (sessionUserId && detailsPayout.sent_by === sessionUserId ? "you" : String(detailsPayout.sent_by)) : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="syn-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-slate-300">Audit timeline</div>
                      <button
                        type="button"
                        onClick={() => detailsPayoutId && void openPayoutEvents(detailsPayoutId)}
                        className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
                        title="Atalho para o modal de histórico"
                      >
                        histórico
                      </button>
                    </div>

                    {detailsEventsLoading ? (
                      <div className="mt-2 text-sm text-slate-200/80">Carregando…</div>
                    ) : detailsEventsErr ? (
                      <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">{detailsEventsErr}</pre>
                    ) : detailsEvents.length === 0 ? (
                      <div className="mt-2 text-sm text-slate-200/80">Nenhum evento.</div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {detailsEvents
                          .slice()
                          .reverse()
                          .map((ev) => (
                            <div key={ev.id} className="rounded-md bg-white/5 p-3 ring-1 ring-white/10">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-white">
                                  {ev.action}
                                  {ev.from_status || ev.to_status ? (
                                    <span className="ml-2 text-slate-300">
                                      {ev.from_status ?? "—"} → {ev.to_status ?? "—"}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-slate-400">{new Date(ev.created_at).toLocaleString()}</div>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-400">actor: {actorLabel(ev.actor_id)}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="syn-card p-4">
                    <div className="text-xs text-slate-300">Raw payload</div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-300">meta</summary>
                      <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-3 text-[11px] text-slate-100 ring-1 ring-white/10">
                        {JSON.stringify(detailsPayout.meta ?? null, null, 2)}
                      </pre>
                    </details>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-300">guardian_raw</summary>
                      <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md bg-black/40 p-3 text-[11px] text-slate-100 ring-1 ring-white/10">
                        {JSON.stringify(detailsPayout.guardian_raw ?? null, null, 2)}
                      </pre>
                    </details>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 syn-card-soft p-6">
        <div className="text-sm font-semibold text-white">Próximos passos (dev)</div>
        <ul className="mt-3 list-disc pl-5 text-sm text-slate-200/90">
          <li>Persistência: salvar faixas em banco (Postgres) + storage (R2/S3).</li>
          <li>Guardian Stage específico para música (copyright/similaridade + provenance).</li>
          <li>Fila async de distribuição (Skipper) + status por DSP.</li>
        </ul>
      </div>

      <div className="mt-6 syn-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Royalties (MVP) — Import CSV</div>
            <div className="text-sm text-slate-200/90">
              CSV-first, API-ready. Normaliza números, aplica FX (ECB→USD), cria statement e linhas com audit trail.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 hover:bg-white/15">
              Escolher arquivo CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onPickCsvFile(f);
                }}
              />
            </label>
            <select
              value={numberFormat}
              onChange={(e) => setNumberFormat(e.target.value as "auto" | "en_US" | "pt_BR")}
              className="syn-select"
            >
              <option value="auto">auto</option>
              <option value="en_US">en_US</option>
              <option value="pt_BR">pt_BR</option>
            </select>
            <button
              disabled={!canImport || importing}
              onClick={() => void importRoyalties()}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar"}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="text-xs text-slate-300">CSV</div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={10}
              className="mt-2 w-full rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10"
            />
            <div className="mt-2 text-xs text-slate-300/80">
              Dica: cole aqui o CSV ou use “Escolher arquivo”.
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300">Resultado</div>
            {importError ? (
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-red-500/10 p-3 text-xs text-red-200 ring-1 ring-red-500/20">
                {importError}
              </pre>
            ) : (
              <pre className="mt-2 max-h-[260px] overflow-auto rounded-md bg-black/30 p-3 text-xs text-slate-100 ring-1 ring-white/10">
                {importResult ?? "—"}
              </pre>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">Statements recentes</div>
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-200/90">
                    <input
                      type="checkbox"
                      checked={showEmptyStatements}
                      onChange={(e) => setShowEmptyStatements(e.target.checked)}
                      className="h-4 w-4 rounded border-white/20 bg-white/10"
                    />
                    mostrar vazios/failed
                  </label>
                  <button
                    onClick={() => sessionToken && void refreshStatements(sessionToken)}
                    className="text-xs text-slate-200 hover:text-white"
                  >
                    {loadingStatements ? "Atualizando..." : "Atualizar"}
                  </button>
                </div>
              </div>
              <div className="mt-2 overflow-hidden rounded-md ring-1 ring-white/10">
                <table className="w-full text-left text-xs text-slate-200/90">
                  <thead className="bg-white/5 text-slate-200">
                    <tr>
                      <th className="px-3 py-2">Mês</th>
                      <th className="px-3 py-2">Fonte</th>
                      <th className="px-3 py-2">Linhas</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showEmptyStatements ? statements : statements.filter((s) => s.line_count > 0)).length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-slate-300" colSpan={4}>
                          Nenhum statement ainda.
                        </td>
                      </tr>
                    ) : (
                      (showEmptyStatements ? statements : statements.filter((s) => s.line_count > 0)).map((s) => (
                        <tr key={s.id} className="border-t border-white/10">
                          <td className="px-3 py-2">{s.report_month}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/dashboard/royalties/${s.id}`}
                              className="text-slate-100 hover:underline"
                            >
                              {s.source}
                            </Link>
                          </td>
                          <td className="px-3 py-2">{s.line_count}</td>
                          <td className="px-3 py-2">{s.parsing_status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 syn-card p-6">
        <div className="text-sm font-semibold text-white">Rights (MVP) — Parties</div>
        <div className="mt-1 text-sm text-slate-200/90">Quem recebe (autores, produtores, intérpretes, selo…).</div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Criar Party</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newPartyName}
                onChange={(e) => setNewPartyName(e.target.value)}
                placeholder="Nome (ex: Claudio, Produtor X, Label Y)"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
              />
              <select
                value={newPartyKind}
                onChange={(e) => setNewPartyKind(e.target.value as "person" | "company")}
                className="syn-select"
              >
                <option value="person">person</option>
                <option value="company">company</option>
              </select>
            </div>
            <div className="mt-2">
              <input
                value={newPartyEmail}
                onChange={(e) => setNewPartyEmail(e.target.value)}
                placeholder="email (obrigatório)"
                className="w-full rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
              />
            </div>
            <div className="mt-2">
              <button
                disabled={!newPartyName.trim() || !newPartyEmail.trim() || creatingParty}
                onClick={() => void createParty()}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                {creatingParty ? "Criando..." : "Criar"}
              </button>
            </div>
            {partyError ? <div className="mt-2 text-xs text-red-200">{partyError}</div> : null}
          </div>

          <div>
            <div className="text-xs text-slate-300">Parties recentes</div>
            <div className="mt-2 overflow-hidden rounded-md ring-1 ring-white/10">
              <table className="w-full text-left text-xs text-slate-200/90">
                <thead className="bg-white/5 text-slate-200">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-300" colSpan={3}>
                        Nenhuma party ainda.
                      </td>
                    </tr>
                  ) : (
                    parties.slice(0, 10).map((p) => (
                      <tr key={p.id} className="border-t border-white/10">
                        <td className="px-3 py-2 text-slate-100">{p.display_name}</td>
                        <td className="px-3 py-2 text-slate-300">{p.kind}</td>
                        <td className="px-3 py-2 text-slate-300">{p.email ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div id="splits" className="mt-6 syn-card p-6">
        <div className="text-sm font-semibold text-white">Rights (MVP) — Recording Splits (draft)</div>
        <div className="mt-1 text-sm text-slate-200/90">Define como o Master será distribuído (bps = 10000 = 100%).</div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Selecionar Recording</div>
            <select
              value={splitRecordingId}
              onChange={(e) => {
                setSplitRecordingId(e.target.value);
                setSplitItems([]);
                setLoadedSplitInfo(null);
                setSplitSuccess(null);
                setSplitError(null);
                const rid = e.target.value;
                if (sessionToken && rid) void loadSplitForRecording(sessionToken, rid);
              }}
              className="syn-select mt-2 w-full px-3"
            >
              <option value="">Selecione…</option>
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>
                  {(r.isrc ?? "—") + " — " + (r.track_title ?? "") + " — " + (r.artist_name ?? "")}
                </option>
              ))}
            </select>

            <div className="mt-4 text-xs text-slate-300">Items</div>
            {loadedSplitInfo ? (
              <div className="mt-2 text-xs text-slate-200/90">{loadingSplit ? "Carregando split…" : loadedSplitInfo}</div>
            ) : null}
            {loadedSplitId ? (
              <div className="mt-1 text-[11px] text-slate-300">split_id: {loadedSplitId}</div>
            ) : null}
            <div className="mt-2 grid gap-2">
              {splitItems.map((it, idx) => (
                <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                  <select
                    value={it.party_id}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSplitItems((s) => s.map((x, i) => (i === idx ? { ...x, party_id: v } : x)));
                    }}
                    className="syn-select w-full px-3"
                  >
                    <option value="">Party…</option>
                    {partiesWithEmail.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} — {p.email}
                      </option>
                    ))}
                  </select>
                  <input
                    value={it.role}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSplitItems((s) => s.map((x, i) => (i === idx ? { ...x, role: v } : x)));
                    }}
                    placeholder="role"
                    className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
                  />
                  <input
                    value={String(it.share_bps)}
                    onChange={(e) => {
                      const v = Math.trunc(Number(e.target.value || 0));
                      setSplitItems((s) => s.map((x, i) => (i === idx ? { ...x, share_bps: v } : x)));
                    }}
                    placeholder="bps"
                    className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
                  />
                  <button
                    onClick={() => setSplitItems((s) => s.filter((_, i) => i !== idx))}
                    className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                onClick={() => setSplitItems((s) => [...s, { party_id: "", role: "participant", share_bps: 0 }])}
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
              >
                + Adicionar item
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-200/90">
              Total: <b>{splitTotalBps()}</b> bps (deve ser 10000)
            </div>
            {splitSuccess ? <div className="mt-2 text-xs text-emerald-200">{splitSuccess}</div> : null}
            {splitError ? <div className="mt-2 text-xs text-red-200">{splitError}</div> : null}
            <div className="mt-3">
              <button
                disabled={!splitRecordingId || savingSplit}
                onClick={() => void saveSplitDraft()}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                {savingSplit ? "Salvando..." : "Salvar draft"}
              </button>
              <button
                disabled={!loadedSplitId}
                onClick={() => void proposeSplit()}
                className="ml-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Propor (gerar links)
              </button>
            </div>
            {proposeLinks ? (
              <div className="mt-3 rounded-md bg-black/30 p-3 text-[11px] text-slate-100 ring-1 ring-white/10">
                {proposeLinks.length === 0 ? (
                  <div className="text-slate-300">Proposto, mas nenhum link retornado.</div>
                ) : (
                  <ul className="space-y-2">
                    {proposeLinks.map((l) => (
                      <li key={l.email} className="break-all">
                        <div className="text-slate-300">{l.email}</div>
                        <a href={l.url} target="_blank" rel="noreferrer" className="text-emerald-200 hover:underline">
                          {l.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            {loadedSplitId ? (
              <div id="activate" className="mt-3 rounded-md bg-black/30 p-3 text-[11px] text-slate-100 ring-1 ring-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-slate-300">Aceitar / Ativar (accept / activate)</div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!sessionToken || loadingAcceptances}
                      onClick={() => sessionToken && void refreshAcceptances(sessionToken, loadedSplitId)}
                      className="rounded-md bg-white/10 px-3 py-1.5 text-[11px] text-slate-100 ring-1 ring-white/10 disabled:opacity-50"
                    >
                      {loadingAcceptances ? "Atualizando..." : "Atualizar"}
                    </button>
                    <button
                      disabled={!sessionToken || activatingSplit || !canActivateSplit || loadedSplitStatus === "active"}
                      onClick={() => void activateSplit()}
                      className={
                        "rounded-md px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50 " +
                        (loadedSplitStatus === "active" ? "bg-amber-500" : "bg-emerald-500")
                      }
                    >
                      {loadedSplitStatus === "active" ? "Ativo" : activatingSplit ? "Ativando..." : "Ativar split"}
                    </button>
                  </div>
                </div>

                {!canActivateSplit && loadedSplitStatus !== "active" && acceptances.length > 0 ? (
                  <div className="mt-2 text-slate-300">
                    Para ativar: 100% das acceptances precisam estar em <span className="text-emerald-200">accepted</span>.
                  </div>
                ) : null}

                {acceptancesErr ? <div className="mt-2 text-red-200">{acceptancesErr}</div> : null}
                {activateErr ? <div className="mt-2 text-red-200">{activateErr}</div> : null}
                {activateMsg ? <div className="mt-2 text-emerald-200">{activateMsg}</div> : null}

                {acceptances.length === 0 ? (
                  <div className="mt-2 text-slate-300">Nenhuma acceptance encontrada (proponha primeiro).</div>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {acceptances.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 truncate">
                          <span className="text-slate-200">{a.party?.display_name ?? a.party_id}</span>
                          <span className="text-slate-400"> — {a.email}</span>
                        </div>
                        <div className="text-slate-200">
                          <span
                            className={
                              a.status === "accepted"
                                ? "text-emerald-200"
                                : a.status === "rejected"
                                  ? "text-rose-200"
                                  : a.status === "expired"
                                    ? "text-slate-400"
                                    : "text-amber-200"
                            }
                          >
                            {a.status}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Como isso vira payout (próximo passo)</div>
            <ul className="mt-2 list-disc pl-5 text-sm text-slate-200/90">
              <li>draft → proposed → active (e-sign)</li>
              <li>com split active, alocamos o ledger por party</li>
              <li>payout auto_condicional só com gates (sem claims/holds + guardian ok)</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 syn-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Escrow (Unallocated) — Open</div>
            <div className="text-sm text-slate-200/90">Dinheiro pendente de matching (nada some; nada paga errado).</div>
          </div>
          <button
            onClick={() => sessionToken && void refreshEscrow(sessionToken)}
            className="text-xs text-slate-200 hover:text-white"
          >
            {loadingEscrow ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        {escrowError ? <div className="mt-3 text-xs text-red-200">{escrowError}</div> : null}

        <div className="mt-3 overflow-hidden rounded-md ring-1 ring-white/10">
          <table className="w-full text-left text-xs text-slate-200/90">
            <thead className="bg-white/5 text-slate-200">
              <tr>
                <th className="px-3 py-2">USD</th>
                <th className="px-3 py-2">ISRC</th>
                <th className="px-3 py-2">Track</th>
                <th className="px-3 py-2">DSP</th>
                <th className="px-3 py-2">Terr</th>
                <th className="px-3 py-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {escrow.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-300" colSpan={6}>
                    Nenhum item em escrow aberto.
                  </td>
                </tr>
              ) : (
                escrow.map((e) => (
                  <tr key={e.id} className="border-t border-white/10">
                    <td className="px-3 py-2 text-slate-100">{e.amount_usd}</td>
                    <td className="px-3 py-2 text-slate-300">{e.line?.isrc ?? "—"}</td>
                    <td className="px-3 py-2">
                      <div className="text-slate-100">{e.line?.track_title ?? "—"}</div>
                      <div className="text-slate-300">{e.line?.artist_name ?? ""}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{e.line?.dsp ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-300">{e.line?.territory ?? "—"}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => {
                          setResolvingEscrowId(e.id);
                          setResolveRecordingId("");
                        }}
                        className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-slate-100 ring-1 ring-white/10 hover:bg-white/15"
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {resolvingEscrowId ? (
          <div className="mt-4 rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Resolver escrow: {resolvingEscrowId}</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
              <select
                value={resolveRecordingId}
                onChange={(e) => setResolveRecordingId(e.target.value)}
                className="syn-select w-full px-3"
              >
                <option value="">Selecione um Recording</option>
                {recordings.map((r) => (
                  <option key={r.id} value={r.id}>
                    {(r.isrc ?? "—") + " — " + (r.track_title ?? "") + " — " + (r.artist_name ?? "")}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <button
                  disabled={!resolveRecordingId}
                  onClick={() => void resolveEscrow()}
                  className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setResolvingEscrowId(null)}
                  className="rounded-md bg-white/10 px-4 py-2 text-sm text-slate-100 ring-1 ring-white/10"
                >
                  Cancelar
                </button>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-300/80">
              Isso marca a linha como <b>matched</b>, resolve o escrow e troca o ledger de <b>unallocated</b> para <b>allocated</b>.
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 syn-card p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Catalog (MVP) — Recordings (Master)</div>
            <div className="text-sm text-slate-200/90">Registry mínimo pra matching ISRC exact.</div>
          </div>
          <button
            onClick={() => sessionToken && void refreshRecordings(sessionToken)}
            className="text-xs text-slate-200 hover:text-white"
          >
            {loadingRecordings ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-md bg-black/30 p-4 ring-1 ring-white/10">
            <div className="text-xs text-slate-300">Criar Recording</div>
            <div className="mt-3 grid gap-2">
              <input
                value={recIsrc}
                onChange={(e) => setRecIsrc(e.target.value)}
                placeholder="ISRC"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
              />
              <input
                value={recTitle}
                onChange={(e) => setRecTitle(e.target.value)}
                placeholder="Track title"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
              />
              <input
                value={recArtist}
                onChange={(e) => setRecArtist(e.target.value)}
                placeholder="Artist"
                className="rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10"
              />
              <button
                disabled={!sessionToken || creatingRec}
                onClick={() => void createRecording()}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
              >
                {creatingRec ? "Criando..." : "Criar"}
              </button>
              {recError ? (
                <div className="text-xs text-red-200">{recError}</div>
              ) : (
                <div className="text-xs text-slate-300/80">Dica: cria o Recording com o ISRC do CSV e reimporte royalties.</div>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-300">Recordings recentes</div>
            <div className="mt-2 overflow-hidden rounded-md ring-1 ring-white/10">
              <table className="w-full text-left text-xs text-slate-200/90">
                <thead className="bg-white/5 text-slate-200">
                  <tr>
                    <th className="px-3 py-2">ISRC</th>
                    <th className="px-3 py-2">Track</th>
                    <th className="px-3 py-2">Artist</th>
                  </tr>
                </thead>
                <tbody>
                  {recordings.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-slate-300" colSpan={3}>
                        Nenhum recording ainda.
                      </td>
                    </tr>
                  ) : (
                    recordings.map((r) => (
                      <tr key={r.id} className="border-t border-white/10">
                        <td className="px-3 py-2 text-slate-300">{r.isrc ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-100">{r.track_title ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-300">{r.artist_name ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
