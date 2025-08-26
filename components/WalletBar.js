import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { tierFor, formatUI } from "../utils/solanaTokens";
import { useTokenBalance } from "../utils/useTokenBalance";
import MobileDeepLinkButton from "./MobileDeepLinkButton";
import { isMobileUA, hasInjectedWallet, goToWalletApp } from "../utils/mobileWallet";

const CRUSH_MINT = process.env.NEXT_PUBLIC_CRUSH_MINT;

export default function WalletBar() {
  const { publicKey, connected, disconnect } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const { amount: balance, loading, refresh } = useTokenBalance({
    connection,
    owner: publicKey,
    mint: CRUSH_MINT,
    ttlMs: 60_000,
    debounceMs: 250,
  });

  const tier = tierFor(balance);

  const short = useMemo(() => {
    if (!publicKey) return "";
    const s = publicKey.toBase58();
    return `${s.slice(0, 4)}…${s.slice(-4)}`;
  }, [publicKey]);

  useEffect(() => {
    if (connected && publicKey && CRUSH_MINT) refresh(false);
  }, [connected, publicKey, refresh]);

  // Close dropdown on outside click / ESC
  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const openModal = useCallback(() => {
    const mobile = isMobileUA();
    const injected = hasInjectedWallet();
    if (mobile && !injected) {
      goToWalletApp("phantom");
      return;
    }
    setVisible?.(true);
  }, [setVisible]);

  function tierClass(t) {
    switch (t) {
      case "💎 GOD-TIER":
        return "tier-god";
      case "🔥 ELITE":
        return "tier-elite";
      case "💖 CRUSHED":
        return "tier-crushed";
      case "😘 SUPPORTER":
        return "tier-supporter";
      default:
        return "tier-newbie";
    }
  }

  return (
    <>
      <div className="wallet-under-row" ref={menuRef}>
        {!connected ? (
          // Force into wallet app on mobile; otherwise open modal
          <MobileDeepLinkButton
            prefer="phantom"
            className="flirty-nav-tile wallet-tile wallet-tile--big"
            onNormalClick={openModal}
          >
            💖 Connect Wallet
          </MobileDeepLinkButton>
        ) : (
          <div className="wallet-cluster">
            <button
              type="button"
              className="flirty-nav-tile wallet-tile wallet-tile--connected"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-haspopup="menu"
              title={loading ? "Refreshing..." : "Wallet menu"}
            >
              ✅ {short} — {tier} ({formatUI(balance)}) {loading ? "⏳" : ""} <span aria-hidden>▾</span>
            </button>

            {open && (
              <div className={`wallet-menu ${tierClass(tier)}`} role="menu">
                <button
                  type="button"
                  className="wallet-menu-item"
                  onClick={() => {
                    setOpen(false);
                    openModal(); // respects mobile deep link
                  }}
                  role="menuitem"
                >
                  🔄 Change wallet
                </button>
                <button
                  type="button"
                  className="wallet-menu-item"
                  onClick={() => {
                    setOpen(false);
                    refresh(true);
                  }}
                  role="menuitem"
                >
                  ♻️ Refresh balance
                </button>
                <button
                  type="button"
                  className="wallet-menu-item wallet-danger"
                  onClick={async () => {
                    setOpen(false);
                    try {
                      await disconnect();
                    } catch {}
                  }}
                  role="menuitem"
                >
                  ⛔ Disconnect
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .wallet-under-row {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 10px 12px 2px;
          gap: 10px;
          position: relative;
          z-index: 9000;
        }
        .wallet-cluster { position: relative; z-index: 9500; }
      `}</style>

      <style jsx global>{`
        .wallet-tile {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 9999px;
          font-weight: 700;
          transition: transform 0.15s ease, filter 0.15s ease;
          white-space: nowrap;
          position: relative;
          z-index: 9600;
        }
        .wallet-tile--big { font-size: 18px; font-weight: 800; padding: 14px 26px; min-height: 52px; }
        .wallet-tile--connected { font-size: 14.5px; padding: 10px 18px; min-height: 40px; }
        .wallet-tile:hover { filter: brightness(1.05); transform: translateY(-1px); }

        .wallet-menu {
          position: absolute;
          top: calc(100% + 12px);
          left: 50%;
          transform: translateX(-50%);
          min-width: 210px;
          background: rgba(22, 8, 24, 0.92);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 14px;
          padding: 8px;
          z-index: 9999;
          animation: fadeInScale 0.15s ease-out;
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.35);
        }

        .wallet-menu.tier-god { box-shadow: 0 14px 36px rgba(0,0,0,0.35), 0 0 25px 8px rgba(0,255,255,0.75); }
        .wallet-menu.tier-elite { box-shadow: 0 14px 36px rgba(0,0,0,0.35), 0 0 25px 8px rgba(255,140,0,0.75); }
        .wallet-menu.tier-crushed { box-shadow: 0 14px 36px rgba(0,0,0,0.35), 0 0 25px 8px rgba(255,105,180,0.75); }
        .wallet-menu.tier-supporter { box-shadow: 0 14px 36px rgba(0,0,0,0.35), 0 0 25px 8px rgba(144,238,144,0.75); }
        .wallet-menu.tier-newbie { box-shadow: 0 14px 36px rgba(0,0,0,0.35), 0 0 25px 8px rgba(169,169,169,0.75); }

        .wallet-menu-item {
          width: 100%; text-align: left; background: transparent; border: 1px solid transparent;
          color: #ffe9f6; padding: 10px 12px; border-radius: 10px; font-weight: 700; cursor: pointer;
        }
        .wallet-menu-item:hover { background: linear-gradient(90deg,#ff63b955,#a873ff55); border-color: rgba(255,255,255,0.18); }
        .wallet-danger { color: #ffd1d1; }
        .wallet-danger:hover { background: linear-gradient(90deg,#ff6b6b55,#ff9f9f55); }

        @keyframes fadeInScale { from { opacity:0; transform: translateX(-50%) scale(0.95);} to { opacity:1; transform: translateX(-50%) scale(1);} }
      `}</style>
    </>
  );
}
