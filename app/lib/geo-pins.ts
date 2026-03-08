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
    category?: string
}

export const PIN_CATEGORIES = {
    intel: { emoji: '🔍', label: 'Intel', color: '#60a5fa' },
    threat: { emoji: '⚠️', label: 'Threat', color: '#ef4444' },
    friendly: { emoji: '🟢', label: 'Friendly', color: '#4ade80' },
    logistics: { emoji: '📦', label: 'Logistics', color: '#fbbf24' },
    observation: { emoji: '👁️', label: 'Observation', color: '#a78bfa' },
    general: { emoji: '💬', label: 'General', color: '#94a3b8' },
} as const

export type PinCategory = keyof typeof PIN_CATEGORIES

export interface GeoPinReaction {
    pinSignature: string
    reactor: string
    emoji: string
    timestamp: number
}

export const ALLOWED_REACTIONS = ['👍', '🔥', '💀', '❤️', '🚀'] as const

export interface GeoPinMedia {
    pinSignature: string
    imageData: string  // base64 data URL
    mimeType: string
    timestamp: number
}

export interface GeoPinReply {
    id?: number
    pinSignature: string
    sender: string
    message: string
    timestamp: number
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

export function getRecentGeoPins(limit = 100, since?: number): GeoPin[] {
    const { userDb } = require('./auth')
    let query = userDb.geo_pins.select()
    if (since) {
        query = query.where('timestamp', '>=', since)
    }
    return query
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

export function getGeoPinsBySender(sender: string, limit = 100): GeoPin[] {
    const { userDb } = require('./auth')
    return userDb.geo_pins.select()
        .where('sender', '=', sender)
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

export interface GeoPinSenderStats {
    sender: string
    pinCount: number
    firstPin: number
    lastPin: number
}

export function getGeoPinSenderStats(sender: string): GeoPinSenderStats | null {
    const { userDb } = require('./auth')
    const pins = userDb.geo_pins.select()
        .where('sender', '=', sender)
        .orderBy('timestamp', 'asc')
        .all()
    if (!pins.length) return null
    return {
        sender,
        pinCount: pins.length,
        firstPin: pins[0].timestamp,
        lastPin: pins[pins.length - 1].timestamp,
    }
}

// ─── Categories ─────────────────────────────────────────

export function savePinCategory(signature: string, category: string) {
    const { userDb } = require('./auth')
    const db = userDb._db
    db.run(`CREATE TABLE IF NOT EXISTS geo_pin_categories (
        signature TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    )`)
    db.run(`INSERT OR REPLACE INTO geo_pin_categories (signature, category, timestamp) VALUES (?, ?, ?)`,
        [signature, category, Date.now()])
}

export function getPinCategory(signature: string): string | null {
    const { userDb } = require('./auth')
    const db = userDb._db
    db.run(`CREATE TABLE IF NOT EXISTS geo_pin_categories (
        signature TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        timestamp INTEGER NOT NULL
    )`)
    const row = db.query(`SELECT category FROM geo_pin_categories WHERE signature = ?`).get(signature) as any
    return row?.category || null
}

// ─── Reactions ──────────────────────────────────────────

export function savePinReaction(reaction: GeoPinReaction) {
    const { userDb } = require('./auth')
    // Create table if not exists (sqlite-zod-orm handles this gracefully)
    try {
        userDb.db.exec(`CREATE TABLE IF NOT EXISTS geo_pin_reactions (
            pinSignature TEXT NOT NULL,
            reactor TEXT NOT NULL,
            emoji TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            PRIMARY KEY (pinSignature, reactor, emoji)
        )`)
    } catch { }

    try {
        userDb.db.exec(
            `INSERT OR REPLACE INTO geo_pin_reactions (pinSignature, reactor, emoji, timestamp) VALUES (?, ?, ?, ?)`,
            [reaction.pinSignature, reaction.reactor, reaction.emoji, reaction.timestamp]
        )
    } catch { }
}

export function getPinReactions(pinSignature: string): Record<string, number> {
    const { userDb } = require('./auth')
    try {
        const rows = userDb.db.query(
            `SELECT emoji, COUNT(*) as count FROM geo_pin_reactions WHERE pinSignature = ? GROUP BY emoji`
        ).all(pinSignature) as Array<{ emoji: string; count: number }>
        const result: Record<string, number> = {}
        for (const row of rows) {
            result[row.emoji] = row.count
        }
        return result
    } catch {
        return {}
    }
}

export function getReactionsBySignature(pinSignature: string): GeoPinReaction[] {
    const { userDb } = require('./auth')
    try {
        return userDb.db.query(
            `SELECT * FROM geo_pin_reactions WHERE pinSignature = ? ORDER BY timestamp DESC`
        ).all(pinSignature) as GeoPinReaction[]
    } catch {
        return []
    }
}

// ─── Media Attachments ──────────────────────────────────

export function savePinMedia(media: GeoPinMedia) {
    const { userDb } = require('./auth')
    try {
        userDb.db.exec(`CREATE TABLE IF NOT EXISTS geo_pin_media (
            pinSignature TEXT PRIMARY KEY,
            imageData TEXT NOT NULL,
            mimeType TEXT NOT NULL DEFAULT 'image/jpeg',
            timestamp INTEGER NOT NULL
        )`)
    } catch { }

    try {
        userDb.db.exec(
            `INSERT OR REPLACE INTO geo_pin_media (pinSignature, imageData, mimeType, timestamp) VALUES (?, ?, ?, ?)`,
            [media.pinSignature, media.imageData, media.mimeType, media.timestamp]
        )
    } catch { }
}

export function getPinMedia(pinSignature: string): GeoPinMedia | null {
    const { userDb } = require('./auth')
    try {
        const row = userDb.db.query(
            `SELECT * FROM geo_pin_media WHERE pinSignature = ?`
        ).get(pinSignature) as GeoPinMedia | null
        return row
    } catch {
        return null
    }
}

/** Get all media entries (lightweight — excludes base64 imageData for listing) */
export function getAllPinMedia(): Array<{ pinSignature: string; mimeType: string; timestamp: number }> {
    const { userDb } = require('./auth')
    try {
        return userDb.db.query(
            `SELECT pinSignature, mimeType, timestamp FROM geo_pin_media ORDER BY timestamp DESC`
        ).all() as any[]
    } catch {
        return []
    }
}

// ─── Thread Replies ─────────────────────────────────────

export function saveReply(reply: GeoPinReply) {
    const { userDb } = require('./auth')
    try {
        userDb.db.exec(`CREATE TABLE IF NOT EXISTS geo_pin_replies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pinSignature TEXT NOT NULL,
            sender TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        )`)
    } catch { }

    try {
        userDb.db.exec(
            `INSERT INTO geo_pin_replies (pinSignature, sender, message, timestamp) VALUES (?, ?, ?, ?)`,
            [reply.pinSignature, reply.sender, reply.message, reply.timestamp]
        )
    } catch { }
}

export function getReplies(pinSignature: string): GeoPinReply[] {
    const { userDb } = require('./auth')
    try {
        return userDb.db.query(
            `SELECT * FROM geo_pin_replies WHERE pinSignature = ? ORDER BY timestamp ASC`
        ).all(pinSignature) as GeoPinReply[]
    } catch {
        return []
    }
}
