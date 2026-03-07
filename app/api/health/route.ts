// GET /api/health — System health check for monitoring
import * as tg from '../../../src/telegram';

export async function GET() {
    const uptime = process.uptime();
    const mem = process.memoryUsage();

    const health = {
        status: 'ok',
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        uptimeSeconds: Math.floor(uptime),
        memory: {
            rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
            heap: `${Math.round(mem.heapUsed / 1024 / 1024)}/${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
        },
        telegram: tg.getStatus(),
        timestamp: new Date().toISOString(),
        version: '2.0.0',
    };

    return Response.json(health, {
        headers: { 'Cache-Control': 'no-cache' },
    });
}
