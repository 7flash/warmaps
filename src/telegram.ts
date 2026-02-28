// src/telegram.ts — Telegram OSINT channel monitor for STARWAR
//
// Adapted from geeksy-telegram-plugin. Polls public OSINT channels
// for conflict updates, extracts location data, and feeds them into
// the STARWAR dashboard in real-time.

import { TelegramClient, Api } from 'telegram'
import { StringSession } from 'telegram/sessions'
import * as fs from 'fs'
import * as path from 'path'

// ── OSINT Channels to Monitor ──
// Key Telegram channels for Middle East & global conflict OSINT
export const OSINT_CHANNELS = [
    { id: 'Middle_East_Spectator', title: 'Middle East Spectator' },
    { id: 'ClashReport', title: 'Clash Report' },
    { id: 'inaborni', title: 'Iran Observer' },
    { id: 'AbuAliEnglish', title: 'Abu Ali Express' },
    { id: 'CIG_telegram', title: 'Caliber Intelligence Group' },
    { id: 'sotaborci', title: 'Sota Borci' },
    { id: 'ryaborV', title: 'Rybar (Ukraine)' },
    { id: 'war_monitor_ua', title: 'War Monitor UA' },
    { id: 'vaboronka', title: 'Oboronka' },
    { id: 'TheIntelligenceRepublic', title: 'Intelligence Republic' },
]

// ── State ──

interface TgState {
    client: TelegramClient | null
    status: 'disconnected' | 'awaiting_code' | 'awaiting_password' | 'connected' | 'error'
    phoneCodeHash: string | null
    phone: string | null
    error: string | null
    me: { username?: string; firstName?: string; id?: string } | null
    pollTimer: ReturnType<typeof setInterval> | null
}

const state: TgState = {
    client: null,
    status: 'disconnected',
    phoneCodeHash: null,
    phone: null,
    error: null,
    me: null,
    pollTimer: null,
}

// ── Message Store (in-memory ring buffer for dashboard) ──

export interface TelegramAlert {
    id: string
    channel: string
    channelTitle: string
    text: string
    date: number       // unix timestamp
    senderName?: string
    mediaType?: string
    // AI-extracted fields (future)
    location?: { lat: number; lon: number; name: string }
    threatLevel?: 'low' | 'medium' | 'high' | 'critical'
    equipmentType?: string
}

const MAX_ALERTS = 200
const alerts: TelegramAlert[] = []
const alertListeners: Set<(alert: TelegramAlert) => void> = new Set()

export function getAlerts(limit = 50): TelegramAlert[] {
    return alerts.slice(-limit)
}

export function onAlert(listener: (alert: TelegramAlert) => void) {
    alertListeners.add(listener)
    return () => alertListeners.delete(listener)
}

function pushAlert(alert: TelegramAlert) {
    alerts.push(alert)
    if (alerts.length > MAX_ALERTS) alerts.shift()
    for (const listener of alertListeners) {
        try { listener(alert) } catch { }
    }
}

// ── Session Persistence ──

const SESSION_DIR = path.join(import.meta.dir, '..', '.data')

function getSessionPath(phone: string): string {
    return path.join(SESSION_DIR, `session-${phone.replace(/\+/g, '')}.txt`)
}

function loadSession(phone: string): string {
    try {
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
        const p = getSessionPath(phone)
        if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim()
    } catch { }
    return ''
}

function saveSession(session: string, phone: string) {
    try {
        if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true })
        fs.writeFileSync(getSessionPath(phone), session, 'utf-8')
    } catch { }
}

// ── Public API ──

export function getStatus() {
    return {
        status: state.status,
        error: state.error,
        me: state.me,
        phone: state.phone,
        channelCount: OSINT_CHANNELS.length,
        alertCount: alerts.length,
    }
}

/** Step 1: Connect + send auth code */
export async function sendCode(
    appId: number,
    appHash: string,
    phone: string,
): Promise<{ ok: boolean; restored?: boolean; error?: string }> {
    try {
        await disconnect()

        const sessionStr = loadSession(phone)
        const session = new StringSession(sessionStr)

        state.client = new TelegramClient(session, appId, appHash, {
            connectionRetries: 3,
        })

        state.phone = phone
        await state.client.connect()

        // Try restoring saved session
        if (sessionStr) {
            try {
                const me = await state.client.getMe() as any
                if (me) {
                    state.me = {
                        username: me.username || undefined,
                        firstName: me.firstName || undefined,
                        id: String(me.id),
                    }
                    state.status = 'connected'
                    saveSession(state.client.session.save() as any, phone)
                    return { ok: true, restored: true }
                }
            } catch {
                try { fs.unlinkSync(getSessionPath(phone)) } catch { }
            }
        }

        const result = await state.client.sendCode(
            { apiId: appId, apiHash: appHash },
            phone
        )

        state.phoneCodeHash = result.phoneCodeHash
        state.status = 'awaiting_code'
        state.error = null
        return { ok: true }
    } catch (err: any) {
        state.status = 'error'
        state.error = err.message || 'Failed to send code'
        return { ok: false, error: state.error! }
    }
}

