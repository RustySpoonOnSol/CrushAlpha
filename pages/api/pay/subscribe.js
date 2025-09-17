// pages/api/pay/subscribe.js
export const config = { runtime: "edge" };
import { kv } from "@vercel/kv";

/**
 * Server-Sent Events stream for real-time unlock confirmations.
 * - Subscribes to `pay:{ref}` on Upstash/KV
 * - Heartbeats every 15s to keep proxies from closing the stream
 * - Clean unsubscribe on client abort
 */
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) return new Response("bad", { status: 400 });

  return new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const enqueue = (line) => controller.enqueue(enc.encode(line));
        const send = (data) => enqueue(`data: ${JSON.stringify(data)}\n\n`);

        // keep connection warm
        const hb = setInterval(() => enqueue(":hb\n\n"), 15000);

        // ✅ await the subscription so we can reliably unsubscribe later
        const sub = await kv.subscribe(`pay:${ref}`, (msg) => {
          try {
            send(JSON.parse(msg));
          } catch {
            // accept raw strings too
            send({ ok: true });
          }
        });

        const onAbort = async () => {
          clearInterval(hb);
          try { await sub.unsubscribe(); } catch {}
          controller.close();
        };
        req.signal.addEventListener("abort", onAbort);
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
