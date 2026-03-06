/**
 * state.ts — Global state & feature flags
 * 
 * Single source of truth for all mutable application state.
 * Imported by every module that needs to read/write shared state.
 */

import { createMeasure, configure } from 'measure-fn';

// Configure measure-fn for browser console visibility
configure({ maxResultLength: 120, timestamps: true });
export const { measure, measureSync } = createMeasure('wm');

// ─── Feature Flags ──────────────────────────────────────────
// Toggle via console: window.FF.flights = false (to disable for perf debugging)
// All enabled by default — disable to isolate FPS bottlenecks
export const FF = {
    news: true,
    gdelt: true,
    fires: true,
    flights: true,
    markets: true,
    telegram: true,
    assets: true,
    acled: true,
    seismic: true,
    crypto: true,
    webcams: true,
    pumpfun: true,
    spotlight: true,
    ticker: true,
    imageMarkers: false,
};
(window as any).FF = FF;

// ─── State ──────────────────────────────────────────────────

export let map: any = null;
export function setMap(m: any) { map = m; }

export let newsItems: any[] = [];
export function setNewsItems(items: any[]) { newsItems = items; }

export let gdeltEvents: any[] = [];
export function setGdeltEvents(events: any[]) { gdeltEvents = events; }

export let firePoints: any[] = [];
export function setFirePoints(points: any[]) { firePoints = points; }

export let flightData: any[] = [];
export function setFlightData(data: any[]) { flightData = data; }

export let flightStats: any = {};
export function setFlightStats(stats: any) { flightStats = stats; }

export let marketData: any[] = [];
export function setMarketData(data: any[]) { marketData = data; }

export let threatAlerts: any[] = [];
export function setThreatAlerts(alerts: any[]) { threatAlerts = alerts; }

export let strategicAssets: any = null;
export function setStrategicAssets(assets: any) { strategicAssets = assets; }

export let acledEvents: any = null;
export function setAcledEvents(events: any) { acledEvents = events; }

export let seismicData: any = null;
export function setSeismicData(data: any) { seismicData = data; }

export let cryptoData: any = null;
export function setCryptoData(data: any) { cryptoData = data; }

export let webcamData: any[] = [];
export function setWebcamData(data: any[]) { webcamData = data; }

export let pumpfunTokens: any[] = [];
export function setPumpfunTokens(tokens: any[]) { pumpfunTokens = tokens; }

export let currentFilter = 'all';
export function setCurrentFilter(filter: string) { currentFilter = filter; }

export let dataPaused = false;
export function setDataPaused(paused: boolean) {
    dataPaused = paused;
    (window as any).dataPaused = paused;
}
(window as any).dataPaused = false;

// ─── Solana Wallet ──────────────────────────────────────────
export let connectedWallet: string | null = null;
export function setConnectedWallet(wallet: string | null) { connectedWallet = wallet; }
export const TREASURY_WALLET = '5yU4dutUibFvCyjgJzucNkKQfrEv96r7Ans3CKTZH68h';

// ─── Real-Time Image Marker System ───────────────────────────
export const eventArrivalTime: Map<string, number> = new Map();
export const eventQueue: any[] = [];
export let queueDrainTimer: ReturnType<typeof setInterval> | null = null;
export function setQueueDrainTimer(timer: ReturnType<typeof setInterval> | null) { queueDrainTimer = timer; }
export const IMAGE_MARKERS: Map<string, any> = new Map();
export const IMAGE_MARKER_ORDER: string[] = [];
export const MAX_VISIBLE_IMAGES = 25;
export const FADE_PER_RANK = 0.04;
export const IMAGE_APPEAR_INTERVAL = 500;

// Data freshness tracking
export const dataFreshness: Record<string, number> = {};
export function markFresh(source: string) { dataFreshness[source] = Date.now(); }
export function getFreshnessLabel(source: string): string {
    const ts = dataFreshness[source];
    if (!ts) return '—';
    const age = Math.floor((Date.now() - ts) / 1000);
    if (age < 60) return `${age}s`;
    if (age < 3600) return `${Math.floor(age / 60)}m`;
    return `${Math.floor(age / 3600)}h`;
}

// Track active token markers for cleanup
export const TOKEN_MARKERS: Map<string, any> = new Map();

// ─── Timeline Scrubber ──────────────────────────────────────
export let timelineHours = 0; // 0 = show all, >0 = filter to last N hours
export function setTimelineHours(h: number) { timelineHours = h; }

/** Check if a date string is within the current timeline window */
export function isWithinTimeline(dateStr: string): boolean {
    if (timelineHours <= 0) return true; // show all
    const eventTime = new Date(dateStr).getTime();
    if (isNaN(eventTime)) return true; // can't parse = show
    const cutoff = Date.now() - timelineHours * 3600_000;
    return eventTime >= cutoff;
}
