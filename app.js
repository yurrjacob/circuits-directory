/* ===== Circuits.com, shared front-end behavior ===== */


function gotoSearch(term){
  const q = (term||'').trim();
  if(!q) return;
  window.location.href = '/results?q=' + encodeURIComponent(q);
}

/* Home page search wiring */
function initHome(){
  const input = document.getElementById('home-search');
  const form  = document.getElementById('home-form');
  if(form){
    form.addEventListener('submit', e=>{
      e.preventDefault();
      if(form.dataset.mode === 'employment'){
        const q = (input.value || '').trim();
        location.href = '/jobs' + (q ? '?q=' + encodeURIComponent(q) : '');
        return;
      }
      gotoSearch(input.value);
    });
  }
  /* Directory or Employment Board: same box, different index */
  document.querySelectorAll('.search-mode [data-mode]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.search-mode [data-mode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
    form.dataset.mode = b.dataset.mode;
    input.placeholder = b.dataset.mode === 'employment'
      ? 'Search jobs by title or keyword...'
      : 'Search products, services, professionals, education, or keywords...';
    input.focus();
  }));
}

/* ---- Recruits Directory card (shared by /talent, the company dashboard and
   the individual's own preview). Public bits open; the private block is a
   blur until a company with Talent Access unlocks it. ---- */
