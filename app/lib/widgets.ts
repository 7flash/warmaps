/**
 * widgets.ts — Widget registry & instance management for WARMAPS Canvas
 * 
 * Each widget type defines a category, default size, config schema,
 * and a render function. Users can add/remove/configure widget instances.
 */

export interface WidgetConfig {
    [key: string]: any;
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
        description: 'Interactive MapLibre conflict map with events, fires, flights, and satellite data.',
        defaultWidth: 700,
        defaultHeight: 500,
        defaultConfig: { layers: ['events', 'fires', 'flights', 'acled'] },
        multi: false,
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
    },
    {
        id: 'telegram',
        name: 'Telegram OSINT',
        icon: '💬',
        category: 'feed',
        description: 'Live Telegram channel feed. Choose channels to monitor.',
        defaultWidth: 380,
        defaultHeight: 400,
        defaultConfig: { channels: 'all' },
        multi: true,
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
    },
];

export function getWidgetType(typeId: string): WidgetType | undefined {
    return WIDGET_TYPES.find(w => w.id === typeId);
}

// ─── Instance Management ────────────────────────────────

const INSTANCES_KEY = 'warmaps:instances';
let nextInstanceId = 1;

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
    return [
        { id: 'wi-1', typeId: 'map', x: 0, y: 0, width: 700, height: 500, collapsed: false, config: { layers: ['events', 'fires', 'flights'] } },
        { id: 'wi-2', typeId: 'news', x: 720, y: 0, width: 380, height: 500, collapsed: false, config: { filter: 'all', source: 'all' } },
        { id: 'wi-3', typeId: 'intel', x: 1120, y: 0, width: 380, height: 340, collapsed: false, config: {} },
        { id: 'wi-4', typeId: 'telegram', x: 1120, y: 360, width: 380, height: 340, collapsed: false, config: { channels: 'all' } },
        { id: 'wi-5', typeId: 'tokens', x: 0, y: 520, width: 380, height: 340, collapsed: false, config: {} },
        { id: 'wi-6', typeId: 'markets', x: 400, y: 520, width: 380, height: 340, collapsed: false, config: { category: 'all' } },
        { id: 'wi-7', typeId: 'gdelt', x: 800, y: 520, width: 380, height: 300, collapsed: false, config: {} },
        { id: 'wi-8', typeId: 'ai', x: 1200, y: 520, width: 360, height: 340, collapsed: false, config: {} },
    ];
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
