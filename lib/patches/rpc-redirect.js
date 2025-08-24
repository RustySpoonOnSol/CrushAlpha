// lib/patches/rpc-redirect.js
if (typeof window !== 'undefined') {
  try {
    const target = process.env.NEXT_PUBLIC_SOLANA_RPC || '';
    if (target) {
      const origFetch = window.fetch;
      window.fetch = (input, init) => {
        if (typeof input === 'string' && input.startsWith('https://api.mainnet-beta.solana.com')) {
          input = target;
        }
        return origFetch(input, init);
      };
      const OldWS = window.WebSocket;
      window.WebSocket = function (url, ...rest) {
        if (typeof url === 'string' && url.startsWith('wss://api.mainnet-beta.solana.com')) {
          url = target.replace(/^http/, 'ws'); // http->ws, https->wss
        }
        return new OldWS(url, ...rest);
      };
    }
  } catch {}
}
