/**
 * /api/ping — Latency measurement endpoint
 * Returns immediately with a timestamp for client-side RTT calculation.
 */
export function GET() {
    return new Response(JSON.stringify({ t: Date.now() }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
}
