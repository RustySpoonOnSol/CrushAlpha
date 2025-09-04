// pages/leaderboard.js
import { useEffect, useRef, useState, useLayoutEffect, useMemo } from "react";
import Head from "next/head";
import { useWallet } from "@solana/wallet-adapter-react";

/* ---------- ENV / RPC (holders uses Helius when present) ---------- */
const CRUSH_MINT = (process.env.NEXT_PUBLIC_CRUSH_MINT || "").replace(/:$/, "");
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_KEY;
const HELIUS_RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

/* ---------- localStorage keys ---------- */
const LS_GUEST_ID_KEY = "crush_guest_id";
const LS_DISPLAY_NAME_KEY = "crush_display_name";

/* ---------- UI guards ---------- */
const SOFT_BAN = [
  "admin","moderator","mod","owner","support","crushai","crush ai","staff",
  "fuck","shit","cunt","bitch","retard","whore","slut","faggot","cock","dick","porn","sex"
];
const RESERVED_EXACT = ["anonymous","guest","user","null","undefined"];

/* ---------- SETTINGS ---------- */
const HIDE_ANON_GUEST_ROWS = true;

/* ---------- Demo leaderboard (alpha fallback) ---------- */
const DEMO_FLIRTS = [
  { wallet: "9xp1demo1111111111111111111111111111111", name: "VelvetVibes", xp: 4200, level: 7 },
  { wallet: "9xp2demo2222222222222222222222222222222", name: "HeartSpark", xp: 3100, level: 6 },
  { wallet: "9xp3demo3333333333333333333333333333333", name: "StellarCrush", xp: 2600, level: 5 },
  { wallet: "9xp4demo4444444444444444444444444444444", name: "BlushByte", xp: 2200, level: 5 },
  { wallet: "9xp5demo5555555555555555555555555555555", name: "MoonTease", xp: 1900, level: 4 },
];

/* ---------- helpers ---------- */
function ensureGuestId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem(LS_GUEST_ID_KEY);
  if (!id) {
    const buf = new Uint8Array(8);
    (window.crypto || {}).getRandomValues?.(buf);
    id =
      "guest_" +
      Array.from(buf.length ? buf : [Date.now() & 255, (Date.now() >> 8) & 255])
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    localStorage.setItem(LS_GUEST_ID_KEY, id);
  }
  return id;
}
function short(pk){ return pk?.length>10 ? `${pk.slice(0,4)}…${pk.slice(-4)}` : (pk||"—"); }
function formatNum(n){ return (n??0).toLocaleString(undefined,{maximumFractionDigits:2}); }
function cleanName(raw){
  const v=(raw||"").trim();
  const basic=v.replace(/[^\p{L}\p{N}\s._-]/gu,"").replace(/\s+/g," ");
  return basic.slice(0,24);
}
function isInvalidName(v){
  const s=(v||"").trim();
  if(s.length<2 || s.length>24) return "Name must be 2–24 characters.";
  const lower=s.toLowerCase();
  if(RESERVED_EXACT.includes(lower)) return "That name is reserved.";
  if(SOFT_BAN.some(w=>lower.includes(w))) return "Please choose a cleaner name.";
  if(!/^[\p{L}\p{N} ._-]+$/u.test(s)) return "Only letters, numbers, space, . _ -";
  return null;
}
function formatPercentile(rank, total){
  if (!rank || rank < 1) return "1";
  if (rank === 1) return total >= 1000 ? "0.1" : "1";
  if (!total || total < 1) return "1";
  const p = (rank / total) * 100;
  if (p < 1) return Math.max(0.1, +p.toFixed(1)).toString();
  return String(Math.max(1, Math.round(p)));
}
const canon = (s) => (s || "").trim().toLowerCase();

