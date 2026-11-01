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
    '/challenge/', '/checkpoint/', '/auth_platform/', '/two_factor/', // security checks
  ];

  // Pages from which you may open a single reel/post.
  const TICKET_SOURCES = ['/direct/', '/accounts/activity', '/notifications'];

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

  const isSource = (p) => TICKET_SOURCES.some((s) => (p || '').startsWith(s));
  const ticket = () => ss.get('dmonly_ticket');

  const allowed = (path, from) => {
    if (path === '/') return true; // stories tray only; feed hidden by CSS
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
    if (!allowed(u.pathname, location.pathname)) {
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
      @keyframes dmonly-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      @keyframes dmonly-pop { from { opacity: 0; transform: translate(-50%, 12px) scale(.96); }
                              to   { opacity: .94; transform: translate(-50%, 0) scale(1); } }

      /* Soft fade-in for every page */
      body { animation: dmonly-in .22s ease-out both; }

      /* Blank the page while bouncing back, so blocked pages never flash */
      html.dmonly-blocking body { visibility: hidden !important; }

      /* Reels tab + Explore buttons */
      a[href="/reels/"], a[href="/explore/"] { display: none !important; }

      /* Feed posts hidden (never inside chats or on the one reel/post you opened) */
      html:not(.dmonly-media):not(.dmonly-direct) main article { display: none !important; }

      /* On a reel/post page: only the first one is shown, nothing below it to scroll into */
      html.dmonly-media main article ~ article,
      html.dmonly-media .dmonly-more { display: none !important; }

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
  const sweep = () => {
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
