// utils/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Works with either NEXT_PUBLIC_* (browser) or server-only names if you add them later
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

// Only init when both vars exist; otherwise export null in alpha
export const supabase = hasSupabase ? createClient(supabaseUrl, supabaseAnonKey) : null;
