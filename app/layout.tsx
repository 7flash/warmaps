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
            </head>
            <body>
                {children}
            </body>
        </html>
    );
}
