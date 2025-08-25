// pages/api/holdings/verify.js
// Robust server-side balance lookup for a given owner+mint.
// - Accepts GET (query) and POST (JSON)
// - Uses your Alchemy RPC (or falls back to public if missing)
// - Tries both getTokenAccountsByOwner and getParsedProgramAccounts
// - Supports SPL Token (Tokenkeg...) and Token-2022 (TokenzQd...)

export const config = { runtime: "nodejs" };

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

function rpcEndpoint() {
  return (
    process.env.SOLANA_RPC_PRIMARY ||
    process.env.NEXT_PUBLIC_SOLANA_RPC ||
    "https://api.mainnet-beta.solana.com"
  );
}

async function rpcCall(body) {
  const r = await fetch(rpcEndpoint(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  return r.json();
}

function sumUiAmount(list) {
  return (list || []).reduce((sum, it) => {
    const ui = it?.account?.data?.parsed?.info?.tokenAmount;
    const v =
      typeof ui?.uiAmount === "number"
        ? ui.uiAmount
        : ui?.amount && ui?.decimals >= 0
        ? Number(ui.amount) / Math.pow(10, ui.decimals)
        : 0;
    return sum + Number(v || 0);
  }, 0);
}

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

    if (method === "POST") {
      const body = JSON.parse(req.body || "{}");
      owner = body.wallet || body.owner || owner;
      mint = body.mint || mint;
    }

    if (!owner || !mint) {
      return res.status(400).json({ error: "owner & mint required", owner, mint });
    }

    // 1) Primary: getTokenAccountsByOwner (jsonParsed)
    const byOwner = await rpcCall({
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });

    if (byOwner?.error) {
      // continue to fallbacks, but keep the error around
    }

    let accounts = byOwner?.result?.value || [];
    let amount = sumUiAmount(accounts);

    // 2) Fallback A: Token Program (legacy) via getParsedProgramAccounts
    if (amount === 0) {
      const parsedLegacy = await rpcCall({
        method: "getParsedProgramAccounts",
        params: [
          TOKEN_PROGRAM,
          {
            filters: [
              { memcmp: { offset: 0, bytes: mint } },   // mint at offset 0
              { memcmp: { offset: 32, bytes: owner } }, // owner at offset 32
              { dataSize: 165 }, // classic token account size
            ],
            encoding: "jsonParsed",
            commitment: "confirmed",
          },
        ],
      });

      if (!parsedLegacy?.error && Array.isArray(parsedLegacy?.result)) {
        amount = sumUiAmount(parsedLegacy.result);
        if (amount > 0) {
          accounts = parsedLegacy.result;
        }
      }
    }

    // 3) Fallback B: Token-2022 Program via getParsedProgramAccounts (no dataSize; accounts may have extensions)
    if (amount === 0) {
      const parsed2022 = await rpcCall({
        method: "getParsedProgramAccounts",
        params: [
          TOKEN_2022_PROGRAM,
          {
            filters: [
              { memcmp: { offset: 0, bytes: mint } },
              { memcmp: { offset: 32, bytes: owner } },
            ],
            encoding: "jsonParsed",
            commitment: "confirmed",
          },
        ],
      });

      if (!parsed2022?.error && Array.isArray(parsed2022?.result)) {
        amount = sumUiAmount(parsed2022.result);
        if (amount > 0) {
          accounts = parsed2022.result;
        }
      }
    }

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(200).json({
      amount,
      accounts: accounts.length,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
