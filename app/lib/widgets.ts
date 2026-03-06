/**
 * widgets.ts — Widget registry & instance management for WARMAPS Canvas
 * 
 * Each widget type defines a category, default size, config schema,
 * and a render function. Users can add/remove/configure widget instances.
 */

export interface WidgetConfig {
    [key: string]: any;
}

export interface ConfigField {
    key: string;
    label: string;
    type: 'select' | 'multiselect' | 'text' | 'toggle';
    options?: { value: string; label: string }[];
}

export interface WidgetType {
    id: string;
    name: string;
    icon: string;
    category: 'map' | 'feed' | 'data' | 'social' | 'media' | 'ai';
    description: string;
    defaultWidth: number;
    defaultHeight: number;
    /** Default config values */
    defaultConfig: WidgetConfig;
    /** Whether multiple instances are allowed */
    multi: boolean;
    /** Configurable fields for the settings panel */
    configFields?: ConfigField[];
}

export interface WidgetInstance {
    id: string;         // unique instance id
    typeId: string;     // references WidgetType.id
    x: number;
    y: number;
    width: number;
    height: number;
    collapsed: boolean;
    config: WidgetConfig;
}

// ─── Widget Type Registry ───────────────────────────────

export const WIDGET_TYPES: WidgetType[] = [
    {
        id: 'map',
        name: 'Global Map',
        icon: '🌍',
        category: 'map',
        description: 'Interactive map. Configure data layers like flights or earthquakes.',
        defaultWidth: 700,
        defaultHeight: 500,
        defaultConfig: { layers: 'events' },
        multi: true,
        configFields: [
            {
                key: 'layers', label: 'Data Layer', type: 'select', options: [
                    { value: 'events', label: '⚡ Conflict Events' },
                    { value: 'fires', label: '🔥 NASA Fires' },
                    { value: 'flights', label: '✈ ADSB Flights' },
                    { value: 'seismic', label: '🌍 USGS Seismic' },
                    { value: 'acled', label: '📊 ACLED Data' },
                    { value: 'assets', label: '🚢 Strategic Assets' },
                    { value: 'all', label: '🌐 All (Cluttered)' },
                ]
            },
        ],
    },
    {
        id: 'heatmap',
        name: 'Heat Map',
        icon: '🔥',
        category: 'map',
        description: 'Heatmap visualization of conflict intensity, fire clusters, or event density.',
        defaultWidth: 500,
        defaultHeight: 400,
        defaultConfig: { source: 'fires' },
        multi: true,
        configFields: [
            {
                key: 'source', label: 'Data Source', type: 'select', options: [
                    { value: 'fires', label: '🔥 NASA Fires' },
                    { value: 'events', label: '⚡ Conflict Events' },
                    { value: 'acled', label: '📊 ACLED' },
                    { value: 'seismic', label: '🌍 Seismic' },
                ]
            },
        ],
    },
    {
        id: 'news',
        name: 'News Feed',
        icon: '📡',
        category: 'feed',
        description: 'Real-time news feed from GDELT. Filter by source, region, or keyword.',
        defaultWidth: 380,
        defaultHeight: 500,
        defaultConfig: { filter: 'all', source: 'all', search: '' },
        multi: true,
        configFields: [
            {
                key: 'filter', label: 'Feed Filter', type: 'select', options: [
                    { value: 'all', label: '🔥 All' },
                    { value: 'intense', label: '⚡ High Intensity' },
                    { value: 'recent', label: '🕐 Last 24h' },
                    { value: 'escalation', label: '↗ Escalation' },
                ]
            },
            {
                key: 'source', label: 'Source Region', type: 'select', options: [
                    { value: 'all', label: '🌐 All Regions' },
                    { value: 'mideast', label: '🏜 Middle East' },
                    { value: 'europe', label: '🇪🇺 Europe' },
                    { value: 'asia', label: '🌏 Asia-Pacific' },
                    { value: 'africa', label: '🌍 Africa' },
                ]
            },
            { key: 'search', label: 'Keyword Filter', type: 'text' },
        ],
    },
    {
        id: 'telegram',
        name: 'Telegram OSINT',
        icon: '💬',
        category: 'feed',
        description: 'Live Telegram feed for a specific channel.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'all' },
        multi: true,
        configFields: [
            {
                key: 'channel', label: 'Telegram Channel', type: 'select', options: [
                    { value: 'all', label: '📡 All Channels' },
                    { value: 'DDGeopolitics', label: 'DD Geopolitics' },
                    { value: 'intelslava', label: 'Intel Slava Z' },
                    { value: 'mod_russia', label: 'MoD Russia' },
                    { value: 'zoka200', label: 'Zoka' },
                    { value: 'nexta_tv', label: 'NEXTA' },
                    { value: 'liveukraine_media', label: 'Live Ukraine' },
                ]
            },
        ],
    },
    {
        id: 'tokens',
        name: 'PF Tokens',
        icon: '🪙',
        category: 'data',
        description: 'Pump.fun conflict token tracker with price data and location tags.',
        defaultWidth: 380,
        defaultHeight: 340,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'markets',
        name: 'Prediction Markets',
        icon: '💎',
        category: 'data',
        description: 'Polymarket prediction markets for conflict and geopolitical bets.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { category: 'all' },
        multi: false,
        configFields: [
            {
                key: 'category', label: 'Market Category', type: 'select', options: [
                    { value: 'all', label: '📊 All Markets' },
                    { value: 'conflict', label: '⚔ Conflict' },
                    { value: 'geopolitical', label: '🌐 Geopolitical' },
                ]
            },
        ],
    },
    {
        id: 'intel',
        name: 'Intel Panel',
        icon: '🎯',
        category: 'data',
        description: 'Threat radar + panic economy (USDT/IRT) tracker.',
        defaultWidth: 380,
        defaultHeight: 340,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'gdelt',
        name: 'GDELT Events',
        icon: '📊',
        category: 'data',
        description: 'GDELT event stream with event types, actors, and tone analysis.',
        defaultWidth: 380,
        defaultHeight: 300,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'fires',
        name: 'Satellite Fires',
        icon: '🔥',
        category: 'data',
        description: 'NASA FIRMS thermal anomaly feed — live satellite fire detection.',
        defaultWidth: 380,
        defaultHeight: 300,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'seismic',
        name: 'Seismic Monitor',
        icon: '🌍',
        category: 'data',
        description: 'USGS earthquake data with magnitude and location tracking.',
        defaultWidth: 380,
        defaultHeight: 280,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'ai',
        name: 'AI Analyst',
        icon: '🤖',
        category: 'ai',
        description: 'Gemini-powered AI assistant for conflict analysis and intelligence queries.',
        defaultWidth: 360,
        defaultHeight: 340,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'chat',
        name: 'Global Chat',
        icon: '🗨️',
        category: 'social',
        description: 'WebSocket-based live chat room.',
        defaultWidth: 340,
        defaultHeight: 400,
        defaultConfig: {},
        multi: false,
    },
    {
        id: 'tv',
        name: 'Live TV',
        icon: '📺',
        category: 'media',
        description: 'Live news streams — Al Jazeera, France24, Sky, DW, CNN.',
        defaultWidth: 340,
        defaultHeight: 340,
        defaultConfig: { channel: 'aljazeeraenglish' },
        multi: true,
        configFields: [
            {
                key: 'channel', label: 'TV Channel', type: 'select', options: [
                    { value: 'aljazeeraenglish', label: '📺 Al Jazeera English' },
                    { value: 'france24english', label: '📺 France24 English' },
                    { value: 'skynews', label: '📺 Sky News' },
                    { value: 'dwnews', label: '📺 DW News' },
                    { value: 'cnn', label: '📺 CNN' },
                ]
            },
        ],
    },
];

