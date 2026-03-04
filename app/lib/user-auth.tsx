/**
 * user-auth.ts — Client-side authentication manager
 * 
 * Checks /api/auth/me on page load. If logged in, shows user avatar+name.
 * If not logged in, shows "LOGIN" button → GitHub OAuth.
 * Syncs localStorage preferences to server on login.
 */

import { render } from 'melina/client';

interface AuthUser {
    id: number;
    username: string;
    displayName: string;
    avatarUrl: string;
    email: string;
}

let currentUser: AuthUser | null = null;

export function getUser() { return currentUser; }

export async function initAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();

        if (data.authenticated && data.user) {
            currentUser = data.user;
            renderLoggedIn(data.user);

            // Sync local preferences to server if they exist
            syncPrefsToServer(data.preferences || {});
        }
    } catch {
        // Not logged in or server error — show login button (default state)
    }
}

function renderLoggedIn(user: AuthUser) {
    const container = document.getElementById('user-auth');
    if (!container) return;

    container.innerHTML = '';
    render(
        <div className="user-profile" title={`Signed in as ${user.username}`}>
            <img
                src={user.avatarUrl}
                alt={user.displayName}
                className="user-avatar"
                width="24"
                height="24"
            />
            <span className="user-name">{user.displayName || user.username}</span>
            <button
                className="logout-btn"
                title="Sign out"
                onClick={async () => {
                    await fetch('/api/auth/me', { method: 'POST' });
                    currentUser = null;
                    location.reload();
                }}
            >×</button>
        </div>,
        container
    );
}

/** Sync localStorage prefs to server — only uploads if server has no data */
async function syncPrefsToServer(serverPrefs: Record<string, any>) {
    const watchRegions = localStorage.getItem('warmaps-watch-regions');
    if (watchRegions && !serverPrefs.watch_regions) {
        try {
            await fetch('/api/auth/preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'watch_regions', value: JSON.parse(watchRegions) }),
            });
        } catch { }
    }
}

/** Save a preference to server (if logged in) */
export async function savePref(key: string, value: any) {
    if (!currentUser) return;
    try {
        await fetch('/api/auth/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value }),
        });
    } catch { }
}
