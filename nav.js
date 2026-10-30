/* ===== Circuits.com, signed-in header ==================================== =
   Swaps "Sign In / Get Listed" for "Dashboard" once somebody is signed in.

   Loaded in <head> on every page that has the nav, and deliberately does NOT
   use the Supabase client: about, privacy and terms do not load store.js, and a
   header that says "Sign In" on those three pages while saying "Dashboard"
   everywhere else is worse than not doing this at all. Reading the stored
   session directly costs nothing and works the same on every page.

   This is a display hint, not a gate. /portal does the real check against the
   database, a tampered or stale value here gets someone a Dashboard link that
   then asks them to sign in, which is the correct failure.
   ========================================================================= */
(function(){
  'use strict';

  /* supabase-js v2 keeps the session under sb-<project-ref>-auth-token. Found
     by pattern rather than hardcoded so it survives a project change. */
  function signedIn(){
    try{
      for(var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if(!/^sb-.*-auth-token$/.test(k || '')) continue;
        var raw = localStorage.getItem(k);
        if(!raw) continue;
        /* supabase-js 2.40 and later store the session base64 encoded behind
           this prefix; older versions store the JSON itself. Reading only the
           JSON shape made every current client look signed out, which cost the
           Dashboard link and the notifications bell (Jacob, 2026-09-03). */
        if(raw.slice(0, 7) === 'base64-'){
          try{ raw = atob(raw.slice(7)); }catch(e){ return true; }
        }
        var v;
        /* A session we hold but cannot read is still a session. This is a
           display hint, so leaning towards "signed in" costs a Dashboard link
           that asks them to sign in; leaning the other way hides the header. */
        try{ v = JSON.parse(raw); }catch(e){ return true; }
        if(!v) continue;
        var tok = v.access_token || (v.currentSession && v.currentSession.access_token);
        var exp = v.expires_at   || (v.currentSession && v.currentSession.expires_at);
        if(!tok) continue;
        /* An expired token still refreshes fine, so a little slack is right, what must not happen is showing Dashboard to someone long gone. */
        if(exp && (exp * 1000) < Date.now() - 7 * 24 * 60 * 60 * 1000) continue;
        return true;
      }
    }catch(e){}       // private mode, blocked storage, corrupt JSON
    return false;
  }

  if(!signedIn()) return;

  /* Signed in, Dashboard takes the Sign In slot and Get Listed stays put
     (Jacob, 2026-09-03). Both links are already in every header, so this only
     chooses which of the two is shown, and it happens here in <head> before
     the first paint. Nothing is added to or removed from the header once it is
     on screen, so the bar never changes shape after the page is drawn, which
     is what used to make every navigation look like a jump. */
  var css = document.createElement('style');
  /* staff also see Admin beside Dashboard (2026-10-30). cx_staff is set by
     the dashboard after the database says so; like the rest, a hint only */
  var staff = false;
  try{ staff = localStorage.getItem('cx_staff') === '1'; }catch(e){}
  css.textContent = '.nav a.nav-signin{display:none}.nav a.nav-dash{display:block}.inbox-btn{display:inline-flex}'
    + (staff ? '.nav a.nav-admin{display:inline-flex}' : '');
  document.head.appendChild(css);
})();

/* ===== phone menu + skip link ==============================================
   Injected here because every page already loads nav.js in <head>, one file
   gives every header the same behaviour, with no per-page editing to forget.

   The burger only appears below 720px (styles.css hides it otherwise). The
   skip link is for keyboards and screen readers: first Tab lands on it, and
   it jumps past the header to the page's main content. */