function talentCardHtml(r, o){
  o = o || {};
  const creds = (Array.isArray(r.credentials) ? r.credentials : []).filter(c => c && (c.name || '').trim());
  const kwHref = o.kwHref === undefined ? (k => '/talent?q=' + encodeURIComponent(k)) : o.kwHref;
  const tag = k => kwHref ? `<a class="kw-tag" href="${escapeHtml(kwHref(k))}">${escapeHtml(k)}</a>` : `<span class="kw-tag">${escapeHtml(k)}</span>`;
  const action = o.preview ? `<span class="btn btn-primary tal-unlock" aria-hidden="true" style="pointer-events:none">Unlock</span>`
    : o.access
    ? `<button type="button" class="btn btn-primary tal-unlock" data-uid="${escapeHtml(r.user_id)}">Unlock</button>`
    : o.signedIn ? `<a class="btn tal-unlock" href="/contact">Get Talent Access</a>`
                 : `<a class="btn tal-unlock" href="/portal">Sign in to unlock</a>`;
  return `
    <article class="tal-card" data-uid="${escapeHtml(r.user_id)}">
      <div class="tal-main">
        <h3>${escapeHtml(r.title || 'Circuits industry professional')}</h3>
        <p class="tal-meta">${r.years != null && r.years !== '' && !isNaN(r.years) ? `${r.years} year${Number(r.years) === 1 ? '' : 's'} of experience` : 'Experience not given'}</p>
        ${r.bio ? `<p class="tal-bio">${escapeHtml(r.bio)}</p>` : ''}
        ${creds.length ? `<p class="tal-meta">${creds.map(c => escapeHtml(c.name.trim()) + (c.issuer ? ', ' + escapeHtml(c.issuer) : '') + (c.year ? ' (' + escapeHtml(String(c.year)) + ')' : '')).join(' · ')}</p>` : ''}
        <div class="kw-tags">${(r.keywords || []).map(tag).join('')}</div>
      </div>
      <div class="tal-private" id="priv-${escapeHtml(r.user_id)}">
        <div class="tal-blur" aria-hidden="true"><b>Jane Doe</b><span>jane@example.com</span><span>(555) 123-4567</span><span>Resume.pdf</span></div>
        ${o.locked === false ? '' : action}
      </div>
    </article>`;
}
function talentContactHtml(c, resume){
  return `<div class="tal-open">
      <b><a href="/${escapeHtml(c.handle)}">${escapeHtml(c.display_name || c.handle)}</a></b>
      ${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : ''}
      ${c.phone ? `<a href="tel:${escapeHtml(c.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(c.phone)}</a>` : ''}
      ${resume ? `<a href="${escapeHtml(resume)}" target="_blank" rel="noopener">Open resume (PDF)</a>` : '<span class="pf-note">No resume uploaded</span>'}
    </div>`;
}

/* ---- validators (shared) ---- */
function isValidEmail(s){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test((s||'').trim()); }
function isValidPhone(s){ const d=(s||'').replace(/\D/g,''); return d.length>=10 && d.length<=15; }
function isValidWebsite(s){ return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([\/?#]\S*)?$/i.test((s||'').trim()); }

/* ---- anti-spam ----
   Two cheap traps that stop the volume scripts. Neither is a real defence on
   its own, anything client-side can be bypassed, so the limit that actually
   holds is the rate_limit() trigger in the database, which applies no matter
   how the row arrives. These just keep the obvious junk out of the founders'
   inbox and off the rate limiter.
   ponytail: no CAPTCHA. Add Turnstile only if real spam gets through these. */
const SPAM_MIN_SECONDS = 3;   // no human completes a form faster than this

function armSpamTrap(form){
  if(!form || form.dataset.armedAt) return;
  form.dataset.armedAt = Date.now();
  const hp = document.createElement('div');
  // off-screen rather than display:none, some bots skip hidden inputs
  hp.style.cssText = 'position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden';
  hp.setAttribute('aria-hidden', 'true');
  hp.innerHTML = '<label>Do not fill this in'
    + '<input type="text" name="company_url" tabindex="-1" autocomplete="off"></label>';
  form.appendChild(hp);
}

function looksLikeSpam(form){
  if(!form) return false;
  const hp = form.querySelector('input[name="company_url"]');
  if(hp && hp.value.trim()) return true;          // only a bot fills an invisible field
  const armed = +(form.dataset.armedAt || 0);
  return armed > 0 && (Date.now() - armed) < SPAM_MIN_SECONDS * 1000;
}

/* Silently accept a suspected bot. Telling it why it failed just teaches the
   author what to change. */
function fakeSuccess(form, message){
  form.innerHTML = '<div class="success show">' + (message || 'Thanks, your message has been sent.') + '</div>';
}

/* ---- the Circuits.com team mark ----
   Not a badge, and deliberately not part of the badge system: it is not chosen,
   not bought, and not attached to a listing. It belongs to the account, so it
   sits beside the company's name on its profile and nowhere else. Whether it
   appears is decided by company_run_by_staff() in the database, never by
   anything a company can set. */
function teamMarkHtml(){
  return '<span class="lb lb-cx" title="Circuits.com team: this profile is run by the Circuits.com team, not a paying advertiser.">'
    + '<img class="lb-cx-mark" src="/assets/favicon.png" alt="" aria-hidden="true">Circuits.com</span>';
}

/* ---- Trust Badges ----
   A paid label a company picks, and it belongs to one keyword listing rather
   than to the company: the same company can run "Authorized" on one keyword and
   nothing on another. So this is only ever rendered against a listing, never
   beside a name. */
function badgeHtml(badge, extraClass){
  if(!badge || !badge.text) return '';
  const cls = 'lb' + (extraClass ? ' ' + extraClass : '');
  return `<span class="${cls}" style="background:${escapeHtml(badge.color || '#c9a227')}"`
    + ` title="Trust Badge: a paid label chosen by this company for this listing. It is not a certification and Circuits.com has not assessed it.">`
    + `${escapeHtml(badge.text)}</span>`;
}

/* Shown when a lookup fails, as opposed to succeeding and finding nothing.
   Those two are very different messages and conflating them is how a visitor
   ends up being told a keyword is for sale when it is simply unreachable. */
function loadErrorHtml(what, retryLabel){
  return `<div class="empty load-error">
    <div class="big">We couldn&rsquo;t load ${escapeHtml(what)}</div>
    <p>This is a problem on our side, not yours. Your connection may have dropped,
       or Circuits.com may be briefly unavailable.</p>
    <div class="btn-row" style="justify-content:center">
      <button class="btn btn-primary" type="button" onclick="location.reload()">${escapeHtml(retryLabel || 'Try again')}</button>
      <a class="btn" href="/">Back to search</a>
    </div>
  </div>`;
}

/* A wait with a spinner reads as deliberate; bare text reads as broken. */
function loadingHtml(label){
  return `<div class="empty"><div class="big"><span class="spin" aria-hidden="true"></span>${escapeHtml(label)}</div></div>`;
}

/* ---- search-page head management ----
   The results page ships with NO robots meta: a static noindex would stop
   Google from ever rendering the page, so the decision is made here instead.
   A keyword with at least one real (non-sample) listing is indexable; an
   empty page, an outage, or the test fixture is not. Google honours a
   JS-set noindex, and this also gives every result page a real title. */
function setResultsMeta(q, indexable){
  document.title = q ? (q + ' suppliers | Circuits.com') : 'Search | Circuits.com';
  let m = document.querySelector('meta[name="robots"]');
  if(!m){ m = document.createElement('meta'); m.name = 'robots'; document.head.appendChild(m); }
  m.content = indexable ? 'index, follow' : 'noindex, follow';
  let c = document.querySelector('link[rel="canonical"]');
  if(!c){ c = document.createElement('link'); c.rel = 'canonical'; document.head.appendChild(c); }
  c.href = 'https://circuits.com/results?q=' + encodeURIComponent(q || '');
}

/* ---- typo tolerance ----
   Exact-match keywords are the product, so search itself never fuzzes. But a
   buyer who typed "oscilator" deserves "did you mean oscillators?" instead of
   a dead end. Edit distance capped at 2, and only against the live index. */
function editDistance(a, b){
  if(Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length, n = b.length;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  for(let i = 1; i <= m; i++){
    const cur = [i];
    for(let j = 1; j <= n; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1, prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function nearestKeywords(term, index, max){
  const t = normKw(term);
  if(!t) return [];
  return index
    .map(k => ({ k, d: editDistance(t, k.norm) }))
    .filter(x => x.d > 0 && x.d <= (t.length > 5 ? 2 : 1))
    .sort((a, b) => a.d - b.d || b.k.companies - a.k.companies)
    .slice(0, max || 3)
    .map(x => x.k);
}

/* One <datalist> shared by the search boxes that live on data-loaded pages.
   Native, so there is nothing to style or break; filled lazily on first
   focus so pages that never touch the box never fetch the index. */
function attachSuggestions(input){
  if(!input || input.__suggested || typeof fetchKeywordIndex !== 'function') return;
  input.__suggested = true;
  input.addEventListener('focus', async function once(){
    input.removeEventListener('focus', once);
    const index = await fetchKeywordIndex();
    if(!index.length) return;
    let dl = document.getElementById('kw-suggestions');
    if(!dl){
      dl = document.createElement('datalist');
      dl.id = 'kw-suggestions';
      dl.innerHTML = index.map(k => `<option value="${escapeHtml(k.keyword)}"></option>`).join('');
      document.body.appendChild(dl);
    }
    input.setAttribute('list', 'kw-suggestions');
  });
}

/* ---- show/hide on every password box ----
   Typing a password blind is how typos get confirmed twice and locked in.
   Runs over whatever exists at load, and again for anything rendered later
   (the portal's account card builds its fields after sign-in). */
function wirePasswordToggles(root){
  const eye = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeOff = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
  (root || document).querySelectorAll('input[type="password"]').forEach(inp => {
    if(inp.__eye) return;
    inp.__eye = true;
    const wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.tabIndex = -1;                 // Tab goes field to field; the eye is a mouse affordance
    btn.setAttribute('aria-label', 'Show password');
    btn.innerHTML = eye;
    btn.addEventListener('click', () => {
      const showing = inp.type === 'password';
      inp.type = showing ? 'text' : 'password';
      btn.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
      btn.innerHTML = showing ? eyeOff : eye;
      inp.focus();
    });
    wrap.appendChild(btn);
  });
}
if(typeof document !== 'undefined' && document.addEventListener){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { wirePasswordToggles(); initInbox(); });
  else { wirePasswordToggles(); initInbox(); }
}

/* supabase-js keeps the session under sb-<ref>-auth-token; presence is a hint, not a gate */
function storedSession(){
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(/^sb-.*-auth-token$/.test(k || '') && localStorage.getItem(k)) return true;
    }
  }catch(e){}
  return false;
}

/* ---- notifications inbox (Jacob, 2026-09-02) ----
   A bell in the top-right of every page that loads store.js, for anyone
   signed in. It opens a panel in the corner, not a page: the list, then the
   message. Rows come from the notifications table (welcome on signup, staff
   messages); opening one marks it read. */
async function initInbox(){
  const bar = document.querySelector('.topbar .inner');
  if(!bar || bar.querySelector('.inbox-btn')) return;
  /* The homepage does not load the data client. If the stored session says
     somebody is signed in (the same check nav.js makes for the Dashboard
     button), pull the client in now; a signed-out visitor pays nothing. */
  if(typeof sb === 'undefined'){
    if(!storedSession()) return;
    const add = src => new Promise((ok, no) => { const t = document.createElement('script'); t.src = src; t.onload = ok; t.onerror = no; document.head.appendChild(t); });
    try{ await add('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'); await add('/store.js'); }catch(e){ return; }
  }
  if(typeof sb === 'undefined' || !sb || typeof currentUser !== 'function') return;
  let user = null;
  try{ user = await currentUser(); }catch(e){}
  if(!user) return;

  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'inbox-btn'; btn.setAttribute('aria-label', 'Notifications'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="inbox-n" hidden></span>';
  /* In the header itself, not inside the nav: on a phone the nav folds into
     the burger menu and the bell must stay visible in the corner. It sits
     just before the last control (the burger on public pages, Sign out in
     the portal). */
  bar.insertBefore(btn, bar.querySelector('.nav-burger') || bar.querySelector('.signout') || null);

  const panel = document.createElement('div');
  panel.className = 'inbox-panel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Notifications');
  document.body.appendChild(panel);

  let items = null, open = null;
  const when = iso => { const d = new Date(iso), days = (Date.now() - d) / 864e5;
    return days < 1 ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : days < 7 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString(); };
  const avatar = n => `<span class="inbox-avatar">${n.sender_avatar ? `<img src="${escapeHtml(n.sender_avatar)}" alt="">` : avatarSvg()}</span>`;
  const badge = () => {
    const n = (items || []).filter(x => !x.read_at).length, b = btn.querySelector('.inbox-n');
    b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n;
    btn.classList.toggle('has-unread', n > 0);
  };
  const draw = () => {
    if(items === null){ panel.innerHTML = '<div class="inbox-head"><b>Notifications</b></div><p class="inbox-empty">Loading…</p>'; return; }
    if(open){
      const n = open;
      panel.innerHTML = `<div class="inbox-head"><button type="button" class="inbox-back" aria-label="Back to notifications">&larr;</button><b>${escapeHtml(n.subject)}</b><button type="button" class="inbox-del" data-del="${escapeHtml(n.id)}">Delete</button></div>
        <div class="inbox-msg">
          <div class="inbox-from">${avatar(n)}<div><b>${escapeHtml(n.sender_name)}</b><span>${escapeHtml(when(n.created_at))}</span></div></div>
          <div class="inbox-body"><p>${escapeHtml(n.body).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>')}</p></div>
          ${n.link ? `<a class="btn btn-primary inbox-open" href="${escapeHtml(n.link)}">Open</a>` : ''}
        </div>`;
      return;
    }
    panel.innerHTML = `<div class="inbox-head"><b>Notifications</b>${items.some(x => !x.read_at) ? '<button type="button" class="inbox-readall">Mark all read</button>' : ''}</div>` +
      (items.length ? items.map(n => `<div class="inbox-row"><button type="button" class="inbox-item${n.read_at ? '' : ' unread'}" data-id="${escapeHtml(n.id)}">
          ${avatar(n)}
          <span class="inbox-text"><span class="inbox-who"><b>${escapeHtml(n.sender_name)}</b><span>${escapeHtml(when(n.created_at))}</span></span>
            <span class="inbox-subject">${escapeHtml(n.subject)}</span>
            <span class="inbox-snip">${escapeHtml(n.body.replace(/\s+/g, ' ').slice(0, 90))}${n.body.length > 90 ? '…' : ''}</span></span>
        </button><button type="button" class="inbox-x" data-del="${escapeHtml(n.id)}" aria-label="Delete notification">&times;</button></div>`).join('') : '<p class="inbox-empty">Nothing here yet.</p>');
  };
  const load = async () => { items = await fetchNotifications(); badge(); draw(); };
  const show = on => { panel.hidden = !on; btn.setAttribute('aria-expanded', on ? 'true' : 'false'); if(!on) open = null; };

  btn.addEventListener('click', async () => { if(panel.hidden){ open = null; show(true); draw(); if(items === null) await load(); else draw(); } else show(false); });
  panel.addEventListener('click', async e => {
    e.stopPropagation();   // a redraw detaches the clicked row; the outside-click test below must not see it
    const del = e.target.closest('[data-del]');
    if(del){
      const id = del.dataset.del;
      items = items.filter(x => x.id !== id);
      if(open && open.id === id) open = null;
      badge(); draw(); deleteNotification(id); return;
    }
    const item = e.target.closest('.inbox-item');
    if(item){
      open = items.find(x => x.id === item.dataset.id) || null;
      if(open && !open.read_at){ open.read_at = new Date().toISOString(); badge(); markNotificationRead(open.id); }
      draw(); return;
    }
    if(e.target.closest('.inbox-back')){ open = null; draw(); return; }
    if(e.target.closest('.inbox-readall')){
      for(const n of items) if(!n.read_at) n.read_at = new Date().toISOString();
      badge(); draw(); markAllNotificationsRead();
    }
  });
  document.addEventListener('click', e => { if(!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) show(false); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && !panel.hidden) show(false); });

  /* the badge without opening: one cheap read at load */
  load();
}

/* The database raises this when someone trips the per-IP limit. Turn it into
   something a real person who genuinely sent three quotes can understand. */
function rateLimitMessage(err){
  const m = (err && (err.message || err.error_description)) || '';
  return /too many submissions/i.test(m)
    ? 'You have sent a few of these recently. Please wait a few minutes and try again.'
    : null;
}

/* ---- email notifications to the founders (via FormSubmit) ----
   Note: the first submission triggers a one-time activation email to
   mike@circuits.com, click the link inside it once and delivery is live. */
/* Each founder gets his own FormSubmit send (no CC), so one un-activated
   form can never block the other. IMPORTANT: FormSubmit requires a ONE-TIME
   activation per address, check mike@circuits.com AND john@circuits.com
   (including spam) for an "Activate Form" email and click the link once. */
const FOUNDER_EMAILS = ['mike@circuits.com','john@circuits.com'];
async function sendFounderEmail(subject, fields, autoresponse){
  async function sendOne(to, withAuto){
    const payload = Object.assign({
      _subject: subject,
      _template: 'table',
      _captcha: 'false'
    }, fields);
    if(withAuto && autoresponse) payload._autoresponse = autoresponse;
    if(fields && fields.email) payload._replyto = fields.email;
    try{
      const res = await fetch('https://formsubmit.co/ajax/' + to, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify(payload)
      });
      const out = await res.json().catch(()=>null);
      const ok = !!out && out.success !== 'false' && out.success !== false;
      if(!ok) console.error('Email to ' + to + ' NOT delivered:', out && out.message);
      return ok;
    }catch(err){ console.warn('Email to ' + to + ' failed:', err); return false; }
  }
  /* The applicant's confirmation is FormSubmit's _autoresponse, which only
     goes out from an ACTIVATED endpoint. A send can return HTTP success while
     silently dropping the autoresponse (e.g. that founder address was never
     activated), so we can't tell which endpoint will actually deliver it.
     Attach the confirmation to EVERY founder send: as long as at least one
     address is activated, the applicant gets their confirmation. (If both are
     activated the applicant may get two copies, acceptable vs. getting none.) */
  const results = await Promise.all(FOUNDER_EMAILS.map(to => sendOne(to, true)));
  /* True only if at least one founder address actually accepted the message.
     Callers use this to decide between a real "sent" confirmation and an
     honest error, instead of always claiming success, a FormSubmit endpoint
     that was never activated silently drops mail, and telling someone their
     message went through when it did not is worse than telling them to try
     another way. */
  return results.some(Boolean);
}

/* Results page rendering */
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
/* A URL safe to put in an href. These values (a listing's website and its
   uploaded-doc links) are supplied by the listing owner, so escaping alone is
   not enough, escapeHtml leaves `javascript:`/`data:` schemes intact. Only
   http(s) is allowed through; a bare domain is upgraded to https, anything
   else becomes empty. Mirrors safeUrl() in profile.js. */
function safeUrl(u){
  const s = (u || '').trim();
  if(!s) return '';
  if(/^https?:\/\//i.test(s)) return s;
  if(/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)) return 'https://' + s;
  return '';
}
/* "View Documentation" link(s) for a listing's uploaded documents */
function docLinks(c){
  const docs = Array.isArray(c && c.docs) ? c.docs : [];
  const usable = docs.filter(d => d && safeUrl(d.url));
  if(!usable.length) return '';
  if(usable.length === 1) return `<a class="doc-link" href="${escapeHtml(safeUrl(usable[0].url))}" target="_blank" rel="noopener nofollow">View Docs</a>`;
  return `<span class="doc-link">View Docs:${usable.map((d,i)=>` <a href="${escapeHtml(safeUrl(d.url))}" target="_blank" rel="noopener nofollow" title="${escapeHtml(d.name)}">${i+1}</a>`).join('')}</span>`;
}
function initials(name){return name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}
/* default logo placeholder: a generic person silhouette (white on the tile's
   varying color) shown whenever a listing has no uploaded logo */
function avatarSvg(){return '<svg class="silhouette" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.2" r="4.2"/><path d="M12 13.6c-4.5 0-7.7 2.4-7.7 5.4V21h15.4v-2c0-3-3.2-5.4-7.7-5.4z"/></svg>';}

/* ---- saved suppliers (buyer side) ----
   A buyer saves suppliers from a profile page (see wireSave in profile.js);
   the list lives in this browser only, under the same 'cx_saved' key. This is
   where they get to SEE that list, without it the Save button wrote to
   nowhere. The key is used as a literal (not a shared const): profile.js
   already declares its own SAVED_KEY, and both files share global scope. */
function savedSuppliers(){
  try{ const v = JSON.parse(localStorage.getItem('cx_saved') || '[]'); return Array.isArray(v) ? v : []; }
  catch(e){ return []; }
}
function removeSaved(slug){
  try{
    const list = savedSuppliers().filter(c => c.slug !== slug);
    localStorage.setItem('cx_saved', JSON.stringify(list));
  }catch(e){ /* private mode / quota, nothing else to do */ }
}
function renderSavedStrip(){
  const strip = document.getElementById('saved-strip');
  if(!strip) return;
  const list = savedSuppliers();
  if(!list.length){ strip.hidden = true; strip.innerHTML = ''; return; }
  strip.hidden = false;
  strip.innerHTML = `<div class="inner saved-inner">
    <span class="saved-label">Saved suppliers</span>
    <div class="saved-chips">${list.map(c => `<span class="saved-chip">
      <a href="/${escapeHtml(c.handle || '')}">${escapeHtml(c.name || c.handle || 'Supplier')}</a>
      <button type="button" class="saved-x" data-unsave="${escapeHtml(c.slug)}" aria-label="Remove ${escapeHtml(c.name || 'supplier')} from saved">×</button>
    </span>`).join('')}</div>
  </div>`;
  strip.querySelectorAll('[data-unsave]').forEach(btn =>
    btn.addEventListener('click', () => { removeSaved(btn.dataset.unsave); renderSavedStrip(); }));
}

async function initResults(forcedTerm){
  const params = new URLSearchParams(location.search);
  const q = forcedTerm || params.get('q') || '';
  const COLORS = ['#76c000','#0f6fff','#ff7a00','#9b51e0','#e02d5b','#00a8a8','#444b54','#c9a400'];
  if(typeof renderSavedStrip === 'function') renderSavedStrip();

  const mini = document.getElementById('mini-search');
  const miniForm = document.getElementById('mini-form');
  if(mini) mini.value = q;
  if(miniForm) miniForm.addEventListener('submit', e=>{ e.preventDefault(); gotoSearch(mini.value); });
  attachSuggestions(mini);
  document.querySelectorAll('[data-term]').forEach(el=> el.textContent = q || '…');

  const body = document.getElementById('results-body');

  if(!q){
    setResultsMeta('', false);
    body.innerHTML = `<div class="empty"><div class="big">Type a keyword to see suppliers</div>
      <p>Try <a href="/results?q=circuits">circuits</a>, <a href="/results?q=microcontrollers">microcontrollers</a>, or <a href="/results?q=sensors">sensors</a>.</p></div>`;
    return;
  }

  setResultsMeta(q, false);   // flipped to indexable only once real listings render
  body.innerHTML = loadingHtml('Searching…');

  let listings = [];
  try {
    listings = await fetchApprovedByKeyword(q);
  } catch(e){
    /* Do NOT fall through to the "this keyword is available" pitch. We do not
       know that it is available, we only know we could not ask. */
    body.innerHTML = loadErrorHtml('the results for “' + q + '”', 'Search again');
    const c = document.getElementById('result-count');
    if(c) c.textContent = '–';
    return;
  }

  const countEl = document.getElementById('result-count');
  if(countEl) countEl.textContent = listings.length;

  /* Record the search and whether it landed. Only reached once the lookup has
     actually succeeded, a failed request above returns early, so an outage is
     never logged as "nobody wanted this keyword". */
  logSearch(q, listings.length);

  /* The example sponsor banner and the "get listed" button. Shown on an empty
     keyword page, and on any keyword page where nobody holds the banner yet, so
     every list carries the pitch (2026-09-01). The Website / View Docs labels are
     spans on purpose: there is nothing to visit, so nothing should look like it
     goes somewhere. The keyword is capitalised by CSS (.tc), the same way the
     subbar shows it. */
  const exampleBanner = (term, extra = '') => `
    <div class="empty" style="margin-bottom:4px">
      <div class="big">This Banner is Available</div>
      ${extra}
    </div>
    <div class="premium"><div class="premium-card">
      <span class="premium-badge">Exclusive Sponsor</span>
      <div class="premium-logo">${avatarSvg()}</div>
      <div class="premium-body">
        <h3>Your Company</h3>
        <p>Own the Exclusive Circuits-Keyword&trade; Sponsor Banner for &ldquo;<span class="tc">${term}</span>&rdquo;.<br>Own the First Listing Every Viewer Sees.</p>
        <div class="premium-links"><span class="doc-link">Website</span><span class="doc-link">View Docs</span></div>
      </div>
      <div class="premium-contact">
        <div class="pc-lines">
          <span class="pc-name">John Doe</span>
          <span>johndoe@yourcompany.com</span>
        </div>
      </div>
    </div></div>`;
  const listCta = (term) => `
    <div class="empty" style="margin:10px auto 26px">
      <a class="btn btn-primary" href="/register" style="padding:14px 28px;font-size:1rem;display:inline-block;font-weight:700">Get Listed For <span class="tc">${term}</span></a>
    </div>`;

  if(!listings.length){
    const term = escapeHtml(q);

    /* A misspelling should not read as "nobody sells this". Checked against
       the live keyword index; shown only when something is genuinely close. */
    let didYouMean = '';
    try{
      const near = nearestKeywords(q, await fetchKeywordIndex(), 3);
      if(near.length){
        didYouMean = `<p class="didyoumean">Did you mean ${near.map(k =>
          `<a href="/results?q=${encodeURIComponent(k.keyword)}">${escapeHtml(k.keyword)}</a>`
        ).join(' or ')}?</p>`;
      }
    }catch(e){ /* suggestions are a nicety; the page must render without them */ }

    /* The keyword-available pitch: the mocked-up sponsor card and listing row
       show a supplier exactly what they would be buying. The buyer's "tell me
       when someone lists" capture was removed 2026-09-01 at Jacob's request. */
    body.innerHTML = exampleBanner(term, didYouMean) + `
    <div class="listings" style="margin-bottom:10px">
      <div class="table-wrap">
        <table class="listings-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody><tr>
            <td><div class="co">
              <span class="co-logo" style="background:var(--dark)">${avatarSvg()}</span>
              <a href="/register">Your Company</a>
              <span class="lb" style="background:#c9a227">Authorized</span>
              <span class="doc-link">Website</span>
              <span class="doc-link">View Docs</span>
            </div></td>
            <td class="cell-muted" data-label="Contact">John Doe</td>
            <td class="cell-muted" data-label="Phone">(555) 123-4567</td>
            <td class="cell-muted" data-label="Email">johndoe@yourcompany.com</td>
          </tr></tbody>
        </table>
      </div>
    </div>` + listCta(term);

    return;
  }

  /* Real listings make this page worth indexing; the sample fixture and an
     empty page are not Google's business. */
  setResultsMeta(q, listings.some(l => !/^sample-/.test(l.company_slug || '')));

  /* The Exclusive Sponsor is lifted OUT of the list, not shown twice. While the
     banner is being paid for, that company IS the banner; when it lapses the
     row goes back into the list like any other. */
  const featured = listings.find(l => l.banner);
  const listed = listings.filter(l => !l.banner);
  /* Every load deals the list in a fresh random order (Jacob, 2026-09-01), the "#" is just the row's place today, not a rank. Fisher-Yates, because
     sort(() => Math.random() - .5) is biased. */
  for(let i = listed.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [listed[i], listed[j]] = [listed[j], listed[i]];
  }
  /* ...except paid locked spots: a company that pays for #N sits at #N and the
     shuffled rest fill in around it. If there are fewer rows than N it simply
     goes last. One company per spot per keyword is a database rule. */
  const free = listed.filter(l => !l.locked_position);
  const pinned = listed.filter(l => l.locked_position).sort((a,b) => a.locked_position - b.locked_position);
  const ordered = [];
  for(const l of pinned){
    while(ordered.length < l.locked_position - 1 && free.length) ordered.push(free.shift());
    ordered.push(l);
  }
  ordered.push(...free);
  const lockHtml = (n, kw) => `<span class="lock" tabindex="0" aria-label="Position locked">`
    + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
    + `<span class="lock-tip"><b>Position locked.</b> This company holds #${n} for &ldquo;${escapeHtml(kw)}&rdquo;. <a href="/contact">Lock yours &rarr;</a></span></span>`;
  let html = '';
  if(!featured){
    html += exampleBanner(escapeHtml(q));
  } else {
    const fLogo = isLogoUrl(featured.logo)
      ? `<img src="${escapeHtml(featured.logo)}" alt="${escapeHtml(featured.company)} logo">`
      : avatarSvg();
    html += `<div class="premium"><div class="premium-card" data-slug="${escapeHtml(featured.company_slug || '')}">
      <span class="premium-badge">Exclusive Sponsor</span>
      <div class="premium-logo">${fLogo}</div>
      <div class="premium-body">
        <h3>${featured.company_handle
          ? `<a href="${escapeHtml(profileUrl(featured.company_handle))}">${escapeHtml(featured.company)}</a>`
          : escapeHtml(featured.company)}${badgeHtml(featured.badge)}</h3>
        ${featured.description ? `<p>${escapeHtml(featured.description)}</p>` : ''}
        <div class="premium-links">
          ${safeUrl(featured.website) ? `<a class="doc-link" href="${escapeHtml(safeUrl(featured.website))}" target="_blank" rel="noopener nofollow">Website</a>` : ''}
          ${docLinks(featured)}
        </div>
      </div>
      <div class="premium-contact">
        <div class="pc-lines">
          ${featured.contact ? `<span class="pc-name">${escapeHtml(featured.contact)}</span>` : ''}
          ${featured.phone ? `<a href="tel:${escapeHtml(featured.phone)}">${escapeHtml(featured.phone)}</a>` : ''}
          ${featured.email ? `<a href="mailto:${escapeHtml(featured.email)}">${escapeHtml(featured.email)}</a>` : ''}
        </div>
      </div>
    </div></div>`;
  }

  const rows = ordered.map((c,i)=>`
    <tr data-slug="${escapeHtml(c.company_slug || '')}">
      <td class="rank" data-label="#">${i+1}${c.locked_position ? lockHtml(i+1, q) : ''}</td>
      <td>
        <div class="co">
          ${c.company_handle ? `<a class="co-logo-link" href="${escapeHtml(profileUrl(c.company_handle))}" aria-label="${escapeHtml(c.company)} profile">` : ''}
          ${isLogoUrl(c.logo)
            ? `<span class="co-logo"><img src="${escapeHtml(c.logo)}" alt="${escapeHtml(c.company)} logo"></span>`
            : `<span class="co-logo" style="background:${COLORS[i%COLORS.length]}">${avatarSvg()}</span>`}
          ${c.company_handle ? '</a>' : ''}
          ${c.company_handle
            ? `<a href="${escapeHtml(profileUrl(c.company_handle))}">${escapeHtml(c.company)}</a>`
            : escapeHtml(c.company)}
          ${badgeHtml(c.badge)}
          ${safeUrl(c.website) ? `<a class="doc-link" href="${escapeHtml(safeUrl(c.website))}" target="_blank" rel="noopener nofollow">Website</a>` : ''}
          ${docLinks(c)}
        </div>
      </td>
      <td class="cell-muted" data-label="Contact">${escapeHtml(c.contact||'')}</td>
      <td class="cell-muted" data-label="Phone">${c.phone ? `<a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a>` : ''}</td>
      <td class="cell-muted" data-label="Email">${c.email ? `<a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a>` : ''}</td>
    </tr>`).join('');

  /* The column used to be headed "Held" with a claim-order note under the
     table; both went 2026-09-01 at Jacob's request, it is a plain "#" now. */
  body.innerHTML = html + `
    <div class="listings">
      <div class="table-wrap">
        <table class="listings-table">
          <thead><tr>
            <th class="rank">#</th>
            <th>Company</th><th>Contact</th><th>Phone</th><th>Email</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>` + (featured ? '' : listCta(escapeHtml(q)));

  /* Arriving from a profile's keyword tag or the approval email (?hl=<slug>):
     walk the reader to that company's row, or its sponsor banner, and flash
     it so the eye lands. The row is scrolled into view FIRST and lit up only
     once it is on screen; lighting it during the scroll meant people caught
     the last quarter-second of the fade and nothing else (Jacob, 2026-09-01). */
  const hl = params.get('hl');
  if(hl){
    const target = body.querySelector(`[data-slug="${CSS.escape(hl)}"]`);
    if(target){
      let lit = false;
      const light = () => { if(lit) return; lit = true; target.classList.add('hl-flash'); };
      setTimeout(() => {
        const r = target.getBoundingClientRect();
        const onScreen = r.top >= 0 && r.bottom <= innerHeight;
        if(onScreen){ light(); return; }
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.addEventListener('scrollend', light, { once: true });
        setTimeout(light, 900);            // browsers without scrollend
      }, 60);
    }
  }
}

/* The per-listing "Request a Quote" button was removed for MVP1 (2026-08-31):
   buyers contact suppliers directly through the phone and email columns that
   sit in the results table and the sponsor banner. The quote/inquiry pipeline
   (profile.js rfqForm, thread.*, the notify/inquiries backend) is preserved in
   backups/mvp1-baseline-2026-08-25/ for MVP2. */

/* Join form behavior */
function initJoin(){
  let keywords = [];
  const kwInput = document.getElementById('kw-input');
  const kwAdd = document.getElementById('kw-add');
  const kwTags = document.getElementById('kw-tags');
  const kwCount = document.getElementById('kw-count');

  function renderKw(){
    if(kwTags) kwTags.innerHTML = keywords.map((k,i)=>{
      const esc = k.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      return `<span class="kw-tag"><a class="kw-check-link" href="/results?q=${encodeURIComponent(k)}" target="_blank" rel="noopener" title="Check availability: opens this keyword's live listing page in a new tab">${esc}</a><button type="button" data-i="${i}" aria-label="Remove">×</button></span>`;
    }).join('');
    if(kwCount) kwCount.innerHTML = `<b>${keywords.length}</b> of 10 keywords`;
  }
  function addKw(){
    // approval-level ruleset: lowercase, no hyphens, no plurals
    const v = (typeof cleanKw==='function') ? cleanKw(kwInput.value) : (kwInput.value||'').trim().toLowerCase();
    if(!v || keywords.includes(v)) return;
    if(keywords.length >= 10){ setErr(kwInput, 'You can list up to 10 keywords for free. Remove one to add another.'); return; }
    keywords.push(v); kwInput.value=''; renderKw(); renderQuote(); kwInput.focus();
    setErr(kwInput, ''); // the "add at least one keyword" message, once satisfied
  }
  function checkKw(){
    // preview the keyword's live listing page without touching the form
    const v = (typeof cleanKw==='function') ? cleanKw(kwInput.value) : (kwInput.value||'').trim().toLowerCase();
    if(!v){ kwInput.focus(); return; }
    window.open('/results?q=' + encodeURIComponent(v), '_blank', 'noopener');
  }
  const kwCheck = document.getElementById('kw-check');
  if(kwCheck) kwCheck.addEventListener('click', checkKw);
  if(kwAdd) kwAdd.addEventListener('click', addKw);
  if(kwInput) kwInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addKw(); } });
  if(kwTags) kwTags.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    keywords.splice(+b.dataset.i,1); renderKw(); renderQuote();
  });
  renderKw();

  /* ---- inline field errors ---- */
  function setErr(input, msg){
    const field = input.closest('.field'); if(!field) return;
    let em = field.querySelector('.err-msg');
    if(!em){ em = document.createElement('div'); em.className = 'err-msg'; field.appendChild(em); }
    em.textContent = msg || '';
    field.classList.toggle('invalid', !!msg);
  }

  // Trust badge builder (opt-in + option + color, live preview)
  const badgeCheck = document.getElementById('badge-check');
  const badgeBuilder = document.getElementById('badge-builder');
  const badgeOpts = document.getElementById('badge-opts');
  const swatches = document.getElementById('swatches');
  const badgePreview = document.getElementById('badge-preview');
  const customBtn = document.getElementById('badge-custom-btn');
  const customInput = document.getElementById('badge-custom');
  const DEFAULT_TEXT = 'Authorized';
  const DEFAULT_COLOR = '#c9a227'; /* gold */
  let curBadgeText = DEFAULT_TEXT, curBadgeColor = DEFAULT_COLOR;
  function selectText(text){
    curBadgeText = text;
    if(badgePreview) badgePreview.textContent = text;
    if(badgeOpts) badgeOpts.querySelectorAll('.opt-btn').forEach(b=>b.classList.toggle('selected', b.dataset.text===text));
    if(customBtn) customBtn.classList.remove('selected');
    if(customInput) customInput.style.display = 'none';
  }
  function selectCustom(){
    if(badgeOpts) badgeOpts.querySelectorAll('.opt-btn').forEach(b=>b.classList.remove('selected'));
    if(customBtn) customBtn.classList.add('selected');
    if(customInput){
      customInput.style.display = 'block';
      curBadgeText = customInput.value.trim() || 'Your Badge';
      if(badgePreview) badgePreview.textContent = curBadgeText;
      customInput.focus();
    }
  }
  /* A badge is a label the company picks for itself, so it must not be able to
     claim an assessment nobody made. The database refuses these outright, see
     guard_verified_badge(), but finding out at submit time, after filling in a
     long form, is a miserable way to learn it. Same rule, said earlier. */
  const BADGE_FORBIDDEN = [
    [/verified|circuits\.com|official/i,
     'is awarded by Circuits.com and cannot be bought'],
    [/certif|accredit|approv|licens|registered|compliant|complianc|audited|endorsed/i,
     'claims somebody else assessed you'],
    [/iso[ -]?\d|as9100|iatf|nadcap|itar|rohs|reach|ce[ -]?mark|ul[ -]?listed|\bul\b|ansi|\bieee\b|\bipc\b|\bfda\b|mil[ -]?spec|nist|ukca/i,
     'names a standard awarded by the body that runs it']
  ];
  function badgeProblem(text){
    for(const [re, why] of BADGE_FORBIDDEN) if(re.test(text || '')) return why;
    return '';
  }
  function showBadgeProblem(){
    const box = document.getElementById('badge-custom-msg');
    if(!box) return '';
    const why = badgeProblem(curBadgeText);
    box.style.display = why ? 'block' : 'none';
    box.textContent = why ? 'That badge cannot be used: it ' + why + '.' : '';
    return why;
  }
  if(customBtn) customBtn.addEventListener('click', selectCustom);
  if(customInput) customInput.addEventListener('input', ()=>{
    curBadgeText = customInput.value.trim() || 'Your Badge';
    if(badgePreview) badgePreview.textContent = curBadgeText;
    showBadgeProblem();
  });
  function selectColor(color){
    curBadgeColor = color;
    if(badgePreview) badgePreview.style.background = color;
    if(swatches) swatches.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected', s.dataset.color===color));
  }
  if(badgeOpts) badgeOpts.addEventListener('click', e=>{
    const b = e.target.closest('.opt-btn'); if(!b || !b.dataset.text) return;
    selectText(b.dataset.text);
  });
  if(swatches) swatches.addEventListener('click', e=>{
    const s = e.target.closest('.swatch'); if(!s) return;
    selectColor(s.dataset.color);
  });
  selectText(DEFAULT_TEXT); selectColor(DEFAULT_COLOR);
  function syncBadgeGate(){
    if(badgeBuilder) badgeBuilder.classList.toggle('on', !!(badgeCheck && badgeCheck.checked));
  }
  if(badgeCheck) badgeCheck.addEventListener('change', () => { syncBadgeGate(); renderQuote(); });
  syncBadgeGate();
  const promoCheck = document.getElementById('promo-check');
  if(promoCheck) promoCheck.addEventListener('change', renderQuote);
  function resetBadge(){ if(customInput) customInput.value=''; selectText(DEFAULT_TEXT); selectColor(DEFAULT_COLOR); syncBadgeGate(); }

  // Logo upload preview
  const logoInput = document.getElementById('logo-input');
  const logoPrev = document.getElementById('logo-preview');
  const logoImg = document.getElementById('logo-preview-img');
  const logoName = document.getElementById('logo-name');
  /* must match the logos bucket, which enforces this server-side. SVG is out:
     it can carry script and the bucket is publicly served. */
  const LOGO_TYPES = ['image/png','image/jpeg','image/webp'];
  const LOGO_MAX = 5 * 1024 * 1024; // 5 MB
  let logoUrl = null;
  if(logoInput) logoInput.addEventListener('change', ()=>{
    const f = logoInput.files && logoInput.files[0];
    if(!f){ logoPrev.style.display='none'; setErr(logoInput,''); logoUrl=null; updatePreviews(); return; }
    if(!LOGO_TYPES.includes(f.type)){
      setErr(logoInput, 'Logo must be a PNG, JPG or WebP image.');
      logoInput.value=''; logoPrev.style.display='none'; logoUrl=null; updatePreviews(); return;
    }
    if(f.size > LOGO_MAX){
      setErr(logoInput, 'Logo file is too large (max 5 MB).');
      logoInput.value=''; logoPrev.style.display='none'; logoUrl=null; updatePreviews(); return;
    }
    setErr(logoInput,'');
    logoName.textContent = f.name;
    logoUrl = URL.createObjectURL(f);
    logoImg.src = logoUrl;
    logoPrev.style.display = 'flex';
    updatePreviews();
  });

  // Additional documentation upload (PDFs / images)
  // Files accumulate across picks (up to 5) instead of replacing each other.
  const docsInput = document.getElementById('docs-input');
  const docsList = document.getElementById('docs-list');
  const DOC_TYPES = ['application/pdf','image/png','image/jpeg','image/webp'];
  const DOC_MAX = 10 * 1024 * 1024; // 10 MB each
  const DOC_LIMIT = 5;
  let docFiles = [];
  function renderDocs(){
    if(docsList) docsList.innerHTML = docFiles.map((f,i)=>
      `<span>${escapeHtml(f.name)} <button type="button" class="doc-remove" data-i="${i}" aria-label="Remove ${escapeHtml(f.name)}" style="border:0;background:none;cursor:pointer;color:#b3261e;font-size:1rem;line-height:1;padding:0 2px">×</button></span>`
    ).join('');
  }
  if(docsList) docsList.addEventListener('click', e=>{
    const b = e.target.closest('.doc-remove'); if(!b) return;
    docFiles.splice(+b.dataset.i, 1); setErr(docsInput,''); renderDocs();
  });
  function clearDocs(){ docFiles = []; if(docsInput) docsInput.value=''; renderDocs(); }
  if(docsInput) docsInput.addEventListener('change', ()=>{
    const picked = Array.from(docsInput.files || []);
    docsInput.value = ''; // allow re-picking the same file later
    if(!picked.length) return;
    if(picked.some(f => !DOC_TYPES.includes(f.type))){ setErr(docsInput, 'Documents must be PDF, PNG, JPEG, or WebP files.'); return; }
    if(picked.some(f => f.size > DOC_MAX)){ setErr(docsInput, 'Each document must be 10 MB or smaller.'); return; }
    const fresh = picked.filter(f => !docFiles.some(d => d.name === f.name && d.size === f.size));
    if(docFiles.length + fresh.length > DOC_LIMIT){ setErr(docsInput, 'You can upload up to ' + DOC_LIMIT + ' documents.'); return; }
    docFiles = docFiles.concat(fresh);
    setErr(docsInput,'');
    renderDocs();
  });

  // Live previews (badge + banner) pull from the form fields
