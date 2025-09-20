export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const pick = (s) => (s ? `${s.slice(0,6)}…${s.slice(-6)} (len:${s.length})` : null);
  const env = process.env;

  const selectedUrl =
    env.CRUSH_KV_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL || null;
  const selectedTok =
    env.CRUSH_KV_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN || null;

  res.status(200).json({
    selected: {
      url: selectedUrl,
      token: selectedTok ? pick(selectedTok) : null,
      source: selectedTok
        ? (env.CRUSH_KV_TOKEN   ? "CRUSH_KV_TOKEN"
          : env.KV_REST_API_TOKEN ? "KV_REST_API_TOKEN"
          : env.UPSTASH_REDIS_REST_TOKEN ? "UPSTASH_REDIS_REST_TOKEN"
          : "none")
        : "none"
    },
    present: {
      CRUSH_KV_URL: !!env.CRUSH_KV_URL,
      CRUSH_KV_TOKEN: env.CRUSH_KV_TOKEN ? pick(env.CRUSH_KV_TOKEN) : null,
      KV_REST_API_URL: !!env.KV_REST_API_URL,
      KV_REST_API_TOKEN: env.KV_REST_API_TOKEN ? pick(env.KV_REST_API_TOKEN) : null,
      UPSTASH_REDIS_REST_URL: !!env.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN ? pick(env.UPSTASH_REDIS_REST_TOKEN) : null,
    }
  });
}