export function getWidgetType(typeId: string): WidgetType | undefined {
    return WIDGET_TYPES.find(w => w.id === typeId);
}

// ─── Instance Management ────────────────────────────────

const INSTANCES_KEY = 'warmaps:instances';
let nextInstanceId = 1;

// ─── Preset Management ────────────────────────────────────

export const LAYOUT_PRESETS: Record<string, WidgetInstance[]> = {
    'monitoring': getDefaultInstances(),
    'trading': [
        { id: 'wm-c-tokens', typeId: 'tokens', x: 200, y: 100, width: 380, height: 340, collapsed: false, config: {} },
        { id: 'wm-c-markets', typeId: 'markets', x: 600, y: 100, width: 380, height: 340, collapsed: false, config: { category: 'all' } },
        { id: 'wm-c-intel', typeId: 'intel', x: 1000, y: 100, width: 380, height: 340, collapsed: false, config: {} },
        { id: 'wm-c-chat', typeId: 'chat', x: 1400, y: 100, width: 340, height: 400, collapsed: false, config: {} },
        { id: 'wm-c-pulse', typeId: 'news', x: 200, y: 460, width: 380, height: 500, collapsed: false, config: { filter: 'all', source: 'all' } },
        { id: 'wm-c-ai', typeId: 'ai', x: 600, y: 460, width: 360, height: 340, collapsed: false, config: {} },
    ],
    'analysis': [
        { id: 'wm-c-map', typeId: 'map', x: 100, y: 100, width: 800, height: 600, collapsed: false, config: { layers: ['events', 'fires', 'flights', 'seismic', 'acled'] } },
        { id: 'wm-c-data', typeId: 'gdelt', x: 920, y: 100, width: 380, height: 300, collapsed: false, config: {} },
        { id: 'wm-c-fires', typeId: 'fires', x: 920, y: 420, width: 380, height: 300, collapsed: false, config: {} },
        { id: 'wm-c-seismic', typeId: 'seismic', x: 1320, y: 100, width: 380, height: 280, collapsed: false, config: {} },
        { id: 'wm-c-pulse', typeId: 'news', x: 1320, y: 400, width: 380, height: 500, collapsed: false, config: { filter: 'all', source: 'all' } },
    ]
};

