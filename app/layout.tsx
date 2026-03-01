export default function RootLayout({ children }: { children: any }) {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
                <title>WARMAPS — Global Conflict Monitor</title>
                <meta name="description" content="WARMAPS — Real-time global conflict monitoring. Live satellite fire data, OSINT intelligence, and 3D globe visualization. $WARMAPS on Solana." />
                <meta name="theme-color" content="#050913" />
                <meta property="og:title" content="WARMAPS — Global Conflict Monitor" />
                <meta property="og:description" content="Real-time OSINT intelligence dashboard with 3D globe, satellite fire tracking, and live news feeds." />
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
