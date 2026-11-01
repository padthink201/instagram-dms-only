// Injected into every instagram.com page by the app.
// Allows: DMs, calls, stories (watch + post), activity (likes/comments), and opening ONE
//         reel/post at a time from a chat or from activity (with its comments).
// Blocks: feed, Reels tab, Explore, profiles, scrolling/swiping to other reels or posts,
//         sharing reels, creating posts/reels, "use the app" banners.
(() => {
  'use strict';
  if (window.__dmonly) return;
  window.__dmonly = true;

  const HOME = '/direct/inbox/';
  const SHOW_BLOCKED_BANNER = true;

  const ALLOWED_PREFIXES = [
    '/direct/',          // messages
    '/call',             // audio / video calls
    '/stories/',         // watching stories
    '/create/story',     // posting a story
    '/accounts/',        // login, settings, activity (likes/comments on your stuff)
    '/notifications',    // activity (other layout)
    '/settings',         // settings pages
    '/emails/', '/session/', '/your_activity/', '/privacy', '/help', '/legal/',
    '/challenge/', '/checkpoint/', '/auth_platform/', '/two_factor/', // security checks
  ];


  // /p/ID, /reel/ID, /reels/ID (+ /comments/, /liked_by/ etc. of the same ID)
  const MEDIA_RE = /^\/(reels?|p)\/([^/?#]+)/;

  const APP_NAG_TEXTS = ['use the app', 'use an app', 'use app', 'open app', 'open the app',
    'get the app', 'open instagram', 'get app'];
  const MORE_TEXTS = ['more posts from', 'more reels from', 'more from', 'related', 'suggested', 'explore more'];

  const html = document.documentElement;

  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} },
  };

  // Any allowed page that isn't itself a reel/post may open ONE reel/post ("one hop").
  // From a reel/post you can't go to another one, so there's no scrolling deeper.
  // Your own profile (for the settings menu). The post grid on it is hidden by CSS.
  const NOT_USERNAMES = new Set(['direct', 'explore', 'reels', 'reel', 'p', 'stories', 'accounts',
    'notifications', 'create', 'call', 'settings', 'emails', 'session', 'your_activity', 'privacy',
    'help', 'legal', 'challenge', 'checkpoint', 'auth_platform', 'two_factor']);
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const me = () => lsGet('dmonly_me');
  const userOf = (p) => {
    const m = (p || '').match(/^\/([A-Za-z0-9._]{1,30})\/?$/);
    return m && !NOT_USERNAMES.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
  };
  const isMyProfile = (p) => { const u = userOf(p); return !!u && u === me(); };

  // Learn your username from the profile button in Instagram's bottom/side bar.
  const learnMe = () => {
    const home = document.querySelector('a[href="/"]');
    let bar = home;
    for (let i = 0; i < 6 && bar; i++) {
      bar = bar.parentElement;
      if (bar && bar.querySelectorAll('a[href]').length >= 3) break;
    }
    if (!bar) return;
    for (const a of bar.querySelectorAll('a[href]')) {
      const u = userOf(a.getAttribute('href'));
      if (u && a.querySelector('img')) { if (me() !== u) lsSet('dmonly_me', u); return; }
    }
  };

  const isSource = (p) => !!p && !MEDIA_RE.test(p) &&
    (p === '/' || ALLOWED_PREFIXES.some((x) => p.startsWith(x)));
  const ticket = () => ss.get('dmonly_ticket');

  const allowed = (path, from) => {
    if (path === '/') return true; // stories tray only; feed hidden by CSS
    if (isMyProfile(path)) return true; // settings live behind your profile
    if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return true;
    const m = path.match(MEDIA_RE);
    if (m) {
      if (isSource(from)) return true;   // opened from a chat / activity
      return ticket() === m[2];          // same reel/post (comments, reload, /reel <-> /reels)
    }
    return false;
  };

  const accept = (path, from) => {
    if (isSource(path)) { ss.set('dmonly_return', path); ss.del('dmonly_ticket'); }
    const m = path.match(MEDIA_RE);
    if (m && isSource(from)) ss.set('dmonly_ticket', m[2]);
    ss.set('dmonly_prev', path);
  };

  const backPath = () => {
    const b = ss.get('dmonly_return') || HOME;
    return isSource(b) ? b : HOME;
  };

  const showBanner = (text) => {
    if (!SHOW_BLOCKED_BANNER || !document.body) return;
    const old = document.getElementById('dmonly-banner');
    if (old) old.remove();
    const b = document.createElement('div');
    b.id = 'dmonly-banner';
    b.textContent = text;
    document.body.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, 2600);
  };

  const hardBlock = (path, silent) => {
    html.classList.add('dmonly-blocking');
    if (!silent) ss.set('dmonly_blocked', path);
    location.replace(backPath());
  };

  const goInbox = () => {
    const a = document.querySelector('a[href="/direct/inbox/"], a[href="/direct/inbox"]');
    if (a) a.click(); else location.assign(HOME);
  };

  // Called by the app's back button.
  window.__dmonlyBack = () => {
    const p = location.pathname;
    if (p === HOME || p === '/direct/inbox') return 'exit';
    if (p.startsWith('/direct/')) { goInbox(); return 'handled'; }
    return 'history';
  };

  const setPageClasses = (path) => {
    html.classList.toggle('dmonly-home', path === '/');
    html.classList.toggle('dmonly-media', MEDIA_RE.test(path));
    html.classList.toggle('dmonly-direct', path.startsWith('/direct/'));
    html.classList.toggle('dmonly-thread', path.startsWith('/direct/t/'));
    html.classList.toggle('dmonly-stories', path.startsWith('/stories/') || path.startsWith('/create/story'));
    html.classList.toggle('dmonly-myprofile', isMyProfile(path));
  };

  let lastPath = null;
  let viaPopstate = false;
  const check = () => {
    const path = location.pathname;
    if (path === lastPath) return;
    const from = ss.get('dmonly_prev') || '';
    lastPath = path;
    setPageClasses(path);
    const silent = viaPopstate;
    viaPopstate = false;
    if (allowed(path, from)) accept(path, from);
    else hardBlock(path, silent);
  };

  const urlOf = (url) => {
    try { return new URL(url, location.href); } catch (e) { return null; }
  };

  // 1) Stop link taps to blocked pages before anything happens.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const u = urlOf(a.getAttribute('href'));
    if (!u || u.origin !== location.origin) return;
    if (allowed(u.pathname, location.pathname)) {
      setPageClasses(u.pathname);
    } else {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (location.pathname.startsWith('/direct/t/')) goInbox();
      else if (MEDIA_RE.test(location.pathname) && MEDIA_RE.test(u.pathname)) showBanner('Only the one you were sent');
      else showBanner('Blocked: ' + u.pathname);
    }
  }, true);

  // 2) Navigation done in code (swipes, buttons): check the target before the URL changes.
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function (state, title, url) {
      if (url != null) {
        const u = urlOf(url);
        if (u && u.origin === location.origin && u.pathname !== location.pathname &&
            !allowed(u.pathname, location.pathname)) {
          // Swiping to the next reel: refuse and reload the one you were sent.
          if (MEDIA_RE.test(location.pathname) && MEDIA_RE.test(u.pathname)) {
            html.classList.add('dmonly-blocking');
            ss.set('dmonly_blocked_msg', 'Only the one you were sent');
            location.replace(location.pathname);
            return;
          }
          hardBlock(u.pathname);
          return;
        }
      }
      if (url != null) {
        const u = urlOf(url);
        if (u && u.origin === location.origin) setPageClasses(u.pathname);
      }
      const r = orig.apply(this, arguments);
      check();
      return r;
    };
  }
  window.addEventListener('popstate', () => { viaPopstate = true; check(); });
  setInterval(check, 250);
  check();

  // 3) CSS (+ small animations)
  const addStyle = () => {
    if (document.getElementById('dmonly-style')) return;
    const style = document.createElement('style');
    style.id = 'dmonly-style';
    style.textContent = `
      @keyframes dmonly-in { from { opacity: .35; } to { opacity: 1; } }
      @keyframes dmonly-pop { from { opacity: 0; transform: translate(-50%, 12px) scale(.96); }
                              to   { opacity: .94; transform: translate(-50%, 0) scale(1); } }

      /* Soft fade-in for every page.
         Opacity only, no fill: an animated transform on <body> breaks Instagram's
         pinned bottom bar (it starts scrolling with the page) and tap targets. */
      body { animation: dmonly-in .2s ease-out; }

      /* Blank the page while bouncing back, so blocked pages never flash */
      html.dmonly-blocking body { visibility: hidden !important; }

      /* Reels tab + Explore buttons */
      a[href="/reels/"], a[href="/explore/"] { display: none !important; }

      /* Posts/reels hidden everywhere except: inside a chat, the one reel/post you opened, stories.
         Videos too, so nothing can flash while switching pages. */
      html:not(.dmonly-media):not(.dmonly-thread) main article { display: none !important; }
      html:not(.dmonly-media):not(.dmonly-thread):not(.dmonly-stories) video { visibility: hidden !important; }

      /* On a reel/post page: only the first one is shown, nothing below it to scroll into */
      html.dmonly-media main article ~ article,
      html.dmonly-media .dmonly-more { display: none !important; }

      /* Your profile: settings/edit buttons stay, the grid of posts/reels is hidden */
      html.dmonly-myprofile main a[href^="/p/"],
      html.dmonly-myprofile main a[href^="/reel/"],
      html.dmonly-myprofile main a[href*="/reels/"],
      html.dmonly-myprofile main a[href*="/tagged/"],
      html.dmonly-myprofile main a[href*="/saved/"] { display: none !important; }

      /* Endless "loading" spinner where the hidden feed would be */
      html.dmonly-home main [data-visualcompletion="loading-state"],
      html.dmonly-home main [role="progressbar"],
      html.dmonly-home main svg[aria-label^="Loading"] { display: none !important; }

      /* Share / send buttons on reels and posts */
      svg[aria-label^="Share"] { display: none !important; }
      :is([role="button"], button):has(> svg[aria-label^="Share"]),
      :is([role="button"], button):has(> div > svg[aria-label^="Share"]) { display: none !important; }

      /* "Get the app" links */
      a[href^="instagram://"], a[href*="play.google.com"], a[href*="apps.apple.com"],
      a[href*="itunes.apple.com"], .dmonly-nag { display: none !important; }

      #dmonly-banner {
        position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%);
        background: rgba(30,30,30,.94); color: #fff; padding: 8px 16px; border-radius: 18px;
        font: 13px system-ui, sans-serif; z-index: 2147483647; opacity: .94;
        animation: dmonly-pop .22s cubic-bezier(.2,.9,.3,1.2) both;
        transition: opacity .3s, transform .3s;
        box-shadow: 0 4px 14px rgba(0,0,0,.25);
      }
      #dmonly-banner.out { opacity: 0; transform: translate(-50%, 8px); }
    `;
    (document.head || html).appendChild(style);
  };
  addStyle();

  // 4) Periodic sweep: remove app banners; on reel/post pages hide links to OTHER reels/posts.
  const videoAllowed = () => html.classList.contains('dmonly-media') ||
    html.classList.contains('dmonly-thread') || html.classList.contains('dmonly-stories');

  const sweep = () => {
    learnMe();
    if (!videoAllowed()) {
      for (const v of document.querySelectorAll('video')) {
        try { v.muted = true; if (!v.paused) v.pause(); v.autoplay = false; } catch (e) {}
      }
    }
    // "Use the app" banners
    const els = document.querySelectorAll('a, button, [role="button"], span, div');
    for (const el of els) {
      if (el.childElementCount > 3) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t || t.length > 20 || !APP_NAG_TEXTS.includes(t)) continue;
      let target = el.closest('a, button, [role="button"]') || el;
      let n = el;
      for (let i = 0; i < 8 && n && n !== document.body; i++, n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky') {
          if (n.getBoundingClientRect().height < 160) target = n;
          break;
        }
      }
      target.classList.add('dmonly-nag');
    }

    if (!html.classList.contains('dmonly-media')) return;
    const mine = ticket();

    // Thumbnails / links to other reels and posts
    for (const a of document.querySelectorAll('a[href^="/p/"], a[href^="/reel/"], a[href^="/reels/"]')) {
      const m = (a.getAttribute('href') || '').match(MEDIA_RE);
      if (m && m[2] !== mine) a.classList.add('dmonly-more');
    }
    // "More posts from ..." sections
    for (const h of document.querySelectorAll('main h2, main h3, main span, main div')) {
      if (h.childElementCount > 2) continue;
      const t = (h.textContent || '').trim().toLowerCase();
      if (t && t.length < 60 && MORE_TEXTS.some((x) => t.startsWith(x))) {
        const section = h.closest('section, article ~ div, main > div > div') || h.parentElement;
        if (section && !section.querySelector('article')) section.classList.add('dmonly-more');
      }
    }
  };
  let sweepQueued = false;
  const queueSweep = () => {
    if (sweepQueued) return;
    sweepQueued = true;
    setTimeout(() => { sweepQueued = false; sweep(); }, 150);
  };

  // Notifications: Instagram's phone site shows the rows but doesn't make them tappable.
  // On a tap that opens nothing, find which post/reel/story the row is about (from the
  // page's own data) and open it. It's still one hop: no scrolling deeper from there.
  const isNotifPage = () => /^\/(notifications|accounts\/activity)/.test(location.pathname);
  const MEDIA_IN_TEXT = /\/(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})|\/stories\/([A-Za-z0-9._]+)\/(\d+)/;
  const CODE_KEYS = /^(code|shortcode|media_code|mediaCode|media_shortcode|mediaShortcode)$/i;
  // Instagram notification targets like "media?id=3456_789" or "comments_v2?media_id=3456"
  const MEDIA_ID_IN_TEXT = /media(?:\?id=|_id=|Id=|_id":"?|id":"?)(\d{8,})/i;
  const MEDIA_ID_KEYS = /^(media_?id|mediaPk|media_pk|post_?id|postId)$/i;
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const pkToCode = (pk) => {
    try {
      let n = BigInt(String(pk).split('_')[0]);
      let out = '';
      while (n > 0n) { out = B64[Number(n % 64n)] + out; n /= 64n; }
      return out || null;
    } catch (e) { return null; }
  };

  const scanProps = (obj, depth, seen) => {
    if (!obj || typeof obj !== 'object' || depth > 6 || seen.has(obj)) return null;
    if (obj.nodeType || obj === window) return null;
    seen.add(obj);
    let n = 0;
    for (const key in obj) {
      if (++n > 120) break;
      if (key === 'children' || key === '_owner' || key === 'return' || key === 'ref') continue;
      let v;
      try { v = obj[key]; } catch (e) { continue; }
      if (typeof v === 'string') {
        const m = v.match(MEDIA_IN_TEXT);
        if (m) return m[3] ? '/stories/' + m[3] + '/' + m[4] + '/' : '/' + (m[1] === 'tv' ? 'p' : m[1]) + '/' + m[2] + '/';
        if (CODE_KEYS.test(key) && /^[A-Za-z0-9_-]{6,}$/.test(v)) return '/p/' + v + '/';
        const mi = v.match(MEDIA_ID_IN_TEXT);
        if (mi) { const c = pkToCode(mi[1]); if (c) return '/p/' + c + '/'; }
        if (MEDIA_ID_KEYS.test(key) && /^\d{8,}(_\d+)?$/.test(v)) { const c = pkToCode(v); if (c) return '/p/' + c + '/'; }
      } else if ((typeof v === 'number' || typeof v === 'bigint') && MEDIA_ID_KEYS.test(key)) {
        const c = pkToCode(v);
        if (c) return '/p/' + c + '/';
      } else if (v && typeof v === 'object') {
        const r = scanProps(v, depth + 1, seen);
        if (r) return r;
      }
    }
    return null;
  };

  const findTargetFor = (el) => {
    // 1) a plain link somewhere inside the row
    const row = el.closest('[role="listitem"], li') || el.parentElement;
    const link = row && row.querySelector && row.querySelector('a[href*="/p/"], a[href*="/reel"], a[href*="/stories/"]');
    if (link) return link.getAttribute('href');
    // 2) the page's own data behind the row (React props)
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const fk = Object.keys(node).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
      if (!fk) continue;
      let f = node[fk];
      const seen = new Set();
      for (let i = 0; f && i < 60; i++, f = f.return) {
        const hit = scanProps(f.memoizedProps, 0, seen) ||
          (f.memoizedState && typeof f.memoizedState === 'object' ? scanProps(f.memoizedState.memoizedState, 0, seen) : null);
        if (hit) return hit;
      }
      break;
    }
    return null;
  };

  document.addEventListener('click', (e) => {
    if (!isNotifPage()) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('a[href], button, input, textarea')) return; // real links/buttons work on their own
    const before = location.href;
    setTimeout(() => {
      if (location.href !== before || !isNotifPage()) return;
      const target = findTargetFor(t);
      if (target) {
        showBanner('Opening…');
        ss.set('dmonly_prev', location.pathname);
        location.assign(target);
      } else {
        showBanner("Instagram's phone site can't open this one");
      }
    }, 600);
  }, true);

  const onReady = () => {
    addStyle();
    sweep();
    new MutationObserver(queueSweep).observe(document.body, { childList: true, subtree: true });
    const p = ss.get('dmonly_blocked');
    if (p) { ss.del('dmonly_blocked'); showBanner('Blocked: ' + p); }
    const msg = ss.get('dmonly_blocked_msg');
    if (msg) { ss.del('dmonly_blocked_msg'); showBanner(msg); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
