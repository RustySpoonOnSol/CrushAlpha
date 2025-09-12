// lib/entitlements.js
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/*
-- Run once (idempotent)
create table if not exists entitlements (
  wallet text not null,
  item_id text not null,
  tx_sig text not null,
  created_at timestamptz default now(),
  primary key (wallet, item_id)
);
create index if not exists entitlements_wallet_idx on entitlements(wallet);

-- Recommended RLS (if you ever expose anon key to read user’s own):
-- alter table entitlements enable row level security;
-- create policy "owner can read own" on entitlements
--   for select using (auth.jwt() ->> 'wallet' = wallet);
-- (Service key bypasses RLS for server-only writes.)
*/

const mem = new Map(); // in-memory fallback (non-persistent)

// --- tiny helpers ---
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/; // loose guard for Solana pubkeys/tx
const isBase58ish = (s) => typeof s === "string" && BASE58_RE.test(s);
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

// LRU for has/list (cuts hot DB reads)
const LRU_MAX = 1000;
function lruSet(key, val) {
  mem.set(key, { ...val, _ts: Date.now() });
  if (mem.size > LRU_MAX) {
    // delete oldest ~5%
    const arr = [...mem.entries()].sort((a, b) => a[1]._ts - b[1]._ts);
    const del = Math.ceil(mem.size * 0.05);
    for (let i = 0; i < del; i++) mem.delete(arr[i][0]);
  }
}
function lruGet(key) {
  const v = mem.get(key);
  if (!v) return null;
  // 10 min TTL
  if (Date.now() - v._ts > 10 * 60 * 1000) {
    mem.delete(key);
    return null;
  }
  return v;
}

// minimal retry for transient db errors
async function withRetry(fn, { attempts = 3, baseMs = 120 } = {}) {
  let err;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      err = e;
      await new Promise(r => setTimeout(r, clamp(baseMs * (2 ** i), 120, 1200)));
    }
  }
  throw err;
}

export async function grantEntitlement(wallet, itemId, txSig) {
  if (!isBase58ish(wallet)) throw new Error("invalid wallet");
  if (!itemId || typeof itemId !== "string") throw new Error("invalid itemId");
  if (!isBase58ish(txSig)) throw new Error("invalid txSig");

  if (supabase) {
    await withRetry(async () => {
      const { error } = await supabase
        .from("entitlements")
        .upsert({ wallet, item_id: itemId, tx_sig: txSig });
      if (error) throw error;
    });
  } else {
    lruSet(`${wallet}:${itemId}`, { txSig, createdAt: Date.now() });
  }
  return true;
}

export async function grantEntitlements(wallet, itemIds, txSig) {
  if (!Array.isArray(itemIds) || itemIds.length === 0) return true;
  if (!isBase58ish(wallet)) throw new Error("invalid wallet");
  if (!isBase58ish(txSig)) throw new Error("invalid txSig");

  if (supabase) {
    const rows = itemIds.map((id) => ({ wallet, item_id: String(id), tx_sig: txSig }));
    await withRetry(async () => {
      const { error } = await supabase.from("entitlements").upsert(rows);
      if (error) throw error;
    });
    // warm LRU
    rows.forEach((r) => lruSet(`${wallet}:${r.item_id}`, { txSig, createdAt: Date.now() }));
  } else {
    for (const id of itemIds) lruSet(`${wallet}:${String(id)}`, { txSig, createdAt: Date.now() });
  }
  return true;
}

export async function hasEntitlement(wallet, itemId) {
  if (!isBase58ish(wallet)) return false;
  if (!itemId || typeof itemId !== "string") return false;

  const key = `${wallet}:${itemId}`;
  const lru = lruGet(key);
  if (lru) return true;

  if (supabase) {
    const { data, error } = await supabase
      .from("entitlements")
      .select("wallet")
      .eq("wallet", wallet)
      .eq("item_id", itemId)
      .maybeSingle();
    if (error) throw error;
    if (data) lruSet(key, { txSig: "db", createdAt: Date.now() });
    return !!data;
  }
  return mem.has(key);
}

export async function listEntitlements(wallet) {
  if (!isBase58ish(wallet)) return [];
  if (supabase) {
    const { data, error } = await supabase
      .from("entitlements")
      .select("item_id, tx_sig, created_at")
      .eq("wallet", wallet);
    if (error) throw error;
    const out = (data || []).map((r) => ({ itemId: r.item_id, txSig: r.tx_sig, createdAt: r.created_at }));
    // warm LRU
    out.forEach((r) => lruSet(`${wallet}:${r.itemId}`, { txSig: r.txSig, createdAt: Date.parse(r.createdAt) || Date.now() }));
    return out;
  }
  const out = [];
  for (const [k, v] of mem.entries()) {
    const [w, itemId] = k.split(":");
    if (w === wallet) out.push({ itemId, txSig: v.txSig, createdAt: new Date(v.createdAt).toISOString() });
  }
  return out;
}
