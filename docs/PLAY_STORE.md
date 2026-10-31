# Play Store release (Android)

Package: `com.snooker.league` · Build: EAS production **AAB**

## You need once

1. [Expo account](https://expo.dev/signup) (free)
2. [Google Play Console](https://play.google.com/console) developer account (**$25** one-time)
3. Firebase project already working (you have this)

## 1. Install + link EAS

```bash
npm install --legacy-peer-deps
npx eas login
npx eas init
```

`eas init` writes an EAS `projectId` into `app.config.js` / Expo dashboard. Commit that when it appears.

## 2. Env for EAS builds (`.env` is not uploaded)

The app no longer uses Firebase for data or login. `eas.json` already sets
`EXPO_PUBLIC_API_URL` (the Snookit server) and `EXPO_PUBLIC_USE_LOCAL_DATA=false` for the
preview and production profiles. Add the Google web client id, and the Sentry DSN if you use
Sentry:

```bash
npx eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value "YOUR_VALUE" --environment production --visibility plaintext
```

Repeat for `--environment preview` if you use the preview APK profile. Store listing text and
Data safety answers are in [PLAY_STORE_LISTING.md](PLAY_STORE_LISTING.md).

## 3. Build the Play Store file (AAB)

Repo includes `.npmrc` with `legacy-peer-deps=true` (required for EAS `npm ci`).

```bash
npm run eas:build:android
```

First run creates an Android keystore on EAS (let Expo manage it). When the build finishes, download the `.aab` from the Expo build page.

### Google Sign-In on the store build

Play Store builds use the **native** Google account picker (not a browser). Google rejects `snooker://` browser redirects (`Error 400: invalid_request`).

You must register **both** signing certificates on the Firebase Android app (`com.snooker.league`):

1. **EAS upload key** — `npx eas credentials -p android` → copy SHA-1
2. **Play App Signing key** — Play Console → Test and release → App integrity → App signing → **App signing key certificate** → SHA-1

Firebase Console → Project settings → Your apps → Android app `com.snooker.league` → add both SHA-1 values. Enable Google sign-in under Authentication if it is not already.

Then ship a **new EAS AAB** (native module). A JS-only update will not fix Google login.

Keep `google-services.json` (downloaded from Firebase → Android app) at the repo root. `app.config.js` points `android.googleServicesFile` at it so Play builds can resolve Google Sign-In.

## 4. Create the Play Console app

Follow **[PLAY_STORE_SCREENS.md](PLAY_STORE_SCREENS.md)** screen by screen (Create app → store listing → Internal testing).

Short version:

1. Play Console → **Create app** → name **Snookit-Snooker Scoring App**, package `com.snooker.league`, Free, App
2. Complete Dashboard setup tasks (privacy policy, ratings, data safety, listing)
3. **Testing → Internal testing** → upload `.aab` → add your email → install from the join link

## 5. Optional: upload via CLI later

First AAB is often easiest manually. After the app exists in Play Console and a service account has Play access:

```bash
npm run eas:submit:android
```

(`eas.json` submits to **internal** track as **draft**.)

## Preview APK (sideload, not Play Store)

```bash
npm run eas:build:preview
```

Install the APK for a quick device check before / beside internal testing.

## Checklist

- [ ] `eas login` + `eas init`
- [ ] Google web client id (and Sentry DSN) set on EAS
- [ ] `npm run eas:build:android` succeeded
- [ ] SHA-1 added to Firebase Android app
- [ ] Play Console app + store listing + privacy policy
- [ ] AAB on Internal testing → install + test Google login + sync
- [ ] Promote to closed/open/production when happy
