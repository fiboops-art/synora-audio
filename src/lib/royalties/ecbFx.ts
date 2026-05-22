import crypto from "crypto";

export type EcbFxSnapshot = {
  fx_base_currency: "USD";
  fx_source: "ECB";
  fx_timestamp: string; // ISO timestamp
  // 1 unit of original_currency = fx_rate * USD
  fx_rate: number;
};

type RatesPerEur = Record<string, number>; // 1 EUR = rate * CURRENCY

function parseEcbDailyXml(xml: string): RatesPerEur {
  // ECB daily XML contains <Cube currency='USD' rate='1.0789'/> etc.
  // Rate meaning: 1 EUR = rate * currency
  const rates: RatesPerEur = { EUR: 1 };
  const re = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const ccy = m[1];
    const rate = Number(m[2]);
    if (Number.isFinite(rate) && rate > 0) rates[ccy] = rate;
  }
  return rates;
}

async function fetchEcbDailyXml(): Promise<{ xml: string; fetchedAtIso: string; etag?: string | null }> {
  const url = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`ECB fetch failed: ${res.status}`);
  const xml = await res.text();
  const etag = res.headers.get("etag");
  const fetchedAtIso = new Date().toISOString();
  return { xml, fetchedAtIso, etag };
}

export function computeFxRateToUsd(ratesPerEur: RatesPerEur, originalCurrency: string): number {
  if (originalCurrency === "USD") return 1;
  const usdPerEur = ratesPerEur["USD"]; // 1 EUR = X USD
  if (!usdPerEur) throw new Error("ECB rates missing USD");

  if (originalCurrency === "EUR") return usdPerEur; // 1 EUR = usdPerEur USD

  const ccyPerEur = ratesPerEur[originalCurrency]; // 1 EUR = X CCY
  if (!ccyPerEur) throw new Error(`ECB rates missing ${originalCurrency}`);

  // 1 CCY = (1 / ccyPerEur) EUR; multiply by USD per EUR
  return usdPerEur / ccyPerEur;
}

export async function getEcbFxSnapshot(originalCurrency: string): Promise<EcbFxSnapshot> {
  const { xml, fetchedAtIso } = await fetchEcbDailyXml();
  const rates = parseEcbDailyXml(xml);
  const fx_rate = computeFxRateToUsd(rates, originalCurrency);
  return {
    fx_base_currency: "USD",
    fx_source: "ECB",
    fx_timestamp: fetchedAtIso,
    fx_rate,
  };
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

