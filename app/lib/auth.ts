/**
 * WARMAPS — User Database & Session Management
 * 
 * SQLite-backed user accounts with GitHub OAuth.
 * Stores user profiles, sessions, and preferences
 * (favorite regions, custom filters, portfolio positions).
 */

import { Database, z } from 'sqlite-zod-orm';
import path from 'path';
import crypto from 'crypto';

// ─── Database ────────────────────────────────────────────────

const DB_PATH = path.join(import.meta.dir, '..', '..', 'starwar_users.db');

export const userDb = new Database(DB_PATH, {
    users: z.object({
        githubId: z.string(),               // GitHub numeric ID (unique)
        username: z.string(),               // GitHub login
        displayName: z.string().default(''),
        avatarUrl: z.string().default(''),
        email: z.string().default(''),
        createdAt: z.string().default(() => new Date().toISOString()),
        lastLoginAt: z.string().default(() => new Date().toISOString()),
    }),
    sessions: z.object({
        token: z.string(),                  // Random session token (cookie)
        user_id: z.number(),                // FK to users
        expiresAt: z.string(),              // ISO timestamp
        createdAt: z.string().default(() => new Date().toISOString()),
    }),
    user_preferences: z.object({
        user_id: z.number(),                // FK to users
        key: z.string(),                    // Preference key
        value: z.string(),                  // JSON value
        updatedAt: z.string().default(() => new Date().toISOString()),
    }),
    geo_pins: z.object({
        signature: z.string(),              // Solana tx signature
        sender: z.string(),                 // Wallet public key
        lat: z.number(),                    // Latitude
        lng: z.number(),                    // Longitude
        message: z.string(),                // User message (max 280 chars)
        timestamp: z.number(),              // Unix ms
    }),
}, {
    relations: {
        sessions: { user_id: 'users' },
        user_preferences: { user_id: 'users' },
    },
    indexes: {
        users: ['githubId', 'username'],
        sessions: ['token', 'user_id'],
        user_preferences: ['user_id', 'key'],
        geo_pins: ['sender', 'signature'],
    },
    reactive: false,
});

console.log(`[auth] User database initialized at ${DB_PATH}`);

// ─── Session Helpers ─────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(userId: number): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    userDb.sessions.insert({ token, user_id: userId, expiresAt });
    return token;
}

export function getSessionUser(token: string) {
    if (!token) return null;
    const session = userDb.sessions.select().where({ token }).get();
    if (!session) return null;

    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
        userDb.sessions.delete(session.id);
        return null;
    }

    const user = userDb.users.select().where({ id: session.user_id }).get();
    return user || null;
}

export function deleteSession(token: string): void {
    const session = userDb.sessions.select().where({ token }).get();
    if (session) userDb.sessions.delete(session.id);
}

// ─── User Helpers ────────────────────────────────────────────

export function findOrCreateUser(githubProfile: {
    id: string;
    login: string;
    name?: string;
    avatar_url?: string;
    email?: string;
}) {
    const existing = userDb.users.select().where({ githubId: githubProfile.id }).get();
    if (existing) {
        // Update last login and any changed profile data
        existing.update({
            lastLoginAt: new Date().toISOString(),
            username: githubProfile.login,
            displayName: githubProfile.name || existing.displayName,
            avatarUrl: githubProfile.avatar_url || existing.avatarUrl,
            email: githubProfile.email || existing.email,
        });
        return existing;
    }

    return userDb.users.insert({
        githubId: githubProfile.id,
        username: githubProfile.login,
        displayName: githubProfile.name || githubProfile.login,
        avatarUrl: githubProfile.avatar_url || '',
        email: githubProfile.email || '',
    });
}

// ─── Preference Helpers ──────────────────────────────────────

/** Known preference keys */
export type PrefKey = 'watch_regions' | 'filters' | 'map_view' | 'portfolio' | 'theme' | 'feature_flags';

export function setPref(userId: number, key: PrefKey, value: any) {
    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
    return userDb.user_preferences.upsert(
        { user_id: userId, key },
        { user_id: userId, key, value: jsonValue, updatedAt: new Date().toISOString() },
    );
}

export function getPref(userId: number, key: PrefKey): any | null {
    const row = userDb.user_preferences.select().where({ user_id: userId, key }).get();
    if (!row) return null;
    try { return JSON.parse(row.value); } catch { return row.value; }
}

export function getAllPrefs(userId: number): Record<string, any> {
    const rows = userDb.user_preferences.select().where({ user_id: userId }).all();
    const result: Record<string, any> = {};
    for (const row of rows) {
        try { result[row.key] = JSON.parse(row.value); }
        catch { result[row.key] = row.value; }
    }
    return result;
}

// ─── Auth from Request ───────────────────────────────────────

export function getSessionFromRequest(req: Request) {
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/wm_session=([a-f0-9]+)/);
    return match ? getSessionUser(match[1]) : null;
}

export function sessionCookie(token: string, maxAge = 30 * 24 * 60 * 60): string {
    return `wm_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
