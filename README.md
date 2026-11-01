# DMs — Instagram without the distractions (Android)

A small Android app that opens Instagram **for messages only**. No feed, no Reels tab,
no Explore, no notifications. Built for talking to people without getting pulled into scrolling.

It's a wrapper around the Instagram website (instagram.com) with extra rules on top,
so it can only do what the Instagram website can do.

Not affiliated with Instagram or Meta.

## Install
On your Android phone, open
**https://github.com/padthink201/instagram-dms-only/releases/latest**,
tap `DMs.apk`, and allow "install unknown apps" when Android asks.
Log in with your Instagram account. Then uninstall the official Instagram app,
or the whole thing is pointless.

## What works
- Direct messages and group chats
- Voice messages (plain recording, no effects)
- Sending photos/videos (opens straight into your gallery)
- Watching stories (stories bar on the Home screen)
- Posting a regular story
- Opening reels and posts that friends send you in chat: likes, comments and sound work

## What's blocked on purpose
- Home feed (the posts under the stories bar are hidden)
- Reels tab and Explore
- Profiles
- Swiping from a reel someone sent you to other reels
- Sharing / forwarding reels and posts
- Creating posts and reels
- "Use the app" banners
- **All notifications.** The app has no notification permission, so it can never show one.
  You only see new messages when you open it.

## Known limitations (things Instagram's website doesn't offer)
These aren't blocked by the app. The Instagram website simply doesn't have them, so the
app can't add them without breaking Instagram's rules and risking your account.

| Feature | Status |
|---|---|
| Voice message effects / voice changers | ❌ Not available. Only in the official app. |
| Posting a story to **Close Friends** only | ⚠️ Not confirmed. Probably not available on the website. If you see a Close Friends option when sharing a story, it works. |
| **Add to your story** when someone mentions you in theirs | ⚠️ Not confirmed. Probably not available on the website. |
| Story stickers, music, polls etc. | ⚠️ Very limited on the website compared to the app. |
| Push notifications | 🚫 Disabled on purpose (see above). |

If something you need shows **"Blocked: /something/"** at the bottom of the screen,
the app blocked a page it shouldn't have. Open an issue with that text.

## Updating
Every change pushed to `main` is built automatically by GitHub Actions (~3–5 min) and
published as a new release. Install the new `DMs.apk` from the releases link above.
It installs over the old version and you stay logged in.

## For developers
- Blocking rules: `app/src/main/assets/dmonly.js` (allowed paths are in `ALLOWED_PREFIXES`)
- App shell (WebView, gallery picker, permissions): `app/src/main/java/com/zurab/dmonly/MainActivity.kt`
- Build locally: open the folder in Android Studio and press Run, or `./gradlew assembleDebug`
- Release builds are signed with a key stored in the repo secret `SIGNING_KEYSTORE_B64`
  (base64 keystore, alias `androiddebugkey`, passwords `android`). It's not in the code.
  Forks without that secret build with Android's default debug key, so their APKs
  can't install over the official releases.
