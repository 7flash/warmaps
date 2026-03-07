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
// Curated intelligence matrix for Middle East & global conflict OSINT
export const OSINT_CHANNELS = [
    // ─ Official / Semi-Official State Agencies ─
    { id: 'Farsna', title: 'Fars News Agency', category: 'state' },
    { id: 'TasnimNewsEN', title: 'Tasnim News (IRGC-linked)', category: 'state' },
    { id: 'IranIntlEn', title: 'Iran International', category: 'state' },
    { id: 'TehranTimes', title: 'Tehran Times', category: 'state' },
    { id: 'SepahNews', title: 'Sepah News (IRGC)', category: 'state' },
    { id: 'PressTV', title: 'Press TV', category: 'state' },

    // ─ Conflict Media & Aggregators ─
    { id: 'Middle_East_Spectator', title: 'Middle East Spectator', category: 'conflict' },
    { id: 'ClashReport', title: 'Clash Report', category: 'conflict' },
    { id: 'abualiexpress', title: 'Abu Ali Express', category: 'conflict' },
    { id: 'CIG_telegram', title: 'Caliber Intelligence Group', category: 'conflict' },
    { id: 'IntelRepublic', title: 'Intelligence Republic', category: 'conflict' },
    { id: 'RedAlertsIsrael', title: 'Red Alert Israel', category: 'conflict' },
    { id: 'OSINTdefender', title: 'OSINT Defender', category: 'conflict' },
    { id: 'SuriyakMap', title: 'Suriyak Map', category: 'conflict' },
    { id: 'TheWarZoneTWZ', title: 'The War Zone', category: 'conflict' },

    // ─ Hacktivist & Cyber Networks ─
    { id: 'QudsElectronicArmy', title: 'Quds Electronic Army', category: 'cyber' },
    { id: 'hizbollahsyber', title: 'Hezbollah Cyber', category: 'cyber' },

    // ─ Geospatial Verification ─
    { id: 'MiddleEastEYE', title: 'Middle East Eye', category: 'geoVerify' },
    { id: 'TheIntelLab', title: 'Intel Lab', category: 'geoVerify' },

    // ─ Ukraine Theater ─
    { id: 'rybar_in_english', title: 'Rybar (English)', category: 'ukraine' },
    { id: 'MilitarylandNet', title: 'MilitaryLand.net', category: 'ukraine' },
    { id: 'DeepStateUA', title: 'DeepState UA', category: 'ukraine' },
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
    category?: string
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

// Known conflict locations for automatic geolocation
const KNOWN_LOCATIONS: Array<{ pattern: RegExp; lat: number; lon: number; name: string }> = [
    // Iran — nuclear sites & military targets
    { pattern: /\bisfahan\b/i, lat: 32.65, lon: 51.68, name: 'Isfahan' },
    { pattern: /\btehran\b/i, lat: 35.69, lon: 51.39, name: 'Tehran' },
    { pattern: /\bnatanz\b/i, lat: 33.51, lon: 51.73, name: 'Natanz' },
    { pattern: /\bfordow\b/i, lat: 34.88, lon: 51.59, name: 'Fordow' },
    { pattern: /\bbushehr\b/i, lat: 28.97, lon: 50.84, name: 'Bushehr' },
    { pattern: /\btabriz\b/i, lat: 38.07, lon: 46.30, name: 'Tabriz' },
    { pattern: /\bshiraz\b/i, lat: 29.59, lon: 52.58, name: 'Shiraz' },
    { pattern: /\bbandar abbas\b/i, lat: 27.19, lon: 56.28, name: 'Bandar Abbas' },
    { pattern: /\bhormuz\b/i, lat: 27.06, lon: 56.46, name: 'Strait of Hormuz' },
    { pattern: /\bmashhad\b/i, lat: 36.30, lon: 59.60, name: 'Mashhad' },
    { pattern: /\bparchin\b/i, lat: 35.52, lon: 51.77, name: 'Parchin' },
    { pattern: /\barak\b/i, lat: 34.09, lon: 49.69, name: 'Arak' },
    { pattern: /\bkharg\b/i, lat: 29.23, lon: 50.32, name: 'Kharg Island' },
    { pattern: /\bchabahar\b/i, lat: 25.30, lon: 60.64, name: 'Chabahar' },

    // Israel / Palestine
    { pattern: /\btel aviv\b/i, lat: 32.08, lon: 34.78, name: 'Tel Aviv' },
    { pattern: /\bjerusalem\b/i, lat: 31.77, lon: 35.23, name: 'Jerusalem' },
    { pattern: /\bgaza\b/i, lat: 31.50, lon: 34.47, name: 'Gaza' },
    { pattern: /\bdimona\b/i, lat: 31.07, lon: 35.03, name: 'Dimona' },
    { pattern: /\bhaifa\b/i, lat: 32.79, lon: 34.99, name: 'Haifa' },
    { pattern: /\bnegev\b/i, lat: 30.85, lon: 34.78, name: 'Negev' },
    { pattern: /\brafah\b/i, lat: 31.30, lon: 34.25, name: 'Rafah' },
    { pattern: /\bkhan younis\b/i, lat: 31.35, lon: 34.30, name: 'Khan Younis' },
    { pattern: /\bnablus\b/i, lat: 32.22, lon: 35.26, name: 'Nablus' },
    { pattern: /\bhebron\b/i, lat: 31.53, lon: 35.10, name: 'Hebron' },
    { pattern: /\bjenin\b/i, lat: 32.46, lon: 35.30, name: 'Jenin' },
    { pattern: /\bramallah\b/i, lat: 31.90, lon: 35.20, name: 'Ramallah' },
    { pattern: /\bbeersheba\b/i, lat: 31.25, lon: 34.79, name: 'Beersheba' },
    { pattern: /\bashkelon\b/i, lat: 31.67, lon: 34.57, name: 'Ashkelon' },
    { pattern: /\bashdod\b/i, lat: 31.80, lon: 34.65, name: 'Ashdod' },
    { pattern: /\bgolan\b/i, lat: 33.00, lon: 35.80, name: 'Golan Heights' },

    // Lebanon
    { pattern: /\bbeirut\b/i, lat: 33.89, lon: 35.50, name: 'Beirut' },
    { pattern: /\bdahiyeh\b/i, lat: 33.84, lon: 35.51, name: 'Dahiyeh' },
    { pattern: /\btyre\b/i, lat: 33.27, lon: 35.20, name: 'Tyre' },
    { pattern: /\bsidon\b/i, lat: 33.56, lon: 35.37, name: 'Sidon' },
    { pattern: /\bbaalbek\b/i, lat: 34.01, lon: 36.21, name: 'Baalbek' },
    { pattern: /\bnabatieh\b/i, lat: 33.38, lon: 35.48, name: 'Nabatieh' },
    { pattern: /\blitani\b/i, lat: 33.35, lon: 35.30, name: 'Litani River' },

    // Syria
    { pattern: /\bdamascus\b/i, lat: 33.51, lon: 36.29, name: 'Damascus' },
    { pattern: /\baleppo\b/i, lat: 36.20, lon: 37.15, name: 'Aleppo' },
    { pattern: /\bidlib\b/i, lat: 35.93, lon: 36.63, name: 'Idlib' },
    { pattern: /\bhoms\b/i, lat: 34.73, lon: 36.72, name: 'Homs' },
    { pattern: /\bdeir ez.?zor\b/i, lat: 35.33, lon: 40.14, name: 'Deir ez-Zor' },
    { pattern: /\braqqa\b/i, lat: 35.95, lon: 39.01, name: 'Raqqa' },
    { pattern: /\blatakia\b/i, lat: 35.52, lon: 35.79, name: 'Latakia' },
    { pattern: /\btartus\b/i, lat: 34.89, lon: 35.89, name: 'Tartus' },

    // Iraq
    { pattern: /\bbaghdad\b/i, lat: 33.31, lon: 44.37, name: 'Baghdad' },
    { pattern: /\berbil\b/i, lat: 36.19, lon: 44.01, name: 'Erbil' },
    { pattern: /\bmosul\b/i, lat: 36.34, lon: 43.12, name: 'Mosul' },
    { pattern: /\bbasra\b/i, lat: 30.51, lon: 47.81, name: 'Basra' },
    { pattern: /\bkirkuk\b/i, lat: 35.47, lon: 44.39, name: 'Kirkuk' },
    { pattern: /\btikrit\b/i, lat: 34.61, lon: 43.68, name: 'Tikrit' },

    // Ukraine — expanded frontlines
    { pattern: /\bkyiv\b/i, lat: 50.45, lon: 30.52, name: 'Kyiv' },
    { pattern: /\bkharkiv\b/i, lat: 49.99, lon: 36.23, name: 'Kharkiv' },
    { pattern: /\bodessa\b/i, lat: 46.48, lon: 30.73, name: 'Odessa' },
    { pattern: /\bkremenchuk\b/i, lat: 49.07, lon: 33.42, name: 'Kremenchuk' },
    { pattern: /\bdnipro\b/i, lat: 48.47, lon: 35.04, name: 'Dnipro' },
    { pattern: /\bzaporizhzhia\b/i, lat: 47.84, lon: 35.14, name: 'Zaporizhzhia' },
    { pattern: /\bcrimea\b/i, lat: 44.95, lon: 34.10, name: 'Crimea' },
    { pattern: /\bdonetsk\b/i, lat: 48.00, lon: 37.80, name: 'Donetsk' },
    { pattern: /\bluhansk\b/i, lat: 48.57, lon: 39.31, name: 'Luhansk' },
    { pattern: /\bkherson\b/i, lat: 46.64, lon: 32.62, name: 'Kherson' },
    { pattern: /\bmykolaiv\b/i, lat: 46.97, lon: 32.00, name: 'Mykolaiv' },
    { pattern: /\bbakhmut\b/i, lat: 48.59, lon: 38.00, name: 'Bakhmut' },
    { pattern: /\bavdiivka\b/i, lat: 48.14, lon: 37.75, name: 'Avdiivka' },
    { pattern: /\bsevastopol\b/i, lat: 44.62, lon: 33.53, name: 'Sevastopol' },
    { pattern: /\bmelitopol\b/i, lat: 46.84, lon: 35.37, name: 'Melitopol' },
    { pattern: /\blviv\b/i, lat: 49.84, lon: 24.03, name: 'Lviv' },
    { pattern: /\bsumy\b/i, lat: 50.91, lon: 34.80, name: 'Sumy' },

    // Russia — military targets mentioned in OSINT
    { pattern: /\bmoscow\b/i, lat: 55.76, lon: 37.62, name: 'Moscow' },
    { pattern: /\brostov\b/i, lat: 47.24, lon: 39.71, name: 'Rostov-on-Don' },
    { pattern: /\bbelgorod\b/i, lat: 50.60, lon: 36.59, name: 'Belgorod' },
    { pattern: /\bkursk\b/i, lat: 51.73, lon: 36.19, name: 'Kursk' },
    { pattern: /\bnovorossiysk\b/i, lat: 44.72, lon: 37.77, name: 'Novorossiysk' },

    // Yemen / Horn of Africa / Red Sea
    { pattern: /\bsanaa\b/i, lat: 15.37, lon: 44.19, name: "Sana'a" },
    { pattern: /\bhodeida\b/i, lat: 14.80, lon: 42.95, name: 'Hodeidah' },
    { pattern: /\baden\b/i, lat: 12.79, lon: 45.02, name: 'Aden' },
    { pattern: /\bmarib\b/i, lat: 15.46, lon: 45.32, name: 'Marib' },
    { pattern: /\bbab.?el.?mandeb\b/i, lat: 12.58, lon: 43.33, name: 'Bab el-Mandeb' },
    { pattern: /\bred sea\b/i, lat: 20.00, lon: 38.00, name: 'Red Sea' },
    { pattern: /\bdjibouti\b/i, lat: 11.59, lon: 43.15, name: 'Djibouti' },

    // Sudan
    { pattern: /\bkhartoum\b/i, lat: 15.60, lon: 32.53, name: 'Khartoum' },
    { pattern: /\bport sudan\b/i, lat: 19.62, lon: 37.22, name: 'Port Sudan' },
    { pattern: /\bdarfur\b/i, lat: 13.50, lon: 25.00, name: 'Darfur' },

    // Libya
    { pattern: /\btripoli\b/i, lat: 32.90, lon: 13.18, name: 'Tripoli' },
    { pattern: /\bbenghazi\b/i, lat: 32.12, lon: 20.09, name: 'Benghazi' },

    // East Asia — Taiwan Strait & Korean Peninsula
    { pattern: /\btaiwan strait\b/i, lat: 24.50, lon: 119.50, name: 'Taiwan Strait' },
    { pattern: /\btaipei\b/i, lat: 25.03, lon: 121.57, name: 'Taipei' },
    { pattern: /\bpyongyang\b/i, lat: 39.02, lon: 125.75, name: 'Pyongyang' },
    { pattern: /\bsouth china sea\b/i, lat: 14.50, lon: 114.00, name: 'South China Sea' },
]

function extractLocation(text: string): TelegramAlert['location'] | undefined {
    for (const loc of KNOWN_LOCATIONS) {
        if (loc.pattern.test(text)) {
            return { lat: loc.lat, lon: loc.lon, name: loc.name }
        }
    }
    return undefined
}

function classifyThreat(text: string): TelegramAlert['threatLevel'] {
    const lower = text.toLowerCase()
    if (/\b(explosion|missile\s+hit|strike\s+on|nuclear|wmd|chemical\s+attack|casualt|killed|dead|intercept(?:ed|ion)|ballistic|hypersonic|cruise\s+missile)/.test(lower))
        return 'critical'
    if (/\b(attack|shoot|drone\s+strike|siren|alert|launch|fire[sd]?\s+(?:at|on|upon)|raid|shell(?:ing|ed)|bomb(?:ing|ard)|air\s*strike|rocket|rpg|torpedo|ambush|IED|VBIED|sabotage)/.test(lower))
        return 'high'
    if (/\b(troop|deploy|military|convoy|naval|airspace|forces|mobiliz|exercise|buildup|standoff|blockade|sanction|embargo|ceasefire|negotiat|escalat|tension|warning|provocat)/.test(lower))
        return 'medium'
    return 'low'
}

// Equipment type detection for military hardware mentions
const EQUIPMENT_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
    // Missiles
    { pattern: /\b(S-?300|S-?400|S-?500|Patriot|THAAD|Iron\s*Dome|David'?s?\s*Sling)\b/i, type: 'air-defense' },
    { pattern: /\b(Iskander|Kalibr|Kinzhal|Shahed|Geran|Tomahawk|ATACMS|HIMARS|Storm\s*Shadow|SCALP|Tochka|Fateh|Emad|Khorramshahr|Sejjil)\b/i, type: 'missile' },
    { pattern: /\b(ICBM|ballistic\s*missile|cruise\s*missile|hypersonic|Zircon|Brahmos)\b/i, type: 'missile' },

    // Drones/UAV
    { pattern: /\b(Shahed[- ]?136|Shahed[- ]?131|Mohajer|Bayraktar|TB2|Lancet|Orion|MQ-?9|Predator|Reaper|Heron|Hermes)\b/i, type: 'drone' },
    { pattern: /\b(UAV|UAS|UCAV|kamikaze\s*drone|FPV\s*drone|loitering\s*munition)\b/i, type: 'drone' },

    // Aircraft
    { pattern: /\b(F-?15|F-?16|F-?35|Su-?34|Su-?35|Su-?57|MiG-?29|MiG-?31|Tu-?95|Tu-?160|B-?52|B-?2|A-?10|Eurofighter|Rafale)\b/i, type: 'aircraft' },
    { pattern: /\b(Apache|Black\s*Hawk|Chinook|Ka-?52|Mi-?24|Mi-?28)\b/i, type: 'helicopter' },

    // Naval
    { pattern: /\b(aircraft\s*carrier|destroyer|frigate|corvette|submarine|cruiser|warship|gunboat|patrol\s*boat|USS|HMS)\b/i, type: 'naval' },

    // Armor
    { pattern: /\b(Leopard|Abrams|T-?72|T-?90|T-?80|Merkava|Challenger|Bradley|BMP|BTR|MRAP|APC|IFV)\b/i, type: 'armor' },

    // Artillery
    { pattern: /\b(howitzer|MLRS|Grad|Smerch|Uragan|M777|Caesar|PzH|CAESAR|Panzerhaubitze|artillery|mortar)\b/i, type: 'artillery' },

    // Infantry
    { pattern: /\b(Javelin|NLAW|Stinger|MANPAD|TOW|RPG-?\d|AT-?4|Carl\s*Gustaf|Kornet)\b/i, type: 'infantry-weapon' },
]

function extractEquipment(text: string): string | undefined {
    for (const eq of EQUIPMENT_PATTERNS) {
        if (eq.pattern.test(text)) return eq.type
    }
    return undefined
}

// Track last message ID per channel to avoid duplicates
const lastMessageIds = new Map<string, number>()

// Track channels that fail to resolve (don't retry for 1 hour)
const failedChannels = new Map<string, number>();
const FAILED_CHANNEL_TTL = 3600_000; // 1 hour

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
                // Skip recently-failed channels
                const failedAt = failedChannels.get(channel.id);
                if (failedAt && Date.now() - failedAt < FAILED_CHANNEL_TTL) continue;

                let peer: any
                try {
                    peer = await state.client!.getInputEntity(channel.id)
                } catch {
                    try {
                        peer = await state.client!.getInputEntity(`@${channel.id}`)
                    } catch {
                        failedChannels.set(channel.id, Date.now());
                        console.error(`[telegram] Cannot resolve: ${channel.title} (@${channel.id}) — skipping for 1h`)
                        continue
                    }
                }
                // Clear from failed cache on successful resolve
                failedChannels.delete(channel.id);

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
                        category: channel.category,
                        text: msg.message,
                        date: msg.date,
                        mediaType: msg.media?.className?.replace('MessageMedia', '').toLowerCase(),
                        location: extractLocation(msg.message),
                        threatLevel: classifyThreat(msg.message),
                        equipmentType: extractEquipment(msg.message),
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
