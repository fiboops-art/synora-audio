import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export type SolanaAnchorResult = {
  network: "devnet";
  fingerprint_sha256_hex: string;
  memo: string;
  tx_signature: string;
  confirmation: {
    slot: number;
    err: unknown | null;
    confirmationStatus: string | null;
  };
  explorer_url: string;
};

export type SolanaPreparedTx = {
  network: "devnet";
  fingerprint_sha256_hex: string;
  memo: string;
  tx_signature: string;
  recent_blockhash: string;
  last_valid_block_height: number;
  raw_tx_base64: string;
};

function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function isHex64(s: string): boolean {
  return /^[0-9a-f]{64}$/i.test(s);
}

function parseSignerSecretKeyFromEnv(raw: string): Uint8Array {
  const v = raw.trim();
  invariant(v.length > 0, "SOLANA_SIGNER_SECRET_KEY is empty");

  if (v.startsWith("[") && v.endsWith("]")) {
    const arr = JSON.parse(v) as unknown;
    invariant(Array.isArray(arr), "SOLANA_SIGNER_SECRET_KEY JSON must be an array");
    const bytes = arr.map((n) => Number(n));
    for (const b of bytes) invariant(Number.isInteger(b) && b >= 0 && b <= 255, "SOLANA_SIGNER_SECRET_KEY has invalid byte");
    return Uint8Array.from(bytes);
  }

  // base64 (common for env secrets)
  try {
    const buf = Buffer.from(v, "base64");
    invariant(buf.length > 0, "SOLANA_SIGNER_SECRET_KEY base64 decoded empty");
    return new Uint8Array(buf);
  } catch {
    throw new Error("SOLANA_SIGNER_SECRET_KEY must be JSON array or base64");
  }
}

export async function buildSignedAnchorTxDevnet(input: {
  fingerprint_sha256_hex: string;
}): Promise<SolanaPreparedTx> {
  const fingerprint = (input.fingerprint_sha256_hex ?? "").trim().toLowerCase();
  invariant(isHex64(fingerprint), "fingerprint_sha256_hex must be exactly 64 hex chars");

  const rpcUrl = (process.env.SOLANA_RPC_URL ?? "").trim();
  invariant(rpcUrl, "Missing SOLANA_RPC_URL");

  const signerSecret = (process.env.SOLANA_SIGNER_SECRET_KEY ?? "").trim();
  invariant(signerSecret, "Missing SOLANA_SIGNER_SECRET_KEY");

  const secretKey = parseSignerSecretKeyFromEnv(signerSecret);
  const signer = Keypair.fromSecretKey(secretKey);

  const connection = new Connection(rpcUrl, "confirmed");

  const genesisHash = await connection.getGenesisHash();
  invariant(genesisHash === DEVNET_GENESIS_HASH, `RPC is not devnet (genesisHash=${genesisHash})`);

  const memo = `synora.creators.split.activate:v1:${fingerprint}`;
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, "utf8"),
  });

  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(memoIx);

  tx.sign(signer);

  const sig = tx.signatures[0]?.signature;
  invariant(sig && sig.length > 0, "Failed to sign transaction");

  const tx_signature = bs58.encode(sig);
  const raw_tx_base64 = tx.serialize().toString("base64");

  return {
    network: "devnet",
    fingerprint_sha256_hex: fingerprint,
    memo,
    tx_signature,
    recent_blockhash: latest.blockhash,
    last_valid_block_height: latest.lastValidBlockHeight,
    raw_tx_base64,
  };
}

