# Patches (drop-in)

## 1) middleware.js (root) — Basic password gate for all pages
```js
// middleware.js
import { NextResponse } from "next/server";

export function middleware(req) {
  const url = req.nextUrl;
  const pathname = url.pathname;

  // Don't gate API routes or static files
  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const pass = process.env.ALPHA_PASSWORD || "";
  if (!pass) return NextResponse.next(); // no password set

  const header = req.headers.get("authorization") || "";
  const expected = "Basic " + Buffer.from("tester:" + pass).toString("base64");

  if (header === expected) return NextResponse.next();

  return new NextResponse("Auth required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Crush AI Alpha"' },
  });
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
```

Use it like this in the browser: you’ll get a login popup. User: `tester`, Pass: value of `ALPHA_PASSWORD`.

## 2) utils/alpha.js — central flags
```js
// utils/alpha.js
export const ALPHA_MODE = process.env.NEXT_PUBLIC_ALPHA_MODE === "1";
export const ALPHA_BYPASS_WALLET = process.env.NEXT_PUBLIC_ALPHA_MODE === "1" || process.env.ALPHA_BYPASS_WALLET === "1";
export const ALPHA_DISABLE_ONCHAIN = process.env.NEXT_PUBLIC_ALPHA_MODE === "1" || process.env.ALPHA_DISABLE_ONCHAIN === "1";
```

## 3) components/WalletGate.js — auto-pass in alpha
Add near the top:
```js
import { ALPHA_BYPASS_WALLET } from "../utils/alpha";
```

Then change the early return to:
```jsx
if (ALPHA_BYPASS_WALLET) {
  return (
    <div className="w-full rounded-2xl p-4 bg-black/30 border border-pink-300/30 text-center">
      <div className="text-xl text-pink-100 mb-2">✅ Alpha mode: access granted</div>
      {children}
    </div>
  );
}
```

## 4) components/ChatBox.js — allow free chat in alpha
At top:
```js
import { ALPHA_MODE } from "../utils/alpha";
```

When you block sending because wallet isn’t connected, wrap it:
```js
if (!ALPHA_MODE) {
  // existing checks that require wallet/tier
  // ...
}
// In alpha, let it send; rely on server-side rate limits
```

Optionally show a small banner:
```jsx
{ALPHA_MODE && (
  <div className="text-xs text-pink-200/80 mb-2">Alpha: free messages enabled (rate-limited)</div>
)}
```

## 5) components/WalletBar.js — persistent top-right button (optional)
Wrap the existing wallet button in a fixed container:
```jsx
<div className="fixed top-4 right-4 z-50">
  <WalletButton />
</div>
```

## 6) .gitignore — keep secrets out of Git
```
.env*
Supabase password.txt
.next
node_modules
```

## 7) pages/_app.js — tiny console banner
```js
useEffect(() => {
  if (process.env.NEXT_PUBLIC_ALPHA_MODE === "1") {
    // eslint-disable-next-line no-console
    console.log("%cCRUSH AI — ALPHA MODE", "padding:4px 8px;background:#ff1f8f;color:white;border-radius:6px;");
  }
}, []);
```
