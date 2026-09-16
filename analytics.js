/* Circuits.com, analytics, behind consent.
   Loaded on public pages only, never on staff or admin pages.

   Google Analytics used to load the moment any page opened, which set its
   cookies before anyone had agreed to them. That is not lawful for visitors in
   the UK or EU, so nothing loads here until the visitor answers.

   Three states, kept in localStorage under cx_consent:
     "yes"  -> load Google Analytics, and let store.js keep a visitor id
     "no"   -> load nothing, store nothing
     unset  -> show the banner and wait

   store.js reads the same key, so declining also stops the first-party visitor
   id used to de-duplicate profile views. The view is still counted; it just
   carries no identifier. */
(function(){
  var KEY = 'cx_consent';
  var ID  = 'G-2G1L04222N';

  function get(){ try { return localStorage.getItem(KEY); } catch(e){ return 'no'; } }
  function set(v){ try { localStorage.setItem(KEY, v); } catch(e){} }

  function loadGA(){
    if (window.__gaLoaded) return;
    window.__gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', ID);
  }

  function banner(){
    var wrap = document.createElement('div');
    wrap.className = 'cookie-bar';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Cookie choice');
    wrap.innerHTML =
      '<div class="cookie-bar-inner">' +
        '<p>Circuits.com uses one necessary cookie to keep you signed in. ' +
        'If you agree, we also use Google Analytics to see how the directory is used. ' +
        'Change your choice any time on the <a href="/privacy">Privacy Policy</a> page.</p>' +
        '<div class="cookie-bar-actions">' +
          '<button type="button" class="mini-btn" data-c="no">Decline Analytics</button>' +
          '<button type="button" class="mini-btn green" data-c="yes">Accept Analytics</button>' +
        '</div>' +
      '</div>';
    wrap.addEventListener('click', function(e){
      var b = e.target.closest('button[data-c]');
      if (!b) return;
      set(b.dataset.c);
      if (b.dataset.c === 'yes') loadGA();
      wrap.remove();
    });
    document.body.appendChild(wrap);
  }

  function start(){
    var c = get();
    if (c === 'yes') { loadGA(); return; }
    if (c === 'no') return;
    banner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
