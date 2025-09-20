// pages/api/entitlements/index.js
export const config = { runtime: "edge" };

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...extra,
    },
  });

async function supa(path, init = {}) {
  const url = `${SUPA_URL}/rest/v1${path}`;
  const headers = {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${SUPA_KEY}`,
    "content-type": "application/json",
    ...init.headers,
  };
  return fetch(url, { ...init, headers });
}

export default async function handler(req) {
  try {
    if (req.method === "OPTIONS") {
      // (not strictly needed same-origin, but avoids 405 in odd cases)
      return new Response(null, {
        status: 204,
        headers: { "Allow": "GET, POST, OPTIONS" },
      });
    }

    if (req.method === "GET") {
      const { searchParams } = new URL(req.url);
      const wallet = String(searchParams.get("wallet") || "");
      if (!wallet || wallet.length < 25) {
        return json({ ok: false, error: "wallet invalid" }, 400);
      }

      const r = await supa(`/entitlements?select=item_id&wallet=eq.${encodeURIComponent(wallet)}`, {
        headers: { Prefer: "count=exact" },
      });
      const rows = await r.json();
      return json({ ok: true, items: (rows || []).map(x => ({ itemId: x.item_id })) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const wallet = String(body.wallet || "");
      const itemId = String(body.itemId || "");
      const signature = body.signature ? String(body.signature) : null;

      if (!wallet || wallet.length < 25 || !itemId) {
        return json({ ok: false, error: "bad_request" }, 400);
      }

      const payload = [{ wallet, item_id: itemId, signature }];
      const r = await supa(`/entitlements?on_conflict=wallet,item_id`, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        return json({ ok: false, error: "supabase_error", detail: t }, 500);
      }
      return json({ ok: true });
    }

    return json({ ok: false, error: "method not allowed" }, 405, { "Allow": "GET, POST, OPTIONS" });
  } catch {
    return json({ ok: false, error: "internal_error" }, 500);
  }
}
