# Iran Theater — Telegram OSINT Channel Registry

This document catalogs the Telegram channels required for comprehensive open-source intelligence
coverage of the Iranian theater. Channels are categorized by function and reliability.

## Citizen Journalism & Protest Coverage

| Channel | Focus | Notes |
|---------|-------|-------|
| **@1500tasvir** | Documenting state violence, victim stories | Most trusted protest source |
| **@VahidOnline** | Raw protest videos, X/Twitter bridge | High influence, cross-platform |
| **@Mamlekate** | News dissemination, ground footage | Bridges X posts to Telegram audience |

## Hacktivist & Data Leak Channels

| Channel | Focus | Notes |
|---------|-------|-------|
| **Atlas Intelligence Group (AIG)** | Government official data leaks | Phone numbers, emails, sensitive location maps |
| **@ARVIN** | Protest news + censorship circumvention | Distributes VPN servers and proxy lists |
| **RedBlue (Hide01)** | Intercepted conversations, hacking guides | Iranian hacktivist collective |

## Regime & IRGC-Affiliated Channels

| Channel | Focus | Notes |
|---------|-------|-------|
| **@Sepah** | IRGC news and military posturing | 1M+ subscribers, labeled "unofficial" |
| **@Sepah_ir** | IRGC-related broadcasts | State propaganda monitoring |
| **@SepahCybery** | IRGC cyber operations | Cyber warfare narratives |
| **@Sepah_Pasdaran** | Revolutionary Guard news | Military posturing and exercises |

> ⚠️ These channels were labeled "unofficial" by the IRGC after launching official accounts,
> but remain massive content hubs essential for understanding the regime's narrative.

## Major Persian-Language News Broadcasters

| Channel | Notes |
|---------|-------|
| **BBC Persia** | Most widely consumed Telegram news channel in the region |
| **Iran International** | Independent Persian-language broadcaster |
| **Radio Farda** | RFE/RL's Persian service |
| **VOA Farsi** | Voice of America Persian service |

## Integration Strategy

1. **Phase 1 (Current):** Manual monitoring via Telegram MTProto client (geeksy-telegram-plugin)
2. **Phase 2:** Automated message scraping with NLP entity extraction
3. **Phase 3:** Cross-reference Telegram photos with FIRMS thermal anomalies by geo+time
4. **Phase 4:** Sentiment analysis pipeline for regime vs. protest narrative tracking

## OSINT Correlation Pipeline

```
Telegram Message → Extract Media → Reverse Geolocate → Cross-ref FIRMS/GDELT → Map Pin
         ↓
   NLP Entity Extraction → Location Names → Geocode → Confidence Score
         ↓
   Sentiment Analysis → Regime/Protest Classification → Layer Toggle on Map
```
