// pages/api/envcheck.js
export default function handler(req, res) {
  res.json({
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasRpc:
      !!process.env.SOLANA_RPC_PRIMARY || !!process.env.NEXT_PUBLIC_SOLANA_RPC,
    hasSupabase:
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