export function loadUserPresets(): Record<string, WidgetInstance[]> {
    try {
        const saved = localStorage.getItem('warmaps:user_layouts');
        if (saved) return JSON.parse(saved);
    } catch { }
    return {};
}

export function saveUserPresets(presets: Record<string, WidgetInstance[]>) {
    localStorage.setItem('warmaps:user_layouts', JSON.stringify(presets));
}

export function loadInstances(): WidgetInstance[] {
    try {
        const saved = localStorage.getItem(INSTANCES_KEY);
        if (saved) {
            const instances: WidgetInstance[] = JSON.parse(saved);
            // Update nextInstanceId to avoid collisions
            instances.forEach(inst => {
                const num = parseInt(inst.id.replace('wi-', ''));
                if (!isNaN(num) && num >= nextInstanceId) nextInstanceId = num + 1;
            });
            return instances;
        }
    } catch { }
    return getDefaultInstances();
}

export function saveInstances(instances: WidgetInstance[]) {
    localStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
}

export function getDefaultInstances(): WidgetInstance[] {
    nextInstanceId = 1;
    return []; // Empty canvas for game-engine style builder
}

export function createInstance(typeId: string, x: number, y: number): WidgetInstance | null {
    const type = getWidgetType(typeId);
    if (!type) return null;
    const id = `wi-${nextInstanceId++}`;
    return {
        id,
        typeId,
        x,
        y,
        width: type.defaultWidth,
        height: type.defaultHeight,
        collapsed: false,
        config: { ...type.defaultConfig },
    };
}

// ─── Share Link ─────────────────────────────────────────

export function encodeShareLink(instances: WidgetInstance[]): string {
    // Compact format: strip defaults, use short keys
    const compact = instances.map(inst => ({
        t: inst.typeId,
        x: Math.round(inst.x),
        y: Math.round(inst.y),
        w: inst.width,
        h: inst.height,
        c: inst.collapsed ? 1 : 0,
        cfg: Object.keys(inst.config).length > 0 ? inst.config : undefined,
    }));
    const json = JSON.stringify(compact);
    // Base64 encode
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return `${window.location.origin}${window.location.pathname}?layout=${b64}`;
}

export function decodeShareLink(): WidgetInstance[] | null {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('layout');
    if (!encoded) return null;
    try {
        const json = decodeURIComponent(escape(atob(encoded)));
        const compact = JSON.parse(json);
        nextInstanceId = 1;
        return compact.map((item: any) => {
            const id = `wi-${nextInstanceId++}`;
            return {
                id,
                typeId: item.t,
                x: item.x || 0,
                y: item.y || 0,
                width: item.w || 380,
                height: item.h || 300,
                collapsed: item.c === 1,
                config: item.cfg || {},
            } as WidgetInstance;
        });
    } catch {
        return null;
    }
}
