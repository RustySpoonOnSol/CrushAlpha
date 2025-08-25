// pages/api/holdings/verify-debug.js
// Diagnostic endpoint to help pinpoint why amount is 0 in production.

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

async function rpc(body) {
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
    const owner = req.query.owner || "";
    const mint =
      req.query.mint ||
      process.env.CRUSH_MINT ||
      process.env.NEXT_PUBLIC_CRUSH_MINT ||
      "";
    if (!owner || !mint) {
      return res.status(400).json({ error: "owner & mint required", owner, mint });
    }

    const steps = [];
    // A) byOwner
    const byOwner = await rpc({
      method: "getTokenAccountsByOwner",
      params: [owner, { mint }, { encoding: "jsonParsed", commitment: "confirmed" }],
    });
    steps.push({
      step: "getTokenAccountsByOwner",
      error: byOwner?.error || null,
      count: byOwner?.result?.value?.length || 0,
      sum: sumUiAmount(byOwner?.result?.value || []),
      sample: (byOwner?.result?.value || []).slice(0, 2),
    });

    // B) token program (legacy)
    const parsedLegacy = await rpc({
      method: "getParsedProgramAccounts",
      params: [
        TOKEN_PROGRAM,
        {
          filters: [
            { memcmp: { offset: 0, bytes: mint } },
            { memcmp: { offset: 32, bytes: owner } },
            { dataSize: 165 },
          ],
          encoding: "jsonParsed",
          commitment: "confirmed",
        },
      ],
    });
    steps.push({
      step: "getParsedProgramAccounts (Token Program)",
      error: parsedLegacy?.error || null,
      count: Array.isArray(parsedLegacy?.result) ? parsedLegacy.result.length : 0,
      sum: sumUiAmount(parsedLegacy?.result || []),
      sample: Array.isArray(parsedLegacy?.result) ? parsedLegacy.result.slice(0, 2) : [],
    });

    // C) token-2022 program
    const parsed2022 = await rpc({
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
    steps.push({
      step: "getParsedProgramAccounts (Token-2022)",
      error: parsed2022?.error || null,
      count: Array.isArray(parsed2022?.result) ? parsed2022.result.length : 0,
      sum: sumUiAmount(parsed2022?.result || []),
      sample: Array.isArray(parsed2022?.result) ? parsed2022.result.slice(0, 2) : [],
    });

    res.status(200).json({
      rpc: rpcEndpoint(),
      owner,
      mint,
      steps,
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}
