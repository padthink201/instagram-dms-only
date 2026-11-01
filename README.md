# DMs: Instagram without the distractions (Android)

A small Android app that opens Instagram **for talking to people**: messages, calls, stories and
notifications. No feed, no Reels tab, no Explore, no push notifications, no way to scroll from one
reel into the next. Built for staying in touch without getting pulled into doomscrolling.

It wraps the Instagram website (instagram.com) and adds its own rules on top, so it can only do
what Instagram's website can do. Your login stays on your phone. The app doesn't send your data
anywhere except Instagram itself (and GitHub, to check for updates).

Not affiliated with Instagram or Meta. Personal project; use at your own risk.

**Current version:** see [Releases](https://github.com/padthink201/instagram-dms-only/releases/latest).
This page describes build 16 and newer.

---

## Install
1. On your Android phone (Android 8 or newer), open
   **https://github.com/padthink201/instagram-dms-only/releases/latest**
2. Tap `DMs.apk`. When Android asks, allow your browser to "install unknown apps".
3. Open **DMs** and log in with your Instagram account.
4. Uninstall the official Instagram app (otherwise you'll just keep opening it).

## Updating
The app checks GitHub when it starts. When there's a new version, a small bar appears at the top:
**New version · build N | Update | ✕**. Tap **Update**, then **Install**. The first time, Android
asks you to allow "Install unknown apps" for DMs. Updates install over the old version, so you stay
logged in. Tap the "New version" text to see what changed on GitHub.

You can also long-press the app icon → **Check for updates**, or install the latest `DMs.apk` from
the Releases page by hand.

> Builds 1–6 have no update bar. If you're on one of those, install the latest by hand once.
> Builds 1–2 used a temporary signing key: if Android says "App not installed", uninstall the old
> app first (one time only).

---

## ✅ What it can do

### Messages
- Direct messages and group chats, message requests
- Voice messages (normal recording)
- Sending photos and videos: opens **straight into your gallery** (Android photo picker)
- Opening photos, videos, reels and posts that people send you
- Back button from a chat always returns to the chat list

### Calls
- Audio and video calls through **call mode**: tap the small round **📞** on the right side of a chat.
  The chat reloads as Instagram's desktop website (which has call buttons). Then tap Instagram's
  call or video button.
- The call screen is zoomed to fit your phone in portrait, and the screen stays on during a call.
- **Exit** on the "📞 Call mode" bar, or the phone's back button, closes the call and returns to the
  normal phone layout. The app also switches back by itself when the call window closes.

### Stories
- Watching stories (the stories bar on the Home screen; the feed under it is hidden)
- Posting a regular story from your gallery

### Notifications (activity)
- The ❤️ notifications page: likes, comments, follows, story likes
- Tapping a notification opens what it's about. Instagram's phone website doesn't make these rows
  tappable, so the app finds the post behind each row itself.
- Comment notifications open **the comment itself** (or the post's comments list)

### One reel at a time
- A reel or post you open (from a chat or a notification) works normally: video, sound, likes, comments
- You **can't** swipe or scroll into another reel or post from there. Trying reloads the one you
  opened and shows "Only the one you were sent".

### Your profile and settings
- Tap your profile picture in the bottom bar: your profile opens **without the post grid**, so the
  ☰ / ⚙️ settings menu is there. All of Instagram's settings pages and Accounts Center work.
- Or long-press the app icon → **Instagram settings**

### Offline
- If your internet drops, everything already on screen stays visible.
- If you open the app with no internet, it shows a **saved copy of the last chat screen** you had
  open ("Offline · saved copy from 20:41"). It reloads by itself when the internet is back.

### App icon shortcuts (long-press the DMs icon)
- **Check for updates**
- **Desktop mode (calls)**: manual switch to the desktop website; the same shortcut switches back
- **Instagram settings**
- **GitHub page**

---

## 🚫 What's blocked on purpose
- Home feed (posts under the stories bar are hidden)
- Reels tab and Explore
- Other people's profiles (tapping one from a chat takes you back to the chat list)
- Scrolling or swiping from one reel/post to another; "more posts" sections and other reels' thumbnails
- Videos anywhere except chats, stories and the reel/post you opened (so nothing flashes while you
  switch pages)
- Sharing / forwarding reels and posts (share buttons hidden)
- Creating posts and reels (stories are allowed)
- "Use the app" / "Open app" banners, and links that would open the official Instagram app
- **Push notifications.** The app has no notification permission and can never show one.
  You see new messages when you open it.

If the app blocks something it shouldn't, a small **"Blocked: /something/"** message appears at the
bottom. Open an [issue](https://github.com/padthink201/instagram-dms-only/issues) with that text.

---

## ❌ What it can't do (Instagram's website doesn't offer it)
These aren't blocked by the app. Instagram's website simply doesn't have them, and adding them
would mean pretending to be the official app, which can get your account banned.

| Feature | Status |
|---|---|
| Voice message effects / voice changers | ❌ Only in the official app |
| "View once" / "allow replay" photos and videos taken with Instagram's camera | ❌ Instagram only shows these in the official app |
| Your phone ringing for incoming calls while DMs is closed | ❌ Needs push notifications. You can only get a call while the app is open. |
| Push notifications of any kind | 🚫 Off on purpose; Android's WebView can't receive them anyway |
| Posting a story to **Close Friends** only | ⚠️ Not confirmed; probably not on the website. If the share screen shows a Close Friends option, it works. |
| **Add to your story** when someone mentions you | ⚠️ Not confirmed; probably not on the website |
| Story stickers, music, polls | ⚠️ Very limited on the website |
| Sending messages while offline | ❌ The offline copy is read-only |

## ⚠️ Known rough edges
- **Calls** depend on Instagram's desktop website on a phone screen. They work, but the call screen
  is small (pinch to zoom) and Instagram could change it at any time.
- **Notifications** that aren't about a post (e.g. "started following you") can't be opened. If a
  post notification says **"Can't open this one · tap here to copy details for Claude"**, tap the
  message and paste the copied text into an issue.
- The first page load after switching call mode on or off is a bit slower (Instagram re-downloads
  its files).
- Hiding share buttons relies on Instagram's English button labels. With Instagram set to another
  language, share buttons may stay visible.
- Instagram changes its website often. Any rule here can break after one of their updates.

---

## FAQ
**Is my account safe?** The app is a normal browser view of instagram.com, the same thing you'd get in
Chrome, plus rules that hide things. It doesn't use unofficial APIs. Your password goes only to
Instagram.

**Can other people change this app?** No. Only the owner can publish releases. Others can copy the
code (fork) or suggest changes, but their builds can't install over this app, because they don't
have its signing key.

**Why isn't it on the Play Store?** It's a personal project; installing from GitHub is simpler.

---

## History (so far)
| Build | What changed |
|---|---|
| 1–3 | First version: DMs only, stories, sent reels open one at a time, no notifications; permanent signing key from build 3 |
| 4–6 | Gallery picker, no feed flashes, loading spinner and "use the app" banner removed, back from chats fixed |
| 7 | In-app update bar, app icon shortcuts, offline copy, activity page, call windows |
| 8–12 | Call mode with 📞 button in chats, automatic switch back, portrait call screen, stuck bottom bar fixed, own profile and settings |
| 13–15 | Notification rows open the post behind them; gallery picker fixed again |
| 16 | Comment notifications open the comment itself |

---

## For developers
- Page rules (what's allowed/blocked, notifications, hiding): `app/src/main/assets/dmonly.js`
  (allowed paths are in `ALLOWED_PREFIXES`)
- App shell (WebView, calls, gallery, offline copy, updates, shortcuts):
  `app/src/main/java/com/zurab/dmonly/MainActivity.kt`, update check in `Updater.kt`
- Build locally: open the folder in Android Studio and press Run, or `./gradlew assembleDebug`
- Every push to `main` (except README-only changes) is built by GitHub Actions and published as
  release `build-N`, where N is the app's version code.
- Release builds are signed with a key stored in the repository secret `SIGNING_KEYSTORE_B64`
  (base64 keystore, alias `androiddebugkey`, passwords `android`). It's not in the code.
  Forks without that secret build with Android's default debug key, so their APKs can't install
  over the official releases.
