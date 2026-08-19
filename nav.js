/* ===== Circuits.com — signed-in header ==================================== =
   Swaps "Sign In / Get Listed" for "Dashboard" once somebody is signed in.

   Loaded in <head> on every page that has the nav, and deliberately does NOT
   use the Supabase client: about, privacy and terms do not load store.js, and a
   header that says "Sign In" on those three pages while saying "Dashboard"
   everywhere else is worse than not doing this at all. Reading the stored
   session directly costs nothing and works the same on every page.

   This is a display hint, not a gate. /portal does the real check against the
   database — a tampered or stale value here gets someone a Dashboard link that
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
        /* An expired token still refreshes fine, so a little slack is right —
           what must not happen is showing Dashboard to someone long gone. */
        if(exp && (exp * 1000) < Date.now() - 7 * 24 * 60 * 60 * 1000) continue;
        return true;
      }
    }catch(e){}       // private mode, blocked storage, corrupt JSON
    return false;
  }

  if(!signedIn()) return;

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
    a.textContent = 'Dashboard';
    nav.appendChild(a);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
