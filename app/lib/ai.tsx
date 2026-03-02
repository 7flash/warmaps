/**
 * ai.ts — AI Chat with Gemini streaming
 */

import { map, IMAGE_MARKERS } from './state';

interface AIChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

const aiHistory: AIChatMessage[] = [];
let aiStreaming = false;

export function initAIChat() {
    const input = document.getElementById('ai-input') as HTMLInputElement;
    const sendBtn = document.getElementById('ai-send') as HTMLButtonElement;
    const messagesEl = document.getElementById('ai-messages')!;

    if (!input || !sendBtn || !messagesEl) return;

    // Add welcome message
    appendAIMessage('assistant', `**WARMAPS AI** ready. I have access to real-time conflict data from GDELT, FIRMS, ACLED, and prediction markets.\n\nAsk me anything about current global conflicts, threat assessments, or geopolitical analysis.`);

    function sendMessage() {
        const text = input.value.trim();
        if (!text || aiStreaming) return;

        input.value = '';
        appendAIMessage('user', text);
        aiHistory.push({ role: 'user', content: text });

        streamAIResponse();
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function appendAIMessage(role: 'user' | 'assistant', content: string): HTMLElement {
    const messagesEl = document.getElementById('ai-messages')!;
    const msgEl = document.createElement('div');
    msgEl.className = `ai-msg ai-msg--${role}`;

    const label = document.createElement('div');
    label.className = 'ai-msg__label';
    label.textContent = role === 'user' ? 'YOU' : 'WARMAPS AI';

    const body = document.createElement('div');
    body.className = 'ai-msg__body';
    body.innerHTML = formatAIContent(content);

    msgEl.appendChild(label);
    msgEl.appendChild(body);
    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    return body;
}

function formatAIContent(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .replace(/\n/g, '<br>');
}

function gatherLiveContext(): string {
    const parts: string[] = [];

    // 1. Map viewport
    try {
        if (map) {
            const center = map.getCenter();
            const zoom = map.getZoom();
            const bounds = map.getBounds();
            parts.push(`### Current Map View
- Center: ${center.lat.toFixed(2)}°N, ${center.lng.toFixed(2)}°E
- Zoom level: ${zoom.toFixed(1)}
- Viewport: ${bounds.getSouth().toFixed(1)}°N to ${bounds.getNorth().toFixed(1)}°N, ${bounds.getWest().toFixed(1)}°E to ${bounds.getEast().toFixed(1)}°E
- The user is currently viewing this region on the WARMAPS conflict map.`);
        }
    } catch { }

    // 2. Image markers visible on map
    try {
        if (typeof IMAGE_MARKERS !== 'undefined' && IMAGE_MARKERS.size > 0) {
            const markerInfo: string[] = [];
            IMAGE_MARKERS.forEach((data: any, eid: string) => {
                const ev = data.ev;
                const lnglat = data.marker.getLngLat();
                const title = ev.title || '';
                const source = ev.source || ev.domain || '';
                if (title) {
                    markerInfo.push(`- "${title}" (${source}) at ${lnglat.lat.toFixed(1)}°, ${lnglat.lng.toFixed(1)}°`);
                }
            });
            if (markerInfo.length > 0) {
                parts.push(`### Image Markers On Map (${markerInfo.length} news events with photos)\n${markerInfo.slice(0, 20).join('\n')}`);
            }
        }
    } catch { }

    // 3. Pulse feed articles
    try {
        const cards = document.querySelectorAll('#news-feed .pulse-card');
        if (cards.length > 0) {
            const headlines: string[] = [];
            cards.forEach((card, i) => {
                if (i >= 20) return;
                const title = card.querySelector('.pulse-card__title')?.textContent?.trim();
                const meta = card.querySelector('.pulse-card__meta')?.textContent?.trim();
                if (title) headlines.push(`- ${title}${meta ? ` (${meta})` : ''}`);
            });
            if (headlines.length > 0) {
                parts.push(`### Pulse Feed Headlines (${headlines.length} articles)\n${headlines.join('\n')}`);
            }
        }
    } catch { }

    // 4. Breaking news ticker
    try {
        const ticker = document.querySelector('.marquee-text')?.textContent?.trim();
        if (ticker && ticker.length > 10) {
            parts.push(`### Breaking News Ticker\n${ticker.slice(0, 500)}`);
        }
    } catch { }

    // 5. Token markers on map
    try {
        const tokenMarkers = document.querySelectorAll('.map-token-marker');
        if (tokenMarkers.length > 0) {
            const tokens: string[] = [];
            tokenMarkers.forEach((el: any) => {
                const name = el.querySelector('.map-token-label')?.textContent?.trim();
                if (name) tokens.push(`- ${name}`);
            });
            if (tokens.length > 0) {
                parts.push(`### Pump.fun Tokens On Map\n${tokens.join('\n')}`);
            }
        }
    } catch { }

    // 6. Fire/FIRMS data
    try {
        const fireFeed = document.querySelectorAll('#firms-feed .feed-item');
        if (fireFeed.length > 0) {
            const fires: string[] = [];
            fireFeed.forEach((item, i) => {
                if (i >= 5) return;
                const title = item.querySelector('.feed-item-title')?.textContent?.trim();
                if (title) fires.push(`- ${title}`);
            });
            if (fires.length > 0) {
                parts.push(`### Thermal Anomalies (FIRMS)\n${fires.join('\n')}`);
            }
        }
    } catch { }

    // 7. Prediction markets
    try {
        const markets = document.querySelectorAll('.radar-market');
        if (markets.length > 0) {
            const minfo: string[] = [];
            markets.forEach((m, i) => {
                if (i >= 5) return;
                const title = m.querySelector('.radar-market-title')?.textContent?.trim();
                const prob = m.querySelector('.radar-market-prob')?.textContent?.trim();
                if (title) minfo.push(`- ${title} → ${prob || '?'}%`);
            });
            if (minfo.length > 0) {
                parts.push(`### Prediction Markets\n${minfo.join('\n')}`);
            }
        }
    } catch { }

    return parts.join('\n\n');
}

async function streamAIResponse() {
    aiStreaming = true;
    const sendBtn = document.getElementById('ai-send') as HTMLButtonElement;
    sendBtn.textContent = '...';
    sendBtn.disabled = true;

    const bodyEl = appendAIMessage('assistant', '');
    let fullText = '';

    try {
        const context = gatherLiveContext();
        const res = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: aiHistory.slice(-10),
                context,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            fullText = `⚠ Error: ${err.error || res.statusText}`;
            bodyEl.innerHTML = formatAIContent(fullText);
            aiHistory.push({ role: 'assistant', content: fullText });
            return;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.error) {
                        fullText += `\n⚠ ${parsed.error}`;
                    } else if (parsed.text) {
                        fullText += parsed.text;
                    }
                    bodyEl.innerHTML = formatAIContent(fullText);
                    const messagesEl = document.getElementById('ai-messages')!;
                    messagesEl.scrollTop = messagesEl.scrollHeight;
                } catch { }
            }
        }

        aiHistory.push({ role: 'assistant', content: fullText });
    } catch (err: any) {
        fullText = `⚠ Network error: ${err.message}`;
        bodyEl.innerHTML = formatAIContent(fullText);
    } finally {
        aiStreaming = false;
        sendBtn.textContent = 'ASK';
        sendBtn.disabled = false;
    }
}
