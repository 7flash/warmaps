// GET /api/og-image — Serve the OG banner image
import * as path from 'path';

const bannerPath = path.join(import.meta.dir, '..', '..', '..', 'banner.png');

export async function GET() {
    try {
        const file = Bun.file(bannerPath);
        const buf = await file.arrayBuffer();
        return new Response(buf, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=604800',
            },
        });
    } catch {
        return new Response('Not found', { status: 404 });
    }
}

