/**
 * geo-pins.ts — On-chain Geo-Pin Chat via Solana Memo Program
 *
 * Uses Solana Memo program (MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr)
 * to store spatial chat messages as memo instructions with JSON payloads.
 *
 * Format: GEOPIN|{lat}|{lng}|{msg}|{ts}
 * Compact, human-readable, and fully on-chain.
 *
 * Client-side: connects to Phantom, signs memo txs
 * Server-side: persisted in SQLite via sqlite-zod-orm
 */

// ─── Types ──────────────────────────────────────────────

export interface GeoPin {
    signature: string
    sender: string
    lat: number
    lng: number
    message: string
    timestamp: number
    slot?: number
}

// ─── Constants ──────────────────────────────────────────

const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const GEOPIN_PREFIX = 'GEOPIN'
const RPC_URL = 'https://api.mainnet-beta.solana.com'

// ─── Client-side: Create & Sign Geo-Pin ─────────────────

export async function createGeoPin(
    lat: number,
    lng: number,
    message: string
): Promise<{ signature: string } | { error: string }> {
    const phantom = (window as any).solana
    if (!phantom?.isPhantom) {
        return { error: 'Phantom wallet not found' }
    }

    try {
        await phantom.connect()
        const pubkey = phantom.publicKey

        // Encode geo-pin data as memo
        const payload = `${GEOPIN_PREFIX}|${lat.toFixed(6)}|${lng.toFixed(6)}|${message.substring(0, 280)}|${Date.now()}`

        const { Connection, Transaction, TransactionInstruction, PublicKey } =
            await import('@solana/web3.js')

        const connection = new Connection(RPC_URL, 'confirmed')
        const memoProgramId = new PublicKey(MEMO_PROGRAM_ID)

        const memoIx = new TransactionInstruction({
            keys: [{ pubkey, isSigner: true, isWritable: true }],
            programId: memoProgramId,
            data: Buffer.from(payload),
        })

        const tx = new Transaction().add(memoIx)
        tx.feePayer = pubkey
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash

        const signed = await phantom.signTransaction(tx)
        const sig = await connection.sendRawTransaction(signed.serialize())
        await connection.confirmTransaction(sig, 'confirmed')

        return { signature: sig }
    } catch (err: any) {
        return { error: err.message || 'Transaction failed' }
    }
}

// ─── Server-side: SQLite persistence ────────────────────

export function saveGeoPin(pin: GeoPin) {
    const { userDb } = require('./auth')
    userDb.geo_pins.insert({
        signature: pin.signature,
        sender: pin.sender,
        lat: pin.lat,
        lng: pin.lng,
        message: pin.message.substring(0, 280),
        timestamp: pin.timestamp,
    })
}

export function getRecentGeoPins(limit = 100): GeoPin[] {
    const { userDb } = require('./auth')
    return userDb.geo_pins.select()
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .all()
        .map((r: any) => ({
            signature: r.signature,
            sender: r.sender,
            lat: r.lat,
            lng: r.lng,
            message: r.message,
            timestamp: r.timestamp,
        }))
}

export function getGeoPinCount(): number {
    const { userDb } = require('./auth')
    return userDb.geo_pins.select().all().length
}
