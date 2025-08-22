// utils/alpha.js
export const ALPHA_MODE = process.env.NEXT_PUBLIC_ALPHA_MODE === "1";
export const ALPHA_BYPASS_WALLET = ALPHA_MODE || process.env.NEXT_PUBLIC_ALPHA_BYPASS_WALLET === "1" || process.env.ALPHA_BYPASS_WALLET === "1";
export const ALPHA_DISABLE_ONCHAIN = ALPHA_MODE || process.env.NEXT_PUBLIC_ALPHA_DISABLE_ONCHAIN === "1" || process.env.ALPHA_DISABLE_ONCHAIN === "1";
