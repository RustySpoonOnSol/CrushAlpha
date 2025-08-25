// lib/supa.js
import { createClient } from "@supabase/supabase-js";

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let _client = null;
export function supa() {
  if (!_client && url && anon) {
    _client = createClient(url, anon, {
      auth: { persistSession: false, storageKey: "crush_anon_v1" },
    });
  }
  return _client;
}
