# WARMAPS Twitter Posts

## Post 1: The Terminal
Finance has the Bloomberg Terminal. Geopolitical intelligence has 50 browser tabs.

Built WarMaps — satellite thermals, flight tracking, OSINT feeds, prediction markets on one canvas. No context switching.

V1 adds native Solana trading via Phantom. See the event, verify the data, execute. Same screen.

---

## Post 2: Image Decay
Plotting every OSINT point on a map makes it unreadable in an hour.

WarMaps uses real-time image decay. New data renders at full brightness, old data physically fades into the dark canvas.

You don't check timestamps. You see the timeline by looking at the map.

---

## Post 3: Telegram Layer
Telegram is the best raw ground intel source. But reading it in a chat app kills spatial awareness — you guess coordinates from a street name.

WarMaps parses 23 OSINT Telegram channels and pins the data directly on the map coordinates. Local chatter appears next to satellite thermals and flight trackers.

Parser is early. Tell me which channels to add.

---

## Post 4: Physical Verification
Waiting for journalists to verify a kinetic strike is slow. Prediction markets already priced it in.

WarMaps stacks raw sensor data. ACLED strike log + NASA FIRMS thermal layer — actual heat signatures from space, right where the strike was reported. No editorial filter.

---

## Post 5: Why Solana
OSINT is about speed. Spot something on the feed, need to execute immediately.

Solana settles fast enough to match the data layer. See it on the map, click the widget, tx confirms while WebGL keeps rendering at 120fps.

The execution layer has to move at the speed of the data.

---

## Post 6: Flight Tracking
Switched WarMaps to ADSB.lol — community-sourced ADS-B data with no rate limits. 15-second refresh interval instead of 5 minutes.

Also, ADSB returns proper aircraft type codes so classification accuracy went up. OpenSky stays as fallback.

---

## Post 7: Transaction Retry
Solana transactions fail constantly. Network congestion, priority fee too low, validator skips your slot.

Built escalating priority fees: 5K → 25K → 100K microLamports. Fresh blockhash each attempt.

Key insight: not all failures deserve retries. Network timeout → retry. On-chain "insufficient balance" → stop immediately. Smart error classification matters.

---

## Post 8: Timeline Scrubber
Added a timeline scrubber to WarMaps. Filter the entire map to last 1H, 6H, 24H, 48H, or 7D of data.

GDELT events, satellite fires, ACLED strikes all filter in real-time. Counter stats update live.

Useful when you want to see what happened overnight without scrolling through a feed.

---

## Post 9: Country Profiles
Click any country label on the WarMaps map — get an instant intel summary.

Aggregates GDELT events, ACLED strikes, satellite fires within 500km radius. Calculates a risk score 0-100 from event density + fatalities.

No external API. Pure client-side aggregation from data already on the map.

---

## Post 10: Alert System
WarMaps now monitors for high-severity events in watch regions and sends browser notifications.

Default watch: Middle East (1500km), Ukraine (800km), East Africa (1200km). Triggers on ACLED events with fatalities and GDELT articles with tone < -5.

5-minute cooldown per alert so you don't get spammed. Regions stored in localStorage, toggle with 🔔/🔕 in the stats bar.
