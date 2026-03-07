// GET /api/manifest.json — PWA Web App Manifest
export function GET() {
    const manifest = {
        name: 'WARMAPS — Global Conflict Monitor',
        short_name: 'WARMAPS',
        description: 'Real-time OSINT intelligence dashboard with tactical map, Telegram feeds, and AI analyst.',
        start_url: '/',
        display: 'standalone',
        background_color: '#050913',
        theme_color: '#050913',
        orientation: 'any',
        categories: ['news', 'security'],
        icons: [
            {
                src: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#050913"/><text x="256" y="340" text-anchor="middle" font-size="280" font-family="sans-serif">🗺️</text></svg>`),
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable',
            },
        ],
    };

    return new Response(JSON.stringify(manifest), {
        headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=86400',
        },
    });
}