export async function anchorFingerprintToSolanaDevnet(input: {
  fingerprint_sha256_hex: string;
}): Promise<SolanaAnchorResult> {
  const fingerprint = (input.fingerprint_sha256_hex ?? "").trim().toLowerCase();
  invariant(isHex64(fingerprint), "fingerprint_sha256_hex must be exactly 64 hex chars");

  const rpcUrl = (process.env.SOLANA_RPC_URL ?? "").trim();
  invariant(rpcUrl, "Missing SOLANA_RPC_URL");

  const signerSecret = (process.env.SOLANA_SIGNER_SECRET_KEY ?? "").trim();
  invariant(signerSecret, "Missing SOLANA_SIGNER_SECRET_KEY");

  const secretKey = parseSignerSecretKeyFromEnv(signerSecret);
  const signer = Keypair.fromSecretKey(secretKey);

  const connection = new Connection(rpcUrl, "confirmed");

  const genesisHash = await connection.getGenesisHash();
  invariant(genesisHash === DEVNET_GENESIS_HASH, `RPC is not devnet (genesisHash=${genesisHash})`);

  const memo = `synora.creators.split.activate:v1:${fingerprint}`;
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memo, "utf8"),
  });

  // Use a stable, explicit recent blockhash flow (avoid implicit behaviors)
  const latest = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(memoIx);

  const tx_signature = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed",
    skipPreflight: false,
    maxRetries: 3,
  });

  const status = await connection.getSignatureStatus(tx_signature, { searchTransactionHistory: true });
  const confirmation = {
    slot: status?.value?.slot ?? -1,
    err: status?.value?.err ?? null,
    confirmationStatus: status?.value?.confirmationStatus ?? null,
  };
  invariant(confirmation.err === null, "Transaction confirmed with error");
  invariant(confirmation.slot >= 0, "Transaction not confirmed (missing slot)");

  const explorer_url = `https://explorer.solana.com/tx/${tx_signature}?cluster=devnet`;

  return {
    network: "devnet",
    fingerprint_sha256_hex: fingerprint,
    memo,
    tx_signature,
    confirmation,
    explorer_url,
  };
}

export type SolanaBroadcastPreparedResult = {
  network: "devnet";
  tx_signature: string;
  confirmation: {
    slot: number;
    err: unknown | null;
    confirmationStatus: string | null;
  };
  anchored_at: string;
  explorer_url: string;
};

export async function broadcastPreparedAnchorTxDevnet(input: {
  raw_tx_base64: string;
  tx_signature: string;
  recent_blockhash: string;
  last_valid_block_height: number;
}): Promise<SolanaBroadcastPreparedResult> {
  const rpcUrl = (process.env.SOLANA_RPC_URL ?? "").trim();
  invariant(rpcUrl, "Missing SOLANA_RPC_URL");

  const raw = Buffer.from((input.raw_tx_base64 ?? "").trim(), "base64");
  invariant(raw.length > 0, "raw_tx_base64 decoded empty");

  const expectedSignature = (input.tx_signature ?? "").trim();
  invariant(expectedSignature.length > 0, "Missing tx_signature");

  const connection = new Connection(rpcUrl, "confirmed");

  const genesisHash = await connection.getGenesisHash();
  invariant(
    genesisHash === DEVNET_GENESIS_HASH,
    `RPC is not devnet (genesisHash=${genesisHash})`,
  );

  const wireSignature = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
  });

  invariant(
    wireSignature === expectedSignature,
    `Broadcast signature mismatch: expected=${expectedSignature} actual=${wireSignature}`,
  );

  const confirmation = await connection.confirmTransaction(
    {
      signature: expectedSignature,
      blockhash: input.recent_blockhash,
      lastValidBlockHeight: input.last_valid_block_height,
    },
    "confirmed",
  );

  invariant(
    confirmation.value.err === null,
    "Transaction confirmed with error",
  );

  const status = await connection.getSignatureStatus(expectedSignature, {
    searchTransactionHistory: true,
  });

  const slot = status?.value?.slot ?? -1;
  invariant(slot >= 0, "Transaction not confirmed (missing slot)");

  return {
    network: "devnet",
    tx_signature: expectedSignature,
    confirmation: {
      slot,
      err: status?.value?.err ?? null,
      confirmationStatus: status?.value?.confirmationStatus ?? null,
    },
    anchored_at: new Date().toISOString(),
    explorer_url: `https://explorer.solana.com/tx/${expectedSignature}?cluster=devnet`,
  };
}

export async function isPreparedAnchorBlockhashExpiredDevnet(input: {
  last_valid_block_height: number;
}): Promise<boolean> {
  const rpcUrl = (process.env.SOLANA_RPC_URL ?? "").trim();
  invariant(rpcUrl, "Missing SOLANA_RPC_URL");

  const connection = new Connection(rpcUrl, "confirmed");

  const genesisHash = await connection.getGenesisHash();
  invariant(
    genesisHash === DEVNET_GENESIS_HASH,
    `RPC is not devnet (genesisHash=${genesisHash})`,
  );

  const currentBlockHeight = await connection.getBlockHeight("confirmed");

  return currentBlockHeight > input.last_valid_block_height;
}