const pvName = document.getElementById('preview-name');
const pvLogo = document.getElementById('preview-logo');
const bpLogo = document.getElementById('bp-logo');
const bpCompany = document.getElementById('bp-company');
const bpMessage = document.getElementById('bp-message');
const bpContact = document.getElementById('bp-contact');
const bpPhone = document.getElementById('bp-phone');
const bpEmail = document.getElementById('bp-email');
function fieldVal(id){ const el = document.getElementById(id); return el ? el.value.trim() : ''; }
function updatePreviews(){
const company = fieldVal('f-company');
if(pvName) pvName.textContent = company || 'AAA Electronics';
if(bpCompany) bpCompany.textContent = company || 'AAA Electronics, Inc.';
if(logoUrl){
  if(pvLogo){ pvLogo.classList.remove('logo-ph'); pvLogo.innerHTML = `<img src="${logoUrl}" alt="Your logo">`; }
  if(bpLogo){ bpLogo.classList.remove('logo-ph'); bpLogo.innerHTML = `<img src="${logoUrl}" alt="Your logo">`; }
} else {
  /* no logo picked yet, show a "Your Logo" placeholder, never initials */
  if(pvLogo){ pvLogo.classList.add('logo-ph'); pvLogo.textContent = 'Your Logo'; }
  if(bpLogo){ bpLogo.classList.add('logo-ph'); bpLogo.textContent = 'Your Logo'; }
}
if(bpContact) bpContact.textContent = fieldVal('f-contact') || 'Jane Doe, VP Sales';
if(bpPhone) bpPhone.textContent = fieldVal('f-phone') || '(555) 123-4567';
if(bpEmail) bpEmail.textContent = fieldVal('f-email') || 'sales@company.com';
/* the profile description is written by staff after review, so the preview
   keeps its example text, the Step 5 suggestions box does NOT feed it */
}
['f-company','f-contact','f-phone','f-email'].forEach(function(id){
const el = document.getElementById(id);
if(el) el.addEventListener('input', updatePreviews);
});
updatePreviews();

