// components/ChatOverlay.js
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function ChatOverlay({ open, onClose, children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // lock scroll while overlay is open
  useEffect(() => {
    if (!mounted) return;
    document.body.classList.toggle("chat-lock", open);
    return () => document.body.classList.remove("chat-lock");
  }, [mounted, open]);

  if (!mounted || !open) return null;

  return createPortal(
    <>
      <div className="chat-backdrop" onClick={onClose} />
      <div className="chat-panel" role="dialog" aria-modal="true" aria-label="Chat">
        <button className="chat-close" onClick={onClose} aria-label="Close chat">×</button>
        <div className="chat-content">{children}</div>
      </div>

      <style jsx global>{`
        .chat-lock { overflow: hidden; }
        .chat-backdrop {
          position: fixed; inset: 0; z-index: 9998; background: #0b0610;
        }
        .chat-panel {
          position: fixed; inset: 0; z-index: 9999;
          display: grid; place-items: center;
          height: 100dvh; width: 100vw;
          background: radial-gradient(120% 120% at 50% -10%, #ffb6d5 0%, #7a45ff 60%, #2a0c3b 100%);
          padding: 16px; padding-bottom: max(16px, env(safe-area-inset-bottom));
          overflow: auto;
        }
        .chat-close {
          position: fixed; top: max(12px, env(safe-area-inset-top)); right: 12px;
          width: 42px; height: 42px; border-radius: 999px;
          background: rgba(255,255,255,.18); color: #fff; font-size: 24px; font-weight: 900;
          border: 1px solid rgba(255,255,255,.3);
        }
        .chat-content {
          width: 100%; max-width: 560px;
        }
      `}</style>
    </>,
    document.body
  );
}
