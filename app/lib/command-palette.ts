/**
 * command-palette.ts — Ctrl+K command palette for WARMAPS
 * Searchable command launcher with fly-to-location, canvas controls, and help
 */

import { map } from './state';

// ─── Types ──────────────────────────────────────────────

export interface PaletteCommand {
    id: string;
    label: string;
    category: string;
    action: () => void;
}

// ─── Fly-to Helper ──────────────────────────────────────

export function flyToLocation(lat: number, lon: number, zoom: number) {
    if (map?.flyTo) {
        map.flyTo({ center: [lon, lat], zoom, duration: 2000 });
    }
}

// ─── Command Registry ───────────────────────────────────

export type CanvasActions = {
    fitAll: () => void;
    arrange: () => void;
    resetZoom: () => void;
    resetAll: () => void;
};

let _actions: CanvasActions | null = null;

/** Call once from warmaps-canvas to register canvas actions */
export function registerCanvasActions(actions: CanvasActions) {
    _actions = actions;
}

function getCommands(): PaletteCommand[] {
    return [
        // Canvas
        { id: 'fit', label: 'Fit All Containers', category: '⬛ Canvas', action: () => _actions?.fitAll() },
        { id: 'arrange', label: 'Auto-Arrange Grid', category: '⬛ Canvas', action: () => _actions?.arrange() },
        { id: 'reset-zoom', label: 'Reset Zoom to 1:1', category: '⬛ Canvas', action: () => _actions?.resetZoom() },
        { id: 'reset-all', label: 'Reset Pan + Zoom', category: '⬛ Canvas', action: () => _actions?.resetAll() },

        // Navigate — Active Conflicts
        { id: 'go-world', label: 'World Overview', category: '📍 Navigate', action: () => flyToLocation(20, 30, 2) },
        { id: 'go-ukraine', label: 'Fly to Ukraine', category: '📍 Navigate', action: () => flyToLocation(49.0, 32.0, 6) },
        { id: 'go-israel', label: 'Fly to Israel / Gaza', category: '📍 Navigate', action: () => flyToLocation(31.5, 34.8, 8) },
        { id: 'go-iran', label: 'Fly to Iran', category: '📍 Navigate', action: () => flyToLocation(32.4, 53.7, 6) },
        { id: 'go-lebanon', label: 'Fly to Lebanon', category: '📍 Navigate', action: () => flyToLocation(33.9, 35.5, 8) },
        { id: 'go-yemen', label: 'Fly to Yemen / Red Sea', category: '📍 Navigate', action: () => flyToLocation(15.0, 44.0, 6) },
        { id: 'go-syria', label: 'Fly to Syria', category: '📍 Navigate', action: () => flyToLocation(35.0, 38.0, 7) },
        { id: 'go-sudan', label: 'Fly to Sudan', category: '📍 Navigate', action: () => flyToLocation(15.0, 32.0, 6) },
        { id: 'go-taiwan', label: 'Fly to Taiwan Strait', category: '📍 Navigate', action: () => flyToLocation(24.0, 120.0, 7) },
        { id: 'go-korea', label: 'Fly to Korean Peninsula', category: '📍 Navigate', action: () => flyToLocation(38.0, 127.0, 7) },
        { id: 'go-india', label: 'Fly to India-Pakistan', category: '📍 Navigate', action: () => flyToLocation(33.0, 74.0, 6) },
        { id: 'go-myanmar', label: 'Fly to Myanmar', category: '📍 Navigate', action: () => flyToLocation(19.8, 96.2, 6) },
        { id: 'go-ethiopia', label: 'Fly to Ethiopia / Horn of Africa', category: '📍 Navigate', action: () => flyToLocation(9.0, 40.0, 6) },
        { id: 'go-sahel', label: 'Fly to Sahel Region', category: '📍 Navigate', action: () => flyToLocation(14.0, 2.0, 5) },
        { id: 'go-libya', label: 'Fly to Libya', category: '📍 Navigate', action: () => flyToLocation(27.0, 17.0, 6) },
        { id: 'go-drc', label: 'Fly to DR Congo', category: '📍 Navigate', action: () => flyToLocation(-1.5, 29.0, 7) },
        { id: 'go-scs', label: 'Fly to South China Sea', category: '📍 Navigate', action: () => flyToLocation(12.0, 114.0, 5) },
        { id: 'go-somalia', label: 'Fly to Somalia', category: '📍 Navigate', action: () => flyToLocation(5.0, 46.0, 6) },
        { id: 'go-afg', label: 'Fly to Afghanistan', category: '📍 Navigate', action: () => flyToLocation(34.0, 66.0, 6) },

        // Utilities
        { id: 'clear-cache', label: 'Clear Session Cache', category: '🔧 Utilities', action: () => { sessionStorage.clear(); location.reload(); } },

        // Help
        { id: 'help', label: 'Keyboard Shortcuts (?)', category: '❓ Help', action: () => { } },
    ];
}

