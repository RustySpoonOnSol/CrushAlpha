// pages/api/debug/rpc.js
export const config = { runtime: "nodejs" };
export default async function handler(req, res) {
  const RPC =
    process.env.SOLANA_RPC_PRIMARY ||
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    "https://api.mainnet-beta.solana.com";
  try {
    const r = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getVersion", params: [] }),
    });
    const j = await r.json();
    res.status(200).json({ ok: true, rpc: RPC, version: j?.result });
  } catch (e) {
    res.status(500).json({ ok: false, rpc: RPC, error: String(e?.message || e) });
  }
}
