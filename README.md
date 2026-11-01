# DMs — Instagram without the distractions (Android)

What works: messages, voice messages, sending photos, watching and posting stories,
opening reels/posts friends send you (likes, comments, sound).

What's blocked: the feed, the Reels tab, Explore, profiles, swiping to other reels,
sharing reels, creating posts/reels, and all notifications (the app has no
notification permission at all).

## Get the APK, option A: GitHub (nothing to install)
Every push to `main` builds the app (~3–5 min) and publishes it under **Releases**.
On your phone open `https://github.com/padthink201/instagram-dms-only/releases/latest`,
tap `DMs.apk`, and allow "install unknown apps" when asked.

The signing key lives in the repo secret `SIGNING_KEYSTORE_B64` (base64 of the keystore,
passwords `android`), not in the code.

## Get the APK, option B: Android Studio
Open this folder in Android Studio → wait for Gradle sync → plug in your phone
(USB debugging on) → press Run ▶.

## After installing
- Log in once. Then **uninstall the real Instagram app**.
- If something you need gets blocked, a "Blocked: /…/" message appears for a few seconds.
  Add that path to `ALLOWED_PREFIXES` in `app/src/main/assets/dmonly.js` and rebuild.
- Rebuilt APKs install as updates (same signing key), so you stay logged in.
