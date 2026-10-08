# Snookit

Phone-first Expo app for live snooker scoring, city rankings, doubles matches, and race-to-score games.

## Stack

- Expo (React Native) + TypeScript + Expo Router
- Firebase Auth (Google) + Cloud Firestore when configured
- Local AsyncStorage demo mode by default (`EXPO_PUBLIC_USE_LOCAL_DATA=true`)
- Modular layering: screens → hooks → services → storage

## Run

```bash
npm install --legacy-peer-deps
cp .env.example .env
npm start
```

Demo sign-in works without Firebase. For Google SSO + cloud sync, fill Firebase keys in `.env` and set `EXPO_PUBLIC_USE_LOCAL_DATA=false`. Deploy [`firestore.rules`](firestore.rules) from the Firebase console.

## Play Store (Android)

- **[PLAY_STORE.md](PLAY_STORE.md)** - EAS build, env vars, SHA-1
- **[PLAY_STORE_SCREENS.md](PLAY_STORE_SCREENS.md)** - Play Console **screen-by-screen** (what to enter on each page)

```bash
npx eas login
npx eas init
npm run eas:build:android
```

## Scripts

| Command                           | Purpose                                           |
| --------------------------------- | ------------------------------------------------- |
| `npm install --legacy-peer-deps`  | Install deps (also enforced via `.npmrc` for EAS) |
| `npm run typecheck`               | `tsc --noEmit`                                    |
| `npm test`                        | Unit tests (jest-expo): scoring engine, access    |
| `npm run lint`                    | ESLint (no mutate)                                |
| `npm run format` / `format:check` | Prettier                                          |
| `npm run eas:build:android`       | Production AAB for Play Store                     |
| `npm run eas:build:preview`       | Internal APK for sideload                         |
| `npm run eas:submit:android`      | Upload AAB to Play (after Console setup)          |

See [claude.md](claude.md) for engineering conventions.

## Inviting friends

- Each league has an invite code and an https link: `EXPO_PUBLIC_WEB_ORIGIN/join/CODE`.
  The code resolves through `leagueInvites/{code}`; leagues themselves are readable by members only.
- Joining needs Google sign-in (demo mode is local to one phone). After joining, people pick
  an unclaimed guest card ("that's me") or add themselves.
- **Deploy `firestore.rules` before shipping the app** (`firebase deploy --only firestore:rules`);
  older rules reject the join and scorer-handover writes.
- Links open the web app. Opening the installed Android app from the link needs Android App
  Links (an `intentFilters` entry plus `/.well-known/assetlinks.json` on the web host) and a new build.

## Scoring

One phone scores a match at a time; everyone else in the league watches live and can
"Take over scoring" (the match creator can limit who). Firestore rules enforce the same.
