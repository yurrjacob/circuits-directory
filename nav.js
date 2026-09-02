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
        var v = JSON.parse(localStorage.getItem(k) || 'null');
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

  /* Get Listed while signed in (Jacob, 2026-09-02): every "Get Listed" button
     on the site, static or rendered later, lands on the Listings tab of the
     dashboard instead of the form. Signed out, the form needs no account.
     An individual account has no Listings tab and may well be getting a
     company listed, so its buttons keep going to the form. */
  var kind = '';
  try{ kind = localStorage.getItem('cx_account_type') || ''; }catch(e){}
  if(kind !== 'individual'){
    if(/^\/join(\.html)?$/.test(location.pathname)){ location.replace('/portal#listings'); return; }
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href="/join"]');
      if(!a) return;
      e.preventDefault();
      location.href = '/portal#listings';
    });
  }

  /* Hide the signed-out links before first paint, so nobody sees "Sign In"
     flash and then vanish. The Dashboard link itself has to wait for <body>. */
  var css = document.createElement('style');
  css.textContent = '.nav .nav-auth,.nav .cta.nav-join{display:none}';
  document.head.appendChild(css);

  function mount(){
    var nav = document.querySelector('.nav');
    if(!nav || nav.querySelector('.nav-dash')) return;
    var signIn = nav.querySelector('.nav-auth');
    var join = nav.querySelector('.cta');
    if(join && !join.classList.contains('nav-dash')) join.classList.add('nav-join');
    if(signIn) signIn.classList.add('nav-auth');

    var a = document.createElement('a');
    a.className = 'cta nav-dash';
    a.href = '/portal';
    /* "Company Dashboard" / "Individual Dashboard" (Jacob, 2026-09-02). The
       portal stores the account type once it knows it; until then, plain. */
    var kind = '';
    try{ kind = localStorage.getItem('cx_account_type') || ''; }catch(e){}
    a.textContent = kind === 'company' ? 'Company Dashboard' : kind === 'individual' ? 'Individual Dashboard' : 'Dashboard';
    nav.appendChild(a);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
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
      s.href = '#';
      s.textContent = 'Skip to content';
      s.addEventListener('click', function(e){
        e.preventDefault();
        var main = document.querySelector('main')
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
