/**
 * /api/rpc — Solana RPC Proxy
 * Proxies Solana RPC requests through our server so the Helius API key stays private.
 */
import * as fs from 'fs';
import path from 'path';

let RPC_URL = 'https://api.mainnet-beta.solana.com';

// Load RPC from config
const configPaths = [
    path.join(import.meta.dir, '../../../.config.toml'),
    'C:/Code/geeksy-pumpfun-plugin/.config.toml',
    '/opt/geeksy-pumpfun-plugin/.config.toml',
];

for (const p of configPaths) {
    try {
        if (!fs.existsSync(p)) continue;
        const content = fs.readFileSync(p, 'utf-8');
        const rpcMatch = content.match(/endpoint\s*=\s*"([^"]+)"/);
        if (rpcMatch) {
            RPC_URL = rpcMatch[1];
            console.log(`[rpc-proxy] Using RPC: ${RPC_URL.replace(/api-key=.*/, 'api-key=***')}`);
            break;
        }
    } catch { }
}

export async function POST(req: Request) {
    try {
        const body = await req.text();

        const resp = await fetch(RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        const data = await resp.text();
        return new Response(data, {
            status: resp.status,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 502 });
    }
}
