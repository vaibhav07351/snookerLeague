# Engineering conventions — snooker

Expo (React Native) + TypeScript + Expo Router + Firebase Auth/Firestore.
These conventions apply across the app unless a feature-local note overrides them.

## Projects & commands

| Path | What it is | Build / test / lint |
|------|-----------|---------------------|
| `.` (repo root) | Expo app — phone-first snooker league tracker | `npm start` · `npm run android` / `ios` · `npm run lint` · `npm run format` · `npm run format:check` · `npx tsc --noEmit` |

Run commands from the repo root.

## Formatting & lint

**Prettier is the formatter of record.** Shared `.prettierrc` (2-space, single quotes, semicolons, `printWidth` 100, trailing commas, LF) plus `.editorconfig` and `.gitattributes` pinning `eol=lf`. Don't hand-format against it.

| Script | What it does |
|--------|--------------|
| `npm run format` | Rewrites files to Prettier style |
| `npm run format:check` | Verifies only — **CI should gate on this** |
| `npm run lint` | Reports ESLint problems, never mutates |
| `npm run lint:fix` | The mutating variant, run deliberately |

- `lint` and `lint:fix` stay separate. Never put `--fix` into `lint`.
- After `lint:fix`, run `format` — removing code can leave formatting drift.
- Don't add net-new ESLint / TypeScript violations.

## General approach

- Write and review code as a senior engineer would: correct, secure, maintainable.
- Prefer low time complexity; call out deliberate slower tradeoffs.
- No half-finished implementations, no speculative abstractions — but build for the *known* future shape (swappable repos, clear domain services).
- After writing code, self-review before calling the task done:
  - Logic bugs, off-by-ones, unhandled edges, broken control flow
  - Architectural fit: correct feature module, no cross-feature repo reaches, no UI→Firestore
  - Error paths logged per Logging below
  - Existing behaviours on touched surfaces still work (filters, counts, empty/error states)

### Integrating into an existing surface

Adding to a screen or list means every control already there must work with the new data too.

- Filters / search — new rows must be narrowed the same way
- Counts / badges / summaries — must include new data and still reconcile
- Pagination — every source needs a paging story
- Sorting / grouping — same keys as existing rows
- Empty / loading / error — per-source when multi-source
- Adjacent flows sharing the data — new writes/shapes must not break them

## Modular architecture (feature folders)

Feature-per-domain under `src/features/` (`auth/`, `league/`, `players/`, `match/`, `race/`, `stats/`, `home/`).

Inside a feature (omit empty folders):

```
screens/  components/  hooks/  services/  repositories/  schemas/  types/
```

- Loose coupling: a feature talks to another only through that feature's **public service** surface — never its repository, private hooks, or internal types meant for local use.
- Expo Router files under `src/app/` stay thin — they render feature screens, they don't own business logic.

## Layering & separation of concerns

Strict layering:

**Screens / components → feature hooks → domain services → repositories → Firebase SDK**

| Layer | Owns | Must not |
|-------|------|----------|
| Screens / components | Render, navigation, local UI state | Firestore, Auth SDK, stats math, doc paths |
| Feature hooks | Wire UI to services, loading/error for the screen | Query strings, collection paths, business rules |
| Domain services | Match/race/stats/league rules, Zod validation before write | Direct Firestore calls |
| Repositories | Firestore/Auth reads & writes only | Business rules, UI concerns |
| `src/shared` | Firebase init, logger, errors, generic utils | Feature-specific branching |

- One service file per domain concept (e.g. `match.service.ts`, `race.service.ts`).
- Keep UI files under ~300 lines; services/repos under ~500 — extract rather than grow.
- Avoid circular dependencies between features; extract shared pieces into `src/shared`.

## Shared code

Before writing a new util, check `src/shared/` first. If logic is reusable across ≥2 features, put it in shared (generic only). If a “shared” helper needs feature-specific branches, it isn't shared yet — keep it local.

## Production-grade planning

- Explicit types / Zod schemas over loose object shapes.
- Consider failure modes up front (offline mid-match, half-written race, forfeit mid-score).
- Repositories isolate Firestore so a future API/Mongo swap is a repo rewrite, not a UI rewrite.

### Resilience

- Every outbound network call that isn't the Firebase SDK's own retry path should use a timeout where we own the fetch.
- Reuse the single Firebase app / Auth / Firestore instances from `src/shared/firebase` — never re-init per call.
- List endpoints / queries must be paginated — never unbounded result sets in production paths.
- Prefer point reads when the doc id is known; avoid N+1 loops of one read per item.

## Security

- Never hardcode secrets, API keys, or tokens. Client Firebase config lives in env (`EXPO_PUBLIC_FIREBASE_*`); placeholders in `.env.example`. Never commit service account keys.
- Validate and sanitize all external / user input at the service boundary with Zod before repository writes.
- `firestore.rules` is the **backend auth contract** — versioned in-repo, reviewed like API guards. Client UI hiding is not protection.
- Don't log tokens, full emails beyond what's needed for support, or other sensitive PII. Prefer ids and shapes.

## Data hygiene (Firestore)

- Prefer point reads (doc id) over collection scans when possible.
- Select / project only needed fields when the query shape supports it.
- Keep related writes consistent via batches/transactions where the same logical operation spans docs (e.g. finish race + update player stats + crown title).
- Make multi-doc updates idempotent where a retry is possible.

## Error handling

- Services throw typed domain/app errors; hooks map them to UI messages.
- Never swallow errors with empty `catch {}` — log with context, rethrow or return a typed failure.
- Timestamps crossing persistence boundaries are ISO 8601 UTC strings. IDs are strings.
- Structured error shape for user-facing failures: `{ code, message }`.

## Logging

- Use the shared structured logger (`src/shared/logging`) — one JSON-ish object with timestamp, layer/module, relevant ids.
- No `console.log` in production feature code.
- Never log secrets or raw sensitive PII.

## Frontend conventions (Expo + React Native)

- Code-split at the route level via Expo Router; keep heavy screens out of the critical home path where practical.
- One component per file; avoid barrel files that re-export an entire folder.
- Group imports: external packages → internal modules (`@/…`) → relative → types.
- No `any` — use `unknown` and narrow, or explicit interfaces. Type exported function params/returns. Model state with discriminated unions (`Match` vs `Race`, `completed` | `forfeited`, `place | 'dnf'`).
- Tests co-locate with the file they cover when a runner is added (`foo.ts` → `foo.test.ts`).

## Post-coding checklist

1. Does it typecheck (`npx tsc --noEmit`) and pass `format:check` / `lint`?
2. Obvious logic bugs, nulls, race conditions?
3. Correct layer (screen vs hook vs service vs repo)? Loose coupling preserved?
4. Shared logic reused instead of duplicated?
5. Failures logged; no sensitive data leaked; no empty catches?
6. Input validated with Zod before writes?
7. New Firestore queries paginated / free of N+1 / free of unparameterized paths?
8. New env vars only in config + `.env.example` placeholders?
9. Touched surfaces: filters, counts, empty/error states still correct?