(function(){
  'use strict';

  function mount(){
    if(!document.body) return;      // page already being replaced (signed-in /join)
    var bar = document.querySelector('.topbar .inner');
    if(bar && !bar.querySelector('.nav-burger') && bar.querySelector('.nav')){
      var nav = bar.querySelector('.nav');
      /* the button names the panel it controls, so a screen reader announces
         the relationship and its open/closed state */
      if(!nav.id) nav.id = 'primary-nav';
      var b = document.createElement('button');
      b.className = 'nav-burger';
      b.setAttribute('aria-label', 'Menu');
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-controls', nav.id);
      b.setAttribute('aria-haspopup', 'true');
      b.innerHTML =
        '<svg class="bars" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>' +
        '<svg class="x" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
      function setOpen(open){
        document.body.classList.toggle('nav-open', open);
        b.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      b.addEventListener('click', function(){
        setOpen(!document.body.classList.contains('nav-open'));
      });
      /* picking a destination should also close the panel */
      nav.addEventListener('click', function(e){
        if(e.target.closest('a')) setOpen(false);
      });
      /* Escape closes the panel and returns focus to the button, the standard
         keyboard contract for a disclosure menu */
      document.addEventListener('keydown', function(e){
        if(e.key === 'Escape' && document.body.classList.contains('nav-open')){
          setOpen(false); b.focus();
        }
      });
      bar.appendChild(b);
    }

    if(!document.querySelector('.skip-link')){
      var s = document.createElement('a');
      s.className = 'skip-link';
      s.href = '#content';
      s.textContent = 'Skip to content';
      s.addEventListener('click', function(e){
        e.preventDefault();
        var main = document.getElementById('content') || document.querySelector('main:not([hidden])')
          || document.querySelector('.form-wrap, .auth-wrap, .browse-wrap, #results-body, .page, .console');
        if(!main) return;
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: false });
        main.scrollIntoView({ block: 'start' });
      });
      document.body.insertBefore(s, document.body.firstChild);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
/* ===== no browser autofill ==================================================
   Jacob, 2026-10-12: "Is there a way to turn off all auto-fields? We want to
   reduce mistakes filling out the forms." Browsers were pouring a saved name
   or address into the wrong box (a person's name into Company, a home address
   into a listing). Every form field on the site is set to autocomplete="off",
   including the ones the dashboard draws after the page loads.
   Two kinds are left alone on purpose: the sign-in email and password
   (autocomplete="username" or "current-password"), so a password manager can
   still sign people in, and new-password boxes, which stop the browser from
   pasting a saved password into a sign-up form.
   Why not just "off": most fields already said off, and Chrome ignores it for
   anything that looks like a name, email, phone or address, which is exactly
   where the mistakes came from. Chrome does skip a field whose autocomplete
   value it does not recognise, so in Chrome the fields get "cx-no-autofill".
   Firefox and Safari honour off, so they keep it, and every form is off too,
   which is what Firefox falls back to for a value it does not know. */
(function(){
  'use strict';
  var KEEP = /^(username|current-password|new-password|one-time-code)$/;
  /* Chrome, Edge, Opera and Chrome on iOS all carry Chrome/ or CriOS/ */
  var CHROME = /Chrome\/|CriOS\//.test(navigator.userAgent || '');
  var FIELD_OFF = CHROME ? 'cx-no-autofill' : 'off';
  function off(root){
    if(!root || !root.querySelectorAll) return;
    var els = root.querySelectorAll('form, input, textarea, select');
    for(var i = 0; i < els.length; i++){
      var el = els[i], ac = (el.getAttribute('autocomplete') || '').toLowerCase();
      if(KEEP.test(ac)) continue;
      if(el.tagName === 'FORM'){ if(ac !== 'off') el.setAttribute('autocomplete', 'off'); continue; }
      if(el.type === 'password'){ if(!ac) el.setAttribute('autocomplete', 'new-password'); continue; }
      if(/^(hidden|submit|button|checkbox|radio|file|range|color)$/.test(el.type)) continue;
      if(ac !== FIELD_OFF) el.setAttribute('autocomplete', FIELD_OFF);
    }
  }
  function start(){
    off(document);
    if(!window.MutationObserver) return;
    new MutationObserver(function(list){
      for(var i = 0; i < list.length; i++){
        var added = list[i].addedNodes;
        for(var j = 0; j < added.length; j++){
          var n = added[j];
          if(n.nodeType !== 1) continue;
          if(/^(INPUT|TEXTAREA|SELECT|FORM)$/.test(n.tagName)) off(n.parentNode || n); else off(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