/* ---- Circuits.com address (handle) + password ----
   Get Listed is the ONLY place an account is created, so the handle is
   reserved and the sign-in password is set here. */
const handleInput = document.getElementById('f-handle');
const handleMsg = document.getElementById('handle-msg');
let handleTimer = null, handleState = '';
if(handleInput) handleInput.addEventListener('input', ()=>{
  if(JOIN_ADOPTED) return;
  handleInput.value = handleInput.value.toLowerCase().replace(/[^a-z0-9_-]/g,'');
  clearTimeout(handleTimer);
  handleState = 'checking';
  if(!handleInput.value){ handleMsg.textContent=''; handleState=''; return; }
  handleMsg.textContent = 'Checking…'; handleMsg.style.color = '';
  handleTimer = setTimeout(async ()=>{
    /* The debounce cancels a pending timer, but not a fetch already in flight.
       A slow answer for an earlier prefix could otherwise land after the user
       has typed more and overwrite the verdict for what is now in the box.
       Capture the value we asked about and ignore the answer if it moved on. */
    const asked = handleInput.value;
    const why = await handleAvailable(asked, null);
    if(handleInput.value !== asked) return;
    handleState = why ? 'bad' : 'ok';
    handleMsg.textContent = why || ('circuits.com/' + asked + ' is yours to reserve.');
    handleMsg.style.color = why ? '#b3261e' : '#3f6300';
  }, 400);
});