/* ========================================================= */
export default function LeaderboardPage(){
  const { publicKey } = useWallet();
  const myWallet = publicKey ? publicKey.toBase58() : null;

  const [guestId,setGuestId] = useState(null);
  const [storedDisplayName,setStoredDisplayName] = useState("");

  useEffect(()=>{
    if(typeof window!=="undefined"){
      const gid=ensureGuestId();
      setGuestId(gid);
      setStoredDisplayName(localStorage.getItem(LS_DISPLAY_NAME_KEY)||"");
    }
  },[myWallet]);

  const myIdentifier = myWallet || guestId || null;

  /* ---------- Holders (server first, Helius fallback) ---------- */
  const [holders,setHolders] = useState([]);
  const [allHolders,setAllHolders] = useState([]);
  const [holdersLoading,setHoldersLoading] = useState(true);

  async function fetchTopHolders(){
    try{
      setHoldersLoading(true);
      // Prefer your server API (uses your Solana RPC with no CORS)
      if (CRUSH_MINT) {
        try {
          const r = await fetch(`/api/holders/top?mint=${encodeURIComponent(CRUSH_MINT)}&limit=25`);
          if (r.ok) {
            const j = await r.json();
            const list = (j?.holders||[]).map((h,i)=>({ rank:i+1, wallet:h.wallet, amount:h.amount }));
            setHolders(list); setAllHolders(list);
            return;
          }
        } catch(_) {}
      }
      // Fallback to Helius if configured
      if(!CRUSH_MINT || !HELIUS_API_KEY || !HELIUS_RPC_URL){
        setHolders([]); setAllHolders([]); return;
      }
      const perPage=1000; let page=1; let decimals=0;
      const totals=new Map(); const MAX_PAGES=10;
      while(page<=MAX_PAGES){
        const res=await fetch(HELIUS_RPC_URL,{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({
            jsonrpc:"2.0", id:`crush-top-holders-${page}`,
            method:"getTokenAccounts", params:{mint:CRUSH_MINT,page,limit:perPage}
          })
        });
        if(!res.ok) throw new Error(`Helius RPC ${res.status}`);
        const data=await res.json();
        const accounts=data?.result?.token_accounts||[];
        if(accounts.length===0) break;
        for(const acc of accounts){
          const owner=acc?.owner;
          const amtRaw=Number(acc?.amount || 0);
          if(acc?.decimals!=null) decimals=Math.max(decimals, acc.decimals);
          if(owner) totals.set(owner,(totals.get(owner)||0)+amtRaw);
        }
        if(accounts.length<perPage) break;
        page+=1;
      }
      const list=Array.from(totals.entries())
        .map(([wallet,raw])=>({wallet,amount: raw/Math.pow(10,decimals||0)}))
        .sort((a,b)=>b.amount-a.amount)
        .map((h,i)=>({rank:i+1,...h}))
        .slice(0,25);
      setHolders(list); setAllHolders(list);
    }catch(e){
      console.error(e);
      setHolders([]); setAllHolders([]);
    }finally{
      setHoldersLoading(false);
    }
  }

  /* ---------- Flirts (XP leaderboard via server API) ---------- */
  const [flirts,setFlirts] = useState([]);
  const [allFlirts,setAllFlirts] = useState([]);
  const [flirtsLoading,setFlirtsLoading] = useState(true);
  const prevRanks = useRef(new Map());
  const prevXp = useRef(new Map());
  const [shine,setShine] = useState(()=>new Set());

  // Build local/demo list, include "me" if present
  const buildLocalFlirts = useMemo(() => {
    return (meName, meId) => {
      const base = [...DEMO_FLIRTS];
      const meWallet = meId || "guest_demo_me";
      const meRow = { wallet: meWallet, name: meName || null, xp: 1200, level: 3 };
      const idx = base.findIndex(r => r.wallet === meWallet);
      if (idx >= 0) base[idx] = meRow; else base.push(meRow);
      const ranked = base
        .map(r => ({...r}))
        .sort((a,b)=> (Number(b.xp)||0)-(Number(a.xp)||0))
        .map((r,i)=> ({...r, _rank: i+1, _delta: 0}));
      return ranked;
    };
  }, []);

  function combineSelfRowsStrict(rows){
    return rows.slice().sort((a,b)=>(Number(b.xp)||0)-(Number(a.xp)||0));
  }

  async function fetchTopFlirts(){
    try{
      setFlirtsLoading(true);
      const meName = storedDisplayName;
      const meId = myWallet || guestId || "guest_demo_me";

      // Call your server API (reads Supabase on the server; no client createClient)
      let rows = [];
      try {
        const r = await fetch("/api/leaderboard/top", { headers: { "cache-control": "no-cache" } });
        if (r.ok) {
          const j = await r.json();
          rows = Array.isArray(j?.rows) ? j.rows : [];
        }
      } catch (e) {
        console.error("Leaderboard API fetch failed", e);
      }

      if (!rows.length) {
        // Fallback demo list
        rows = buildLocalFlirts(meName, meId);
      } else {
        // Ensure "me" is present
        if (!rows.some(r => r.wallet === meId)) {
          rows.push({ wallet: meId, name: meName || null, xp: 1200, level: 3 });
        }
        // Optional filter
        if (HIDE_ANON_GUEST_ROWS) {
          rows = rows.filter(r => {
            const isMyGuest = guestId && r.wallet === guestId;
            if (isMyGuest) return true;
            const isGuest = typeof r.wallet === "string" && r.wallet.startsWith("guest_");
            const nm = (r.name || "").trim().toLowerCase();
            const isAnon = !nm || nm === "anonymous";
            return !(isGuest && isAnon);
          });
        }
        rows = rows.slice().sort((a,b)=> (Number(b.xp)||0)-(Number(a.xp)||0));
      }

      // Shine effect on xp increase
      rows.forEach(r => {
        const prev = prevXp.current.get(r.wallet) || 0;
        if ((r.xp || 0) > prev) {
          setShine(s => { const n = new Set(s); n.add(r.wallet); return n; });
          setTimeout(() => setShine(s => { const n = new Set(s); n.delete(r.wallet); return n; }), 900);
        }
      });
      prevXp.current = new Map(rows.map(r => [r.wallet, r.xp || 0]));
      prevRanks.current = new Map(rows.map((r,i)=>[r.wallet,i]));

      const ranked = rows.map((r,i)=>({ ...r, _rank: i+1, _delta: 0 }));
      setAllFlirts(ranked);
      setFlirts(ranked.slice(0,25));
    }catch(e){
      console.error(e);
      setFlirts([]); setAllFlirts([]);
    }finally{
      setFlirtsLoading(false);
    }
  }

  /* ---------- Username (availability + save) [local only in alpha] ---------- */
  const [nameDraft,setNameDraft] = useState("");
  const [nameSaving,setNameSaving] = useState(false);
  const [nameMsg,setNameMsg] = useState("");
  const [availState,setAvailState] = useState("idle");
  const [initialName,setInitialName] = useState("");
  const seededNameRef = useRef(false);

  const isEditingRef = useRef(false);
  const inputRef = useRef(null);

  const lastIdentifierRef = useRef(null);
  useEffect(()=>{
    if(lastIdentifierRef.current !== (myIdentifier || "")){
      lastIdentifierRef.current = myIdentifier || "";
      seededNameRef.current = false;
    }
  },[myIdentifier]);

  useEffect(()=>{
    if(seededNameRef.current) return;
    if(isEditingRef.current) return;
    const me = myIdentifier ? allFlirts.find(r=>r.wallet===myIdentifier) : null;
    const initial = (me?.name || storedDisplayName || "").trim();
    setNameDraft(initial);
    setInitialName(initial);
    setNameMsg(""); setAvailState("idle");
    seededNameRef.current = true;
  },[myIdentifier,storedDisplayName,allFlirts]);

  useLayoutEffect(()=>{
    if(!isEditingRef.current) return;
    const el = inputRef.current;
    if(el && document.activeElement !== el){
      const pos = el.value?.length ?? 0;
      el.focus({ preventScroll: true });
      try{ el.setSelectionRange(pos,pos);}catch{}
    }
  });

  useEffect(() => {
    if (isEditingRef.current) return;
    if (!myIdentifier) return;
    const me = allFlirts.find(r => r.wallet === myIdentifier);
    if (me?.name && (!nameDraft || !initialName)) {
      setNameDraft(me.name);
      setInitialName(me.name);
      setNameMsg("");
      setAvailState("idle");
    }
  }, [allFlirts, myIdentifier, nameDraft, initialName]);

  const availReqIdRef = useRef(0);
  useEffect(()=>{
    if(!myIdentifier) return;
    const cleaned = cleanName(nameDraft);
    const msg = isInvalidName(cleaned);
    if(msg){ setAvailState("invalid"); setNameMsg(msg); return; }
    setNameMsg("");

    const id = ++availReqIdRef.current;
    const t = setTimeout(async ()=>{
      if(!cleaned || cleaned===initialName){ setAvailState("idle"); return; }
      try{
        setAvailState("checking");
        // Local “availability”: exact, case-insensitive against current board
        const target = canon(cleaned);
        const takenByOther = (allFlirts || []).some(
          (r) => r.wallet !== myIdentifier && canon(r.name) === target
        );
        if (availReqIdRef.current !== id) return;
        setAvailState(takenByOther ? "taken" : "available");
      }catch(e){
        if(id===availReqIdRef.current){
          setAvailState("error");
          setNameMsg("Couldn’t check availability.");
        }
      }
    },350);

    return ()=>clearTimeout(t);
  },[nameDraft,myIdentifier,initialName,allFlirts]);

  function saveName(){
    if(!myIdentifier){ setNameMsg("Connect a wallet or open chat first."); return; }
    const cleaned = cleanName(nameDraft);
    const msg = isInvalidName(cleaned);
    if(msg){ setNameMsg(msg); setAvailState("invalid"); return; }
    if(cleaned===initialName){ setNameMsg("Already saved."); setAvailState("idle"); return; }

    setNameSaving(true); setNameMsg("");
    try{
      // Local duplication guard
      const target = canon(cleaned);
      const takenByOther = (allFlirts || []).some(
        (r) => r.wallet !== myIdentifier && canon(r.name) === target
      );
      if (takenByOther) {
        setAvailState("taken");
        setNameMsg("Name is already taken.");
        setNameSaving(false);
        return;
      }

      // Save locally and update board
      localStorage.setItem(LS_DISPLAY_NAME_KEY, cleaned);
      setStoredDisplayName(cleaned);

      setAllFlirts(list => {
        const mapped = list.map(r => r.wallet === myIdentifier ? { ...r, name: cleaned } : r);
        return mapped;
      });
      setFlirts(list => {
        const mapped = list.map(r => r.wallet === myIdentifier ? { ...r, name: cleaned } : r);
        return mapped;
      });

      setAvailState("available");
      setInitialName(cleaned);
      setNameMsg("Saved ✓");
      addToast("Saved ✓");
    }catch(e){
      console.error(e);
      setAvailState("error");
      setNameMsg("Couldn’t save right now.");
    }finally{
      setNameSaving(false);
    }
  }

  /* ---------- lifecycle ---------- */
  useEffect(()=>{
    fetchTopHolders(); fetchTopFlirts();

    // Simple periodic refresh (demo xp tick + holders polling)
    let t1,t2;
    const start=()=>{
      t1=setInterval(()=>{
        setAllFlirts(cur=>{
          if(!cur || !cur.length) return cur;
          const idx = Math.floor(Math.random()*Math.min(cur.length,5));
          const bumped = cur.map((r,i)=> i===idx ? { ...r, xp: (r.xp||0) + Math.floor(Math.random()*6) } : r);
          const ranked = bumped.slice().sort((a,b)=>(b.xp||0)-(a.xp||0)).map((r,i)=>({ ...r, _rank:i+1 }));
          return ranked;
        });
        setFlirts(prev => {
          // keep first 25 in sync with allFlirts
          return (prev && prev.length) ? prev.slice(0,25) : [];
        });
      }, 5000);
      t2=setInterval(fetchTopHolders,60_000);
    };
    const stop=()=>{ clearInterval(t1); clearInterval(t2); };
    const onVis=()=>{ if(document.hidden) stop(); else { fetchTopFlirts(); fetchTopHolders(); start(); } };
    onVis();
    document.addEventListener("visibilitychange", onVis);

    return ()=>{ stop(); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[guestId,myWallet,storedDisplayName]);

  /* ---------- Toasts ---------- */
  const [toasts,setToasts] = useState([]);
  function addToast(text){
    const id = Math.random().toString(36).slice(2);
    setToasts(t=>[...t,{id,text}]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),1500);
  }

  /* ---------- Holders rank line ---------- */
  const prevHolderRankRef = useRef(null);
  function HoldersMyRankLine(){
    if(!myWallet || !allHolders.length) return null;
    const idx = allHolders.findIndex(h => h.wallet === myWallet);
    if(idx < 0) return null;
    const entry = allHolders[idx];
    const prevIdx = prevHolderRankRef.current;
    const delta = typeof prevIdx==="number" ? (prevIdx - idx) : 0;
    prevHolderRankRef.current = idx;

    const percentile = formatPercentile(idx+1, allHolders.length);
    const inlineStyle = { marginTop: "-22px", marginBottom: "18px", marginLeft: "6px", position: "relative", zIndex: 20 };

    return (
      <div className="hrl holders-rank-line" style={inlineStyle} aria-live="polite" role="group" aria-label="Your CRUSH rank">
        <span className="hrl-label">Your $CRUSH holders rank</span>{" "}
        <span className={`hrl-badge ${delta>0?'up':delta<0?'down':''}`}>
          #{idx + 1}{delta ? <em className="mini"> {delta>0?'▲':'▼'}{Math.abs(delta)}</em> : null}
        </span>{" "}
        <span className="hrl-cur">$CRUSH</span>{" "}
        <span className="hrl-amt">{formatNum(entry.amount)}</span>{" "}
        <span className="hrl-sub">Top {percentile}%</span>
      </div>
    );
  }

  /* ---------- Combined Name + Share UI (polished) ---------- */
  function NameEditor(){
    const statusBadge =
      availState==="checking" ? <span className="chip info">Checking…</span> :
      availState==="available" ? <span className="chip ok">Available</span> :
      availState==="taken" ? <span className="chip warn">Taken</span> :
      availState==="invalid" ? <span className="chip warn">{nameMsg||"Invalid"}</span> :
      nameMsg ? <span className="chip info">{nameMsg}</span> :
      <span className="chip tip">2–24 letters, numbers, space, . _ -</span>;

    const disableSave =
      nameSaving || !myIdentifier ||
      availState==="invalid" || availState==="taken" ||
      canon(cleanName(nameDraft))===canon(initialName) || !cleanName(nameDraft);

    const me = allFlirts.find(r => r.wallet === (myWallet || guestId));
    const total = allFlirts.length;
    const myPercentile = me ? formatPercentile(me._rank, total) : "—";

    // Share URL → /u/{name-or-wallet}
    const base =
      (process.env.NEXT_PUBLIC_SITE_URL ||
        (typeof window !== "undefined" && window.location?.origin) ||
        "").replace(/\/$/, "");
    const shareId =
      (me?.name && me.name.trim()) ||
      me?.wallet ||
      myWallet ||
      guestId ||
      "";
    const shareUrl = shareId ? `${base}/u/${encodeURIComponent(shareId)}` : "";

    const copyShare = async () => {
      if(!shareUrl) return;
      try { await navigator.clipboard.writeText(shareUrl); addToast("Share link copied"); }
      catch { prompt("Copy this share link:", shareUrl); }
    };
    const openShare = () => {
      if(!shareUrl) return;
      window.open(shareUrl, "_blank", "noopener,noreferrer");
    };
    const shareToX = () => {
      if(!me || !shareUrl) return;
      const name = (me.name && me.name.trim()) || (me.wallet?.slice(0,4) + "…" + me.wallet?.slice(-4));
      const xp = Number(me.xp || 0).toLocaleString();
      const text = `$CRUSH ${name} — Global Rank #${me._rank} (${xp} XP)`;
      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl)}`;
      window.open(intent, "_blank", "noopener,noreferrer");
    };

    return (
      <div className="ns-card" role="group" aria-label="Claim name and share">
        <div className="ns-left">
          <div className="ns-title">Claim your name</div>
          <div className="ns-inputrow">
            <input
              ref={inputRef}
              type="text"
              placeholder="e.g. MoonCrush"
              value={nameDraft}
              onChange={(e)=>{ isEditingRef.current=true; setNameDraft(e.target.value); setNameMsg(""); }}
              onFocus={()=>{ isEditingRef.current=true; }}
              onBlur={()=>{ isEditingRef.current=false; }}
              onKeyDown={(e)=>{ if(e.key==="Enter" && !disableSave) saveName(); }}
              maxLength={24}
              className={`ns-input ${availState}`}
              disabled={!myIdentifier}
              aria-invalid={availState==="invalid"||availState==="taken"}
            />
            <button className="btn btn-primary btn-pill" onClick={saveName} disabled={disableSave}>
              {nameSaving ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="ns-hint" aria-live="polite">{statusBadge}</div>
        </div>

        <div className="ns-right">
          <div className="share-title">Share your rank</div>
          <div className="share-group" role="group" aria-label="Share actions">
            <button className="btn btn-x btn-pill" onClick={shareToX} disabled={!me || !shareUrl}>
              <svg className="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M20.1 3h-3.1l-4.2 5.7L8 3H3.6l6 8.2L3 21h3.1l4.6-6.2L16 21h4.4l-6.5-8.9L20.1 3z"/></svg>
              Share to X
            </button>
            <button className="btn btn-ghost btn-pill" onClick={copyShare} disabled={!shareUrl}>
              <svg className="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>
              Copy link
            </button>
            <button className="btn btn-outline btn-pill" onClick={openShare} disabled={!shareUrl}>
              <svg className="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 4h16v16H4zM2 2v20h20V2H2zm6 6h8v8H8z"/></svg>
              Open card
            </button>
          </div>

          {me ? (
            <div className="hrl small" aria-label="Your flirt rank" aria-live="polite" role="group">
              <span className="hrl-label">Flirt rank</span>{" "}
              <span className="hrl-badge">#{me._rank}</span>{" "}
              <span className="hrl-sub">Top {myPercentile}%</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  async function copyWallet(text){
    try{
      await navigator.clipboard.writeText(text);
      addToast("Copied");
    }catch{}
  }

  return (
    <>
      <Head><title>Crush AI · Leaderboard</title></Head>

      <div className="lb-container">
        <section className="lb-section">
          <h2>Top $CRUSH Holders</h2>
          <HoldersMyRankLine />
          <div className="lb-card">
            <div className="lb-table" role="table" aria-label="Top $CRUSH holders">
              <div className="lb-row lb-head" role="row">
                <div className="lb-th w-10">#</div>
                <div className="lb-th">Wallet</div>
                <div className="lb-th w-32 text-right">Amount</div>
              </div>

              {holdersLoading ? (
                <SkeletonRows cols={[10,0,32]} rows={6}/>
              ) : holders.length===0 ? (
                <EmptyRow text={(!CRUSH_MINT||!HELIUS_API_KEY)?"Add NEXT_PUBLIC_CRUSH_MINT + NEXT_PUBLIC_HELIUS_KEY to env":"No data yet"}/>
              ) : holders.map(h=>{
                const me=myWallet && h.wallet===myWallet;
                return (
                  <div className={["lb-row",me?"lb-me":""].join(" ")} role="row" key={h.wallet}>
                    <div className="lb-td w-10">{h.rank}</div>
                    <div className="lb-td">
                      <span className="copy-wallet" role="button" tabIndex={0}
                        onClick={()=>copyWallet(h.wallet)}
                        onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); copyWallet(h.wallet);} }}>
                        {short(h.wallet)}<svg className="cp" width="14" height="14" viewBox="0 0 24 24"><path d="M9 9h10v12H9z"/><path d="M5 5h10v4H9a4 4 0 0 0-4 4V5z"/></svg>
                      </span>
                    </div>
                    <div className="lb-td w-32 text-right">{formatNum(h.amount)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lb-section">
          <h2>Top Flirts</h2>

          {/* Name + Share */}
          <NameEditor />

          <div className="lb-card">
            <div className="lb-table" role="table" aria-label="Top Flirts">
              <div className="lb-row lb-head" role="row">
                <div className="lb-th w-10">#</div>
                <div className="lb-th">Name / Wallet</div>
                <div className="lb-th w-28 text-right">XP</div>
              </div>

              {flirtsLoading ? (
                <SkeletonRows cols={[10,0,28]} rows={8}/>
              ) : flirts.length===0 ? (
                <EmptyRow text="No flirts yet — chat to earn XP!"/>
              ) : allFlirts.map(r=>{
                const me=myIdentifier && r.wallet===myIdentifier;
                return (
                  <div key={r.wallet+String(r._rank)} role="row"
                       className={[
                         "lb-row",
                         me?"lb-me":"",
                         r._delta ? "rank-change" : ""
                       ].join(" ")}>
                    <div className="lb-td w-10">
                      {r._rank}
                      {r._delta ? (
                        <span className={`delta ${r._delta>0?"up":"down"}`}>
                          {r._delta>0?"▲":"▼"} {Math.abs(r._delta)}
                        </span>
                      ) : null}
                    </div>
                    <div className="lb-td">
                      <span className="lb-name">{r.name || short(r.wallet)}</span>
                      <span className="lb-wallet copy-wallet" role="button" tabIndex={0}
                        onClick={()=>copyWallet(r.wallet)}
                        onKeyDown={(e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); copyWallet(r.wallet);} }}>
                        {short(r.wallet)}<svg className="cp" width="12" height="12" viewBox="0 0 24 24"><path d="M9 9h10v12H9z"/><path d="M5 5h10v4H9a4 4 0 0 0-4 4V5z"/></svg>
                      </span>
                    </div>
                    <div className={`lb-td w-28 text-right ${shine.has(r.wallet) ? "shine" : ""}`}>
                      {formatNum(r.xp || 0)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Toasts */}
      <div className="toasts" aria-live="polite">
        {toasts.map(t=>(
          <div key={t.id} className="toast">{t.text}</div>
        ))}
      </div>

      <style jsx>{`
        :root{
          --glow-cyan:#b5fffc; --glow-pink:#ffb6d5;
          --ink-100:#06121a; --panel:rgba(25, 5, 35, 0.58);
        }
        .lb-container{
          width:100%;
          max-width:1180px;
          margin:40px auto 56px;
          padding:0 20px;
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:40px;
        }
        @media (max-width:1024px){ .lb-container{ grid-template-columns:1fr; gap:32px; } }
        .lb-section h2{
          margin:0 0 18px 6px;
          font-size:1.35rem; line-height:1.2; font-weight:900;
          color:#fff0fc; text-shadow:0 0 8px #fa1a81, 0 0 18px #ffb6d5;
        }

        /* Rank pill (shared) */
        .hrl, .holders-rank-line{
          display:inline-flex; align-items:baseline; gap:12px;
          padding:10px 14px; border-radius:999px;
          background:linear-gradient(90deg, rgba(255,255,255,.12), rgba(255,255,255,.07));
          border:1.6px solid rgba(181,255,252,.6);
          box-shadow:0 0 26px rgba(181,255,252,.25), inset 0 0 12px rgba(181,255,252,.18);
          backdrop-filter:blur(10px) saturate(1.1);
          color:#ffe9f6; white-space:nowrap;
        }
        .hrl.small{ padding:8px 12px; gap:10px; align-self:flex-start; }
        .hrl-label{ font-weight:900; letter-spacing:.2px; opacity:.95; }
        .hrl-badge{
          padding:5px 12px; border-radius:999px; font-weight:1000; font-size:1.02rem; line-height:1;
          color:#06121a; background:radial-gradient(120% 140% at 50% -20%, var(--glow-cyan) 0%, #e098f8 65%, rgba(224,152,248,.25) 100%);
          border:1.6px solid rgba(181,255,252,.9);
        }
        .hrl.small .hrl-badge{ padding:4px 10px; font-size:.98rem; }
        .hrl-amt{ font-weight:1000; letter-spacing:.2px; opacity:.98; }
        .hrl-cur{ margin-left:6px; font-weight:900; opacity:.9; }
        .hrl-sub{ font-weight:900; opacity:.88; }

        /* --- Name & Share card (polished) --- */
        .ns-card{
          display:grid; grid-template-columns: 1fr auto; gap:22px;
          margin:8px 6px 18px; padding:16px 18px;
          border-radius:20px;
          background:rgba(255,255,255,0.08);
          border:1px solid rgba(255,255,255,.16);
          backdrop-filter: blur(8px) saturate(1.1);
        }
        @media (max-width:860px){ .ns-card{ grid-template-columns: 1fr; } }

        .ns-left{ min-width: 280px; }
        .ns-title{ font-weight:1000; color:#fff; margin:4px 0 10px 2px; letter-spacing:.2px; }

        .ns-inputrow{ display:flex; gap:12px; align-items:center; }
        .ns-input{
          flex:1 1 auto; min-width:220px;
          background:#fff; color:#000; border:1px solid rgba(0,0,0,.18);
          border-radius:14px; padding:12px 14px; font-weight:700; line-height:1.2;
          box-shadow:0 1px 0 rgba(0,0,0,.04), inset 0 6px 18px rgba(0,0,0,.08);
        }
        .ns-input.available{ box-shadow:0 0 0 3px #4ade8033, inset 0 6px 18px rgba(0,0,0,.08); }
        .ns-input.taken{ box-shadow:0 0 0 3px #fb718533, inset 0 6px 18px rgba(0,0,0,.08); }
        .ns-input.invalid{ box-shadow:0 0 0 3px #fbbf2433, inset 0 6px 18px rgba(0,0,0,.08); }
        .ns-hint{ margin-top:8px; font-weight:900; }

        .ns-right{ display:flex; flex-direction:column; align-items:flex-end; gap:12px; }
        @media (max-width:860px){ .ns-right{ align-items:flex-start; } }
        .share-title{ font-weight:900; color:#fff; opacity:.95; margin:2px 0 2px; }
        .share-group{ display:flex; flex-wrap:wrap; align-items:center; gap:12px; }

        /* Button system */
        .btn{
          display:inline-flex; align-items:center; gap:8px;
          padding:12px 16px; border-radius:12px; font-weight:1000;
          border:1px solid rgba(255,255,255,.24);
          color:#fff; background: rgba(255,255,255,.10);
          transition:transform .12s ease, box-shadow .2s ease, background .2s ease;
          white-space:nowrap;
        }
        .btn:hover:not(:disabled){ transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0,0,0,.25); }
        .btn:disabled{ opacity:.6; cursor:not-allowed; }
        .btn-pill{ border-radius:999px; }

        /* Variants */
        .btn-primary{
          background: linear-gradient(90deg,#fa1a81,#b57eff);
          box-shadow: 0 0 18px rgba(250,26,129,.45), 0 10px 22px rgba(181,126,255,.28);
        }
        .btn-primary:hover:not(:disabled){
          box-shadow: 0 16px 34px rgba(250,26,129,.55), 0 0 22px rgba(181,126,255,.45);
        }
        .btn-x{
          background: radial-gradient(140% 140% at 50% -20%, #000 0%, #171717 55%, #2a2a2a 100%);
          border-color: rgba(255,255,255,.22);
        }
        .btn-ghost{ background: rgba(255,255,255,.10); }
        .btn-outline{ background: transparent; border-color: rgba(255,255,255,.35); }

        .ic{ display:block; opacity:.92; }

        /* Table + rows */
        .lb-card{
          position:relative; border-radius:18px; padding:14px;
          background:var(--panel); backdrop-filter:blur(12px) saturate(1.35);
          border:1px solid rgba(255,255,255,.12); overflow:hidden;
        }
        .lb-table{ color:#fff; }
        .lb-row{
          display:grid; grid-template-columns:64px 1fr 160px;
          align-items:center; padding:12px 14px; border-radius:12px; line-height:1.35;
          transition:transform .12s ease, background .18s ease, box-shadow .18s ease;
        }
        .lb-row.rank-change{ animation:rise 120ms ease-out; }
        @keyframes rise{ from{ transform:translateY(3px); opacity:.92 } to{ transform:translateY(0); opacity:1 } }
        .lb-head{ position:sticky; top:0; z-index:2; background:linear-gradient(90deg, rgba(250,26,129,.28), rgba(176,126,255,.28)); border:1px solid rgba(255,255,255,.16); margin-bottom:10px; backdrop-filter: blur(8px); }
        .lb-th{ font-weight:900; color:#ffe9f6; letter-spacing:.2px; }
        .lb-td{ color:#fff; }
        .lb-row:not(.lb-head):nth-child(even){ background:rgba(255,255,255,.04); }
        .lb-row:not(.lb-head):hover{ background:rgba(250,26,129,.14); transform:translateY(-1px); }
        .lb-name{ font-weight:900; margin-right:10px; }
        .lb-wallet{ font-size:.86rem; color:#ffd1ec99; }
        .w-10{ width:64px; } .w-28{ width:140px; } .w-32{ width:160px; }
        .text-right{ text-align:right; }
        .lb-me{ background:linear-gradient(90deg, rgba(181,255,252,.18), rgba(224,152,248,.18)); outline:1.5px solid rgba(181,255,252,.6); box-shadow:0 0 0 2px rgba(255,255,255,.08) inset, 0 0 18px rgba(181,255,252,.35); }
        .delta{ font-size:.78rem; margin-left:8px; padding:2px 6px; border-radius:999px; background:rgba(255,255,255,.12); }
        .delta.up{ color:#b5fffc; } .delta.down{ color:#ffb6d5; }

        .copy-wallet{ cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        .copy-wallet .cp{ opacity:.55; transition:opacity .15s ease, transform .15s ease; }
        .copy-wallet:hover .cp{ opacity:.95; transform:translateY(-1px) scale(1.04); }

        .shine{ position:relative; }
        .shine::after{ content:""; position:absolute; inset:0; background:linear-gradient(90deg,transparent,#ffffff66,transparent); transform:translateX(-120%); animation:shine 700ms ease-out; }
        @keyframes shine{ to{ transform:translateX(120%) } }

        /* Mobile micro-polish */
        @media (max-width:380px){
          .lb-card{ padding:10px; }
          .lb-row{ padding:10px 10px; }
          .btn{ padding:10px 14px; }
          .ns-card{ padding:12px; }
          .ns-input{ padding:10px 14px; }
        }

        /* Toasts */
        .toasts{ position: fixed; right: 14px; bottom: 14px; display:flex; flex-direction:column; gap:8px; z-index: 9999; }
        .toast{ background: rgba(25,25,28,.9); color:#fff; padding:10px 14px; border-radius:10px; font-weight:900; border:1px solid rgba(255,255,255,.18); }
      `}</style>
    </>
  );
}

/* ---------- small components ---------- */
function SkeletonRows({ cols=[10,0,28], rows=6 }){
  return (
    <>
      {Array.from({length:rows}).map((_,i)=>(
        <div className="lb-row" key={i} aria-hidden="true">
          <div className="lb-td w-10"><span className="sk"/></div>
          <div className="lb-td"><span className="sk"/></div>
          {cols.slice(2).map((w,j)=>(
            <div key={j} className={'lb-td ' + (w ? ('w-' + w) : '')}>
              <span className="sk"/>
            </div>
          ))}
        </div>
      ))}

      <style jsx>{`
        .sk{
          display:inline-block; width:70%; height:12px; border-radius:8px;
          background:linear-gradient(90deg,#ffffff22,#ffffff55,#ffffff22);
          background-size:200% 100%; animation:sk 1.4s infinite;
        }
        @keyframes sk{ 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>
    </>
  );
}

function EmptyRow({ text }){
  return (
    <div className="lb-row" role="row">
      <div className="lb-td" style={{gridColumn:"1 / -1", textAlign:"center", color:"#ffd1ec"}}>
        {text}
      </div>
    </div>
  );
}
