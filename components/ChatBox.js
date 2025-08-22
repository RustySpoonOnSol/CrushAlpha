// components/ChatBox.js
import { ALPHA_MODE } from "../utils/alpha";
import { useEffect, useMemo, useRef, useState } from "react";

/** ====== CONFIG ====== */
const MINT = process.env.NEXT_PUBLIC_CRUSH_MINT || "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";
const RPC  = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const MIN_HOLD = Number(process.env.NEXT_PUBLIC_MIN_HOLD ?? "500"); // gate: must hold >= 500

/** ====== tiny JSON-RPC helpers ====== */
async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error?.message || "RPC error");
  return j.result;
}
async function getCrushBalance(owner, mint) {
  const tokAccs = await rpc("getTokenAccountsByOwner", [
    owner,
    { mint },
    { encoding: "jsonParsed" }
  ]);
  if (!tokAccs?.value?.length) return 0;
  let total = 0;
  for (const v of tokAccs.value) {
    const ui = v?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    total += Number(ui);
  }
  return total;
}

/** ====== one-time Phantom signer (≤60s freshness) ====== */
async function signOnceWithPhantom() {
  if (!window?.solana?.isPhantom) throw new Error("Phantom not found");
  if (typeof window.solana.signMessage !== "function") {
    throw new Error("Phantom signMessage not available");
  }
  const ts = Date.now(); // server expects freshness <= 60s
  const msg = `CrushAI|chat|${ts}`;
  const encoded = new TextEncoder().encode(msg);
  const { signature } = await window.solana.signMessage(encoded, "utf8");
  return { msg, sig: Array.from(signature) };
}

