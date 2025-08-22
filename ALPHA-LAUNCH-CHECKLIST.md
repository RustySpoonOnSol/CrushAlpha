# Crush AI — Stealth Alpha Launch Checklist (V7.2)
**Goal:** a free, low-friction, password-protected alpha your friends can test without breaking wallet / token gating for later.

## 0) Safety first (do this before pushing anywhere)
- **REMOVE SECRETS FROM THE REPO**: Delete `.env.local` and `Supabase password.txt` from the project folder before pushing to Git/GitHub/Vercel. Add them to `.gitignore` (see below).
- Create a new `.env.local` **on your machine or in Vercel** with placeholder values for the alpha.

## 1) Minimal env for alpha (no on‑chain, chat works)
Create `.env.local` with at least:
```
# Alpha flags
NEXT_PUBLIC_ALPHA_MODE=1
ALPHA_BYPASS_WALLET=1
ALPHA_DISABLE_ONCHAIN=1

# App basics
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# OpenAI key (server-side)
OPENAI_API_KEY=YOUR_KEY

# Solana (only needed if you want balance widgets live)
NEXT_PUBLIC_CRUSH_MINT=A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJsk
SOLANA_RPC_PRIMARY=https://api.mainnet-beta.solana.com
SOLANA_RPC_FALLBACK=
```

## 2) Password‑protect the whole site (stealth)
Add **`middleware.js`** at project root (code included in Patches below). Set:
```
ALPHA_PASSWORD=some-strong-password
```
in your `.env.local`. Share the password privately.

- Bypass for API routes `/api/*` so webhooks/tooling still work.
- You can also whitelist your IP / /health page if needed.

## 3) Make wallet gating optional in alpha
Wallet connect still shows, but **content unlock checks auto-pass** when `NEXT_PUBLIC_ALPHA_MODE=1`. This lets friends test without holding the token. (Patch included for `components/WalletGate.js`.)

## 4) Free chat on (server‑rate‑limited)
`/api/chat` already has an IP rate limiter. For alpha:
- Keep **RL_WINDOW_MS=15s** and **RL_MAX_HITS=6** (already in your file). That’s OK.
- Make sure the client doesn’t hard-block when wallet isn’t connected (Patch in `components/ChatBox.js`).

## 5) Clean top navigation + global wallet button
Your project already has `WalletBar`/`WalletButton`. Ensure it renders on all pages in `_app.js` via `Layout` (already present). No change needed unless you want a fixed top-right button (optional patch below).

## 6) Crash + error visibility
- Add console log banners for ALPHA mode.
- Optional: Wire Sentry later. For now, log errors server side.

## 7) Deploy on Vercel (free tier)
- Push to GitHub **without** `.env.local` or any txt secrets.
- In Vercel Project → Settings → Environment Variables, set variables from step (1) + `ALPHA_PASSWORD`.
- Build command: `next build` (already default). Start: `next start`.

## 8) Share a private link and password
- Send your testers the Vercel URL + password.
- Provide a feedback Google Form (or Typeform) link.

## 9) Test plan (quick)
- Chat flows: send 10–15 messages, ensure no “Oops try again” loop.
- Wallet connect: connect/disconnect Phantom across pages.
- Gating: meet-xenia/gallery should show “Verified holder” banners in alpha (auto-pass).
- Leaderboard/XP: confirm XP increments and persists (Supabase) if that’s on.
- OG cards: paste links on X/Discord and confirm unfurl.

## 10) Rollback to real gating for public beta
- Turn off `NEXT_PUBLIC_ALPHA_MODE`, remove middleware or change password.
- Re-enable on-chain unlocks and token checks.
