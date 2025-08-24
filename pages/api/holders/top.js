// pages/api/holders/top.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    const mint = req.query.mint || '';
    const limit = Math.min(parseInt(req.query.limit || '25', 10), 50);
    if (!mint) return res.status(400).json({ error: 'mint required' });

    const RPC =
      process.env.SOLANA_RPC_PRIMARY ||
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      'https://api.mainnet-beta.solana.com';
    const rpc = async (body) =>
      (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();

    const largest = await rpc({
      jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts',
      params: [mint, { commitment: 'confirmed' }],
    });
    const addrs = (largest?.result?.value || []).slice(0, limit).map(x => x.address);

    const infos = addrs.length
      ? await rpc({ jsonrpc: '2.0', id: 2, method: 'getMultipleAccounts', params: [addrs, { encoding: 'jsonParsed' }] })
      : { result: { value: [] } };

    const holders = (infos?.result?.value || []).map((acc, i) => {
      const parsed = acc?.data?.parsed;
      const owner = parsed?.info?.owner || '';
      const amount = parsed?.info?.tokenAmount?.uiAmount || 0;
      return { rank: i + 1, wallet: owner, amount };
    });

    res.status(200).json({ holders });
  } catch {
    res.status(500).json({ error: 'holders failed' });
  }
}