export default function ChatBox({
  personaName = "Xenia",
  initialGreeting = "Hey cutie 😘 I’m all yours — flirty chat unlocked. Tiered experiences coming soon… 🔥",
  placeholder = "Say something naughty…",
  persistKey = "crush_chat_history",
  enablePersistence = true,
  stream = true,
  className = "",
  onMessageSent,
  cooldownSeconds = 10, // ⏱️ enforce N‑second delay between user sends
}) {
  /** ====== Mounted ====== */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /** ====== Chat state ====== */
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  /** ====== Cooldown ====== */
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  /** ====== Wallet Gate ====== */
  const [wallet, setWallet] = useState(null);
  const [holdBalance, setHoldBalance] = useState(0);
  const [checking, setChecking] = useState(false);
  const [gateError, setGateError] = useState("");

  /** ====== Refs ====== */
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);

  /** ====== Load history ====== */
  useEffect(() => {
    if (!mounted) return;
    if (enablePersistence) {
      try {
        const raw = localStorage.getItem(persistKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            setMessages(parsed);
            return;
          }
        }
      } catch {}
    }
    setMessages([{ id: nid(), role: "ai", text: initialGreeting, ts: Date.now() }]);
  }, [mounted, enablePersistence, persistKey, initialGreeting]);

  /** ====== Persist history ====== */
  useEffect(() => {
    if (!mounted || !enablePersistence) return;
    try { localStorage.setItem(persistKey, JSON.stringify(messages)); } catch {}
  }, [messages, mounted, enablePersistence, persistKey]);

  /** ====== Auto-scroll ====== */
  useEffect(() => {
    if (!mounted) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, mounted, loading]);

  /** ====== Cooldown ticker ====== */
  useEffect(() => {
    if (!cooldownUntil) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left === 0) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  /** ====== Wallet restore & balance check ====== */
  useEffect(() => {
    if (!mounted) return;
    const stored = localStorage.getItem("crush_wallet");
    if (stored) {
      setWallet(stored);
      refreshBalance(stored);
    } else if (window?.solana?.isPhantom) {
      window.solana.connect({ onlyIfTrusted: true })
        .then((r) => {
          const pk = r?.publicKey?.toString();
          if (pk) {
            setWallet(pk);
            try { localStorage.setItem("crush_wallet", pk); } catch {}
            refreshBalance(pk);
          }
        })
        .catch(() => {});
    }
  }, [mounted]);

  async function connectWallet() {
    try {
      setGateError("");
      if (!window?.solana?.isPhantom) {
        setGateError("Phantom not found. Install Phantom to continue.");
        return;
      }
      const resp = await window.solana.connect({ onlyIfTrusted: false });
      const pubkey = resp?.publicKey?.toString();
      if (!pubkey) throw new Error("No public key");
      setWallet(pubkey);
      try { localStorage.setItem("crush_wallet", pubkey); } catch {}
      await refreshBalance(pubkey);
    } catch (e) {
      setGateError(e?.message || "Failed to connect wallet");
    }
  }

  async function disconnectWallet() {
    try { await window?.solana?.disconnect?.(); } catch {}
    setWallet(null);
    setHoldBalance(0);
    try { localStorage.removeItem("crush_wallet"); } catch {}
  }

  async function refreshBalance(pubkey = wallet) {
    if (!pubkey) return;
    setChecking(true);
    setGateError("");
    try {
      const bal = await getCrushBalance(pubkey, MINT);
      setHoldBalance(bal);
    } catch (e) {
      setGateError("Balance check failed. Try again.");
    } finally {
      setChecking(false);
    }
  }

  const isHolder = !!wallet && holdBalance >= MIN_HOLD;
  const isHolderAlpha = ALPHA_MODE ? true : isHolder;

  /** ====== Quick emoji ====== */
  const quickEmojis = useMemo(() => ["💋", "😘", "💦", "❤️", "✨", "🔥"], []);

  /** ====== Send helpers (wallet + auth) ====== */
  async function sendJSON(text) {
    if (!wallet) throw new Error("Wallet required");
    const auth = await signOnceWithPhantom();
    const res = await fetch('/api/chat?stream=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, persona: personaName, wallet, auth }),
    });
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    return (data?.reply || "Mm… tell me more 😘").trim();
  }

  async function sendStream(text, onToken) {
    if (!wallet) throw new Error("Wallet required");
    const auth = await signOnceWithPhantom();
    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: text, persona: personaName, wallet, auth }),
    });
    if (!res.body) throw new Error('No stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let acc = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      const chunk = decoder.decode(value);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') break;
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

  /** ====== Cooldown helpers ====== */
  const isOnCooldown = () => Date.now() < cooldownUntil;
  const startCooldown = () => {
    if (cooldownSeconds > 0) {
      const until = Date.now() + cooldownSeconds * 1000;
      setCooldownUntil(until);
      setCooldownLeft(cooldownSeconds);
    }
  };

  /** ====== Send ====== */
  async function handleSend() {
    const text = input.trim();
    if (!text || loading || sendingRef.current) return;

    // 🔄 Live balance check to prevent stale UI from allowing sends
    if (!wallet) {
      setErrorText("🔌 Connect Phantom to chat.");
      return;
    }
    try {
      const liveBal = await getCrushBalance(wallet, MINT);
      setHoldBalance(liveBal); // keep UI in sync after live check
      if (liveBal < MIN_HOLD) {
        setErrorText(`🔒 Hold at least ${MIN_HOLD} $CRUSH to chat.`);
        return;
      }
    } catch {
      setErrorText("Balance check failed. Try again.");
      return;
    }

    // ⏱️ block if cooling down
    if (isOnCooldown()) {
      setErrorText(`⌛ Please wait ${cooldownLeft || Math.ceil((cooldownUntil - Date.now())/1000)}s before sending again.`);
      return;
    }

    sendingRef.current = true;
    setLoading(true);
    setErrorText("");

    const userMsg = { id: nid(), role: "user", text, ts: Date.now() };
    const aiId = nid();
    setMessages((prev) => [...prev, userMsg, { id: aiId, role: "ai", text: "", ts: Date.now() }]);
    setInput("");

    // 🎯 XP hook
    if (typeof onMessageSent === "function") {
      try { onMessageSent(text); } catch {}
    }

    try {
      if (stream) {
        await sendStream(text, (partial) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, text: partial } : m))
          );
        });
      } else {
        const reply = await sendJSON(text);
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, text: reply } : m))
        );
      }
    } catch (e) {
      setErrorText(e?.message?.includes("signMessage") ? "Phantom is missing signMessage — update wallet app." : "Oops, I slipped… try again in a sec 💕");
      setMessages((prev) =>
        prev.map((m) => (m.id === aiId ? { ...m, text: "Oops, I slipped… try again in a sec 💕" } : m))
      );
    } finally {
      setLoading(false);
      sendingRef.current = false;
      inputRef.current?.focus();
      startCooldown(); // ⏱️ begin cooldown after a send
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

  const disableInput = loading || isOnCooldown() || !isHolderAlpha;

  return (
    <div
      className={`w-full max-w-lg px-4 py-3 rounded-2xl flirty-chatbox-bg shadow-xl relative ${className}`}
      role="region"
      aria-label={`${personaName} chat`}
    >
      {/* Header */}
      <header className="mb-2 flex items-center gap-2">
        <div className="h-3 w-3 rounded-full bg-pink-400 animate-pulse" aria-hidden="true" />
        <div className="text-pink-200/90 text-sm">
          Chatting with <strong>{personaName}</strong>
          {isOnCooldown() && <span className="ml-2 text-xs">⌛ {cooldownLeft}s</span>}
        </div>
      </header>

      {/* Gate notice (inline) */}
      {!isHolderAlpha && (
        <div className="mb-3 rounded-xl border border-pink-300/40 bg-pink-500/10 text-pink-50 p-3">
          <div className="font-semibold mb-1">🔒 Chat Locked</div>
          <div className="text-sm mb-2">Hold at least <b>{MIN_HOLD}</b> $CRUSH to unlock Xenia.</div>
          <div className="flex flex-wrap items-center gap-2">
            {!wallet ? (
              <button
                onClick={connectWallet}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-semibold"
              >Connect Phantom</button>
            ) : (
              <>
                <div className="px-3 py-2 rounded-xl bg-black/30 border border-pink-300/30 text-xs">
                  <span className="opacity-80">Wallet:</span> <span className="font-mono">{wallet.slice(0,4)}…{wallet.slice(-4)}</span>
                </div>
                <button
                  onClick={disconnectWallet}
                  className="px-3 py-2 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-white text-xs border border-pink-300/40"
                >Disconnect</button>
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
              Your $CRUSH: <b>{holdBalance.toLocaleString()}</b>  &nbsp;|&nbsp; Need: <b>{MIN_HOLD}</b>
            </div>
          </div>
          {gateError && <div className="mt-2 text-xs text-pink-200/90">{gateError}</div>}
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} className="space-y-2 mb-3 max-h-[320px] overflow-y-auto pr-1 custom-scroll" aria-live="polite">
        {messages.map((m) => <Bubble key={m.id} role={m.role} text={m.text} />)}
        {loading && <TypingBubble name={personaName} />}
      </div>

      {/* Quick emojis */}
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

      {/* Composer */}
      <div className="flex items-stretch">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={!isHolderAlpha ? `Hold ${MIN_HOLD}+ $CRUSH to chat` : (isOnCooldown() ? `Wait ${cooldownLeft}s…` : placeholder)}
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
          {loading ? "…" : !isHolderAlpha ? "Locked" : isOnCooldown() ? `⌛ ${cooldownLeft}s` : "Send"}
        </button>
      </div>

      {/* Alerts */}
      {errorText ? <div className="mt-2 text-sm text-pink-200/80" role="alert">{errorText}</div> : null}

      {/* Tiny styles */}
      <style jsx>{`
        .custom-scroll { scrollbar-width: thin; scrollbar-color: #f472b6 #0000; }
        .custom-scroll::-webkit-scrollbar { width: 8px; }
        .custom-scroll::-webkit-scrollbar-thumb { border-radius: 20px; background: #f472b6aa; }

        /* 🪄 Accessibility: calm animations for users who prefer reduced motion */
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

/** ====== UI bits ====== */
function Bubble({ role, text }) {
  if (role === "ai") return <div className="flirty-animated-bubble">💖 {text || <TypingDots />}</div>;
  return <div className="sexy-user-bubble">{text} 💋</div>;
}
function TypingBubble({ name = "Xenia" }) {
  return <div className="flirty-animated-bubble" aria-label={`${name} is typing`}>💖 <TypingDots /></div>;
}
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px] align-middle">
      <span className="typing-dot">•</span>
      <span className="typing-dot" style={{ animationDelay: ".15s" }}>•</span>
      <span className="typing-dot" style={{ animationDelay: ".3s" }}>•</span>
      <style jsx>{`
        .typing-dot { display:inline-block; animation: blink 1s infinite; opacity:.2; }
        @keyframes blink { 0%,80%{opacity:.2} 40%{opacity:1} }
      `}</style>
    </span>
  );
}

/** ====== utils ====== */
function nid(size = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = ""; for (let i = 0; i < size; i++) id += chars[(Math.random()*chars.length)|0]; return id;
}
