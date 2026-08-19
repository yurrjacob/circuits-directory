/* ===== Circuits.com — light / dark ===== =====================================
   Loaded synchronously in <head> on every page, and deliberately not part of
   app.js: about, privacy and terms do not load app.js, and those are the pages
   the footer links point at. A toggle missing from exactly those pages would be
   the first thing anyone noticed.

   Running in <head> also means the theme is set before the browser paints. If
   this ran at the end of <body>, a reader who chose dark would get a full white
   page first — the flash is the whole reason this file is where it is.
   ========================================================================= */
(function(){
  'use strict';
  var KEY = 'cx_theme';

  /* localStorage throws in private mode and when cookies are blocked. A reader
     who cannot save a preference should still get a working page, so every
     access is wrapped and simply falls back to the system setting. */
  function saved(){
    try{ var v = localStorage.getItem(KEY); return (v === 'dark' || v === 'light') ? v : null; }
    catch(e){ return null; }
  }
  function remember(v){ try{ localStorage.setItem(KEY, v); }catch(e){} }

  function systemPrefersDark(){
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function apply(theme){
    document.documentElement.setAttribute('data-theme', theme);
    /* keeps the browser's own UI — form controls, scrollbars — in step */
    document.documentElement.style.colorScheme = theme;
  }

  var current = saved() || (systemPrefersDark() ? 'dark' : 'light');
  apply(current);            // before first paint

  /* Only follow the system while the reader has not made a choice of their own.
     Once they pick, that decision outranks the OS until they clear it. */
  if(window.matchMedia){
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function(e){
      if(saved()) return;
      current = e.matches ? 'dark' : 'light';
      apply(current);
      paint();
    };
    if(mq.addEventListener) mq.addEventListener('change', onChange);
    else if(mq.addListener) mq.addListener(onChange);
  }

  var btn = null;
  function paint(){
    if(!btn) return;
    var toDark = current !== 'dark';
    btn.setAttribute('aria-pressed', current === 'dark' ? 'true' : 'false');
    /* The label names what a click will DO, so the control is unambiguous on
       its own — a lone sun or moon leaves people guessing which state it means. */
    btn.setAttribute('title', toDark ? 'Switch to dark mode' : 'Switch to light mode');
    btn.setAttribute('aria-label', toDark ? 'Switch to dark mode' : 'Switch to light mode');
    btn.innerHTML = (toDark ? moon() : sun()) + '<span class="theme-label">' + (toDark ? 'Dark' : 'Light') + '</span>';
  }
  function moon(){
    return '<svg class="theme-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
      + '<path fill="currentColor" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  }
  function sun(){
    return '<svg class="theme-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
      + '<circle cx="12" cy="12" r="4.2" fill="currentColor"/>'
      + '<g stroke="currentColor" stroke-width="1.9" stroke-linecap="round">'
      + '<path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4"/>'
      + '<path d="M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7"/>'
      + '</g></svg>';
  }

  function mount(){
    var links = document.querySelector('.footer .flinks');
    if(!links || document.getElementById('theme-toggle')) return;
    btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.type = 'button';                 // never submit a form it happens to sit in
    btn.className = 'theme-toggle';
    btn.addEventListener('click', function(){
      current = (current === 'dark') ? 'light' : 'dark';
      apply(current);
      remember(current);
      paint();
    });
    links.appendChild(btn);
    paint();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