const passEl = document.getElementById('f-pass');
const pass2El = document.getElementById('f-pass2');
const passMsg = document.getElementById('pass-msg');
function passwordsMatch(){
  if(!passEl || !pass2El) return true;
  if(!pass2El.value){ if(passMsg) passMsg.textContent = ''; return false; }
  const same = passEl.value === pass2El.value;
  if(passMsg){
    passMsg.textContent = same ? 'Passwords match.' : 'Passwords do not match.';
    passMsg.style.color = same ? '#3f6300' : '#b3261e';
  }
  return same;
}
if(passEl) passEl.addEventListener('input', passwordsMatch);
if(pass2El) pass2El.addEventListener('input', passwordsMatch);

/* ---- live price estimate ----
   Each keyword is its own listing row, so the banner and badge are charged per
   keyword. Showing that up front avoids an invoice surprise later. */
function renderQuote(){
  const lines = document.getElementById('quote-lines');
  if(!lines) return;
  const n = keywords.length;
  const wantsBanner = !!(document.getElementById('promo-check') && document.getElementById('promo-check').checked);
  const wantsBadge  = !!(badgeCheck && badgeCheck.checked);
  const each = BASE_FEE + (wantsBanner ? BANNER_FEE : 0) + (wantsBadge ? BADGE_FEE : 0);
  const eachYear = BASE_FEE_YEAR + (wantsBanner ? BANNER_FEE_YEAR : 0) + (wantsBadge ? BADGE_FEE_YEAR : 0);
  const rows = [['Keyword listing', BASE_FEE, BASE_FEE_YEAR]];
  if(wantsBanner) rows.push(['Exclusive Circuits-Keyword™ Sponsor banner', BANNER_FEE, BANNER_FEE_YEAR]);
  if(wantsBadge)  rows.push(['Circuits.com Trust Badge', BADGE_FEE, BADGE_FEE_YEAR]);

  const money = v => '$' + v.toLocaleString('en-US');

  lines.innerHTML = rows.map(([label, price, yearly]) =>
    `<div class="quote-line"><span>${escapeHtml(label)}</span>`
    + `<span class="quote-each">${money(price)}/mo or ${money(yearly)}/yr &times; ${n || 0}</span>`
    + `<b>${money(price * n)}</b></div>`).join('');

  const totalEl = document.getElementById('quote-total');
  if(totalEl) totalEl.textContent = money(each * n) + (n ? '/mo' : '');
  const yearEl = document.getElementById('quote-total-year');
  if(yearEl) yearEl.textContent = money(eachYear * n) + (n ? '/yr' : '');
  const note = document.getElementById('quote-note');
  if(note) note.textContent = !n
    ? 'Add at least one Circuits-Keyword™ in step 02 to see your estimate.'
    : (n === 1
        ? 'One keyword at ' + money(each) + '/mo, or ' + money(eachYear) + ' a year.'
        : n + ' keywords at ' + money(each) + '/mo each, or ' + money(eachYear) + ' each a year. Extras apply to every keyword you claim.');
}

