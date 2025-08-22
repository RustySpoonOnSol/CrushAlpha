// components/XPBar.js
import React from "react";

export default function XPBar({ level, progress, need, into, className = "" }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <div className={`w-full max-w-xl mx-auto mb-3`} role="status" aria-label={`Flirt Level ${level}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-pink-100 font-semibold">Flirt Level <span className="font-extrabold">{level}</span></div>
        <div className="text-pink-200/80 text-sm">{into}/{need} XP</div>
      </div>
      <div className="flirt-progress">
        <div className="flirt-progress__value" style={{ width: `${pct}%` }} />
      </div>
      <style jsx>{`
        .flirt-progress {
          height: 10px;
          background: linear-gradient(180deg, #ffffff22, #00000011);
          border: 1px solid #ffffff22;
          border-radius: 999px;
          overflow: hidden;
        }
        .flirt-progress__value {
          height: 100%;
          background: linear-gradient(90deg, var(--accent, #ff69b4), var(--accent-2, #a873ff));
          box-shadow: 0 0 14px var(--glow, rgba(255,105,180,.6));
          transition: width .5s ease;
        }
      `}</style>
    </div>
  );
}
