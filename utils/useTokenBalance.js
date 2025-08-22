// utils/useTokenBalance.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getTokenBalanceUI } from "./solanaTokens";

/**
 * In-memory cache: { "<owner>-<mint>": { amount, ts, decimals, programId } }
 * Resets on page reload — perfect for rate control without stale UX.
 */
const BAL_CACHE = new Map();

/**
 * useTokenBalance
 * Caches results for `ttlMs` (default 60s). Debounces refetch to avoid bursts.
 *
 * @param {object} params
 * - connection: Solana Connection
 * - owner: PublicKey | null
 * - mint: string (mint address)
 * - ttlMs: number (cache TTL)
 * - debounceMs: number (debounce delay)
 *
 * Returns: { amount, decimals, loading, refresh, source }
 */
export function useTokenBalance({
  connection,
  owner,
  mint,
  ttlMs = 60_000,
  debounceMs = 300,
} = {}) {
  const key = useMemo(() => {
    if (!owner || !mint) return null;
    return `${owner.toBase58?.() || String(owner)}-${mint}`;
  }, [owner, mint]);

  const [amount, setAmount] = useState(0);
  const [decimals, setDecimals] = useState(0);
  const [source, setSource] = useState("init");
  const [loading, setLoading] = useState(false);

  const timer = useRef(null);

  const fetchNow = useCallback(async () => {
    if (!connection || !owner || !mint || !key) return;
    setLoading(true);
    try {
      const res = await getTokenBalanceUI(connection, owner, mint);
      BAL_CACHE.set(key, { ...res, ts: Date.now() });
      setAmount(res.amount || 0);
      setDecimals(res.decimals || 0);
      setSource(res.source || "unknown");
    } catch (e) {
      console.error("useTokenBalance fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [connection, owner, mint, key]);

  const refresh = useCallback(
    (force = false) => {
      if (!key) return;
      // Serve cached if fresh
      const cached = BAL_CACHE.get(key);
      const fresh = cached && Date.now() - cached.ts < ttlMs;

      if (!force && fresh) {
        setAmount(cached.amount || 0);
        setDecimals(cached.decimals || 0);
        setSource(cached.source || "cache");
        return;
      }

      // Debounce actual fetches
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(fetchNow, debounceMs);
    },
    [key, ttlMs, debounceMs, fetchNow]
  );

  // Initial / dependency-driven refresh
  useEffect(() => {
    refresh(false);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  // Refresh on tab focus (cheap & user friendly)
  useEffect(() => {
    const onFocus = () => refresh(false);
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { amount, decimals, loading, refresh, source };
}
