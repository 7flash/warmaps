# ADR-007: Lottery Rewards System

## Status
**Accepted** — 2026-03-08

## Context
We need to implement a lottery rewards system where users can claim rewards after their newly-introduced "Luck value" reaches a certain threshold. The user must be prompted to visit the rewards area once they connect their Phantom wallet on the main dashboard. 
Given the existing WARMAPS architecture is a dense, interactive infinite canvas, dropping another complex widget directly onto the map could clutter the UX and take away focus from geopolitical monitoring tools.

## Options Evaluated

| Option | Pros | Cons |
|---|---|---|
| **Modal overlay** | Keeps the user on the map without losing context. | Can be accidentally closed; complex state management needed. Clutters the dashboard. |
| **New Canvas Widget** | Native to the WARMAPS engine geometry. | Unrelated to map elements; doesn't intuitively belong in the spatial "war room" environment. |
| **Dedicated `/rewards` Route** | Clean, focused environment. Easy to link to from a toast/banner. Fully isolated from map complexities. | Navigates the user away from the war room temporarily. Requires managing layout transition. |

## Decision
We chose to implement a **Dedicated `/rewards` Route** using Melina.js file routing, along with a top-level banner shown on the main dashboard (`app/page.tsx`) when the Phantom wallet connects.

When the wallet connects, a notification banner will appear and instruct the user to navigate to the new Lottery Rewards page to check their Luck value and claim rewards.

## Consequences
- **Positive:** Keeps the war room dashboard strictly focused on geospatial intelligence. The rewards module gets a focused, clean UI.
- **Limitation:** Users will navigate away from the infinite canvas when claiming rewards, meaning any unsaved layout state that isn't fully persisted could be disrupted (though WARMAPS serializes widget positions to localStorage, so it should be fine).
