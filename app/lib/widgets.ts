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
    category: 'map' | 'feed' | 'data' | 'social' | 'media' | 'ai' | 'telegram' | 'rss';
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
    // ──── Maps ────────────────────────────────────
    {
        id: 'map',
        name: 'Global Map',
        icon: '🌍',
        category: 'map',
        description: 'Interactive map with configurable data layers.',
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
        description: 'Heatmap of conflict intensity, fires, or event density.',
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

    // ──── Telegram Channels ───────────────────────
    {
        id: 'tg-all',
        name: 'All Channels',
        icon: '📡',
        category: 'telegram',
        description: 'Combined feed from all monitored OSINT channels.',
        defaultWidth: 380,
        defaultHeight: 500,
        defaultConfig: { channel: 'all' },
        multi: false,
    },
    {
        id: 'tg-ddgeopolitics',
        name: 'DD Geopolitics',
        icon: '🌐',
        category: 'telegram',
        description: 'Geopolitical analysis and breaking events.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'DDGeopolitics' },
        multi: false,
    },
    {
        id: 'tg-intelslava',
        name: 'Intel Slava Z',
        icon: '⚡',
        category: 'telegram',
        description: 'Real-time frontline updates.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'intelslava' },
        multi: false,
    },
    {
        id: 'tg-mod-russia',
        name: 'MoD Russia',
        icon: '🇷🇺',
        category: 'telegram',
        description: 'Official Russian Ministry of Defence briefings.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'mod_russia' },
        multi: false,
    },
    {
        id: 'tg-zoka',
        name: 'Zoka',
        icon: '🎯',
        category: 'telegram',
        description: 'OSINT and conflict analysis with map overlays.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'zoka200' },
        multi: false,
    },
    {
        id: 'tg-nexta',
        name: 'NEXTA',
        icon: '📰',
        category: 'telegram',
        description: 'Eastern European news and citizen journalism.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'nexta_tv' },
        multi: false,
    },
    {
        id: 'tg-liveukraine',
        name: 'Live Ukraine',
        icon: '🇺🇦',
        category: 'telegram',
        description: 'Breaking updates from Ukraine.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channel: 'liveukraine_media' },
        multi: false,
    },

    // ──── RSS / News Outlets ──────────────────────
    {
        id: 'news',
        name: 'All News',
        icon: '📡',
        category: 'rss',
        description: 'Combined GDELT news feed. Filter by region or intensity.',
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
        id: 'news-reuters',
        name: 'Reuters',
        icon: '🟠',
        category: 'rss',
        description: 'Reuters wire — breaking world and conflict news.',
        defaultWidth: 380,
        defaultHeight: 450,
        defaultConfig: { filter: 'all', source: 'all', search: 'reuters' },
        multi: false,
    },
    {
        id: 'news-ap',
        name: 'AP News',
        icon: '🔵',
        category: 'rss',
        description: 'Associated Press — global breaking coverage.',
        defaultWidth: 380,
        defaultHeight: 450,
        defaultConfig: { filter: 'all', source: 'all', search: 'associated press' },
        multi: false,
    },
    {
        id: 'news-aljazeera',
        name: 'Al Jazeera',
        icon: '🟡',
        category: 'rss',
        description: 'Al Jazeera English — Middle East and world reporting.',
        defaultWidth: 380,
        defaultHeight: 450,
        defaultConfig: { filter: 'all', source: 'mideast', search: 'al jazeera' },
        multi: false,
    },
    {
        id: 'news-bbc',
        name: 'BBC World',
        icon: '🔴',
        category: 'rss',
        description: 'BBC World — global news and analysis.',
        defaultWidth: 380,
        defaultHeight: 450,
        defaultConfig: { filter: 'all', source: 'all', search: 'bbc' },
        multi: false,
    },
    {
        id: 'news-dw',
        name: 'DW News',
        icon: '🟣',
        category: 'rss',
        description: 'Deutsche Welle — German intl broadcasting.',
        defaultWidth: 380,
        defaultHeight: 450,
        defaultConfig: { filter: 'all', source: 'europe', search: 'dw' },
        multi: false,
    },

    // ──── Data & Intel ────────────────────────────
    {
        id: 'tokens',
        name: 'PF Tokens',
        icon: '🪙',
        category: 'data',
        description: 'Pump.fun conflict token tracker with price data.',
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
        description: 'Polymarket prediction markets for geopolitical bets.',
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
        description: 'Threat radar + panic economy tracker.',
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
        description: 'GDELT event stream — actors, event types, tone.',
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
        description: 'NASA FIRMS thermal anomaly feed.',
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
        description: 'USGS earthquake data — magnitude and location.',
        defaultWidth: 380,
        defaultHeight: 280,
        defaultConfig: {},
        multi: false,
    },

    // ──── AI, Social, Media ───────────────────────
    {
        id: 'ai',
        name: 'AI Analyst',
        icon: '🤖',
        category: 'ai',
        description: 'Gemini-powered AI for conflict analysis.',
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
