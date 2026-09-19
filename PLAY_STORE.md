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

## 2. Put Firebase env on EAS (required — `.env` is not uploaded)

From the repo root, set each value from your local `.env` (cloud sync **on**):

```bash
npx eas env:create --name EXPO_PUBLIC_FIREBASE_API_KEY --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_FIREBASE_PROJECT_ID --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_FIREBASE_APP_ID --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "YOUR_VALUE" --environment production --visibility plaintext
npx eas env:create --name EXPO_PUBLIC_USE_LOCAL_DATA --value "false" --environment production --visibility plaintext
```

Repeat the same for `--environment preview` if you use the preview APK profile.

Or set them in [expo.dev](https://expo.dev) → project → **Environment variables**.

## 3. Build the Play Store file (AAB)

Repo includes `.npmrc` with `legacy-peer-deps=true` (required for EAS `npm ci`).

```bash
npm run eas:build:android
```

First run creates an Android keystore on EAS (let Expo manage it). When the build finishes, download the `.aab` from the Expo build page.

### Google Sign-In on the store build

After the first production build:

```bash
npx eas credentials -p android
```

Copy the **SHA-1** of the upload/production keystore → Firebase Console → Project settings → Your apps → **Add Android app** (`com.snooker.league`) → paste SHA-1 → download if prompted. Also enable Google sign-in if not already.

Without this, Google login can fail in the Play build even though Expo Go / web worked.

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
- [ ] Production env vars on EAS (`USE_LOCAL_DATA=false`)
- [ ] `npm run eas:build:android` succeeded
- [ ] SHA-1 added to Firebase Android app
- [ ] Play Console app + store listing + privacy policy
- [ ] AAB on Internal testing → install + test Google login + sync
- [ ] Promote to closed/open/production when happy
