// Injected into every instagram.com page by the app.
// Allows: DMs, stories (watch + post), opening reels/posts friends send you.
// Blocks: feed, Reels tab, Explore, profiles, swiping to other reels, sharing reels, creating posts/reels.
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

  // Reels/posts: only the one you opened from a chat.
  const MEDIA_RE = /^\/(reels?|p)\/([^/?#]+)/;

  const ss = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} },
    del: (k) => { try { sessionStorage.removeItem(k); } catch (e) {} },
  };

  const block = (path) => {
    ss.set('dmonly_blocked', path);
    const back = ss.get('dmonly_return') || HOME;
    location.replace(back.startsWith('/direct/') ? back : HOME);
  };

  const decide = (path) => {
    const prev = ss.get('dmonly_prev') || '';

    if (path === '/') return true; // stories tray only; feed hidden by CSS

    if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      if (path.startsWith('/direct/')) { ss.set('dmonly_return', path); ss.del('dmonly_ticket'); }
      return true;
    }

    const m = path.match(MEDIA_RE);
    if (m) {
      const id = m[2];
      if (prev.startsWith('/direct/')) { ss.set('dmonly_ticket', id); return true; }
      if (ss.get('dmonly_ticket') === id) return true;
      return false;
    }
    return false;
  };

  let lastPath = null;
  const check = () => {
    const path = location.pathname;
    if (path === lastPath) return;
    lastPath = path;
    document.documentElement.classList.toggle('dmonly-home', path === '/');
    if (decide(path)) ss.set('dmonly_prev', path);
    else block(path);
  };

  for (const fn of ['pushState', 'replaceState']) {
    const orig = history[fn];
    history[fn] = function (...args) {
      const r = orig.apply(this, args);
      check();
      return r;
    };
  }
  window.addEventListener('popstate', check);
  setInterval(check, 300);
  check();

  const addStyle = () => {
    if (document.getElementById('dmonly-style')) return;
    const style = document.createElement('style');
    style.id = 'dmonly-style';
    style.textContent = `
      a[href="/reels/"], a[href="/explore/"] { display: none !important; }
      html.dmonly-home main article { display: none !important; }
      svg[aria-label^="Share"] { display: none !important; }
      :is([role="button"], button):has(> svg[aria-label^="Share"]),
      :is([role="button"], button):has(> div > svg[aria-label^="Share"]) { display: none !important; }
      #dmonly-banner {
        position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%);
        background: #222; color: #fff; padding: 8px 14px; border-radius: 8px;
        font: 13px system-ui, sans-serif; z-index: 2147483647; opacity: .92;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  };
  addStyle();

  const onReady = () => {
    addStyle();
    if (!SHOW_BLOCKED_BANNER) return;
    const p = ss.get('dmonly_blocked');
    if (!p) return;
    ss.del('dmonly_blocked');
    const b = document.createElement('div');
    b.id = 'dmonly-banner';
    b.textContent = 'Blocked: ' + p;
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 3500);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
