import jwt from "jsonwebtoken";
import { getConnection, getFallbackConnection, asPublicKey } from "../../../utils/solana";
import { PublicKey } from "@solana/web3.js";

const MINT = process.env.CRUSH_MINT;
const JWT_SECRET = process.env.JWT_SECRET;
const TTL = parseInt(process.env.JWT_TTL_SECONDS || "900", 10);

const TIERS = [
  { name: "GOD-TIER", min: 100000 },
  { name: "ELITE",    min: 10000  },
  { name: "CRUSHED",  min: 1000   },
  { name: "SUPPORTER",min: 1      },
];

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { wallet } = JSON.parse(req.body || "{}");
    if (!wallet) return res.status(400).json({ error: "Missing wallet" });

    const owner = asPublicKey(wallet);
    const mintPk = asPublicKey(MINT);
    let amount = 0;

    // try primary, then fallback
    const conns = [getConnection(), getFallbackConnection()];
    let lastErr;
    for (const conn of conns) {
      try {
        const resp = await conn.getParsedTokenAccountsByOwner(owner, { mint: mintPk });
        for (const a of resp.value) {
          const uiAmt = a?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
          amount += uiAmt;
        }
        lastErr = null;
        break;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;

    let tier = "NEWBIE";
    for (const t of TIERS) if (amount >= t.min) { tier = t.name; break; }

    const token = jwt.sign(
      { w: wallet, bal: amount, tier },
      JWT_SECRET,
      { expiresIn: TTL }
    );

    return res.status(200).json({ ok: true, balance: amount, tier, token, ttl: TTL });
  } catch (e) {
    console.error("[verify] error", e);
    return res.status(500).json({ error: "Verification failed" });
  }
}
