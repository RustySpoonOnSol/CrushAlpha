// lib/payments.js
export const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

export const TREASURY = process.env.TREASURY_WALLET || ""; // REQUIRED

// Price is in $CRUSH units (not SOL). We'll transfer SPL tokens.
export const ITEMS = [
  {
    id: "vip-gallery-01-1",
    title: "VIP Photo 01",
    priceCrush: 250,                     // pay per image
    preview: "/xenia/nsfw/nsfw-01-blur.jpg",
    file: "vip-01.jpg",                  // under /protected/xenia/vip/
  },
  {
    id: "vip-gallery-01-2",
    title: "VIP Photo 02",
    priceCrush: 250,
    preview: "/xenia/nsfw/nsfw-02-blur.jpg",
    file: "vip-02.jpg",
  },
  {
    id: "vip-gallery-01-3",
    title: "VIP Photo 03",
    priceCrush: 250,
    preview: "/xenia/nsfw/nsfw-03-blur.jpg",
    file: "vip-03.jpg",
  },
];

export function getItem(id) {
  return ITEMS.find((x) => x.id === id);
}
