// utils/mobileWallet.js
export function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function hasInjectedWallet() {
  if (typeof window === "undefined") return false;
  const w = window;
  return Boolean(
    w?.solana?.isPhantom ||
      w?.phantom?.solana ||
      w?.solflare ||
      w?.backpack
  );
}

export function makeWalletDeeplink(prefer = "phantom") {
  const href =
    (typeof window !== "undefined" && window.location?.href) ||
    "https://crush-alpha-eight.vercel.app";
  const origin =
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://crush-alpha-eight.vercel.app";

  const url = encodeURIComponent(href);
  const ref = encodeURIComponent(origin);

  const PHANTOM = `https://phantom.app/ul/browse/${url}?ref=${ref}`;
  const SOLFLARE = `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`;
  return prefer === "solflare" ? SOLFLARE : PHANTOM;
}

export function goToWalletApp(prefer = "phantom") {
  const link = makeWalletDeeplink(prefer);
  try {
    window.location.href = link;
  } catch (e) {
    // ignore
  }
}
