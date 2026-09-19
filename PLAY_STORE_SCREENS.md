# Google Play Console — screen-by-screen setup

App: **Snookit**  
Package (inside your AAB): `com.snooker.league`  
Open: [play.google.com/console](https://play.google.com/console)

Use this doc top to bottom. For each screen: what you see → what to enter → what to click next.

---

## Before you start

1. Finish a successful EAS Android production build and download the **`.aab`** from Expo.
2. Have ready:
   - App icon **512×512** PNG (from `assets/icon.png`)
   - Feature graphic **1024×500** (simple banner; make in Canva if needed)
   - At least **2 phone screenshots**
   - A **public privacy policy URL** (Notion public page / GitHub Pages)
   - Your contact email

---

# PART A — Create the app

## Screen 1 — Create app (App details)

You should see fields like this:

### App name

|             |                               |
| ----------- | ----------------------------- |
| **Enter**   | `Snookit-Snooker Scoring App` |
| **Limit**   | 30 characters (27/30)         |
| **Meaning** | Name users see on Google Play |

### Package name

|                                             |                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What to do**                              | Leave empty **if** the field is optional / greyed, **or** enter exactly: `com.snooker.league`                                                                                                  |
| **Important**                               | This must match the AAB. Your Expo app already uses `com.snooker.league`. Do **not** invent a new name (e.g. not `com.vaibhav.snooker`).                                                       |
| **If Play says** “reserved / already taken” | Use the same `com.snooker.league` only if it’s yours from this project. Otherwise you must change `android.package` in `app.config.js`, rebuild the AAB, then use that new package everywhere. |

> On some Console versions, package name is set **when you upload the first AAB**, not on this screen. If the box is missing or locked, skip it and continue.

### Default language

|            |                                   |
| ---------- | --------------------------------- |
| **Select** | `English (United States) – en-US` |

(Or `English (India)` if you prefer — either is fine.)

### App or game

|            |                    |
| ---------- | ------------------ |
| **Select** | **App** (not Game) |

### Free or paid

|            |          |
| ---------- | -------- |
| **Select** | **Free** |

You cannot turn Free → Paid later after publish. Paid → Free is allowed later if needed.

### Declarations

| Checkbox                       | Action                                                        |
| ------------------------------ | ------------------------------------------------------------- |
| **Developer Program Policies** | ✅ Check — “Confirm app meets the Developer Program Policies” |
| **US export laws**             | ✅ Check — “Accept US export laws”                            |

### Then click

**Create app** (bottom right).

---

## Screen 2 — App dashboard (home)

You land on the app’s **Dashboard**.

You’ll see sections like:

- **Set up your app** (checklist with incomplete tasks)
- **Grow** / **Release** later

### What to do

1. Stay on this app (title **Snookit** in the top bar).
2. Open **Set up your app** / **Dashboard** tasks one by one (left menu or the checklist cards).
3. Prefer **Internal testing** first (do **not** jump to Production until testing works).

Work through **PART B** in any order Play allows; typical order below.

---

# PART B — Set up your app (checklist screens)

## Screen 3 — Privacy policy

**Path:** Grow → Store presence → **Store settings** / **App content** → Privacy policy  
(or Dashboard task: **Privacy policy**)

| Field                  | Enter                                     |
| ---------------------- | ----------------------------------------- |
| **Privacy policy URL** | Your public URL (must open without login) |

Example policy text to put on that page:

```text
Privacy Policy — Snookit

Snookit (“the App”) is provided for live snooker scoring, clubs, and city rankings.

Data we collect
• Google account info used for sign-in (name, email, photo if provided by Google)
• Approximate location used only to suggest and store your **city** (not a live GPS trail)
• League data you create: club name, players, matches, races, shot-by-shot scores, and related activity

How we use data
• To authenticate you (Google Sign-In)
• To show local players, city leaderboards, live matches, and challenges
• To sync your data across devices via Firebase (Authentication and Cloud Firestore)

Sharing
• We use Google Firebase. We do not sell your data.
• We do not retain precise GPS coordinates.

Contact
• [YOUR EMAIL HERE]
```

### Then click

**Save**.

---

## Screen 4 — App access

**Path:** App content → **App access**

| Option                                             | Choose               |
| -------------------------------------------------- | -------------------- |
| All functionality available without special access | ✅ **Yes** (typical) |

If asked whether some features need login:

- Google Sign-In is normal Play login; you usually still pick that most features are available after signing in with any Google account.
- If Play asks for **instructions for reviewers**:  
  `Sign in with Google using any Google account. Create or join a league with an invite code to use all features.`

### Then click

**Save**.

---

## Screen 5 — Ads

**Path:** App content → **Ads**

| Question                   | Answer |
| -------------------------- | ------ |
| Does your app contain ads? | **No** |

### Then click

**Save**.

---

## Screen 6 — Content ratings

**Path:** App content → **Content ratings** → Start questionnaire

1. Email: your contact email
2. Category: pick **Sports** or **Utility** (Sports is fine)
3. Answer the IARC questions honestly. For this app, typical answers:

| Topic                             | Typical answer                                     |
| --------------------------------- | -------------------------------------------------- |
| Violence                          | No                                                 |
| Sexual content                    | No                                                 |
| Profanity                         | No                                                 |
| Controlled substances             | No                                                 |
| Gambling / cash prizes            | No                                                 |
| User-to-user communication / chat | No (unless you add chat later)                     |
| Share location                    | Yes — approximate city only (not a live GPS trail) |
| Online interactions               | Mild — account login only                          |

4. **Save** → **Submit**
5. Wait until rating appears (often **Everyone** / PEGI 3)

### Then click

**Save** / apply rating to the store listing when prompted.

---

## Screen 7 — Target audience and content

**Path:** App content → **Target audience**

| Field                 | Choose                                                           |
| --------------------- | ---------------------------------------------------------------- |
| Target age groups     | Prefer **18 and over**, or include **13–17** if kids will use it |
| Appealing to children | **No** (unless you design for kids)                              |

### Then click

**Next** / **Save**.

---

## Screen 8 — News apps

**Path:** App content → **News apps**

| Question            | Answer |
| ------------------- | ------ |
| Is this a news app? | **No** |

### Then click

**Save**.

---

## Screen 9 — COVID-19 contact tracing / other declarations

If shown:

| Question                            | Answer for Snookit |
| ----------------------------------- | ------------------ |
| COVID contact tracing / status apps | **No**             |
| Government apps                     | **No**             |

### Then click

**Save**.

---

## Screen 10 — Data safety

**Path:** App content → **Data safety**

Be honest. Approximate answers for this app:

### Data collected

| Data type                    | Collected?                  | Why                                                 |
| ---------------------------- | --------------------------- | --------------------------------------------------- |
| Name                         | Yes                         | Account / profile                                   |
| Email                        | Yes                         | Google sign-in                                      |
| User IDs                     | Yes                         | Firebase Auth UID                                   |
| Photos (profile from Google) | Yes (if Google provides)    | Profile                                             |
| Approximate location (city)  | Yes, optional               | Suggest city, local players, rankings, live matches |
| Device IDs                   | Optional / as Firebase uses | Auth / analytics if any                             |

### Is data shared with third parties?

- **Yes** — shared with **Google Firebase** (service provider), not sold for ads.

### Data encrypted in transit?

- **Yes**

### Can users request deletion?

- **Yes** (say they can contact you by email to delete account/league data), unless you build in-app delete later.

### Then click

**Save** → preview → **Submit**.

---

## Screen 11 — Government apps / Financial features / Health (if shown)

Answer **No** unless they clearly apply. Snookit is not a bank/health/government app.

---

# PART C — Store listing

## Screen 12 — Main store listing

**Path:** Grow → Store presence → **Main store listing**

### App details

| Field                 | Enter exactly                                                        |
| --------------------- | -------------------------------------------------------------------- |
| **App name**          | `Snookit-Snooker Scoring App`                                        |
| **Short description** | `#1 Snooker scoring app for live scoring, city rankings, and clubs.` |
| **Full description**  | Paste block below                                                    |

**Full description:**

```text
Snookit is the snooker scoring app for live scoring, city rankings, and clubs.

• Live-score every shot — pots, fouls, and current break update instantly
• See live matches and the best players in your city
• Challenge opponents and set up a match
• Track highest breaks, centuries, doubles, races, and champions
• Invite friends with a club code
• Sign in with Google to sync across devices

Built for phone-first play at the table.
```

### Graphics

| Asset                 | Requirement           | What to use                                               |
| --------------------- | --------------------- | --------------------------------------------------------- |
| **App icon**          | 512 × 512 PNG, 32-bit | Export `assets/icon.png` to 512×512                       |
| **Feature graphic**   | 1024 × 500            | Banner with text “Snookit” on dark green `#071A10`        |
| **Phone screenshots** | Min 2                 | Capture Home, Match, Leaderboard, Profile from your phone |

Optional: 7" / 10" tablet screenshots — skip for now.

### Categorization

| Field            | Enter                              |
| ---------------- | ---------------------------------- |
| **App category** | Sports                             |
| **Tags**         | optional (snooker, sports, league) |

### Contact details

| Field       | Enter                      |
| ----------- | -------------------------- |
| **Email**   | Your real email (required) |
| **Phone**   | Optional                   |
| **Website** | Optional                   |

### Then click

**Save**.

---

## Screen 13 — Store settings (language / name)

Confirm default language is still **English (United States)**.  
App name should still be **Snookit-Snooker Scoring App**.

### Then click

**Save**.

---

# PART D — Countries / pricing

## Screen 14 — Countries/regions & pricing

**Path:** Test and release / Monetize → **Countries/regions** or **Free app** pricing

| Setting   | Choose                                                                   |
| --------- | ------------------------------------------------------------------------ |
| Price     | **Free**                                                                 |
| Countries | **Available in all countries** (or select India + others you care about) |

### Then click

**Save**.

---

# PART E — Internal testing release (install on your phone)

Do this **before** Production.

## Screen 15 — Internal testing → Testers

**Path:** Test and release → Testing → **Internal testing** → **Testers**

1. Click **Create email list** (or Create list)
2. **List name:** `Internal testers`
3. **Add email addresses:** your Gmail (the one on the phone)  
   Example: `you@gmail.com`
4. **Save changes**

Copy the **join / opt-in link** when shown (you’ll need it after the release is live).

---

## Screen 16 — Internal testing → Create new release

**Path:** Internal testing → **Create new release**

### App integrity / Play App Signing

| Prompt                  | Action                                                          |
| ----------------------- | --------------------------------------------------------------- |
| Google Play App Signing | **Continue** / Accept — let Google manage signing (recommended) |

### App bundles

1. Click **Upload**
2. Select your Expo **`.aab`** file
3. Wait until processing finishes
4. Confirm package shows as **`com.snooker.league`**

If upload fails with package mismatch, your AAB package ≠ what Play expects — fix `app.config.js` / rebuild.

### Release name

|           |                                                       |
| --------- | ----------------------------------------------------- |
| **Enter** | `1.0.0` or accept Play’s auto name (e.g. `1 (1.0.0)`) |

### Release notes

**en-US:**

```text
Initial internal testing release.
```

### Then click

**Next** → review warnings → **Save** → **Review release** → **Start rollout to Internal testing**.

---

## Screen 17 — Confirm rollout

|           |                                  |
| --------- | -------------------------------- |
| Rollout % | 100% of internal testers is fine |
| Confirm   | **Rollout** / **Start rollout**  |

Wait until status is **Available to internal testers** (can take minutes to hours).

---

## Screen 18 — Install on your phone

1. On the phone, open the **join link** from the Testers screen (use the same Google account you added).
2. Accept becoming a tester.
3. Tap **Download on Google Play** / open the listing.
4. Install **Snookit**.
5. Open the app → **Sign in with Google** → create/join league → smoke-test.

### If Google sign-in fails

Add your EAS upload keystore **SHA-1** to Firebase:

```bash
npx eas credentials -p android
```

Firebase Console → Project settings → **Add Android app** → package `com.snooker.league` → paste **SHA-1**.

---

# PART F — Production (only after internal test works)

## Screen 19 — Publishing overview

**Path:** Dashboard → **Publishing overview**

Complete every remaining required task until you can send for review.

---

## Screen 20 — Production → Create release

**Path:** Test and release → **Production** → **Create new release**

1. Promote from Internal testing **or** upload the same `.aab` again
2. Release notes:

```text
First public release of Snookit — live snooker scoring, city rankings, and clubs.
```

3. **Review release** → **Start rollout to Production**
4. Confirm send for **Google review**

Review can take from a few hours to several days.

---

# Quick reference — Create app screen (your screenshot)

| Field                      | What to do                                          |
| -------------------------- | --------------------------------------------------- |
| App name                   | `Snookit-Snooker Scoring App`                       |
| Package name               | `com.snooker.league` (or leave if set by first AAB) |
| Default language           | English (United States) – en-US                     |
| App or game                | **App**                                             |
| Free or paid               | **Free**                                            |
| Developer Program Policies | ✅ Check                                            |
| US export laws             | ✅ Check                                            |
| Button                     | **Create app**                                      |

Then go to **Dashboard → Set up your app** and continue from **PART B** in this file.

---

# Checklist

- [ ] Screen 1 — Create app saved
- [ ] Privacy policy URL
- [ ] App access / Ads / Ratings / Audience / News / Data safety
- [ ] Main store listing + icon + feature graphic + 2 screenshots
- [ ] Countries + Free
- [ ] Internal tester email list (you)
- [ ] AAB uploaded to Internal testing + rollout started
- [ ] Joined as tester + installed from Play
- [ ] Google login + sync works
- [ ] Firebase Android SHA-1 added
- [ ] Production release (when ready)
