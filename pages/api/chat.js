// pages/api/chat.js
// Node runtime for Vercel, rate limit + wallet signature + on-chain hold gate

export const config = { runtime: "nodejs", api: { bodyParser: { sizeLimit: "1mb" } } };

import nacl from "tweetnacl";
import bs58 from "bs58";

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_INPUT_LEN = 4000;

// simple IP rate limit
const RL_WINDOW_MS = 15_000;
const RL_MAX_HITS = 6;
const rlMap = new Map();

// per-wallet cooldown
const COOLDOWN_MS = 10_000;
const lastSendMap = new Map();

const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
const RPC =
  process.env.SOLANA_RPC_PRIMARY ||
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  "https://api.mainnet-beta.solana.com";
const MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    const ip = getIP(req);
    if (!allow(ip)) return res.status(429).json({ error: "Too many requests" });

    const data = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
    const {
      message,
      history = [],
      persona = "Xenia",
      temperature = 0.9,
      model = DEFAULT_MODEL,
      wallet = null,
      auth = null,
    } = data || {};

    if (!message || typeof message !== "string")
      return res.status(400).json({ error: "Missing message" });
    if (message.length > MAX_INPUT_LEN)
      return res.status(413).json({ error: "Message too long" });

    // basic auth by wallet signature
    if (!wallet || typeof wallet !== "string" || wallet.length < 25)
      return res.status(401).json({ error: "Wallet required" });
    if (!auth || !auth.msg || !Array.isArray(auth.sig))
      return res.status(401).json({ error: "Signature required" });

    try {
      const msgBytes = new TextEncoder().encode(auth.msg);
      const sigBytes = new Uint8Array(auth.sig);
      const pubKey = bs58.decode(wallet);
      const ok = nacl.sign.detached.verify(msgBytes, sigBytes, pubKey);
      if (!ok) return res.status(401).json({ error: "Invalid signature" });
      const ts = Number(String(auth.msg).split("|")[2] || "0");
      if (!ts || Date.now() - ts > 60_000) return res.status(401).json({ error: "Expired signature" });
    } catch {
      return res.status(401).json({ error: "Bad signature" });
    }

    const now = Date.now();
    const last = lastSendMap.get(wallet) || 0;
    if (now - last < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Cooldown active. Wait ${left}s.` });
    }

    // on-chain hold gate
    const hold = await getCrushBalance(wallet, MINT).catch(() => -1);
    if (hold < MIN_HOLD) {
      return res.status(403).json({ error: `Hold at least ${MIN_HOLD} $CRUSH to chat`, hold });
    }

    const messages = [
      { role: "system", content: systemPrompt(persona) },
      ...sanitizeHistory(history),
      { role: "user", content: message },
    ];

    lastSendMap.set(wallet, now);

    // streaming SSE?
    const stream = parseBool(getQuery(req, "stream"), true);
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, temperature, stream: true, messages, max_tokens: 300 }),
      });

      if (!r.ok || !r.body) {
        const body = await r.text().catch(() => "");
        res.write(`data: ${JSON.stringify({ error: "Upstream error", body })}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder("utf-8");
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") {
            res.write("data: [DONE]\n\n");
            return res.end();
          }
          try {
            const json = JSON.parse(payload);
            const token = json?.choices?.[0]?.delta?.content;
            if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
          } catch {}
        }
      }
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // non-stream
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature, messages, max_tokens: 300 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "Upstream error", body: j });

    const reply = j?.choices?.[0]?.message?.content?.trim() || "Mm… tell me more 😘";
    return res.status(200).json({ reply, usage: j?.usage ?? null, model, persona });
  } catch {
    return res.status(500).json({ error: "Chat failed" });
  }
}

function systemPrompt(persona) {
  return `You are ${persona}, a flirty, seductive AI girlfriend for the Crush AI experience.
Keep replies short, playful, and teasing. Use light emojis (💋 😘 💖) but don't spam.
Stay safe: refuse illegal/harmful requests. Encourage users to keep chatting.`;
}
function sanitizeHistory(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(-16)
    .map((m) => {
      const role = m?.role === "assistant" || m?.role === "system" ? m.role : "user";
      const content = typeof m?.content === "string" ? m.content.slice(0, MAX_INPUT_LEN) : "";
      return { role, content };
    })
    .filter((m) => m.content);
}
function getIP(req) {
  return (
    req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}
function allow(ip) {
  const now = Date.now();
  const e = rlMap.get(ip) || { count: 0, ts: now };
  if (now - e.ts > RL_WINDOW_MS) {
    rlMap.set(ip, { count: 1, ts: now });
    return true;
  }
  if (e.count >= RL_MAX_HITS) return false;
  e.count += 1;
  rlMap.set(ip, e);
  return true;
}
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function getQuery(req, key) {
  const u = new URL(req.url, "http://localhost");
  return u.searchParams.get(key);
}
function parseBool(v, fb = false) {
  if (v == null) return fb;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.message || "RPC error");
  return j.result;
}
async function getCrushBalance(owner, mint) {
  const tokAccs = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" },
  ]);
  if (!tokAccs?.value?.length) return 0;
  let total = 0;
  for (const v of tokAccs.value) {
    const ui = v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    total += Number(ui);
  }
  return total;
}
