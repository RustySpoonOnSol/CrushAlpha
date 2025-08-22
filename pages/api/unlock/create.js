import { getConnection, asPublicKey } from "../../../utils/solana";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction } from "@solana/spl-token";

const MINT = process.env.CRUSH_MINT;
const TREASURY = process.env.DEV_TREASURY;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { wallet, itemId, amount } = JSON.parse(req.body || "{}"); // amount in CRUSH
    if (!wallet || !itemId || !amount) return res.status(400).json({ error: "Missing fields" });

    const conn = getConnection();
    const payer = asPublicKey(wallet);
    const mint = asPublicKey(MINT);
    const treasury = asPublicKey(TREASURY);

    const fromAta = getAssociatedTokenAddressSync(mint, payer);
    const toAta = getAssociatedTokenAddressSync(mint, treasury);

    // Create SPL transfer instruction (amount in base units; assume 6 decimals typical)
    const decimals = 6;
    const baseAmount = BigInt(Math.floor(amount * 10 ** decimals));

    const ix = createTransferInstruction(fromAta, toAta, payer, baseAmount);
    const tx = new Transaction().add(ix);

    tx.feePayer = payer;
    tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;

    // Return serialized tx for Phantom to sign
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
    return res.status(200).json({ ok: true, tx: serialized, itemId });
  } catch (e) {
    console.error("[unlock/create] error", e);
    return res.status(500).json({ error: "Failed to create unlock transaction" });
  }
}
