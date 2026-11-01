# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

Android phones first (Play Store). The same Expo / React Native code also ships as a web app (react-native-web) with one shared custom design; the web build follows the Android design rather than having its own.

## Users

- **Primary:** club and friend-group snooker players in India, scoring a match live on their phone at the table. Often mid-frame, one hand free, under club lighting, between shots.
- **Secondary:** friends and league members following a match live on their own phones, and players who open a shared result or profile link from WhatsApp.

## Product Purpose

Snookit is a snooker scoreboard and league tracker for friends and clubs. It scores frames ball by ball, keeps league history, stats and titles, and shows city rankings. Success is players scoring their real matches in it and every shared result pulling other players in, with no paid marketing.

## Positioning

Shot-by-shot snooker scoring built for the table, offline-first, where every scored match becomes a shareable result card and link that hands each opponent their stats.

## Operating Context

- Scoring happens at the table, in the middle of play, often with poor or no network; the app writes to the phone first and syncs later.
- A scorer can hand scoring over to another phone mid-match.
- Leagues are formed by sharing an invite link, usually on WhatsApp; results are shared the same way.
- "Try without an account" works fully offline; Google sign-in syncs across devices.

## Capabilities and Constraints

- Live scoring: singles or doubles, pots, fouls, misses, safeties, free balls, undo, frames, breaks; friends follow live.
- Leagues with matches, points races, title matches and reigning champions.
- Stats: win rate, highest break, 50+ and century breaks, frame times, head-to-head, league rating (Elo style).
- City: best players by city and division, follows, "looking for a game", challenges.
- Tournaments: knockout and round robin with a shareable bracket.
- Appearance: light by default with a Light / Dark / System choice and three dark styles, saved per device.
- Backend: own Go + PostgreSQL API; permissions are enforced there, not in the UI.
- Audience is 13 and older; content includes user-generated names and posts.
- Free, no ads (current state per the store listing).

## Brand Commitments

- Name: **Snookit**.
- Logo: the crown over snooker balls (`frontend/assets/SnookIt Crown Billiards Logo.png`, app icon and splash derived from it).

## Evidence on Hand

- Store listing copy: `docs/PLAY_STORE_LISTING.md`.
- Promo image: `frontend/assets/SnookIt_ Log, Track, Improve.png`.
- No real testimonials, user counts, reviews or press exist yet; do not invent them.

## Product Principles

1. **The table comes first.** Scoring must work one-handed, fast and offline, mid-frame; anything that slows a pot being recorded is a regression.
2. **Every result travels.** Scored matches should be easy to share and should make sense to someone who taps the link without the app.
3. **One screen, one job.** Screens fit one viewport; rare actions live behind sheets or expanders, not on the main surface.
4. **Truthful numbers.** Stats, ratings and rankings reflect only real scored data.

## Accessibility & Inclusion

- Touch targets at least 44pt; scoring controls sized for use between shots.
- Respect the phone's reduce motion setting: drop movement, keep gentle fades.
- Physical (haptic) feedback is never the only feedback.
