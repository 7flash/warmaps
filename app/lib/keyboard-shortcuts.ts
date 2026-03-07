/**
 * keyboard-shortcuts.ts — Keyboard shortcuts for WARMAPS canvas
 *
 * Extracted from warmaps-canvas.ts for modularity.
 * Handles: F (fit), A (arrange), R (reset zoom), 0 (origin),
 * ? (help overlay), Ctrl+K (command palette), Esc (close all).
 */

import { toggleCommandPalette } from './command-palette';

// ─── Types ──────────────────────────────────────────────

interface ShortcutActions {
    fitAll: () => void;
    arrange: () => void;
    resetZoom: () => void;
    resetToOrigin: () => void;
}

// ─── Help Overlay ───────────────────────────────────────

let helpVisible = false;

function toggleShortcutHelp() {
    const existing = document.getElementById('wm-shortcut-help');
    if (existing) {
        existing.remove();
        helpVisible = false;
        return;
    }
    helpVisible = true;

    const overlay = document.createElement('div');
    overlay.id = 'wm-shortcut-help';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
        animation: fadeIn 0.15s ease-out;
    `;
    overlay.onclick = (ev) => {
        if (ev.target === overlay) { overlay.remove(); helpVisible = false; }
    };

    const kbd = (key: string) =>
        `<kbd style="background: rgba(51,65,85,0.6); padding: 2px 8px; border-radius: 4px; text-align: center; color: #67e8f9; font-weight: 600;">${key}</kbd>`;

    const kbdSmall = (key: string) =>
        `<kbd style="background: rgba(51,65,85,0.4); padding: 1px 4px; border-radius: 3px; color: #94a3b8;">${key}</kbd>`;

    const shortcuts = [
        ['F', 'Fit all containers to view'],
        ['A', 'Auto-arrange grid layout'],
        ['R', 'Reset zoom to 1:1'],
        ['0', 'Reset pan + zoom to origin'],
        ['?', 'Toggle this help'],
        ['⌘K', 'Command palette'],
        ['Esc', 'Close overlays / menus'],
    ];

    overlay.innerHTML = `
        <div style="
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(100, 116, 139, 0.25);
            border-radius: 16px;
            padding: 28px 36px;
            max-width: 420px;
            color: #e2e8f0;
            font-family: var(--font-mono, 'SF Mono', monospace);
            box-shadow: 0 25px 50px rgba(0,0,0,0.5);
        ">
            <div style="font-size: 14px; font-weight: 700; color: #22d3ee; margin-bottom: 16px; letter-spacing: 2px;">
                ⌨ KEYBOARD SHORTCUTS
            </div>
            <div style="display: grid; grid-template-columns: 50px 1fr; gap: 8px 12px; font-size: 13px;">
                ${shortcuts.map(([key, desc]) => `${kbd(key!)}<span>${desc}</span>`).join('\n                ')}
            </div>
            <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(100,116,139,0.2); font-size: 11px; color: #64748b;">
                ${kbdSmall('Shift')}+drag → snap to grid  ·
                ${kbdSmall('Scroll')} → zoom  ·
                ${kbdSmall('Drag')} → pan  ·
                ${kbdSmall('Dbl-click')} header → collapse
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// ─── Escape handler ─────────────────────────────────────

function handleEscape() {
    // Close command palette
    document.getElementById('wm-command-palette')?.remove();
    // Close help overlay
    document.getElementById('wm-shortcut-help')?.remove();
    helpVisible = false;
    // Close country profile modal
    document.getElementById('country-profile-modal')?.remove();
    document.getElementById('country-profile-overlay')?.remove();
    // Close widget context menu
    document.querySelector('.wm-context-menu')?.remove();
    // Close old search modal
    const searchModal = document.getElementById('search-modal');
    if (searchModal) searchModal.style.display = 'none';
}

// ─── Init ───────────────────────────────────────────────

export function initKeyboardShortcuts(actions: ShortcutActions) {
    window.addEventListener('keydown', (e) => {
        // Skip when typing in inputs (except Escape and Ctrl+K)
        const tag = (e.target as HTMLElement)?.tagName;
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;

        // Ctrl+K / Cmd+K — Command palette (works even in inputs)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            toggleCommandPalette();
            return;
        }

        if (isInput) return;

        switch (e.key.toLowerCase()) {
            case 'f':
                e.preventDefault();
                actions.fitAll();
                break;

            case 'a':
                if (!e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    actions.arrange();
                }
                break;

            case 'r':
                e.preventDefault();
                actions.resetZoom();
                break;

            case '0':
                e.preventDefault();
                actions.resetToOrigin();
                break;

            case '?':
            case '/':
                if (e.key === '/' && !e.shiftKey) break; // Only ? (Shift+/)
                e.preventDefault();
                toggleShortcutHelp();
                break;

            case 'escape':
                handleEscape();
                break;
        }
    });
}
