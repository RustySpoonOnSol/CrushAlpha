export const config = { runtime: "edge" };

const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK
].filter(Boolean);

const MINT = process.env.NEXT_PUBLIC_CRUSH_MINT;

// Define your tiers here
const TIERS = [
  { name: "FREE",  min: 0 },
  { name: "BRONZE", min: 1_000 },
  { name: "SILVER", min: 10_000 },
  { name: "GOLD",   min: 100_000 },
  { name: "DIAMOND",min: 1_000_000 },
];

async function rpcFetch(url, body, { signal, timeoutMs = 3500 } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: signal || ctrl.signal
    });
    if (!res.ok) throw new Error(`RPC ${res.status}`);
    return await res.json();
  } finally { clearTimeout(id); }
}

function mapTier(amount) {
  let best = TIERS[0];
  for (const t of TIERS) if (amount >= t.min) best = t;
  return best;
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get("address");
    if (!address || !MINT) {
      return new Response(JSON.stringify({ error: "Missing address or mint" }), { status: 400 });
    }

    // RPC body: get all token accounts for owner filtered by mint
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenAccountsByOwner",
      params: [
        address,
        { mint: MINT },
        { encoding: "jsonParsed", commitment: "confirmed" }
      ]
    };

    let lastErr;
    for (const rpc of RPCS.length ? RPCS : ["https://api.mainnet-beta.solana.com"]) {
      try {
        const json = await rpcFetch(rpc, body, { timeoutMs: 3500 });
        const accounts = json?.result?.value || [];
        let uiAmount = 0;
        let decimals = 0;

        for (const acc of accounts) {
          const info = acc?.account?.data?.parsed?.info;
          const amt = info?.tokenAmount;
          if (!amt) continue;
          decimals = amt.decimals ?? decimals;
          uiAmount += Number(amt.uiAmount || 0);
        }

        const tier = mapTier(uiAmount);
        return new Response(JSON.stringify({
          address,
          mint: MINT,
          uiAmount,
          decimals,
          tier
        }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" }
        });
      } catch (e) { lastErr = e; }
    }
    return new Response(JSON.stringify({ error: String(lastErr || "RPC failed") }), { status: 502 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || "Error" }), { status: 500 });
  }
}
