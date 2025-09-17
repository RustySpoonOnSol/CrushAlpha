// pages/api/pay/subscribe.js
export const config = { runtime: "edge" };
import { kv } from "@vercel/kv";

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const ref = searchParams.get("ref");
  if (!ref) return new Response("bad", { status: 400 });

  return new Response(
    new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const write = (d) => controller.enqueue(enc.encode(`data: ${JSON.stringify(d)}\n\n`));
        const hb = setInterval(() => controller.enqueue(enc.encode(":hb\n\n")), 15000);

        const sub = kv.subscribe(`pay:${ref}`, (msg) => {
          try { write(JSON.parse(msg)); } catch {}
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
