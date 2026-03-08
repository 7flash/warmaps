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
 * Server-side: indexes recent pins from RPC
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

        // Import Solana web3 dynamically (loaded from CDN or bundled)
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

// ─── Server-side: Parse memo into GeoPin ────────────────

export function parseMemoToGeoPin(memo: string, signature: string, sender: string, slot?: number): GeoPin | null {
    if (!memo.startsWith(GEOPIN_PREFIX + '|')) return null

    const parts = memo.split('|')
    if (parts.length < 5) return null

    const lat = parseFloat(parts[1])
    const lng = parseFloat(parts[2])
    const message = parts[3]
    const timestamp = parseInt(parts[4]) || Date.now()

    if (isNaN(lat) || isNaN(lng)) return null

    return { signature, sender, lat, lng, message, timestamp, slot }
}

// ─── Server-side: Fetch recent geo-pins from RPC ────────

const _pinCache: { pins: GeoPin[]; fetchedAt: number } = { pins: [], fetchedAt: 0 }
const PIN_CACHE_TTL = 30_000 // 30s

export async function fetchRecentGeoPins(limit = 50): Promise<GeoPin[]> {
    if (Date.now() - _pinCache.fetchedAt < PIN_CACHE_TTL) {
        return _pinCache.pins
    }

    try {
        // Search for recent memo transactions with GEOPIN prefix
        // Using getSignaturesForAddress on the Memo program is too broad
        // Instead, we maintain a local index of known geo-pin senders
        // and scan their recent transactions

        // For MVP: return cached pins from the local store
        // Full indexing would use a dedicated RPC method or webhook
        _pinCache.fetchedAt = Date.now()
        return _pinCache.pins
    } catch {
        return _pinCache.pins
    }
}

export function addPinToCache(pin: GeoPin) {
    _pinCache.pins.unshift(pin)
    if (_pinCache.pins.length > 200) _pinCache.pins.pop()
}
