// GET /robots.txt
export function GET() {
    const body = `User-agent: *
Allow: /

Sitemap: https://warmaps.xyz/api/sitemap.xml
`;
    return new Response(body, {
        headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' },
    });
}