// ─── Toggle UI ──────────────────────────────────────────

export function toggleCommandPalette() {
    const existing = document.getElementById('wm-command-palette');
    if (existing) { existing.remove(); return; }

    const commands = getCommands();
    let selectedIdx = 0;
    let filtered = commands;

    const overlay = document.createElement('div');
    overlay.id = 'wm-command-palette';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: flex-start; justify-content: center;
        padding-top: 20vh;
        background: rgba(0,0,0,0.5); backdrop-filter: blur(6px);
    `;
    overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

    const panel = document.createElement('div');
    panel.style.cssText = `
        width: 500px; max-height: 400px;
        background: rgba(15, 23, 42, 0.98);
        border: 1px solid rgba(100, 116, 139, 0.3);
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 25px 60px rgba(0,0,0,0.6);
        font-family: var(--font-mono, 'SF Mono', monospace);
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type a command...';
    input.style.cssText = `
        width: 100%; padding: 14px 18px;
        background: transparent; border: none; border-bottom: 1px solid rgba(100,116,139,0.2);
        color: #e2e8f0; font-size: 15px; outline: none;
        font-family: inherit;
    `;

    const list = document.createElement('div');
    list.style.cssText = `max-height: 320px; overflow-y: auto;`;

    function renderList() {
        list.innerHTML = '';
        let lastCat = '';
        filtered.forEach((cmd, i) => {
            if (cmd.category !== lastCat) {
                lastCat = cmd.category;
                const catEl = document.createElement('div');
                catEl.style.cssText = `padding: 8px 18px 4px; font-size: 11px; color: #64748b; letter-spacing: 1px; font-weight: 600;`;
                catEl.textContent = cmd.category;
                list.appendChild(catEl);
            }
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 8px 18px; cursor: pointer; font-size: 13px;
                color: ${i === selectedIdx ? '#22d3ee' : '#e2e8f0'};
                background: ${i === selectedIdx ? 'rgba(34, 211, 238, 0.08)' : 'transparent'};
            `;
            row.textContent = cmd.label;
            row.onmouseenter = () => { selectedIdx = i; renderList(); };
            row.onclick = () => { overlay.remove(); cmd.action(); };
            list.appendChild(row);
        });
    }

    input.oninput = () => {
        const q = input.value.toLowerCase();
        filtered = q ? commands.filter(c => c.label.toLowerCase().includes(q) || c.id.includes(q)) : commands;
        selectedIdx = 0;
        renderList();
    };

    input.onkeydown = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1); renderList(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); renderList(); }
        else if (e.key === 'Enter' && filtered[selectedIdx]) { overlay.remove(); filtered[selectedIdx].action(); }
        else if (e.key === 'Escape') { overlay.remove(); }
    };

    panel.appendChild(input);
    panel.appendChild(list);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    renderList();
    input.focus();
}
