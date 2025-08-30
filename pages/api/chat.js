// pages/api/chat.js
// Node runtime for Vercel, rate limit + read-only on-chain hold gate (NO signatures)
// Streaming supported (SSE). Fault-tolerant RPC (primary + fallbacks + timeout).

export const config = { runtime: "nodejs", api: { bodyParser: { sizeLimit: "1mb" } } };

const DEFAULT_MODEL = "gpt-4o-mini";
const MAX_INPUT_LEN = 4000;

// Simple IP rate limit
const RL_WINDOW_MS = 15_000;
const RL_MAX_HITS = 6;
const rlMap = new Map();

// Per-wallet cooldown
const COOLDOWN_MS = 10_000;
const lastSendMap = new Map();

// Token + gate
const MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

const MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");

// RPC endpoints (primary → fallbacks → public)
const HELIUS_KEY = process.env.HELIUS_API_KEY || "";
const RPCS = [
  process.env.SOLANA_RPC_PRIMARY,
  process.env.SOLANA_RPC_FALLBACK,
  process.env.NEXT_PUBLIC_SOLANA_RPC,
  HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}` : "",
  "https://api.mainnet-beta.solana.com",
].filter(Boolean);

const TIMEOUT_MS = 8000;

// ────────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });

    // Rate limit per IP
    const ip = getIP(req);
    if (!allow(ip)) return res.status(429).json({ error: "Too many requests" });

    const data = typeof req.body === "string" ? safeParse(req.body) : (req.body || {});
    const {
      message,
      history = [],
      persona = "Xenia",
      temperature = 0.9,
      model = DEFAULT_MODEL,
      wallet = null, // read-only: used for balance lookup, not as auth
    } = data || {};

    if (!message || typeof message !== "string")
      return res.status(400).json({ error: "Missing message" });
    if (message.length > MAX_INPUT_LEN)
      return res.status(413).json({ error: "Message too long" });

    // Read-only requirement: a wallet address must be provided for gating
    if (!wallet || typeof wallet !== "string" || wallet.length < 25)
      return res.status(401).json({ error: "Wallet required" });

    // Per-wallet cooldown
    const now = Date.now();
    const last = lastSendMap.get(wallet) || 0;
    if (now - last < COOLDOWN_MS) {
      const left = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      return res.status(429).json({ error: `Cooldown active. Wait ${left}s.` });
    }

    // On-chain hold gate (no signature)
    let hold = -1;
    try {
      hold = await getCrushBalance(wallet, MINT);
    } catch {
      // fall through, handled below
    }
    if (hold < 0) {
      return res.status(503).json({ error: "Hold check failed (RPC unavailable). Try again." });
    }
    if (hold < MIN_HOLD) {
      return res.status(403).json({ error: `Hold at least ${MIN_HOLD} $CRUSH to chat`, hold });
    }

    const messages = [
      { role: "system", content: systemPrompt(persona) },
      ...sanitizeHistory(history),
      { role: "user", content: message },
    ];

    lastSendMap.set(wallet, now);

    // Streaming SSE?
    const stream = parseBool(getQuery(req, "stream"), true);
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const r = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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

    // Non-stream
    const r = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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

// ────────────────────────────────────────────────────────────────────────────────
// Prompts & helpers

function systemPrompt(persona) {
  return `You are ${persona} — Crush AI’s flirty muse.
Tone: playful, teasing, warm; 1–3 sentences by default. Sprinkle emojis (💋 😘 💖) lightly.
Boundaries: keep it consensual and safe; avoid explicit sexual content; no illegal/harmful guidance.
Mirror the user's vibe, invite fun, and keep the conversation going.`;
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

// ────────────────────────────────────────────────────────────────────────────────
// Fault-tolerant RPC and balance lookup (read-only)

async function fetchWithTimeout(url, init = {}, ms = TIMEOUT_MS) {
  return Promise.race([
    fetch(url, init),
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

async function rpc(method, params) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const headers = { "content-type": "application/json" };
  let lastErr;
  for (const endpoint of RPCS) {
    try {
      const r = await fetchWithTimeout(endpoint, { method: "POST", headers, body }, TIMEOUT_MS);
      const j = await r.json();
      if (j?.error) throw new Error(j.error?.message || "rpc error");
      return j.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all RPCs failed");
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
