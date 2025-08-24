// pages/api/holdings/verify.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const owner = req.query.owner || (req.body && JSON.parse(req.body || '{}').owner) || '';
    const mint  = req.query.mint  || (req.body && JSON.parse(req.body || '{}').mint ) || '';
    if (!owner || !mint) return res.status(400).json({ error: 'owner & mint required' });

    const RPC =
      process.env.SOLANA_RPC_PRIMARY ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      'https://api.mainnet-beta.solana.com';

    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [owner, { mint }, { encoding: 'jsonParsed' }],
      }),
    }).then(x => x.json());

    const accounts = r?.result?.value || [];
    const amount = accounts.reduce((sum, a) => {
      const ui = a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
      return sum + Number(ui);
    }, 0);

    res.status(200).json({ amount });
  } catch {
    res.status(500).json({ error: 'verify failed' });
  }
}
