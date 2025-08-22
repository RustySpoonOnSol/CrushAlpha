import {
  getAssociatedTokenAddress,
  getAccount,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

// Cache mint metadata to avoid repeated getMint() calls
const MINT_CACHE = new Map(); // key: mintStr -> { decimals, programId }

/** Pretty-print a UI balance with sensible decimals. */
export function formatUI(amount) {
  if (!Number.isFinite(amount)) return "0";
  if (amount >= 1_000_000) return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (amount >= 1) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Efficient token balance:
 * 1) Try ATA (fast path, attempts classic then 2022)
 * 2) Fallback: single parsed scan by mint (covers Token + 2022)
 * 3) Lazily resolve mint decimals/program and cache for later
 */
export async function getTokenBalanceUI(connection, ownerPubkey, mintStr) {
  try {
    if (!connection || !ownerPubkey || !mintStr) {
      return { amount: 0, decimals: 0, programId: TOKEN_PROGRAM_ID, source: "missing-args" };
    }

    const mint = new PublicKey(mintStr);

    // Use cached mint info if present; lazily fill if needed
    let cached = MINT_CACHE.get(mintStr);
    let decimals = cached?.decimals ?? 9;
    let programId = cached?.programId ?? TOKEN_PROGRAM_ID;

    // 1) Try ATA first (attempt both programs)
    for (const pid of [programId, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
      try {
        const ata = await getAssociatedTokenAddress(mint, ownerPubkey, false, pid);
        const acc = await getAccount(connection, ata, undefined, pid);
        const raw = BigInt(acc.amount.toString());
        const ui = Number(raw) / Math.pow(10, decimals);
        programId = pid;
        return { amount: ui, decimals, programId, source: "ata" };
      } catch {
        // keep trying
      }
    }

    // 2) Fallback: single parsed scan by mint (RPC covers both programs)
    try {
      const parsed = await connection.getParsedTokenAccountsByOwner(ownerPubkey, { mint });
      for (const { account } of parsed.value) {
        const info = account.data.parsed?.info;
        const uiAmount = info?.tokenAmount?.uiAmount;
        const d = info?.tokenAmount?.decimals;
        if (typeof d === "number") decimals = d; // prefer parsed decimals when available
        if (typeof uiAmount === "number") {
          return { amount: uiAmount, decimals, programId, source: "scan" };
        }
      }
    } catch {
      // ignore; we’ll return 0 if nothing found
    }

    // 3) If still nothing, lazily cache mint decimals/program for future calls
    if (!cached) {
      try {
        const classic = await getMint(connection, mint, undefined, TOKEN_PROGRAM_ID);
        decimals = classic?.decimals ?? decimals;
        programId = TOKEN_PROGRAM_ID;
        MINT_CACHE.set(mintStr, { decimals, programId });
      } catch {
        try {
          const t22 = await getMint(connection, mint, undefined, TOKEN_2022_PROGRAM_ID);
          decimals = t22?.decimals ?? decimals;
          programId = TOKEN_2022_PROGRAM_ID;
          MINT_CACHE.set(mintStr, { decimals, programId });
        } catch {
          // leave defaults if both fail
        }
      }
    }

    return { amount: 0, decimals, programId, source: "not-found" };
  } catch (e) {
    console.error("getTokenBalanceUI error:", e);
    return { amount: 0, decimals: 0, programId: TOKEN_PROGRAM_ID, source: "error" };
  }
}

export function tierFor(amount) {
  if (amount >= 20_000_000) return "💎 GOD-TIER";
  if (amount >= 5_000_000)  return "🔥 ELITE";
  if (amount >= 500_000)    return "💖 CRUSHED";
  if (amount > 0)           return "😘 SUPPORTER";
  return "😶‍🌫️ NEWBIE";
}
