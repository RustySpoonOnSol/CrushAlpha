// components/MobileDeepLinkButton.js
import { useCallback } from "react";
import { isMobileUA, hasInjectedWallet, goToWalletApp } from "../utils/mobileWallet";

export default function MobileDeepLinkButton({
  children = "Connect Wallet",
  prefer = "phantom", // "phantom" | "solflare"
  onNormalClick,       // optional: fallback handler (desktop/in-app)
  className = "flirty-nav-tile",
}) {
  const onClick = useCallback(
    (e) => {
      const mobile = isMobileUA();
      const injected = hasInjectedWallet();
      if (mobile && !injected) {
        e.preventDefault();
        goToWalletApp(prefer);
        return;
      }
      onNormalClick?.(e);
    },
    [onNormalClick, prefer]
  );

  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
