export const config = { runtime: "nodejs" };
import { createClient } from "@vercel/kv";

const kv = createClient({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    const key = "kv:selftest";
    const val = { ts: Date.now() };
    await kv.set(key, val, { ex: 60 });
    const back = await kv.get(key);
    res.status(200).json({ ok: true, wrote: val, read: back });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
