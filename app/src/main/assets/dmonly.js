// Injected into every instagram.com page by the app.
// Allows: DMs, stories (watch + post), opening reels/posts friends send you.
// Blocks: feed, Reels tab, Explore, profiles, swiping to other reels, sharing reels,
//         creating posts/reels, "use the app" banners.
(() => {
  'use strict';
  if (window.__dmonly) return;
  window.__dmonly = true;

  const HOME = '/direct/inbox/';
  const SHOW_BLOCKED_BANNER = true;

  const ALLOWED_PREFIXES = [
    '/direct/',        // messages
    '/stories/',       // watching stories
    '/create/story',   // posting a story
    '/accounts/',      // login, settings
    '/challenge/', '/checkpoint/', '/auth_platform/', '/two_factor/', // security checks
  ];
  const MEDIA_RE = /^\/(reels?|p)\/([^/?#]+)/;

  // Text of "get the app" banners/buttons to remove (lowercase).
  const APP_NAG_TEXTS = ['use the app', 'use an app', 'use app', 'open app', 'open the app', 'get the app', 'open instagram', 'get app'];

  const html = document.documentElement;

  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} },
  };

  // Pure decision: may we go from `from` to `path`?
  const allowed = (path, from) => {
    if (path === '/') return true; // stories tray only; feed hidden by CSS
    if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return true;
    const m = path.match(MEDIA_RE);
    if (m) {
      if ((from || '').startsWith('/direct/')) return true;   // opened from a chat
      return ss.get('dmonly_ticket') === m[2];                // same reel/post as before
    }
    return false;
  };

  // Remember state after an allowed navigation.
  const accept = (path, from) => {
    if (path.startsWith('/direct/')) { ss.set('dmonly_return', path); ss.del('dmonly_ticket'); }
    const m = path.match(MEDIA_RE);
    if (m && (from || '').startsWith('/direct/')) ss.set('dmonly_ticket', m[2]);
    ss.set('dmonly_prev', path);
  };

  const backPath = () => {
    const b = ss.get('dmonly_return') || HOME;
    return b.startsWith('/direct/') ? b : HOME;
  };

  const showBanner = (text) => {
    if (!SHOW_BLOCKED_BANNER || !document.body) return;
    const old = document.getElementById('dmonly-banner');
    if (old) old.remove();
    const b = document.createElement('div');
    b.id = 'dmonly-banner';
    b.textContent = text;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 3000);
  };

  // Hard block: hide everything instantly (no flash of feed), then go back to chats.
  const hardBlock = (path) => {
    html.classList.add('dmonly-blocking');
    ss.set('dmonly_blocked', path);
    location.replace(backPath());
  };

  const setPageClasses = (path) => {
    html.classList.toggle('dmonly-home', path === '/');
    html.classList.toggle('dmonly-media', MEDIA_RE.test(path));
  };

  let lastPath = null;
  const check = () => {
    const path = location.pathname;
    if (path === lastPath) return;
    const from = ss.get('dmonly_prev') || '';
    lastPath = path;
    setPageClasses(path);
    if (allowed(path, from)) accept(path, from);
    else hardBlock(path);
  };

  const pathOf = (url) => {
    try { return new URL(url, location.href); } catch (e) { return null; }
  };

  // 1) Stop navigation BEFORE it happens: taps on links.
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const u = pathOf(a.getAttribute('href'));
    if (!u || u.origin !== location.origin) return;
    if (!allowed(u.pathname, location.pathname)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showBanner('Blocked: ' + u.pathname);
    }
  }, true);

  // 2) Navigation done in code (buttons): check the target before the URL changes.
  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function (state, title, url) {
      if (url != null) {
        const u = pathOf(url);
        if (u && u.origin === location.origin && u.pathname !== location.pathname &&
            !allowed(u.pathname, location.pathname)) {
          hardBlock(u.pathname);
          return;
        }
      }
      const r = orig.apply(this, arguments);
      check();
      return r;
    };
  }
  window.addEventListener('popstate', check);
  setInterval(check, 250);
  check();

  // 3) CSS
  const addStyle = () => {
    if (document.getElementById('dmonly-style')) return;
    const style = document.createElement('style');
    style.id = 'dmonly-style';
    style.textContent = `
      /* Blank the page while bouncing back, so blocked pages never flash */
      html.dmonly-blocking body { visibility: hidden !important; }

      /* Reels tab + Explore buttons */
      a[href="/reels/"], a[href="/explore/"] { display: none !important; }

      /* Feed posts are hidden everywhere except on a reel/post you opened from chat */
      html:not(.dmonly-media) main article { display: none !important; }

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
        position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%);
        background: #222; color: #fff; padding: 8px 14px; border-radius: 8px;
        font: 13px system-ui, sans-serif; z-index: 2147483647; opacity: .92;
      }
    `;
    (document.head || html).appendChild(style);
  };
  addStyle();

  // 4) Remove "Use the app" banners (found by their text).
  const killNags = () => {
    const els = document.querySelectorAll('a, button, [role="button"], span, div');
    for (const el of els) {
      if (el.childElementCount > 3) continue;
      const t = (el.textContent || '').trim().toLowerCase();
      if (!t || t.length > 20 || !APP_NAG_TEXTS.includes(t)) continue;
      // Hide the whole fixed/sticky bar if there is one, else just the button.
      let target = el.closest('a, button, [role="button"]') || el;
      let n = el;
      for (let i = 0; i < 8 && n && n !== document.body; i++, n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky') {
          // only small bars (never a whole chat screen that happens to be fixed)
          if (n.getBoundingClientRect().height < 160) target = n;
          break;
        }
      }
      target.classList.add('dmonly-nag');
    }
  };
  let nagQueued = false;
  const queueNags = () => {
    if (nagQueued) return;
    nagQueued = true;
    setTimeout(() => { nagQueued = false; killNags(); }, 200);
  };

  const onReady = () => {
    addStyle();
    killNags();
    new MutationObserver(queueNags).observe(document.body, { childList: true, subtree: true });
    const p = ss.get('dmonly_blocked');
    if (p) { ss.del('dmonly_blocked'); showBanner('Blocked: ' + p); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