const msg = document.getElementById('msg');
  const msgCount = document.getElementById('msg-count');
  if(msg) msg.addEventListener('input', ()=>{ msgCount.textContent = `${msg.value.length} / 600`; });

  renderQuote();
  initJoinAccount();

  const form = document.getElementById('join-form');
  function validate(){
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    let firstBad = null;
    const check = (id, ok, errText)=>{
      const el = document.getElementById(id); if(!el) return;
      setErr(el, ok ? '' : errText);
      if(!ok && !firstBad) firstBad = el;
    };
    /* a typed-but-never-Added keyword still counts, people forget the button */
    if(kwInput && kwInput.value.trim()) addKw();
    check('kw-input', keywords.length > 0, 'Add at least one keyword. That is what buyers search to find you.');
    check('f-company', !!v('f-company'), 'Please enter your company name.');
    check('f-contact', !!v('f-contact'), 'Please enter a contact person.');
    check('f-phone', isValidPhone(v('f-phone')), 'Please enter a phone number (at least 10 digits). Buyers need a way to call you.');
    check('f-website', !v('f-website') || isValidWebsite(v('f-website')), 'Please enter a valid website (e.g. www.company.com).');
    /* MVP1: a free listing request, no password/account is created here, so we
       only need an email your team can reply to. */
    check('f-email', isValidEmail(v('f-email')), 'Please enter a valid email address (e.g. sales@company.com) so we can reply.');
    /* terms must be accepted before the form can be submitted */
    const termsBox = document.getElementById('f-terms');
    const termsErr = document.getElementById('terms-err');
    const termsOk = !!(termsBox && termsBox.checked);
    if(termsErr) termsErr.style.display = termsOk ? 'none' : 'block';
    if(!termsOk && !firstBad) firstBad = termsBox;
    if(firstBad){ firstBad.scrollIntoView({behavior:'smooth', block:'center'}); firstBad.focus({preventScroll:true}); return false; }
    return true;
  }

  /* Highlight whichever step is currently in view, and tick off the ones
     behind it. Uses scroll position rather than IntersectionObserver so it
     also settles correctly on first paint and after a jump-to-error. */
  (function wireWizard(){
    const wiz = document.getElementById('wiz');
    if(!wiz) return;
    const steps = [...document.querySelectorAll('.step')];
    const items = [...wiz.querySelectorAll('li')];
    if(!steps.length || !items.length) return;
    function sync(){
      const line = window.scrollY + wiz.offsetHeight + 80;   // just under the sticky bar
      let cur = 0;
      steps.forEach((s, i) => { if(s.offsetTop <= line) cur = i; });
      items.forEach(li => {
        const n = +li.dataset.step;
        li.classList.toggle('here', n <= cur && (+items[items.indexOf(li) + 1]?.dataset.step > cur || items.indexOf(li) === items.length - 1));
        li.classList.toggle('done', n < cur && !li.classList.contains('here'));
      });
    }
    addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    sync();
  })();

  armSpamTrap(form);
  if(form) form.addEventListener('submit', async e=>{
    e.preventDefault();
    if(looksLikeSpam(form)){
      fakeSuccess(form, 'Thanks, your request has been received. We will be in touch.');
      return;
    }
    if(!validate()) return;
    const submitBtn = form.querySelector('.submit');
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    let website = v('f-website');
    if(website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    /* MVP1: a FREE listing request. No account is created here and no keyword
       fee applies, a Pending application is filed and staff follow up by email.
       (The account/upgrade/pricing steps and their fields were removed; the
       full version is preserved in backups/mvp1-baseline-2026-08-25/.) */
    const base = {
      company: v('f-company'), contact: v('f-contact'),
      email: v('f-email'),          // the address staff reply to; the DB copies it to owner_email
      phone: v('f-phone'), website,
      logo: '',
      banner: false,
      badge: null,
      message: msg ? msg.value.trim() : '',
      terms: !!(document.getElementById('f-terms') && document.getElementById('f-terms').checked),
      status: 'Pending'
    };
    try {
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

      /* Uploads are best-effort: a failed logo/document upload must NEVER
         stop the request data from reaching the database. */
      base.docs = [];
      try{
        const logoFile = logoInput && logoInput.files && logoInput.files[0];
        if(logoFile) base.logo = await uploadLogo(logoFile);
      }catch(e){ console.warn('logo upload skipped', e); }
      try{
        for(const f of docFiles){ const d = await uploadDoc(f); if(d) base.docs.push(d); }
      }catch(e){ console.warn('doc upload skipped', e); }
      await addApplicationKeywords(base, keywords);
    } catch(err) {
      if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Request'; }
      alert('Sorry, we couldn’t submit your request right now. Please try again.');
      return;
    }
    /* Tell the founders a request came in, and send the requester a copy.
       Best-effort: the request is already saved and visible in the admin
       console, so a failed notification must not fail the submission. */
    const kwList = keywords.map(cleanKw).join(', ') || '(none)';
    const founderNotified = await sendFounderEmail('New Listing Request - ' + base.company, {
      company: base.company,
      contact: base.contact,
      email: base.email,
      phone: base.phone || '(not provided)',
      website: base.website || '(none)',
      logo: base.logo || '(none)',
      keywords: kwList,
      documentation: base.docs.length ? base.docs.map(d=>d.name).join(', ') : '(none)',
      ideas: base.message || '(none)'
    }, 'Thanks for your request to list ' + base.company + ' on Circuits.com! We received it and will respond within 1 business day.\n\n'
      + 'Here is a copy of what you sent:\n'
      + '- Company: ' + base.company + '\n'
      + '- Contact: ' + base.contact + '\n'
      + '- Email: ' + base.email + '\n'
      + '- Phone: ' + (base.phone || '(not provided)') + '\n'
      + '- Website: ' + (base.website || '(none)') + '\n'
      + '- Keywords: ' + kwList + '\n'
      + '- Documentation: ' + (base.docs.length ? base.docs.map(d=>d.name).join(', ') : '(none)') + '\n'
      + '- Ideas: ' + (base.message || '(none)') + '\n\n'
      + '- John & Mike, Circuits.com');
    if(!founderNotified) console.warn('founder notification not delivered; the request is still saved and visible in the admin console');
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Request'; }
    const ok = document.getElementById('success');
    ok.classList.add('show');
    form.reset();
    keywords = []; renderKw();
    logoUrl = null;
    clearDocs();
    updatePreviews();
    if(logoPrev) logoPrev.style.display='none';
    if(msgCount) msgCount.textContent='0 / 600';
    window.scrollTo({top:0,behavior:'smooth'});
  });
}

