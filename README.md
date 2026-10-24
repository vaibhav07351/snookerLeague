# Snookit

Phone-first snooker scoring, leagues and city rankings.

## Repository layout

| Folder             | What it is                                                                     |
| ------------------ | ------------------------------------------------------------------------------ |
| `frontend/`        | Expo (React Native) + TypeScript app, with a web build                         |
| `backend/`         | Go + PostgreSQL API, deployed with Docker on an Oracle Cloud Always Free VM    |
| `docs/`            | Plans and Play Store notes. Start with `docs/PRODUCTION_PLAN.md`               |
| `legacy-firebase/` | Old Firestore rules and config, kept only until the Firebase data move is done |

Engineering conventions for both live in [claude.md](claude.md).

## Frontend

```bash
cd frontend
npm install --legacy-peer-deps
cp .env.example .env
npm start
```

Demo sign-in works without a server and keeps data on one phone. Google sign-in and sync need the backend (see below).

| Command                           | Purpose                                         |
| --------------------------------- | ----------------------------------------------- |
| `npm run typecheck`               | `tsc --noEmit`                                  |
| `npm test`                        | Unit tests (jest-expo): scoring engine, storage |
| `npm run lint`                    | ESLint (no mutate)                              |
| `npm run format` / `format:check` | Prettier                                        |
| `npm run eas:build:android`       | Production AAB for Play Store                   |
| `npm run eas:build:preview`       | Internal APK for sideload                       |

Play Store steps: [docs/PLAY_STORE.md](docs/PLAY_STORE.md) and [docs/PLAY_STORE_SCREENS.md](docs/PLAY_STORE_SCREENS.md).
EAS builds should be started from `frontend/`.

## Backend

```bash
cd backend
go build ./... && go vet ./... && go test ./...
```

Deployment (Docker Compose, shared Oracle VM): see [backend/deploy/](backend/deploy/) and [docs/PRODUCTION_PLAN.md](docs/PRODUCTION_PLAN.md).

## Scoring

One phone scores a match at a time; everyone else in the league watches live and can "Take over scoring" (the match creator can limit who).
