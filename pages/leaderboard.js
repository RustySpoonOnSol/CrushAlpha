// pages/leaderboard.js
import { useEffect, useRef, useState, useLayoutEffect } from "react";
import Head from "next/head";
import { supabase } from "../utils/supabaseClient";
import { useWallet } from "@solana/wallet-adapter-react";

/* ---------- ENV / RPC ---------- */
const CRUSH_MINT = (process.env.NEXT_PUBLIC_CRUSH_MINT || "").replace(/:$/, "");
const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_KEY;
const HELIUS_RPC_URL = HELIUS_API_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
  : null;

/* ---------- localStorage keys ---------- */
const LS_GUEST_ID_KEY = "crush_guest_id";
const LS_DISPLAY_NAME_KEY = "crush_display_name";
const LS_MERGED_KEY = "crush_guest_merged";

/* ---------- UI guards ---------- */
const SOFT_BAN = [
  "admin","moderator","mod","owner","support","crushai","crush ai","staff",
  "fuck","shit","cunt","bitch","retard","whore","slut","faggot","cock","dick","porn","sex"
];
const RESERVED_EXACT = ["anonymous","guest","user","null","undefined"];

/* ---------- SETTINGS ---------- */
const HIDE_ANON_GUEST_ROWS = true;

/* ---------- helpers ---------- */
function ensureGuestId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem(LS_GUEST_ID_KEY);
  if (!id) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    id = "guest_" + Array.from(buf).map(b => b.toString(16).padStart(2, "0")).join("");
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

/* Percentile formatter (smart; never 100% for #1) */
function formatPercentile(rank, total){
  if (!rank || rank < 1) return "1";
  if (rank === 1) return total >= 1000 ? "0.1" : "1";
  if (!total || total < 1) return "1";
  const p = (rank / total) * 100;
  if (p < 1) return Math.max(0.1, +p.toFixed(1)).toString();
  return String(Math.max(1, Math.round(p)));
}