/* ===================================================================
   Password reset. One page, two jobs: ask for the link, and, when the
   person arrives back holding one, set the new password.
   =================================================================== */
async function initReset(){
  const el = id => document.getElementById(id);
  const show = (id, on) => { const n = el(id); if(n) n.style.display = on ? '' : 'none'; };
  if(!el('rq-card')) return;

  /* Supabase puts the recovery token in the URL fragment and swaps it for a
     session as the page loads, so wait for that before deciding which half
     of this page to show. */
  const looksLikeRecovery = /type=recovery|access_token|error_description/.test(location.hash || '')
    || /code=/.test(location.search || '');

  if(looksLikeRecovery){
    if(/error|expired|invalid/i.test(location.hash || '')){ show('rs-bad', true); return; }
    let user = null;
    for(let i = 0; i < 12 && !user; i++){          // ~3s, the exchange is usually instant
      user = await currentUser();
      if(!user) await new Promise(r => setTimeout(r, 250));
    }
    if(!user){ show('rs-bad', true); return; }

    /* An email-CONFIRMATION link is not a password reset. Someone who just
       confirmed their address already chose a password minutes ago, showing
       them the set-a-new-password sheet reads as "your password is gone".
       Only a recovery link or a staff invite (no password yet) gets that
       sheet; a confirmation gets a plain "you're confirmed" and the portal. */
    if(/type=(signup|email_change|magiclink)/.test(location.hash || '')){
      const rc = el('rs-confirmed-email');
      if(rc) rc.textContent = user.email || 'your account';
      show('rs-confirmed', true);
      return;
    }

    el('rs-email').textContent = user.email || 'your account';
    show('rs-card', true);

    const p1 = el('rs-pass'), p2 = el('rs-pass2'), match = el('rs-match');
    const check = () => {
      if(!p2.value){ match.textContent = ''; return false; }
      const ok = p1.value === p2.value;
      match.textContent = ok ? 'Passwords match.' : 'Passwords do not match.';
      match.style.color = ok ? '#3f6300' : '#b3261e';
      return ok;
    };
    p1.addEventListener('input', check);
    p2.addEventListener('input', check);

    el('rs-form').addEventListener('submit', async e => {
      e.preventDefault();
      const msg = el('rs-msg'), btn = el('rs-submit');
      msg.style.color = '#b3261e';
      if(p1.value.length < 8){ msg.textContent = 'Your password must be at least 8 characters.'; return; }
      if(p1.value !== p2.value){ msg.textContent = 'The two passwords do not match.'; return; }
      btn.disabled = true; msg.style.color = ''; msg.textContent = 'Saving…';
      const err = await setNewPassword(p1.value);
      if(err){ btn.disabled = false; msg.style.color = '#b3261e'; msg.textContent = err; return; }
      show('rs-card', false); show('rs-done', true);
    });
    return;
  }

  show('rq-card', true);
  el('rq-form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = el('rq-submit'), msg = el('rq-msg');
    const id = el('rq-id').value.trim();
    if(!id){ msg.textContent = 'Enter your email or username.'; msg.style.color = '#b3261e'; return; }
    if(id.includes('@') && !isValidEmail(id)){ msg.textContent = 'That email address looks incomplete. Check it and try again.'; msg.style.color = '#b3261e'; return; }
    btn.disabled = true; msg.style.color = ''; msg.textContent = 'Sending…';
    const err = await requestPasswordReset(id);
    /* An unknown account and a real one look identical, deliberately, but a
       send that actually failed says so, rather than sending them to wait by
       an inbox for a message that was never sent. */
    if(err){
      btn.disabled = false;
      msg.style.color = '#b3261e';
      msg.textContent = err;
      return;
    }
    show('rq-card', false); show('rq-sent', true);
  });
}

/* ===================================================================
   Get Listed, step 00, the account.
   Browsing needs no account; submitting a listing does. Rather than send
   people away to Register and lose the form they were filling in, the
   account is created (or signed into) in place, at the top of the flow.
   =================================================================== */
let JOIN_USER = null;      // the signed-in user, once we know

/* True once the form has been filled in from a company the signed-in user
   already owns. Lives here, not inside initJoin(), because both the form and
   adoptExistingCompany() read it, assigning to it from the wrong scope would
   just create a stray global that nothing checks. */
let JOIN_ADOPTED = false;

/* A supplier who already has a listing and comes back for a second keyword.
   Get Listed asks for a company name and a FREE username, and their own
   username is already taken, by them. Left alone they would be pushed into
   inventing a second one, and because the database matches an existing company
   by exact name, the smallest difference in spelling would hand them a second
   company and a second profile page.

   So: fill their details in and lock the identity fields. They are here to add
   a keyword, not to re-introduce themselves. */
async function adoptExistingCompany(){
  const el = id => document.getElementById(id);
  const name = el('f-company'), handle = el('f-handle');
  if(!name || !handle || typeof myCompanies !== 'function') return;

  /* my_companies() returns only slug and name, so the rest has to be read back
     from the company itself. */
  let co = null;
  try{
    const mine = await myCompanies();
    if(!mine || !mine.length) return;                 // no company yet: normal first-time flow
    co = await fetchCompany(mine[0].slug);
  }catch(e){ return; }
  if(!co || !co.handle) return;

  const lock = (input, value) => {
    if(!input || !value) return;
    input.value = value;
    input.readOnly = true;
    input.classList.add('is-locked');
  };
  lock(name, co.name);
  lock(handle, co.handle);

  /* Their own address is "taken", by them. The availability checker would call
     that unavailable and block the form, so it is switched off for a locked
     field. Reached by id: the checker's own variables belong to initJoin(). */
  JOIN_ADOPTED = true;
  const msg = el('handle-msg');
  if(msg){
    msg.textContent = 'circuits.com/' + co.handle + ' is your existing address.';
    msg.style.color = '#3f6300';
  }

  /* contact details are a convenience, not an identity, prefilled, still editable */
  const soft = (id, v) => { const f = el(id); if(f && !f.value && v) f.value = v; };
  soft('f-contact', co.contact); soft('f-phone', co.phone); soft('f-website', co.website);

  if(!el('f-adopted')){
    const hint = document.createElement('p');
    hint.className = 'pf-note';
    hint.id = 'f-adopted';
    hint.textContent = 'Adding a keyword to ' + co.name + '. Contact us if you need to list a different company.';
    name.parentNode.appendChild(hint);
  }
}

