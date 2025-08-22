import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";

export function getConnection() {
  const p = process.env.SOLANA_RPC_PRIMARY;
  const f = process.env.SOLANA_RPC_FALLBACK;
  const url = p || f || clusterApiUrl("mainnet-beta");
  return new Connection(url, "confirmed");
}

export function getFallbackConnection() {
  const f = process.env.SOLANA_RPC_FALLBACK || process.env.SOLANA_RPC_PRIMARY || clusterApiUrl("mainnet-beta");
  return new Connection(f, "confirmed");
}

export function asPublicKey(v) {
  return new PublicKey(v);
}
