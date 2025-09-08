// lib/entitlements.js
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  const { createClient } = require("@supabase/supabase-js");
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

/*
Run once in Supabase:
create table if not exists entitlements (
  wallet text not null,
  item_id text not null,
  tx_sig text not null,
  created_at timestamp with time zone default now(),
  primary key (wallet, item_id)
);
create index if not exists entitlements_wallet_idx on entitlements(wallet);
*/

const mem = new Map(); // fallback (non-persistent)

export async function grantEntitlement(wallet, itemId, txSig) {
  if (supabase) {
    const { error } = await supabase
      .from("entitlements")
      .upsert({ wallet, item_id: itemId, tx_sig: txSig });
    if (error) throw error;
    return true;
  }
  mem.set(`${wallet}:${itemId}`, { txSig, createdAt: Date.now() });
  return true;
}

export async function grantEntitlements(wallet, itemIds, txSig) {
  for (const id of itemIds) {
    await grantEntitlement(wallet, id, txSig);
  }
  return true;
}

export async function hasEntitlement(wallet, itemId) {
  if (supabase) {
    const { data, error } = await supabase
      .from("entitlements")
      .select("wallet")
      .eq("wallet", wallet)
      .eq("item_id", itemId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }
  return mem.has(`${wallet}:${itemId}`);
}

export async function listEntitlements(wallet) {
  if (supabase) {
    const { data, error } = await supabase
      .from("entitlements")
      .select("item_id, tx_sig, created_at")
      .eq("wallet", wallet);
    if (error) throw error;
    return (data || []).map((r) => ({ itemId: r.item_id, txSig: r.tx_sig, createdAt: r.created_at }));
  }
  const out = [];
  for (const [k, v] of mem.entries()) {
    const [w, itemId] = k.split(":");
    if (w === wallet) out.push({ itemId, txSig: v.txSig, createdAt: new Date(v.createdAt).toISOString() });
  }
  return out;
}
