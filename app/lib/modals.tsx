/**
 * modals.ts — Article modal & shared modal utilities
 */

import { escHtml, formatTime, proxyImg } from './utils';

export function openArticleModal(ev: any) {
    // Remove any existing modal
    document.querySelector('.article-modal-overlay')?.remove();

    const title = ev.title || 'Untitled';
    const source = ev.source || ev.domain || '';
    const time = ev.date ? formatTime(ev.date) : '';
    const imageUrl = ev.imageUrl ? proxyImg(ev.imageUrl) : '';
    const articleUrl = ev.url || ev.sourceUrl || '';

    const overlay = document.createElement('div');
    overlay.className = 'article-modal-overlay';

    overlay.innerHTML = `
        <div class="article-modal" onclick="event.stopPropagation()">
            <div class="article-modal__header">
                <div class="article-modal__title">${escHtml(title)}</div>
                <button class="article-modal__close" title="Close">×</button>
            </div>
            ${imageUrl ? `<img class="article-modal__image" src="${escHtml(imageUrl)}" alt="" onerror="this.style.display='none'" />` : ''}
            <div class="article-modal__meta">
                ${source ? `<span>📡 ${escHtml(source)}</span>` : ''}
                ${time ? `<span>🕐 ${time}</span>` : ''}
                ${ev.lat ? `<span>📍 ${Number(ev.lat).toFixed(2)}°, ${Number(ev.lon || ev.lng).toFixed(2)}°</span>` : ''}
                ${ev.tone ? `<span>🎯 Tone: ${Number(ev.tone).toFixed(1)}</span>` : ''}
            </div>
            <div class="article-modal__body">
                <p>${escHtml(title)}</p>
                ${ev.themes?.length ? `<p><strong>Themes:</strong> ${ev.themes.slice(0, 8).map((t: string) => escHtml(t.replace(/_/g, ' '))).join(', ')}</p>` : ''}
                ${articleUrl ? `<a class="article-modal__link" href="${escHtml(articleUrl)}" target="_blank" rel="noopener">🔗 Read full article →</a>` : ''}
            </div>
        </div>
    `;

    // Close handlers
    overlay.addEventListener('click', () => overlay.remove());
    overlay.querySelector('.article-modal__close')?.addEventListener('click', () => overlay.remove());

    const escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);

    document.body.appendChild(overlay);
}
