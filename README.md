# Snooker League

Phone-first Expo app for 2v2 doubles matches and individual race-to-score games.

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

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Expo dev server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (no mutate) |
| `npm run format` / `format:check` | Prettier |

See [claude.md](claude.md) for engineering conventions.
