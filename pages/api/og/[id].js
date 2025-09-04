import { ImageResponse } from '@vercel/og';
export const config = { runtime: 'edge' };

async function fetchWithTimeout(url, ms = 1500) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, cache: 'force-cache' }); return r?.ok ? r : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function loadFont() {
  const g = await fetchWithTimeout('https://fonts.gstatic.com/s/inter/v13/UcCO3Fwr0A3f.woff', 1800);
  if (g) return await g.arrayBuffer();
  const b = await fetchWithTimeout('https://og-playground.vercel.app/inter-latin-ext-700-normal.woff', 1800);
  if (b) return await b.arrayBuffer();
  throw new Error('Font fetch failed');
}
function parseCountFromRange(res) {
  const cr = res.headers.get('content-range'); if (!cr) return 0;
  const n = Number(cr.split('/')[1]); return Number.isFinite(n) ? n : 0;
}

export default async function handler(req) {
  const { pathname } = new URL(req.url);
  const id = decodeURIComponent(pathname.split('/').pop() || '').trim() || 'Unknown';
  const interData = await loadFont();

  // defaults
  let user = { name: id, wallet: id, xp: 0 };
  let rank = 1, percentile = 100;

  // live data (if envs present)
  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (SUPA_URL && SUPA_KEY) {
    const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: 'count=exact' };
    try {
      // resolve by wallet first, then name ilike
      let r = await fetchWithTimeout(`${SUPA_URL}/rest/v1/leaderboard?select=wallet,name,xp&wallet=eq.${encodeURIComponent(id)}&limit=1`, 1200);
      let row = r ? (await r.json())?.[0] : null;
      if (!row) {
        r = await fetchWithTimeout(`${SUPA_URL}/rest/v1/leaderboard?select=wallet,name,xp&name=ilike.*${encodeURIComponent(id)}*&limit=1`, 1200);
        row = r ? (await r.json())?.[0] : null;
      }
      if (row) user = row;

      const higherRes = await fetch(`${SUPA_URL}/rest/v1/leaderboard?select=wallet&xp=gt.${encodeURIComponent(user.xp)}&limit=1`, { headers });
      const totalRes  = await fetch(`${SUPA_URL}/rest/v1/leaderboard?select=wallet&limit=1`, { headers });
      const higher = higherRes.ok ? parseCountFromRange(higherRes) : 0;
      const total  = totalRes.ok  ? parseCountFromRange(totalRes)  : 0;
      rank = (higher || 0) + 1;
      percentile = total ? Math.round((rank / total) * 100) : 100;
    } catch {/* fall back to defaults */}
  }

  const title = user.name || (user.wallet ? `${user.wallet.slice(0,4)}…${user.wallet.slice(-4)}` : id);
  const xpFmt = (user.xp || 0).toLocaleString();

  return new ImageResponse(
    (
      <div style={{ width:'100%',height:'100%',display:'flex',
        background:'linear-gradient(120deg,#ffd1ec 0%,#ffb6d5 25%,#e098f8 48%,#a6a1ff 75%,#b5fffc 100%)',
        fontFamily:'Inter, system-ui, Arial' }}>
        <div style={{ display:'flex', flexDirection:'column', margin:64, gap:18 }}>
          <div style={{ fontSize:54, fontWeight:800, color:'#fff' }}>Crush AI — Flirty Leaderboard</div>
          <div style={{ fontSize:38, color:'#fff' }}>{title}</div>
          <div style={{ display:'flex', gap:22, marginTop:10 }}>
            <div style={{ display:'flex', fontSize:28, color:'#fff' }}><span>XP:&nbsp;</span><b>{xpFmt}</b></div>
            <div style={{ display:'flex', fontSize:28, color:'#fff' }}><span>Rank:&nbsp;</span><b>#{rank}</b></div>
            <div style={{ display:'flex', fontSize:28, color:'#fff' }}><span>Percentile:&nbsp;</span><b>Top {percentile}%</b></div>
          </div>
          <div style={{ marginTop:24, fontSize:22, color:'#fff', opacity:.75, fontWeight:700 }}>Chat. Flirt. Climb.</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'cache-control': 'public, max-age=300' },
      fonts: [{ name: 'Inter', data: interData, weight: 700 }],
    }
  );
}