/* Build a safe ILIKE pattern and do case-insensitive EXACT collision check client-side */
function buildIlikePattern(s){
  // escape SQL wildcards so we don't accidentally broaden the match
  const escaped = s.replace(/[%_]/g, "\\$&");
  return `%${escaped}%`;
}
function canon(s){ return (s||"").trim().toLowerCase(); }

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

  /* ---------- Holders ---------- */
  const [holders,setHolders] = useState([]);
  const [allHolders,setAllHolders] = useState([]);
  const [holdersLoading,setHoldersLoading] = useState(true);

  async function fetchTopHolders(){
    if(!CRUSH_MINT || !HELIUS_API_KEY || !HELIUS_RPC_URL){
      setHolders([]); setAllHolders([]); setHoldersLoading(false); return;
    }
    try{
      setHoldersLoading(true);
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
          if(acc?.decimals!=null) decimals=Math.max(decimals,acc.decimals);
          if(owner) totals.set(owner,(totals.get(owner)||0)+amtRaw);
        }
        if(accounts.length<perPage) break;
        page+=1;
      }
      const allList=Array.from(totals.entries())
        .map(([wallet,raw])=>({wallet,amount:raw/Math.pow(10,decimals||0)}))
        .sort((a,b)=>b.amount-a.amount)
        .map((h,i)=>({rank:i+1,...h}));
      setAllHolders(allList);
      setHolders(allList.slice(0,10));
    }catch(e){ console.error(e); setHolders([]); setAllHolders([]); }
    finally{ setHoldersLoading(false); }
  }

  /* ---------- Flirts (XP leaderboard) ---------- */
  const [flirts,setFlirts] = useState([]);
  const [allFlirts,setAllFlirts] = useState([]);
  const [flirtsLoading,setFlirtsLoading] = useState(true);
  const prevRanks = useRef(new Map());
  const prevXp = useRef(new Map());
  const mergingRef = useRef(false);

  const [shine,setShine] = useState(()=>new Set());

  async function attemptMergeIdentity(list){
    if(mergingRef.current) return;
    if(!myWallet || !guestId) return;

    const guestRow = list.find(r => r.wallet === guestId);
    if(!guestRow) return;

    const walletRow = list.find(r => r.wallet === myWallet);
    mergingRef.current = true;
    try{
      const newXp = (walletRow?.xp || 0) + (guestRow.xp || 0);
      const newLevel = Math.max(walletRow?.level || 0, guestRow.level || 0);
      const newName =
        (storedDisplayName?.trim()) ||
        (walletRow?.name?.trim()) ||
        (guestRow?.name?.trim()) ||
        null;

      await supabase
        .from("leaderboard")
        .upsert({ wallet: myWallet, name: newName, xp: newXp, level: newLevel }, { onConflict: "wallet" });

      await supabase.from("leaderboard").delete().eq("wallet", guestId);
      try { localStorage.setItem(LS_MERGED_KEY,"1"); } catch {}
    }catch(e){ console.error("merge identity failed:", e); }
    finally{ mergingRef.current = false; }
  }

  function combineSelfRowsStrict(rows){
    const ids = [myWallet, guestId].filter(Boolean);
    if(ids.length === 0) return rows.slice();

    const mergedFlag = (typeof window!=="undefined") ? localStorage.getItem(LS_MERGED_KEY)==="1" : false;
    const baseRows = (mergedFlag && myWallet)
      ? rows.filter(r => r.wallet !== guestId)
      : rows.slice();

    const mine = baseRows.filter(r => ids.includes(r.wallet));
    if(mine.length === 0) return baseRows;
    if(mine.length === 1 && myWallet && mine[0].wallet === myWallet) return baseRows;

    const base = mine.find(r => r.wallet === myWallet) || mine[0];
    const combinedXp = mine.reduce((s,r)=>s + (Number(r.xp)||0), 0);
    const combinedLevel = mine.reduce((m,r)=>Math.max(m, Number(r.level)||0), 0);
    const combinedName =
      (storedDisplayName || "").trim() ||
      mine.find(r=> (r.name||"").trim())?.name ||
      base.name || null;

    const merged = {
      ...base,
      wallet: myWallet || base.wallet,
      xp: combinedXp,
      level: combinedLevel,
      name: combinedName || base.name
    };

    const others = baseRows.filter(r => !ids.includes(r.wallet));
    return [...others, merged].sort((a,b)=>(Number(b.xp)||0)-(Number(a.xp)||0));
  }

  async function fetchTopFlirts(){
    const {data,error}=await supabase
      .from("leaderboard").select("*").order("xp",{ascending:false});
    if(error){ console.error(error); setFlirts([]); setAllFlirts([]); setFlirtsLoading(false); return; }

    let raw = (data||[]).map(r => ({...r}));
    try { await attemptMergeIdentity(raw); } catch {}

    if (storedDisplayName) {
      raw = raw.map(r =>
        (r.wallet === myWallet || r.wallet === guestId)
          ? { ...r, name: storedDisplayName }
          : r
      );
    }

    let normalized = combineSelfRowsStrict(raw);

    if (HIDE_ANON_GUEST_ROWS) {
      normalized = normalized.filter(r => {
        const isMyGuest = guestId && r.wallet === guestId;
        if (isMyGuest) return true;
        const isGuest = typeof r.wallet === "string" && r.wallet.startsWith("guest_");
        const nm = (r.name || "").trim().toLowerCase();
        const isAnon = !nm || nm === "anonymous";
        return !(isGuest && isAnon);
      });
    }

    const ranked = normalized
      .map((row, idx) => {
        const prevIdx = prevRanks.current.get(row.wallet);
        const delta = typeof prevIdx === "number" ? prevIdx - idx : 0;
        return { ...row, _rank: idx + 1, _delta: delta };
      });

    ranked.forEach(r=>{
      const prev = prevXp.current.get(r.wallet) || 0;
      if(r.xp > prev){
        setShine(s => { const n = new Set(s); n.add(r.wallet); return n; });
        setTimeout(()=>setShine(s => { const n = new Set(s); n.delete(r.wallet); return n; }), 900);
      }
    });
    prevXp.current = new Map(ranked.map(r=>[r.wallet, r.xp||0]));

    prevRanks.current = new Map(ranked.map((r,i)=>[r.wallet,i]));
    setAllFlirts(ranked);
    setFlirts(ranked.slice(0,25));
    setFlirtsLoading(false);
  }

  /* ---------- Username (availability + save) ---------- */
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

        // NEW: case-insensitive EXACT check
        const pattern = buildIlikePattern(cleaned);
        const { data, error } = await supabase
          .from("leaderboard")
          .select("wallet,name")
          .ilike("name", pattern)
          .limit(50);
        if(id !== availReqIdRef.current) return;
        if(error) throw error;

        const target = canon(cleaned);
        const takenByOther = (data||[]).some(r =>
          r.wallet !== myIdentifier && canon(r.name) === target
        );

        setAvailState(takenByOther ? "taken" : "available");
      }catch(e){
        if(id===availReqIdRef.current){
          setAvailState("error");
          setNameMsg("Couldn’t check availability.");
        }
      }
    },350);

    return ()=>clearTimeout(t);
  },[nameDraft,myIdentifier,initialName]);

  async function saveName(){
    if(!myIdentifier){ setNameMsg("Connect a wallet or open chat first."); return; }
    const cleaned = cleanName(nameDraft);
    const msg = isInvalidName(cleaned);
    if(msg){ setNameMsg(msg); setAvailState("invalid"); return; }
    if(cleaned===initialName){ setNameMsg("Already saved."); setAvailState("idle"); return; }

    setNameSaving(true); setNameMsg("");
    try{
      // NEW: case-insensitive EXACT duplication guard
      const pattern = buildIlikePattern(cleaned);
      const { data: dup, error: dupErr } = await supabase
        .from("leaderboard")
        .select("wallet,name")
        .ilike("name", pattern)
        .limit(50);
      if(dupErr) throw dupErr;

      const target = canon(cleaned);
      const takenByOther = (dup||[]).some(r =>
        r.wallet !== myIdentifier && canon(r.name) === target
      );
      if(takenByOther){
        setAvailState("taken");
        setNameMsg("Name is already taken.");
        setNameSaving(false);
        return;
      }

      localStorage.setItem(LS_DISPLAY_NAME_KEY, cleaned);
      setStoredDisplayName(cleaned);

      await supabase.from("leaderboard")
        .upsert({ wallet: myIdentifier, name: cleaned }, { onConflict: "wallet" });

      setAvailState("available");
      setInitialName(cleaned);
      setNameMsg("Saved ✓");
      addToast("Saved ✓");
      fetchTopFlirts();
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

    const ch=supabase
      .channel("leaderboard-changes")
      .on("postgres_changes",{event:"*",schema:"public",table:"leaderboard"},fetchTopFlirts)
      .subscribe();

    let t1,t2;
    const start=()=>{
      t1=setInterval(fetchTopFlirts, 5000);
      t2=setInterval(fetchTopHolders,60_000);
    };
    const stop=()=>{ clearInterval(t1); clearInterval(t2); };
    const onVis=()=>{ if(document.hidden) stop(); else { fetchTopFlirts(); fetchTopHolders(); start(); } };
    onVis();
    document.addEventListener("visibilitychange", onVis);

    return ()=>{ supabase.removeChannel(ch); stop(); document.removeEventListener("visibilitychange", onVis); };
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

  /* ---------- Combined Name + Share UI ---------- */
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
    const percentile = me ? formatPercentile(me._rank, total) : "—";

    const shareToX = () => {
      if(!me) return;
      const origin = (typeof window !== "undefined" && window.location && window.location.origin)
        ? window.location.origin : "https://yourdomain.com";
      const url = (typeof window !== "undefined" && window.location?.href)
        ? window.location.href : `${origin}/leaderboard`;
      const name = (me.name && me.name.trim()) || (me.wallet?.slice(0,4) + "…" + me.wallet?.slice(-4));
      const xp = Number(me.xp || 0).toLocaleString();
      const text = `$CRUSH ${name} — Global Rank #${me._rank} (${xp} XP)`;
      const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
      window.open(intent, "_blank", "noopener,noreferrer");
    };

    return (
      <div className="ns-card" role="group" aria-label="Claim name and share">
        <div className="ns-left">
          <div className="ns-label">Claim your name</div>

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
            <button className="ns-save" onClick={saveName} disabled={disableSave}>
              {nameSaving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="ns-hint" aria-live="polite">{statusBadge}</div>
        </div>

        <div className="ns-right">
          <button
            className="share-btn"
            onClick={shareToX}
            aria-label="Share to X"
            title="Shares your rank + XP"
            disabled={!me}
          >
            Share to X
          </button>

          {me ? (
            <div className="hrl small" aria-label="Your flirt rank" aria-live="polite" role="group">
              <span className="hrl-label">Flirt rank</span>{" "}
              <span className="hrl-badge">#{me._rank}</span>{" "}
              <span className="hrl-sub">Top {percentile}%</span>
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
                <EmptyRow text={(!CRUSH_MINT||!HELIUS_API_KEY)?"Add NEXT_PUBLIC_CRUSH_MINT + NEXT_PUBLIC_HELIUS_KEY to .env.local":"No data yet"}/>
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

          {/* New combined UI */}
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
        .hrl.small{ padding:8px 12px; gap:10px; }
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

        /* New Name + Share card */
        .ns-card{
          display:flex; align-items:flex-start; justify-content:space-between;
          gap:18px; margin:8px 6px 18px; padding:16px;
          border-radius:18px; background:rgba(255,255,255,0.07);
          border:1px solid rgba(255,255,255,0.16); backdrop-filter:blur(6px);
        }
        .ns-left{ flex:1 1 520px; min-width:280px; }
        .ns-right{ flex:0 0 auto; display:flex; align-items:center; gap:12px; flex-wrap:wrap; }

        .ns-label{ font-weight:900; color:#fff; margin:0 0 8px 2px; }
        .ns-inputrow{ display:flex; gap:10px; align-items:center; }
        .ns-input{
          flex:1 1 auto; min-width:220px;
          background:#fff; color:#000; border:1px solid rgba(0,0,0,.18);
          border-radius:999px; padding:12px 16px; font-weight:700; line-height:1.25;
          box-shadow:0 1px 0 rgba(0,0,0,.04), inset 0 6px 18px rgba(0,0,0,.08);
        }
        .ns-input.available{ box-shadow:0 0 0 3px #4ade8033, inset 0 6px 18px rgba(0,0,0,.08); }
        .ns-input.taken{ box-shadow:0 0 0 3px #fb718533, inset 0 6px 18px rgba(0,0,0,.08); }
        .ns-input.invalid{ box-shadow:0 0 0 3px #fbbf2433, inset 0 6px 18px rgba(0,0,0,.08); }

        .ns-save{
          padding:12px 20px; border-radius:999px;
          background:linear-gradient(90deg,#fa1a81,#b57eff); color:#fff;
          font-weight:1000; border:1px solid rgba(255,255,255,.24); cursor:pointer;
          box-shadow:0 0 16px rgba(250,26,129,0.46), 0 14px 28px rgba(250,26,129,0.3);
          transition:.15s ease; white-space:nowrap;
        }
        .ns-save:hover:not(:disabled){ transform:translateY(-1px); box-shadow:0 16px 34px rgba(250,26,129,0.55), 0 0 22px rgba(181,126,255,0.45); }
        .ns-save:disabled{ opacity:.6; cursor:not-allowed; }

        .ns-hint{ margin-top:8px; font-weight:900; }

        .share-btn{
          display:inline-flex; align-items:center; gap:8px;
          padding:12px 18px; border-radius:999px;
          border:1px solid rgba(255,255,255,.24);
          background:linear-gradient(90deg,#fa1a81,#b57eff);
          color:#fff; font-weight:1000; cursor:pointer;
        }
        .share-btn:disabled{ opacity:.6; cursor:not-allowed; }

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
        @media (max-width:860px){
          .ns-card{ flex-direction:column; align-items:stretch; }
          .ns-right{ justify-content:flex-start; }
        }
        @media (max-width:380px){
          .lb-card{ padding:10px; }
          .lb-row{ padding:10px 10px; }
          .share-btn{ padding:10px 14px; }
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
