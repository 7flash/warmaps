# WARMAPS — Global Conflict Monitor

Real-time OSINT intelligence dashboard with 2D tactical map, satellite fire tracking, GDELT event visualization, live news feeds, and Telegram OSINT channels.

## Setup

```bash
bun install
```

## Run

```bash
bun run server.ts
```

Server starts at `http://localhost:4444`.

## Features

- **MapLibre GL** tactical dark map with GPU-rendered layers
- **GDELT Visual Intelligence** — conflict images appearing in real-time on the map
- **NASA FIRMS** satellite fire detection
- **OpenSky** military flight tracking
- **ACLED** kinetic strike events
- **Prediction Markets** (Polymarket/Kalshi) threat radar
- **Pump.fun** conflict token tracking
- **Telegram OSINT** channel monitoring
- **Live TV** news channel switching
- **WebSocket** global chat
- **120 FPS** target with real-time image decay animations