/** Step 2: Verify auth code */
export async function verifyCode(code: string): Promise<{ ok: boolean; needsPassword?: boolean; error?: string }> {
    if (!state.client || !state.phone || !state.phoneCodeHash) {
        return { ok: false, error: 'No pending auth — call sendCode first' }
    }

    try {
        await state.client.invoke(
            new Api.auth.SignIn({
                phoneNumber: state.phone,
                phoneCodeHash: state.phoneCodeHash,
                phoneCode: code,
            })
        )

        const me = await state.client.getMe() as any
        state.me = {
            username: me.username || undefined,
            firstName: me.firstName || undefined,
            id: String(me.id),
        }
        state.status = 'connected'
        state.error = null
        saveSession(state.client.session.save() as any, state.phone)
        return { ok: true }
    } catch (err: any) {
        if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
            state.status = 'awaiting_password'
            return { ok: true, needsPassword: true }
        }
        state.status = 'error'
        state.error = err.message || 'Failed to verify code'
        return { ok: false, error: state.error! }
    }
}

/** Step 2b: Submit 2FA password */
export async function submitPassword(password: string): Promise<{ ok: boolean; error?: string }> {
    if (!state.client || !state.phone) {
        return { ok: false, error: 'No pending auth' }
    }

    try {
        await state.client.invoke(
            new Api.auth.CheckPassword({
                password: await state.client.computeSrpParams(
                    await state.client.invoke(new Api.account.GetPassword()),
                    password
                ) as any,
            })
        )

        const me = await state.client.getMe() as any
        state.me = {
            username: me.username || undefined,
            firstName: me.firstName || undefined,
            id: String(me.id),
        }
        state.status = 'connected'
        state.error = null
        saveSession(state.client.session.save() as any, state.phone)
        return { ok: true }
    } catch (err: any) {
        state.status = 'error'
        state.error = err.message || 'Wrong password'
        return { ok: false, error: state.error! }
    }
}

/** Disconnect */
export async function disconnect() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer)
        state.pollTimer = null
    }
    if (state.client) {
        try { await state.client.disconnect() } catch { }
        state.client = null
    }
    state.status = 'disconnected'
    state.me = null
    state.phoneCodeHash = null
    state.error = null
}

// ── OSINT Channel Polling ──

// Track last message ID per channel to avoid duplicates
const lastMessageIds = new Map<string, number>()

/** Start polling all OSINT channels */
export function startPolling(intervalMs = 15_000) {
    if (state.pollTimer) clearInterval(state.pollTimer)

    const poll = async () => {
        if (!state.client || state.status !== 'connected') return

        // Seed entity cache
        try {
            await state.client.invoke(
                new Api.messages.GetDialogs({ limit: 100, offsetPeer: new Api.InputPeerEmpty() })
            )
        } catch { }

        for (const channel of OSINT_CHANNELS) {
            try {
                let peer: any
                try {
                    peer = await state.client!.getInputEntity(channel.id)
                } catch {
                    try {
                        peer = await state.client!.getInputEntity(`@${channel.id}`)
                    } catch {
                        console.error(`[telegram] Cannot resolve: ${channel.title} (@${channel.id})`)
                        continue
                    }
                }

                const lastId = lastMessageIds.get(channel.id) || 0
                const result = await state.client!.invoke(
                    new Api.messages.GetHistory({
                        peer,
                        limit: 20,
                        minId: lastId,
                    })
                )

                const msgs = (result as any).messages || []
                let maxId = lastId

                for (const msg of msgs) {
                    if (!msg.message) continue
                    const id = Number(msg.id)
                    if (id <= lastId) continue

                    const alert: TelegramAlert = {
                        id: `tg-${channel.id}-${id}`,
                        channel: channel.id,
                        channelTitle: channel.title,
                        text: msg.message,
                        date: msg.date,
                        mediaType: msg.media?.className?.replace('MessageMedia', '').toLowerCase(),
                    }

                    pushAlert(alert)
                    if (id > maxId) maxId = id
                }

                if (maxId > lastId) {
                    lastMessageIds.set(channel.id, maxId)
                }
            } catch (err: any) {
                console.error(`[telegram] Poll error for ${channel.title}:`, err.message)
            }
        }
    }

    poll()
    state.pollTimer = setInterval(poll, intervalMs)
    console.log(`[telegram] Polling ${OSINT_CHANNELS.length} OSINT channels every ${intervalMs / 1000}s`)
}

export function stopPolling() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer)
        state.pollTimer = null
    }
}
