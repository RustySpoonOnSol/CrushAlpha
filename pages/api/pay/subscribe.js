// pages/api/pay/subscribe.js
export const config = { runtime: "edge" };
import { kv } from "@vercel/kv";

/**
 * SSE stream for real-time unlock confirmations.
 * - Subscribes to `pay:{ref}`
 * - Heartbeats every 15s to keep the connection alive
 * - Clean unsubscribe on abort
 */
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) return new Response("bad", { status: 400 });

  return new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const push = (s) => controller.enqueue(enc.encode(s));
        const send = (d) => push(`data: ${JSON.stringify(d)}\n\n`);

        // Keep connection warm
        const hb = setInterval(() => push(":hb\n\n"), 15000);

        // ✅ await subscription so unsubscribe is reliable
        const sub = await kv.subscribe(`pay:${ref}`, (msg) => {
          try { send(JSON.parse(msg)); } catch { send({ ok: true }); }
        });

        req.signal.addEventListener("abort", async () => {
          clearInterval(hb);
          try { await sub.unsubscribe(); } catch {}
          controller.close();
        });
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
      },
    }
  );
}
