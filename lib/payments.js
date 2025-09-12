// lib/payments.js

/** ******************************
 * Public config
 *********************************/
export const CRUSH_MINT =
  process.env.NEXT_PUBLIC_CRUSH_MINT ||
  "A4R4DhbxhKxc6uNiUaswecybVJuAPwBWV6zQu2gJJskG";

/**
 * Price is in $CRUSH units (not SOL).
 * For each pay-image:
 *  - id: must match frontend VAULT IDs
 *  - title
 *  - priceCrush: positive integer
 *  - preview: blurred/low-res, **.png** public path under /public
 *  - file: full-res **.png** filename under /protected/xenia/vip (raw filename only)
 *  - freeIfHold (optional): holders ≥ this can view w/o purchase
 */
export const ITEMS = [
  // VIP Gallery 01 (all PNG)
  {
    id: "vip-gallery-01-1",
    title: "VIP Photo 01",
    priceCrush: 250,
    preview: "/xenia/nsfw/nsfw-01-blur.png",
    file: "vip-01.png",
    freeIfHold: 2000,
  },
  {
    id: "vip-gallery-01-2",
    title: "VIP Photo 02",
    priceCrush: 300,
    preview: "/xenia/nsfw/nsfw-02-blur.png",
    file: "vip-02.png",
    freeIfHold: 3000,
  },
  {
    id: "vip-gallery-01-3",
    title: "VIP Photo 03",
    priceCrush: 400,
    preview: "/xenia/nsfw/nsfw-03-blur.png",
    file: "vip-03.png",
    freeIfHold: 5000,
  },

  // Purchase-Only Gallery 02 (all PNG)
  {
    id: "pp-02-1",
    title: "Photo A",
    priceCrush: 500,
    preview: "/xenia/pp/pp-01-blur.png",
    file: "pp-01.png",
  },
  {
    id: "pp-02-2",
    title: "Photo B",
    priceCrush: 750,
    preview: "/xenia/pp/pp-02-blur.png",
    file: "pp-02.png",
    freeIfHold: 3500,
  },
  {
    id: "pp-02-3",
    title: "Photo C",
    priceCrush: 1000,
    preview: "/xenia/pp/pp-03-blur.png",
    file: "pp-03.png",
  },
];

/**
 * Bundles: a single purchasable SKU that unlocks multiple children
 * - id: virtual SKU
 * - title
 * - priceCrush: discounted total
 * - children: array of item IDs (must exist in ITEMS)
 */
export const BUNDLES = [
  {
    id: "bundle-vip-01",
    title: "VIP Gallery 01 — Complete Bundle",
    priceCrush: 600, // cheaper than 250+300+400 = 950
    children: ["vip-gallery-01-1", "vip-gallery-01-2", "vip-gallery-01-3"],
  },
];

/** ******************************
 * Boot-time validation (fail fast)
 *********************************/
(function validateCatalog() {
  const ids = new Set();

  // validate items
  for (const it of ITEMS) {
    if (!it?.id || typeof it.id !== "string") throw new Error("[payments] Missing item id");
    if (ids.has(it.id)) throw new Error(`[payments] Duplicate item id: ${it.id}`);
    ids.add(it.id);

    if (!it.title || typeof it.title !== "string") {
      throw new Error(`[payments] Missing/invalid title for ${it.id}`);
    }

    if (typeof it.priceCrush !== "number" || !Number.isFinite(it.priceCrush) || it.priceCrush < 0) {
      throw new Error(`[payments] Invalid priceCrush for ${it.id}: ${it.priceCrush}`);
    }

    // preview must be a public .png path
    if (
      !it.preview ||
      typeof it.preview !== "string" ||
      !it.preview.startsWith("/") ||
      !it.preview.toLowerCase().endsWith(".png")
    ) {
      throw new Error(`[payments] Preview must be a public .png path for ${it.id}`);
    }

    // file must be a raw .png filename; API will safely join under /protected/xenia/vip
    if (
      !it.file ||
      typeof it.file !== "string" ||
      it.file.includes("..") ||
      it.file.includes("/") ||
      it.file.includes("\\") ||
      !it.file.toLowerCase().endsWith(".png")
    ) {
      throw new Error(
        `[payments] Unsafe/invalid file for ${it.id}. Use raw .png filename only, e.g. "vip-01.png".`
      );
    }

    if (it.freeIfHold != null && (typeof it.freeIfHold !== "number" || it.freeIfHold < 0)) {
      throw new Error(`[payments] freeIfHold must be a positive number for ${it.id}`);
    }
  }

  // validate bundles
  for (const b of BUNDLES) {
    if (!b?.id || typeof b.id !== "string") throw new Error("[payments] Missing bundle id");
    if (ids.has(b.id)) throw new Error(`[payments] Bundle id clashes with existing id: ${b.id}`);
    ids.add(b.id);

    if (typeof b.priceCrush !== "number" || !Number.isFinite(b.priceCrush) || b.priceCrush < 0) {
      throw new Error(`[payments] Invalid bundle priceCrush for ${b.id}: ${b.priceCrush}`);
    }

    if (!Array.isArray(b.children) || b.children.length === 0) {
      throw new Error(`[payments] Bundle ${b.id} has no children`);
    }
    for (const c of b.children) {
      const exists = ITEMS.some((x) => x.id === c);
      if (!exists) throw new Error(`[payments] Bundle ${b.id} references missing item: ${c}`);
    }
  }
})();

/** ******************************
 * O(1) lookups (frozen maps)
 *********************************/
const ITEM_MAP = Object.freeze(
  ITEMS.reduce((m, it) => {
    m[it.id] = it;
    return m;
  }, {})
);

const BUNDLE_MAP = Object.freeze(
  BUNDLES.reduce((m, b) => {
    m[b.id] = b;
    return m;
  }, {})
);

/** ******************************
 * Public helpers (same API)
 *********************************/
export function getItem(id) {
  return ITEM_MAP[id] || null;
}

export function isBundle(id) {
  return !!BUNDLE_MAP[id];
}

export function getBundle(id) {
  return BUNDLE_MAP[id] || null;
}

export function getBundleChildren(id) {
  const b = BUNDLE_MAP[id];
  if (!b) return null;
  return { ids: b.children.slice(), bundlePriceCrush: b.priceCrush };
}
