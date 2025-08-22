// utils/useXP.js
import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "crush_flirt_xp_v1";
const EVT = "crush_xp_updated";

// Level curve: base 100 XP for L1→L2, grows 1.4× per level
const BASE = 100;
const GROWTH = 1.4;

function needFor(level) {
  // XP needed to go from "level" to "level+1"
  return Math.round(BASE * Math.pow(GROWTH, Math.max(0, level - 1)));
}

function calcFromXP(totalXP) {
  let lvl = 1;
  let xpLeft = totalXP;
  while (true) {
    const need = needFor(lvl);
    if (xpLeft < need) {
      const progress = need > 0 ? xpLeft / need : 0;
      return { level: lvl, progress, need, into: xpLeft, total: totalXP };
    }
    xpLeft -= need;
    lvl += 1;
  }
}

export function useXP() {
  const [totalXP, setTotalXP] = useState(0);

  // load once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTotalXP(Math.max(0, parseInt(raw, 10) || 0));
    } catch {}
  }, []);

  // stay in sync across components/tabs
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue != null) {
        const v = Math.max(0, parseInt(e.newValue, 10) || 0);
        setTotalXP(v);
      }
    };
    const onCustom = (e) => {
      if (typeof e.detail?.xp === "number") setTotalXP(e.detail.xp);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT, onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT, onCustom);
    };
  }, []);

  const state = useMemo(() => calcFromXP(totalXP), [totalXP]);

  const setXP = useCallback((xp) => {
    const clamped = Math.max(0, Math.floor(xp));
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {}
    setTotalXP(clamped);
    // notify other hooks
    window.dispatchEvent(new CustomEvent(EVT, { detail: { xp: clamped } }));
  }, []);

  const addXP = useCallback((delta) => {
    const add = Math.max(0, Math.floor(delta));
    if (!add) return state;
    const next = totalXP + add;
    setXP(next);
    return calcFromXP(next);
  }, [totalXP, setXP, state]);

  const resetXP = useCallback(() => setXP(0), [setXP]);

  return { totalXP, ...state, addXP, setXP, resetXP, needFor };
}
