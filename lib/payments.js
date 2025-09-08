// lib/payments.js
export const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

// Treasury is set via API env (PAY_RECEIVER / NEXT_PUBLIC_TREASURY) — not needed here directly
// export const TREASURY = process.env.TREASURY_WALLET || "";

/**
 * Price is in $CRUSH units (not SOL).
 * For each pay-image, provide:
 *  - id: must match the frontend `VAULT` pay-images IDs
 *  - title
 *  - priceCrush
 *  - preview: blurred/low-res path (public)
 *  - file: the full-res filename under /protected/xenia/vip/
 *  - freeIfHold (optional): holders ≥ this amount can view without purchase
 */

export const ITEMS = [
  // VIP Gallery 01
  {
    id: "vip-gallery-01-1",
    title: "VIP Photo 01",
    priceCrush: 250,
    preview: "/xenia/nsfw/nsfw-01-blur.jpg",
    file: "vip-01.jpg",
    freeIfHold: 2000,
  },
  {
    id: "vip-gallery-01-2",
    title: "VIP Photo 02",
    priceCrush: 300,
    preview: "/xenia/nsfw/nsfw-02-blur.jpg",
    file: "vip-02.jpg",
    freeIfHold: 3000,
  },
  {
    id: "vip-gallery-01-3",
    title: "VIP Photo 03",
    priceCrush: 400,
    preview: "/xenia/nsfw/nsfw-03-blur.jpg",
    file: "vip-03.jpg",
    freeIfHold: 5000,
  },

  // Purchase-Only Gallery 02
  {
    id: "pp-02-1",
    title: "Photo A",
    priceCrush: 500,
    preview: "/xenia/pp/pp-01-blur.jpg",
    file: "pp-01.jpg",
  },
  {
    id: "pp-02-2",
    title: "Photo B",
    priceCrush: 750,
    preview: "/xenia/pp/pp-02-blur.jpg",
    file: "pp-02.jpg",
    freeIfHold: 3500,
  },
  {
    id: "pp-02-3",
    title: "Photo C",
    priceCrush: 1000,
    preview: "/xenia/pp/pp-03-blur.jpg",
    file: "pp-03.jpg",
  },
];

/**
 * Bundles: a single pay item that unlocks multiple children
 * - id: a virtual purchasable SKU
 * - title
 * - priceCrush: discounted total
 * - children: array of item IDs that will be granted on successful verify
 */
export const BUNDLES = [
  {
    id: "bundle-vip-01",
    title: "VIP Gallery 01 — Complete Bundle",
    priceCrush: 600, // cheaper than 250+300+400 = 950
    children: ["vip-gallery-01-1", "vip-gallery-01-2", "vip-gallery-01-3"],
  },
];

export function getItem(id) {
  return ITEMS.find((x) => x.id === id);
}

export function isBundle(id) {
  return BUNDLES.some((b) => b.id === id);
}

export function getBundle(id) {
  return BUNDLES.find((b) => b.id === id);
}

export function getBundleChildren(id) {
  const b = getBundle(id);
  if (!b) return null;
  return { ids: b.children.slice(), bundlePriceCrush: b.priceCrush };
}
