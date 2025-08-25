// pages/api/holdings/verify.js
// Server-side balance lookup for a given owner+mint.
// Accepts GET (query) or POST (JSON). Uses your Alchemy RPC if configured.

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  try {
    const method = req.method || "GET";

    let owner =
      req.query.owner || (req.body && JSON.parse(req.body || "{}").owner) || "";
    let mint =
      req.query.mint ||
      process.env.CRUSH_MINT ||
      process.env.NEXT_PUBLIC_CRUSH_MINT ||
      "";

    if (method === "POST" && !req.query.owner) {
      const body = JSON.parse(req.body || "{}");
      owner = body.wallet || body.owner || owner;
      mint = body.mint || mint;
    }

    if (!owner || !mint) {
      return res.status(400).json({ error: "owner & mint required", owner, mint });
    }

    const RPC =
      process.env.SOLANA_RPC_PRIMARY ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      "https://api.mainnet-beta.solana.com";

    const rpc = async (body) =>
      (await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
      })).json();

    // get all SPL token accounts for this owner+mint
    const r = await rpc({
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed" }],
    });

    if (r?.error) {
      return res.status(502).json({ error: r.error?.message || "RPC error" });
    }

    const accounts = r?.result?.value || [];
    const amount = accounts.reduce((sum, it) => {
      const ui = it?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      return sum + Number(ui);
    }, 0);

    // small CDN cache to keep things snappy
    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json({ amount, accounts: accounts.length });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
