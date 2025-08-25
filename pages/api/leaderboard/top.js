// pages/api/leaderboard/top.js
// Returns top XP rows from Supabase via the server (no client Supabase).
// Works with SUPABASE_SERVICE_ROLE if present; otherwise uses anon.
// Response: { rows: [{ wallet, name, xp, level }, ...] }

export const config = { runtime: "nodejs" };

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE; // optional, server-only

function sb() {
  const key = SERVICE || ANON;
  if (!URL || !key) throw new Error("Supabase envs missing");
  return createClient(URL, key, { auth: { persistSession: false } });
}

export default async function handler(_req, res) {
  try {
    const supa = sb();
    const { data, error } = await supa
      .from("leaderboard")
      .select("wallet,name,xp,level")
      .order("xp", { ascending: false })
      .limit(50);

    if (error) throw error;

    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");
    res.status(200).json({ rows: data || [] });
  } catch (e) {
    // stay resilient: return empty rows so UI still renders
    res.status(200).json({ rows: [], error: String(e?.message || e) });
  }
}
