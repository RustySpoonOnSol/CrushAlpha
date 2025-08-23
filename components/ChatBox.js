// components/ChatBox.js
// - Uses server API for balance (/api/holdings/verify) — no browser RPC (fixes 403)
// - Works with Phantom; signs a short message before chat
// - Optional alpha bypass via NEXT_PUBLIC_ALPHA_MODE="1"

import { useEffect, useMemo, useRef, useState } from "react";

const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

const MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500");
const ALPHA_MODE =
  String(process.env.NEXT_PUBLIC_ALPHA_MODE ?? "").toLowerCase() === "1";

// ---- helpers ----
function nid(size = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < size; i++) id += chars[(Math.random() * chars.length) | 0];
  return id;
}

async function serverBalance(owner, mint) {
  const res = await fetch(
    `/api/holdings/verify?owner=${encodeURIComponent(
      owner
    )}&mint=${encodeURIComponent(mint)}`
  );
  if (!res.ok) throw new Error("verify failed");
  const j = await res.json();
  return Number(j?.amount || 0);
}

async function phantomSignOnce() {
  if (!window?.solana?.isPhantom) throw new Error("Phantom not found");
  if (typeof window.solana.signMessage !== "function") {
    throw new Error("Phantom signMessage not available");
  }
  const ts = Date.now();
  const msg = `CrushAI|chat|${ts}`;
  const encoded = new TextEncoder().encode(msg);
  const { signature } = await window.solana.signMessage(encoded, "utf8");
  return { msg, sig: Array.from(signature) };
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span className="typing-dot">•</span>
      <span className="typing-dot" style={{ animationDelay: ".15s" }}>
        •
      </span>
      <span className="typing-dot" style={{ animationDelay: ".3s" }}>
        •
      </span>
      <style jsx>{`
        .typing-dot {
          display: inline-block;
          animation: blink 1s infinite;
          opacity: 0.2;
        }
        @keyframes blink {
          0%,
          80% {
            opacity: 0.2;
          }
          40% {
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}

export default function ChatBox({
  personaName = "Xenia",
  initialGreeting = "Hey cutie 😘 I’m all yours — flirty chat unlocked. Tiered experiences coming soon… 🔥",
  placeholder = "Say something naughty…",
  persistKey = "crush_chat_history",
  enablePersistence = true,
  stream = true,
  className = "",
  cooldownSeconds = 10,
  onMessageSent,
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // cooldown
  const [until, setUntil] = useState(0);
  const [coolLeft, setCoolLeft] = useState(0);
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setCoolLeft(left);
      if (left === 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [until]);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);

  // wallet gate
  const [wallet, setWallet] = useState(null);
  const [bal, setBal] = useState(0);
  const [checking, setChecking] = useState(false);
  const [gateMsg, setGateMsg] = useState("");

  useEffect(() => {
    if (!mounted) return;
    // hydrate chat
    if (enablePersistence) {
      try {
        const raw = localStorage.getItem(persistKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            setMessages(parsed);
          } else {
            setMessages([
              { id: nid(), role: "ai", text: initialGreeting, ts: Date.now() },
            ]);
          }
        } else {
          setMessages([
            { id: nid(), role: "ai", text: initialGreeting, ts: Date.now() },
          ]);
        }
      } catch {
        setMessages([
          { id: nid(), role: "ai", text: initialGreeting, ts: Date.now() },
        ]);
      }
    } else {
      setMessages([
        { id: nid(), role: "ai", text: initialGreeting, ts: Date.now() },
      ]);
    }

    // try restore wallet
    const stored = localStorage.getItem("crush_wallet");
    if (stored) {
      setWallet(stored);
      refreshBalance(stored);
    } else if (window?.solana?.isPhantom) {
      window.solana
        .connect({ onlyIfTrusted: true })
        .then((r) => {
          const pk = r?.publicKey?.toString();
          if (pk) {
            setWallet(pk);
            try {
              localStorage.setItem("crush_wallet", pk);
            } catch {}
            refreshBalance(pk);
          }
        })
        .catch(() => {});
    }
  }, [mounted, enablePersistence, persistKey, initialGreeting]);

  // persist chat
  useEffect(() => {
    if (!mounted || !enablePersistence) return;
    try {
      localStorage.setItem(persistKey, JSON.stringify(messages));
    } catch {}
  }, [messages, mounted, enablePersistence, persistKey]);

  // scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const isHolder = !!wallet && bal >= MIN_HOLD;
  const gateOpen = ALPHA_MODE ? true : isHolder;

  async function connectWallet() {
    try {
      setGateMsg("");
      if (!window?.solana?.isPhantom) {
        setGateMsg("Phantom not found. Install the Phantom extension.");
        return;
      }
      const resp = await window.solana.connect({ onlyIfTrusted: false });
      const pk = resp?.publicKey?.toString();
      if (!pk) throw new Error("No public key");
      setWallet(pk);
      try {
        localStorage.setItem("crush_wallet", pk);
      } catch {}
      await refreshBalance(pk);
    } catch (e) {
      setGateMsg(e?.message || "Failed to connect wallet");
    }
  }

  async function disconnectWallet() {
    try {
      await window?.solana?.disconnect?.();
    } catch {}
    setWallet(null);
    setBal(0);
    try {
      localStorage.removeItem("crush_wallet");
    } catch {}
  }

  async function refreshBalance(pk = wallet) {
    if (!pk) return;
    setChecking(true);
    setGateMsg("");
    try {
      const amount = await serverBalance(pk, CRUSH_MINT);
      setBal(amount);
    } catch {
      setGateMsg("Balance check failed. Try again.");
    } finally {
      setChecking(false);
    }
  }

  const onCooldown = () => Date.now() < until;
  const startCooldown = () => {
    if (cooldownSeconds > 0) {
      const u = Date.now() + cooldownSeconds * 1000;
      setUntil(u);
      setCoolLeft(cooldownSeconds);
    }
  };

  async function sendJSON(text) {
    if (!wallet) throw new Error("Wallet required");
    const auth = await phantomSignOnce();
    const res = await fetch("/api/chat?stream=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, persona: personaName, wallet, auth }),
    });
    if (!res.ok) throw new Error("Network error");
    const data = await res.json();
    return (data?.reply || "Mm… tell me more 😘").trim();
  }

  async function sendStream(text, onToken) {
    if (!wallet) throw new Error("Wallet required");
    const auth = await phantomSignOnce();
    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message: text, persona: personaName, wallet, auth }),
    });
    if (!res.body) throw new Error("No stream");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let acc = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = dec.decode(value);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") break;
        try {
          const { token } = JSON.parse(payload);
          if (token) {
            acc += token;
            onToken?.(acc);
          }
        } catch {}
      }
    }
    return acc || "Mm… tell me more 😘";
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading || sendingRef.current) return;

    // live balance gate
    if (!wallet) {
      setErr("🔌 Connect Phantom to chat.");
      return;
    }
    try {
      const live = await serverBalance(wallet, CRUSH_MINT);
      setBal(live);
      if (!ALPHA_MODE && live < MIN_HOLD) {
        setErr(`🔒 Hold at least ${MIN_HOLD} $CRUSH to chat.`);
        return;
      }
    } catch {
      setErr("Balance check failed. Try again.");
      return;
    }

    if (onCooldown()) {
      setErr(`⌛ Please wait ${coolLeft || Math.ceil((until - Date.now()) / 1000)}s.`);
      return;
    }

    sendingRef.current = true;
    setLoading(true);
    setErr("");

    const userMsg = { id: nid(), role: "user", text, ts: Date.now() };
    const aiId = nid();
    setMessages((p) => [...p, userMsg, { id: aiId, role: "ai", text: "", ts: Date.now() }]);
    setInput("");

    if (typeof onMessageSent === "function") {
      try {
        onMessageSent(text);
      } catch {}
    }

    try {
      if (stream) {
        await sendStream(text, (partial) => {
          setMessages((p) => p.map((m) => (m.id === aiId ? { ...m, text: partial } : m)));
        });
      } else {
        const reply = await sendJSON(text);
        setMessages((p) => p.map((m) => (m.id === aiId ? { ...m, text: reply } : m)));
      }
    } catch (e) {
      const msg = e?.message?.includes("signMessage")
        ? "Phantom is missing signMessage — update the wallet app."
        : "Oops, I slipped… try again in a sec 💕";
      setErr(msg);
      setMessages((p) => p.map((m) => (m.id === aiId ? { ...m, text: msg } : m)));
    } finally {
      setLoading(false);
      sendingRef.current = false;
      inputRef.current?.focus();
      startCooldown();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!mounted) {
    return <div suppressHydrationWarning style={{ minHeight: 360 }} className={className} />;
  }

  const disableInput = loading || onCooldown() || !gateOpen;

  return (
    <div className={`w-full max-w-lg px-4 py-3 rounded-2xl flirty-chatbox-bg shadow-xl relative ${className}`}>
      {/* header */}
      <header className="mb-2 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-pink-400 animate-pulse" aria-hidden="true" />
        <div className="text-pink-200/90 text-sm">
          Chatting with <strong>{personaName}</strong>
          {onCooldown() && <span className="ml-2 text-xs">⌛ {coolLeft}s</span>}
        </div>
      </header>

      {/* gate UI */}
      {!gateOpen && (
        <div className="mb-3 rounded-xl border border-pink-300/40 bg-pink-500/10 text-pink-50 p-3">
          <div className="font-semibold mb-1">🔒 Chat Locked</div>
          <div className="text-sm mb-2">
            Hold at least <b>{MIN_HOLD}</b> $CRUSH to unlock Xenia.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!wallet ? (
              <button
                onClick={connectWallet}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold"
              >
                Connect Phantom
              </button>
            ) : (
              <>
                <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-xs">
                  <span className="opacity-80">Wallet:</span>{" "}
                  <span className="font-mono">
                    {wallet.slice(0, 4)}…{wallet.slice(-4)}
                  </span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="px-3 py-2 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-white text-xs border border-pink-300/40"
                >
                  Disconnect
                </button>
              </>
            )}
            <button
              onClick={() => refreshBalance()}
              disabled={!wallet || checking}
              className="px-3 py-2 rounded-xl bg-pink-500 text-white text-xs font-semibold disabled:opacity-60"
            >
              {checking ? "Checking…" : "Refresh Balance"}
            </button>
            <div className="text-xs text-pink-100/90">
              Your $CRUSH: <b>{bal.toLocaleString()}</b> &nbsp;|&nbsp; Need: <b>{MIN_HOLD}</b>
            </div>
          </div>
          {gateMsg && <div className="mt-2 text-xs text-pink-200/90">{gateMsg}</div>}
        </div>
      )}

      {/* messages */}
      <div
        ref={listRef}
        className="space-y-2 mb-3 max-h-[320px] overflow-y-auto pr-1 custom-scroll"
        aria-live="polite"
      >
        {messages.map((m) =>
          m.role === "ai" ? (
            <div key={m.id} className="flirty-animated-bubble">
              💖 {m.text || <TypingDots />}
            </div>
          ) : (
            <div key={m.id} className="sexy-user-bubble">
              {m.text} 💋
            </div>
          )
        )}
        {loading && (
          <div className="flirty-animated-bubble" aria-label={`${personaName} is typing`}>
            💖 <TypingDots />
          </div>
        )}
      </div>

      {/* quick emojis */}
      <div className="flex flex-wrap gap-2 mb-2" aria-label="Quick emoji">
        {["💋", "😘", "💦", "❤️", "✨", "🔥"].map((e) => (
          <button
            key={e}
            type="button"
            className="px-2 py-1 rounded-lg bg-pink-500/15 hover:bg-pink-500/25 border border-pink-400/30 text-lg"
            onClick={() => setInput((v) => v + e)}
            aria-label={`Insert ${e}`}
            disabled={disableInput}
          >
            {e}
          </button>
        ))}
      </div>

      {/* composer */}
      <div className="flex items-stretch">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={
            !gateOpen ? `Hold ${MIN_HOLD}+ $CRUSH to chat` : onCooldown() ? `Wait ${coolLeft}s…` : placeholder
          }
          aria-label="Message"
          className="flex-grow p-3 rounded-l-xl flirty-input border-0 focus:outline-none focus:ring-0 resize-none leading-6"
          disabled={disableInput}
        />
        <button
          onClick={handleSend}
          className="px-5 py-3 bg-pink-500 text-white rounded-r-xl hover:bg-pink-600 disabled:opacity-60"
          disabled={disableInput || !input.trim()}
          aria-label="Send message"
        >
          {loading ? "…" : !gateOpen ? "Locked" : onCooldown() ? `⌛ ${coolLeft}s` : "Send"}
        </button>
      </div>

      {err ? (
        <div className="mt-2 text-sm text-pink-200/80" role="alert">
          {err}
        </div>
      ) : null}

      <style jsx>{`
        .custom-scroll {
          scrollbar-width: thin;
          scrollbar-color: #f472b6 #0000;
        }
        .custom-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          border-radius: 20px;
          background: #f472b6aa;
        }
        @media (prefers-reduced-motion: reduce) {
          .flirty-animated-bubble,
          .typing-dot,
          .animate-pulse {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>
    </div>
  );
}
