# Play Store listing and policy answers

Copy-paste material for Google Play Console. Check every answer against the build you ship.

## Store listing

**App name** (30 max): `Snookit - Snooker Scoreboard`

**Short description** (80 max):
`Live-score snooker with friends, track breaks and stats, and rule your city.`

**Full description:**

```
Snookit is the snooker scoreboard for you and your friends.

SCORE LIVE
Tap each ball as it goes down. Snookit keeps the score, the break, fouls and frames, singles
or doubles. Friends follow every shot live on their own phones.

YOUR LEAGUE
Make a league for your club or friends, share the invite link on WhatsApp, and every match,
race and title is saved for everyone. Works offline at the table and syncs later.

STATS THAT MATTER
Win rate, highest break, 50+ breaks and centuries, frame times, head-to-head records and a
league rating that rewards beating strong players.

TITLES AND RACES
Crown reigning champions with title matches, run points races, and keep a champion history.

YOUR CITY
See the best players in your city, follow players, post "looking for a game", find clubs and
tables, and challenge anyone to a match.

TOURNAMENTS
Run knockout and round-robin tournaments with a shareable bracket.

Free. No ads.
```

**Category:** Sports. **Tags:** Snooker, Scoreboard, Billiards.

**Screenshots** (phone, 1080x1920 or similar), in this order: live scoring screen with a break
on; match result share card; league home with live match; stats screen; city board; tournament
bracket. The promo image `frontend/assets/SnookIt_ Log, Track, Improve.png` can be the
feature graphic after cropping to 1024x500.

## App content answers

| Question                    | Answer                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Privacy policy URL          | https://snookit.duckdns.org/privacy                                                  |
| Account deletion URL        | https://snookit.duckdns.org/delete-account                                           |
| Ads                         | No ads                                                                               |
| App access                  | All features usable with a Google sign-in; "Try without an account" works offline    |
| Target audience             | 13 and older (not designed for children)                                             |
| Content rating              | User-generated content (posts, names), users can interact, no purchases, no gambling |
| News app / health / finance | No                                                                                   |

## Data safety form

Data is encrypted in transit (HTTPS). Users can request deletion (in app, and the URL above).

| Data type                            | Collected | Shared | Purpose                               | Optional |
| ------------------------------------ | --------- | ------ | ------------------------------------- | -------- |
| Name                                 | Yes       | No     | App functionality, account management | No       |
| Email address                        | Yes       | No     | Account management                    | No       |
| Photos (Google profile photo URL)    | Yes       | No     | App functionality                     | Yes      |
| Approximate location (city)          | Yes       | No     | App functionality (city board)        | Yes      |
| User-generated content (posts)       | Yes       | No     | App functionality                     | Yes      |
| Other in-app activity (match scores) | Yes       | No     | App functionality                     | No       |
| Crash logs / diagnostics             | Yes       | No     | Analytics (error reports, via Sentry) | No       |
| Device or other IDs (push token)     | Yes       | No     | App functionality (notifications)     | Yes      |

"Shared" means given to a third party for their own use; processors (hosting, Sentry, Expo
push delivery) do not count as sharing. Date of birth stays on the phone and is not collected.

## Before each release

- Bump `version` in `frontend/app.config.js`; raise `MIN_APP_VERSION` on the server only when
  old versions must stop syncing.
- Set `ANDROID_CERT_SHA256` on the server (Play Console > Setup > App signing > SHA-256) so
  shared links open the app.
