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

  // Keep recent background data Instagram downloads (used to open notification rows:
  // a row's thumbnail file name appears in this data right next to the post's ID).
  const RESP = [];
  const keepText = (t) => {
    if (typeof t !== 'string' || t.length > 4e6 || t.indexOf('_n.') < 0) return;
    RESP.push(t);
    if (RESP.length > 25) RESP.shift();
  };
  const interesting = (url) => /graphql|\/api\/|ajax|news|activity|notif/i.test(String(url || ''));
  try {
    const origFetch = window.fetch;
    window.fetch = function (input) {
      const pr = origFetch.apply(window, arguments);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (interesting(url)) pr.then((r) => r.clone().text().then(keepText)).catch(() => {});
      } catch (e) {}
      return pr;
    };
  } catch (e) {}
  try {
    const xo = XMLHttpRequest.prototype.open;
    const xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, url) { this.__dmUrl = url; return xo.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      if (interesting(this.__dmUrl)) {
        this.addEventListener('load', function () {
          try { if (!this.responseType || this.responseType === 'text') keepText(this.responseText); } catch (e) {}
        });
      }
      return xs.apply(this, arguments);
    };
  } catch (e) {}

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

  const showBanner = (text, onTap, ms) => {
    if (!SHOW_BLOCKED_BANNER || !document.body) return;
    const old = document.getElementById('dmonly-banner');
    if (old) old.remove();
    const b = document.createElement('div');
    b.id = 'dmonly-banner';
    b.textContent = text;
    if (onTap) {
      b.style.pointerEvents = 'auto';
      b.style.textDecoration = 'underline';
      b.addEventListener('click', (e) => { e.stopPropagation(); onTap(); b.remove(); }, true);
    }
    document.body.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 300); }, ms || 2600);
  };

  // Hands text to the app, which puts it on the phone's clipboard.
  const copyToPhone = (text) => {
    location.href = 'dmonly://copy?text=' + encodeURIComponent(text.slice(0, 20000));
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

  // The row's thumbnail (only if exactly one: rows without a post have none).
  const thumbFor = (el) => {
    let n = el;
    for (let i = 0; i < 10 && n && n !== document.body; i++, n = n.parentElement) {
      const imgs = n.querySelectorAll ? n.querySelectorAll('img[alt="Media thumbnail"]') : [];
      if (imgs.length === 1) return imgs[0];
      if (imgs.length > 1) return null;
    }
    return null;
  };
  const thumbKey = (img) => {
    const name = ((img && img.getAttribute('src')) || '').split('?')[0].split('/').pop() || '';
    const m = name.match(/^(.+?)_n\.\w+$/);
    return m ? m[1] : (name.length > 12 ? name : null);
  };
  const CANDS = [
    [/\\?"code\\?"\s*:\s*\\?"([A-Za-z0-9_-]{8,14})\\?"/g, (v) => '/p/' + v + '/'],
    [/media(?:\?id=|_id\\?"?\s*[:=]\s*\\?"?)(\d{17,20})/g, (v) => '/p/' + pkToCode(v) + '/'],
    [/\\?"(?:id|pk|media_id)\\?"\s*:\s*\\?"?(\d{18,20})(?:_\d+)?/g, (v) => '/p/' + pkToCode(v) + '/'],
  ];
  const dataTexts = () => {
    const texts = RESP.slice().reverse();
    for (const sc of document.querySelectorAll('script[type="application/json"]')) texts.push(sc.textContent || '');
    return texts;
  };
  const findByThumb = (key) => {
    if (!key) return null;
    for (const t of dataTexts()) {
      const idx = t.indexOf(key);
      if (idx < 0) continue;
      const lo = Math.max(0, idx - 5000);
      const win = t.slice(lo, idx + 5000);
      const center = idx - lo;
      let best = null, bestD = Infinity;
      CANDS.forEach(([re, mk], ci) => {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(win))) {
          const d = Math.abs(m.index - center) + ci * 300;
          if (d < bestD) { bestD = d; best = mk(m[1]); }
        }
      });
      if (best && best.indexOf('/p/null/') < 0) return best;
    }
    return null;
  };

  const findTargetFor = (el) => {
    const byThumb = findByThumb(thumbKey(thumbFor(el)));
    if (byThumb) return byThumb;
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

  // Collects what Instagram stored behind a row (for fixing the "can't open" case).
  const dumpRow = (el) => {
    const out = [];
    const key = thumbKey(thumbFor(el));
    out.push('THUMB-KEY: ' + key);
    out.push('SAVED-RESPONSES: ' + RESP.length + ', JSON-SCRIPTS: ' + document.querySelectorAll('script[type="application/json"]').length);
    if (key) {
      for (const t of dataTexts()) {
        const i = t.indexOf(key);
        if (i >= 0) { out.push('AROUND-KEY: ' + t.slice(Math.max(0, i - 1500), i + 700)); break; }
      }
    }
    const row = thumbFor(el) ? thumbFor(el).closest('div[role], li') || el.parentElement : el.parentElement;
    if (row) out.push('ROW-HTML: ' + row.outerHTML.replace(/\s+/g, ' ').slice(0, 800));
    let fiberKey = null;
    let node = el;
    for (; node && node !== document.body; node = node.parentElement) {
      fiberKey = Object.keys(node).find((k) => k.startsWith('__react'));
      if (fiberKey) break;
    }
    out.push('REACT-KEY: ' + (fiberKey || 'none'));
    if (fiberKey && fiberKey.startsWith('__reactFiber')) {
      let f = node[fiberKey];
      const seen = new Set();
      const walk = (obj, path, depth) => {
        if (out.length > 260 || !obj || typeof obj !== 'object' || depth > 5 || seen.has(obj)) return;
        if (obj.nodeType || obj === window) return;
        seen.add(obj);
        let n = 0;
        for (const k in obj) {
          if (++n > 60) break;
          if (k === 'children' || k === '_owner' || k === 'return' || k === 'ref') continue;
          let v; try { v = obj[k]; } catch (e) { continue; }
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') {
            const sv = String(v);
            if (sv.length && sv.length < 300) out.push(path + '.' + k + ' = ' + sv);
          } else if (typeof v === 'function') {
            // skip
          } else if (v && typeof v === 'object') {
            walk(v, path + '.' + k, depth + 1);
          }
        }
      };
      for (let i = 0; f && i < 25 && out.length < 260; i++, f = f.return) {
        const name = (f.type && (f.type.displayName || f.type.name)) || (typeof f.type === 'string' ? f.type : '?');
        walk(f.memoizedProps, '#' + i + ':' + name, 0);
      }
    }
    return out.join('\n');
  };

  document.addEventListener('click', (e) => {
    if (!isNotifPage()) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#dmonly-banner')) return;
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
        showBanner("Can't open this one · tap here to copy details for Claude",
          () => { copyToPhone(dumpRow(t)); }, 6000);
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
