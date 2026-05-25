import crypto from "crypto";

export type DestinationProvider = "PIX" | "BANK" | "PAYPAL" | "WISE" | "STRIPE" | "CRYPTO";

export function normalizeWhitespace(s: string) {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

export function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function computeDestinationFingerprint(provider: DestinationProvider, details: Record<string, unknown>): string | null {
  // Keep fingerprints stable and privacy-preserving.
  // Do NOT store raw sensitive values inside fingerprint.
  try {
    if (provider === "PIX") {
      const key = normalizeWhitespace(String(details.pix_key ?? details.key ?? "")).toLowerCase();
      if (!key) return null;
      return sha256Hex(`pix:${key}`);
    }
    if (provider === "BANK") {
      const bank = normalizeWhitespace(String(details.bank ?? "")).toLowerCase();
      const branch = normalizeWhitespace(String(details.branch ?? "")).toLowerCase();
      const account = normalizeWhitespace(String(details.account ?? "")).toLowerCase();
      if (!bank || !branch || !account) return null;
      return sha256Hex(`bank:${bank}|${branch}|${account}`);
    }
    if (provider === "PAYPAL") {
      const email = normalizeWhitespace(String(details.email ?? "")).toLowerCase();
      if (!email) return null;
      return sha256Hex(`paypal:${email}`);
    }
    if (provider === "CRYPTO") {
      const wallet = normalizeWhitespace(String(details.wallet ?? details.address ?? "")).toLowerCase();
      if (!wallet) return null;
      return sha256Hex(`crypto:${wallet}`);
    }
    // For providers we won't support yet, skip fingerprint.
    return null;
  } catch {
    return null;
  }
}

export function maskDestination(provider: DestinationProvider, details: Record<string, unknown>) {
  // Return a non-sensitive snapshot suitable for audit.
  const safe: Record<string, unknown> = { provider };
  if (provider === "PIX") {
    const k = String(details.pix_key ?? details.key ?? "");
    const keyType = String(details.pix_key_type ?? details.key_type ?? "");
    safe.pix_key_type = keyType || null;
    safe.pix_key_masked = k ? k.slice(0, 3) + "***" + k.slice(-3) : null;
    safe.receiver_name = details.receiver_name ?? null;
    return safe;
  }
  if (provider === "BANK") {
    const bank = String(details.bank ?? "");
    const branch = String(details.branch ?? "");
    const account = String(details.account ?? "");
    safe.bank = bank || null;
    safe.branch = branch ? branch.slice(0, 2) + "***" : null;
    safe.account_last4 = account ? account.slice(-4) : null;
    safe.holder_name = details.holder_name ?? null;
    return safe;
  }
  if (provider === "PAYPAL") {
    const email = String(details.email ?? "");
    safe.email_masked = email ? email.replace(/(.{2}).+(@.+)/, "$1***$2") : null;
    return safe;
  }
  if (provider === "CRYPTO") {
    const wallet = String(details.wallet ?? details.address ?? "");
    safe.wallet_masked = wallet ? wallet.slice(0, 6) + "…" + wallet.slice(-4) : null;
    safe.network = details.network ?? null;
    return safe;
  }
  return safe;
}

