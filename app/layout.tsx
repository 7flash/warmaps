export default function RootLayout({ children }: { children: any }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
                <title>WARMAPS — Global Conflict Monitor</title>
                <meta name="description" content="WARMAPS — Real-time global conflict monitoring. Live satellite fire data, OSINT intelligence, and 3D globe visualization. $WARMAPS on Solana." />
                <meta name="theme-color" content="#050913" />
                <link rel="manifest" href="/api/manifest.json" />
                <link rel="icon" type="image/svg+xml" href={"data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#050913"/><text x="16" y="23" text-anchor="middle" font-size="20" fill="#22c55e">◆</text></svg>')} />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta property="og:title" content="WARMAPS — Global Conflict Monitor" />
                <meta property="og:description" content="Real-time OSINT intelligence dashboard with tactical map, Telegram feeds, and AI analyst." />
                <meta property="og:image" content="https://warmaps.live/api/og-image" />
                <meta property="og:url" content="https://warmaps.live" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="WARMAPS" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="WARMAPS — Global Conflict Monitor" />
                <meta name="twitter:description" content="Real-time OSINT intelligence dashboard with tactical map, Telegram feeds, and AI analyst." />
                <meta name="twitter:image" content="https://warmaps.live/api/og-image" />
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
                <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
                <link rel="canonical" href="https://warmaps.live" />
                <script type="application/ld+json" dangerouslySetInnerHTML={{
                    __html: JSON.stringify({
                        "@context": "https://schema.org",
                        "@type": "WebApplication",
                        "name": "WARMAPS",
                        "url": "https://warmaps.live",
                        "description": "Real-time OSINT intelligence dashboard with tactical map, Telegram feeds, and AI analyst.",
                        "applicationCategory": "SecurityApplication",
                        "operatingSystem": "Web",
                        "image": "https://warmaps.live/api/og-image",
                        "author": { "@type": "Organization", "name": "WARMAPS" }
                    })
                }} />
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