async function initJoinAccount(){
  const el = id => document.getElementById(id);
  const stepNew = el('acct-new'), stepLogin = el('acct-login'), done = el('acct-done');
  if(!stepNew) return;

  /* The username field stays put either way, it is the listing's address,
     not the account's, so a signed-in user still has to choose one. */
  async function refresh(){
    JOIN_USER = await currentUser();
    if(JOIN_USER){
      el('acct-email').textContent = JOIN_USER.email;
      done.style.display = ''; stepNew.style.display = 'none'; stepLogin.style.display = 'none';
      await adoptExistingCompany();
    }else{
      done.style.display = 'none'; stepNew.style.display = '';
    }
  }
  await refresh();

  el('acct-login-toggle').addEventListener('click', e => {
    e.preventDefault(); stepNew.style.display = 'none'; stepLogin.style.display = '';
  });
  el('acct-new-toggle').addEventListener('click', e => {
    e.preventDefault(); stepLogin.style.display = 'none'; stepNew.style.display = '';
  });
  el('acct-signout').addEventListener('click', async e => {
    e.preventDefault(); await signOut(); await refresh();
  });

  el('li-submit').addEventListener('click', async () => {
    const msg = el('li-msg'), btn = el('li-submit');
    const id = el('li-id').value.trim(), pass = el('li-pass').value;
    if(!id || !pass){ msg.textContent = 'Enter your email or username and password.'; msg.style.color = '#b3261e'; return; }
    btn.disabled = true; msg.textContent = 'Signing in…'; msg.style.color = '';
    const { error } = await signIn(id, pass);
    btn.disabled = false;
    if(error){ msg.textContent = error.message; msg.style.color = '#b3261e'; return; }
    msg.textContent = '';
    await refresh();
    const next = document.querySelector('#acct-step + .step');
    if(next) next.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ===================================================================
   Register, anyone may create a profile. This is not Get Listed:
   no company, no approval, no fee. The username IS the address.
   =================================================================== */
function initRegister(){
  const form = document.getElementById('reg-form');
  if(!form) return;
  const el = id => document.getElementById(id);
  const v  = id => (el(id) && el(id).value.trim()) || '';
  const handleInput = el('r-handle'), handleMsg = el('r-handle-msg');
  const passEl = el('r-pass'), pass2El = el('r-pass2'), passMsg = el('r-pass-msg');
  const errBox = el('r-err'), submitBtn = el('r-submit');
  /* Step one is the choice of account. Nothing else shows until a card is
     picked; the form is the same for both, only the labels change. */
  document.querySelectorAll('#reg-kind .reg-kind-card').forEach(card => card.addEventListener('click', () => {
    const kind = card.dataset.kind;
    document.querySelectorAll('#reg-kind .reg-kind-card').forEach(c => c.classList.toggle('active', c === card));
    el('r-kind').value = kind;
    el('reg-h2').textContent = kind === 'company' ? 'Register your company' : 'Register';
    el('r-name-label').innerHTML = kind === 'company' ? 'Company Name <span class="req">*</span>'
      : 'Display Name <span class="cell-muted" style="font-weight:400">(Optional)</span>';
    el('r-name').placeholder = kind === 'company' ? 'AAA Electronics' : 'Jacob Kennedy';
    form.style.display = ''; const next = el('reg-next'); if(next) next.style.display = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  let handleState = '', handleTimer = null;

  function fail(msg){
    errBox.textContent = msg || '';
    errBox.style.display = msg ? 'block' : 'none';
  }

  handleInput.addEventListener('input', ()=>{
    handleInput.value = handleInput.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    handleState = '';
    clearTimeout(handleTimer);
    if(!handleInput.value){ handleMsg.textContent = ''; return; }
    handleMsg.textContent = 'Checking…'; handleMsg.style.color = '';
    handleTimer = setTimeout(async ()=>{
      /* Ignore a slow answer for a prefix the user has already typed past. */
      const asked = handleInput.value;
      const why = await handleAvailable(asked);
      if(handleInput.value !== asked) return;
      handleState = why ? 'bad' : 'ok';
      handleMsg.textContent = why || ('circuits.com/' + asked + ' is available.');
      handleMsg.style.color = why ? '#b3261e' : '#3f6300';
    }, 400);
  });

  /* Two boxes, checked as you type, the password is set once here and there is
     no "resend" path if it is a typo. */
  function passwordsMatch(){
    if(!pass2El.value){ passMsg.textContent = ''; return false; }
    const ok = passEl.value === pass2El.value;
    passMsg.textContent = ok ? 'Passwords match.' : 'Passwords do not match.';
    passMsg.style.color = ok ? '#3f6300' : '#b3261e';
    return ok;
  }
  passEl.addEventListener('input', passwordsMatch);
  pass2El.addEventListener('input', passwordsMatch);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    fail('');
    const handle = v('r-handle'), email = v('r-email');

    if(!handle) return fail('Choose the username that will be your circuits.com address.');
    if(v('r-kind') === 'company' && !v('r-name')) return fail('Please enter your company name.');
    if(!isValidEmail(email)) return fail('Please enter a valid email address (e.g. you@company.com). It is how you sign in.');
    if(passEl.value.length < 8) return fail('Your password must be at least 8 characters.');
    if(passEl.value !== pass2El.value) return fail('The two passwords do not match.');
    if(!el('r-terms').checked) return fail('Please accept the Terms to continue.');

    submitBtn.disabled = true; submitBtn.textContent = 'Creating…';

    /* Re-check at submit: someone may have taken it while this form was open.
       The database trigger is the real guard, this is just a kinder message. */
    const why = await handleAvailable(handle);
    if(why){
      submitBtn.disabled = false; submitBtn.textContent = 'Create Profile';
      handleMsg.textContent = why; handleMsg.style.color = '#b3261e';
      handleInput.scrollIntoView({ behavior:'smooth', block:'center' });
      return fail('That address just became unavailable.');
    }

    const err = await registerProfile(email, passEl.value, handle, v('r-name'), v('r-kind'));
    if(err){
      submitBtn.disabled = false; submitBtn.textContent = 'Create Profile';
      return fail(/already registered|already exists/i.test(err)
        ? 'There is already an account with that email. Sign in instead.'
        : err);
    }

    form.style.display = 'none';
    const ok = el('reg-success');
    const okHandle = el('reg-success-handle');
    if(okHandle) okHandle.innerHTML = '<b>circuits.com/' + escapeHtml(handle) + '</b> is yours. ';
    if(ok) ok.style.display = 'block';
    window.scrollTo({ top:0, behavior:'smooth' });
  });
}
/* ===================================================================
   Browse, every claimed Circuits-Keyword™, A to Z.
   The homepage stays a bare search box on purpose; this is the page for
   the buyer who does not know the exact word yet. Test fixtures are
   filtered out in fetchKeywordIndex, so fake companies never show here.
   =================================================================== */
async function initBrowse(){
  const host = document.getElementById('browse-body');
  if(!host) return;
  host.innerHTML = loadingHtml('Loading keywords…');

  let index = [];
  try{ index = await fetchKeywordIndex(); }
  catch(e){ /* fetchKeywordIndex already returns [] on failure */ }

  if(!index.length){
    host.innerHTML = `<div class="empty">
      <div class="big">No keywords to browse yet</div>
      <p>Circuits.com is new. <a href="/register">Be the first company listed</a>,
      the first to claim a Circuits-Keyword&trade; holds its top position permanently.</p>
    </div>`;
    return;
  }

  const groups = new Map();
  for(const k of index){
    const letter = /^[a-z]/i.test(k.keyword) ? k.keyword[0].toUpperCase() : '#';
    if(!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(k);
  }

  host.innerHTML = [...groups.entries()].map(([letter, kws]) => `
    <section class="kw-group">
      <h2 class="kw-letter">${escapeHtml(letter)}</h2>
      <div class="kw-links">${kws.map(k =>
        `<a href="/results?q=${encodeURIComponent(k.keyword)}">${escapeHtml(k.keyword)}<span class="n">${k.companies}</span></a>`
      ).join('')}</div>
    </section>`).join('') + `
    <div class="claim-strip browse-cta">
      <div>
        <b>Don&rsquo;t see your keyword?</b>
        <p>Unclaimed Circuits-Keywords&trade; are first come, first served: the first company
        listed for one holds the top position permanently, for as long as the listing stays active.</p>
      </div>
      <a class="btn btn-primary" href="/register">Claim your keyword</a>
    </div>`;
}
/* end */
