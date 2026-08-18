/* ===== Circuits.com — public company profile =====
   Renders circuits.com/<handle>. See profileHandle() for where the handle
   comes from; profiles are reached from search results, not a browsable list. */

const DAYS = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];
const SOCIALS = [['linkedin','LinkedIn'],['x','X'],['facebook','Facebook'],['youtube','YouTube'],['instagram','Instagram'],['github','GitHub']];

/* Where the handle comes from, in order:
   1. the tag baked in by tools/build-profiles.js on a generated page
   2. ?c= on the shared template
   3. the URL itself — circuits.com/zzzelec — which is how 404.html resolves a
      profile whose static page has not been generated yet */
function profileHandle(){
  const meta = document.querySelector('meta[name="company-handle"]');
  if(meta && meta.content && meta.content !== '{{HANDLE}}') return meta.content;
  const q = new URLSearchParams(location.search).get('c');
  if(q) return q.toLowerCase();
  const m = location.pathname.match(/^\/([a-z0-9][a-z0-9_-]*)\/?$/i);
  return m ? m[1].toLowerCase() : '';
}

function stars(n){
  const full = Math.round(n);
  return '<span class="stars" aria-label="' + n.toFixed(1) + ' out of 5">'
    + '★★★★★'.slice(0, full) + '<span class="stars-off">' + '★★★★★'.slice(0, 5 - full) + '</span></span>';
}

function safeUrl(u){
  const s = (u || '').trim();
  if(!s) return '';
  if(/^https?:\/\//i.test(s)) return s;
  if(/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)) return 'https://' + s;
  return '';               // never emit javascript: or data: from stored text
}

/* A field only earns its place on the page if the value actually fits it.
   Someone typing a sentence into the phone box shouldn't produce a dead tel:
   link, and a pasted URL in the address box shouldn't stretch the sidebar. */
function looksPhone(v){
  const s = (v || '').trim();
  if(s.length > 32 || !/^[0-9+()\-.,\s]|ext/i.test(s)) return false;
  if(/[a-z]/i.test(s.replace(/ext\.?/ig, ''))) return false;
  return (s.match(/\d/g) || []).length >= 7;
}
function looksEmail(v){
  const s = (v || '').trim();
  return s.length <= 320 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(s);
}
/* one short line, no line breaks, not a URL someone pasted into the wrong box */
function fitsLine(v, max){
  const s = (v || '').trim();
  return !!s && s.length <= max && !/[\r\n]/.test(s) && !/^https?:\/\//i.test(s);
}

function section(title, inner, extra){
  if(!inner) return '';
  return `<section class="pf-sec"${extra || ''}><h2 class="pf-sec-h">${escapeHtml(title)}</h2>${inner}</section>`;
}

/* One contact row in the sidebar card. */
function row(label, value, opts){
  if(!value) return '';
  const o = opts || {};
  const inner = o.href
    ? `<a href="${escapeHtml(o.href)}"${o.id ? ` id="${o.id}"` : ''}${o.ext ? ' target="_blank" rel="noopener nofollow"' : ''}>${escapeHtml(value)}</a>`
    : escapeHtml(value);
  // title carries the full value, since long emails and URLs are truncated
  return `<div class="pf-row"><span class="pf-row-l">${escapeHtml(label)}</span>`
       + `<span class="pf-row-v" title="${escapeHtml(value)}">${inner}</span></div>`;
}

/* A person's profile. Deliberately thin: a profile is an identity and a link,
   not a listing. Anything commercial lives on a company listing they claim. */
function personProfile(p){
  const name = p.display_name || p.handle;
  document.title = name + ' — Profile | Circuits.com';
  setMeta('description', name + ' on Circuits.com.');
  return `
  <div class="pf-head">
    <div class="pf-logo">${avatarSvg()}</div>
    <div class="pf-id">
      <h1>${escapeHtml(name)}</h1>
      <p class="pf-tagline">circuits.com/${escapeHtml(p.handle)}</p>
    </div>
  </div>
  <div class="pf-layout"><div class="pf-main">
    ${section('About', `<p class="pf-prose">This is a Circuits.com profile. Profiles are people;
      company listings are separate, and a profile can claim one to manage it.</p>`)}
  </div>
  <aside class="pf-side">
    <div class="pf-side-card">
      <button type="button" class="pf-copy" id="pf-copy" data-url="https://circuits.com/${escapeHtml(p.handle)}">
        <span>circuits.com/${escapeHtml(p.handle)}</span><b>Copy</b>
      </button>
    </div>
    <p class="pf-claim">Is this you? <a href="/portal">Sign in</a> to manage your profile.</p>
  </aside></div>`;
}

async function initProfile(){
  const handle = profileHandle();
  const root = document.getElementById('profile-body');
  if(!handle){ root.innerHTML = notFound(''); return false; }

  /* One namespace, two kinds of occupant. A company listing takes priority
     because it is the older claim; a person's profile is checked next.
     A failed lookup must never reach notFound() — that page tells the visitor
     the address is free to claim, and this address may well belong to someone. */
  let co, person;
  try {
    co = await fetchCompanyByHandle(handle);
    if(!co) person = await fetchProfileByHandle(handle);
  } catch(err){
    console.error('profile lookup failed', err);
    root.innerHTML = loadErrorHtml('circuits.com/' + handle);
    return false;
  }
  if(!co){
    if(person){ root.innerHTML = personProfile(person); wireCopyLink(); return true; }
    root.innerHTML = notFound(handle);
    return false;
  }

  const slug = co.slug;   // internal key: everything else still hangs off this
  const [kws, reviews, claimed, staffRun] = await Promise.all([
    fetchCompanyKeywords(slug), fetchReviews(slug), companyClaimed(slug), companyRunByStaff(slug)
  ]);

  const docs = [];
  const seenDoc = new Set();
  for(const k of kws) for(const d of (Array.isArray(k.docs) ? k.docs : []))
    if(d && d.url && !seenDoc.has(d.url)){ seenDoc.add(d.url); docs.push(d); }

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const site = safeUrl(co.website);

  document.title = co.name + ' — Profile | Circuits.com';
  setMeta('description', (co.tagline || co.description || (co.name + ' on the Circuits.com directory.')).slice(0, 155));

  /* ---- hero ---- */
  const logo = isLogoUrl(co.logo)
    ? `<img src="${escapeHtml(co.logo)}" alt="${escapeHtml(co.name)} logo">`
    : avatarSvg();

  let html = `
  <div class="pf-head">
    <div class="pf-logo">${logo}</div>
    <div class="pf-id">
      <h1>${escapeHtml(co.name)}${staffRun ? ' ' + badgeHtml({ text: 'Circuits.com' }) : ''}${claimed ? '' : ' <span class="lb lb-unclaimed">Unclaimed</span>'}</h1>
      ${co.tagline ? `<p class="pf-tagline">${escapeHtml(co.tagline)}</p>` : ''}
      <div class="pf-meta">
        ${reviews.length ? `<span class="pf-rating">${stars(avg)} ${avg.toFixed(1)} <i>(${reviews.length})</i></span>` : ''}
        ${fitsLine(co.address, 60) ? `<span class="pf-chip">${escapeHtml(co.address)}</span>` : ''}
        ${/^\d{4}$/.test((co.founded || '').trim()) ? `<span class="pf-chip">Est. ${escapeHtml(co.founded.trim())}</span>` : ''}
        ${fitsLine(co.employees, 20) ? `<span class="pf-chip">${escapeHtml(co.employees)} employees</span>` : ''}
      </div>
    </div>
  </div>
  <div class="pf-layout"><div class="pf-main">`;

  /* ---- about ---- */
  html += section('About ' + co.name, co.description
    ? `<p class="pf-prose">${escapeHtml(co.description).replace(/\n+/g, '</p><p class="pf-prose">')}</p>` : '');

  /* ---- keywords ----
     The badge belongs against the keyword it applies to — "PCB Design
     (Authorized)", not "Jacob (Authorized)".

     It is also a PAID label the company chose for itself, so it is marked as
     one. A buyer deciding who to trust must be able to tell the difference
     between this and a certification somebody actually assessed. The wording
     is deliberately plain; a subtle visual difference alone would not do it. */
  // the note is about PAID badges; our own mark is not one, so it must not
  // trigger a disclaimer saying the company chose and paid for it
  const anyBadge = kws.some(k => k.badge && !isCircuitsBadge(k.badge));
  html += section('Keyword Listings', kws.length
    ? `<div class="kw-tags pf-kws">${kws.map(k =>
        `<a class="kw-tag" href="/results?q=${encodeURIComponent(k.keyword)}">${escapeHtml(k.keyword)}${k.banner ? ' ★' : ''}`
        + badgeHtml(k.badge, 'kw-lb')
        + `</a>`
      ).join('')}</div>
      <p class="pf-note">★ marks a Circuits-Keyword&trade; this company exclusively sponsors.</p>`
    : '');

  /* ---- documents ---- */
  html += section('Documentation', docs.length
    ? `<ul class="pf-docs">${docs.map(d =>
        `<li><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" data-doc>${escapeHtml(d.name || 'Document')}</a></li>`
      ).join('')}</ul>` : '');

  /* ---- gallery ---- */
  const gallery = Array.isArray(co.gallery) ? co.gallery : [];
  html += section('Gallery', gallery.length
    ? `<div class="pf-gallery">${gallery.map(g =>
        `<figure><img src="${escapeHtml(g.url)}" alt="${escapeHtml(g.caption || co.name)}" loading="lazy"
           data-full="${escapeHtml(g.url)}" data-cap="${escapeHtml(g.caption || '')}">
         ${g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''}</figure>`
      ).join('')}</div>` : '');

  /* ---- certifications ----
     These are typed in by the company. Nobody at Circuits.com checks them, and
     a buyer choosing a supplier on the strength of "ISO 9001" deserves to know
     that. So the section says whose claim it is, and points at the evidence
     when the company has actually attached a certificate. Presenting an
     unchecked claim as established fact would be the same mistake the Trust
     Badge used to make. */
  /* section() escapes the title, so pass a plain ampersand — passing &amp;
     here rendered literally as "Certifications &amp; approvals" on the page.
     Rows with no name are dropped: the repeater leaves blanks behind, and an
     empty <li> shows up as a stray bullet. */
  const certs = (Array.isArray(co.certifications) ? co.certifications : [])
    .filter(c => c && (c.name || '').trim());
  const certDoc = name => docs.find(d =>
    (d.name || '').toLowerCase().includes((name || '').toLowerCase().slice(0, 12)) && (name || '').length > 3);
  /* The tooltip carries the caveat instead of a paragraph under the list. The
     full explanation lives in the Terms, linked once at the foot of the page. */
  html += section('Certifications & approvals', certs.length
    ? `<ul class="pf-certs" title="Listed by the company. Circuits.com has not checked these.">${certs.map(c => {
        const doc = certDoc(c.name);
        return `<li><b>${escapeHtml(c.name.trim())}</b>`
          + (c.issuer ? ` — ${escapeHtml(c.issuer)}` : '')
          + (c.year ? ` (${escapeHtml(String(c.year))})` : '')
          + (doc && doc.url
              ? ` <a class="doc-link" href="${escapeHtml(safeUrl(doc.url))}" target="_blank" rel="noopener nofollow">certificate</a>`
              : '')
          + `</li>`;
      }).join('')}</ul>` : '');

  /* ---- team ---- */
  const team = Array.isArray(co.team) ? co.team : [];
  html += section('Team', team.length
    ? `<div class="pf-team">${team.map(t => `
        <div class="founder-card">
          <div class="founder-avatar">${t.photo ? `<img src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name || '')}">` : escapeHtml((t.name || '?').slice(0, 1).toUpperCase())}</div>
          <div><div class="founder-name">${escapeHtml(t.name || '')}</div>
          <div class="founder-role">${escapeHtml(t.role || '')}</div>
          ${t.email ? `<a class="founder-line" href="mailto:${escapeHtml(t.email)}">${escapeHtml(t.email)}</a>` : ''}</div>
        </div>`).join('')}</div>` : '');

  /* ---- reviews ----
     Reviews are off by default. If a company has them switched off, the whole
     section stays out of the page rather than advertising an empty one. */
  html += (co.reviews_enabled || reviews.length) ? section('Buyer reviews', `
    ${reviews.length ? `<div class="pf-reviews">${reviews.map(r => `
      <div class="pf-review">
        <div class="pf-review-head">${stars(r.rating)} <b>${escapeHtml(r.author_name)}</b>
          <span class="pf-note">${new Date(r.created_at).toLocaleDateString()}</span></div>
        <p>${escapeHtml(r.body)}</p>
        ${r.reply ? `<div class="pf-reply"><b>${escapeHtml(co.name)} replied:</b> ${escapeHtml(r.reply)}</div>` : ''}
      </div>`).join('')}</div>` : '<p class="empty-line">No reviews yet. Be the first to review this supplier.</p>'}
    ${co.reviews_enabled ? reviewForm() : ''}`) : '';

  /* ---- RFQ ---- */
  html += rfqForm(co);

  /* ---- sidebar: one place for everything a buyer needs to act ---- */
  const hours = co.hours && typeof co.hours === 'object' ? co.hours : {};
  const openDays = DAYS.filter(([k]) => hours[k]);

  html += `</div><aside class="pf-side">
    <div class="pf-side-card">
      <button class="btn btn-primary pf-cta" id="rfq-open">Request a Quote</button>
      <button type="button" class="btn pf-save" id="pf-save"
              data-slug="${escapeHtml(co.slug)}" data-handle="${escapeHtml(co.handle || '')}"
              data-name="${escapeHtml(co.name)}">Save this supplier</button>
      <button type="button" class="pf-copy" id="pf-copy" data-url="https://circuits.com/${escapeHtml(co.handle)}">
        <span>circuits.com/${escapeHtml(co.handle)}</span><b>Copy</b>
      </button>
      <div class="pf-rows">
        ${fitsLine(co.contact, 80) ? row('Contact', co.contact) : ''}
        ${looksPhone(co.phone) ? row('Phone', co.phone, { href: 'tel:' + co.phone.replace(/[^\d+]/g, ''), id: 'pf-phone' }) : ''}
        ${looksEmail(co.email) ? row('Email', co.email, { href: 'mailto:' + co.email.trim(), id: 'pf-email' }) : ''}
        ${site ? row('Website', site.replace(/^https?:\/\//, '').replace(/\/$/, ''), { href: site, id: 'pf-site', ext: true }) : ''}
        ${fitsLine(co.address, 120) ? row('Address', co.address) : ''}
      </div>
      ${socialLinks(co.socials)}
    </div>

    ${openDays.length ? `<div class="pf-side-card">
      <h2 class="pf-sec-h">Opening hours</h2>
      <div class="pf-rows">${openDays.map(([k, label]) =>
        `<div class="pf-row"><span class="pf-row-l">${label}</span><span class="pf-row-v">${escapeHtml(hours[k])}</span></div>`
      ).join('')}</div>
    </div>` : ''}

    ${claimed
      ? `<p class="pf-claim">Is this your company's listing?
           <a href="/claim?c=${encodeURIComponent(co.handle)}">Claim this listing</a>
           to manage it from your Circuits.com profile.</p>`
      : `<div class="pf-unclaimed-card">
           <b>This listing is unclaimed.</b>
           <p>Nobody has connected a Circuits.com account to ${escapeHtml(co.name)} yet, so the
           details here have not been confirmed by the company.</p>
           <a class="btn btn-primary auth-cta" href="/claim?c=${encodeURIComponent(co.handle)}">Claim this listing</a>
         </div>`}
  </aside></div>
  <p class="pf-source">Details, certifications and badges on this page are supplied by the company.
    <a href="/terms#what-we-check">What Circuits.com checks</a></p>`;

  root.innerHTML = html;
  jsonLd(co, avg, reviews.length, site);
  wireProfile(slug, co);
  return true;
}

/* Full-size image overlay. Closes on click, on Esc, or with the button. */
function openLightbox(src, caption){
  const box = document.createElement('div');
  box.className = 'pf-lb';
  box.innerHTML = `<button class="pf-lb-x" aria-label="Close">×</button>
    <img src="${escapeHtml(src)}" alt="${escapeHtml(caption || '')}">
    ${caption ? `<p class="pf-lb-cap">${escapeHtml(caption)}</p>` : ''}`;

  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  };
  const onKey = e => { if(e.key === 'Escape') close(); };

  box.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(box);
  box.querySelector('.pf-lb-x').focus();
}

function socialLinks(socials){
  const s = socials && typeof socials === 'object' ? socials : {};
  const links = SOCIALS.filter(([k]) => safeUrl(s[k]))
    .map(([k, label]) => `<a href="${escapeHtml(safeUrl(s[k]))}" target="_blank" rel="noopener nofollow">${label}</a>`);
  return links.length ? `<div class="pf-socials">${links.join('')}</div>` : '';
}

function reviewForm(){
  return `
  <form class="pf-form" id="review-form" autocomplete="off">
    <h3>Leave a review</h3>
    <div class="form-row">
      <div class="auth-field"><label>Your name</label><input id="rv-name" type="text" required maxlength="80"></div>
      <div class="auth-field"><label>Your email <span class="pf-note">(not published)</span></label><input id="rv-email" type="email" required></div>
      <div class="auth-field"><label>Rating</label>
        <select id="rv-rating">${[5,4,3,2,1].map(n => `<option value="${n}">${'★'.repeat(n)} (${n})</option>`).join('')}</select>
      </div>
    </div>
    <div class="auth-field"><label>Your experience</label><textarea id="rv-body" rows="4" maxlength="1500" required></textarea></div>
    <div id="rv-msg" class="err-msg"></div>
    <button class="mini-btn green" type="submit">Submit review</button>
    <p class="pf-note">Reviews are checked by Circuits.com before they appear.</p>
  </form>`;
}

function rfqForm(co){
  return `
  <section class="pf-sec" id="rfq">
    <h2 class="pf-sec-h">Request a quote from ${escapeHtml(co.name)}</h2>
    <form class="pf-form" id="rfq-form" autocomplete="off">
      <div class="form-row">
        <div class="auth-field"><label>Your name *</label><input id="rq-name" type="text" required maxlength="80"></div>
        <div class="auth-field"><label>Your email *</label><input id="rq-email" type="email" required></div>
        <div class="auth-field"><label>Company</label><input id="rq-company" type="text" maxlength="120"></div>
      </div>
      <div class="form-row">
        <div class="auth-field"><label>Phone</label><input id="rq-phone" type="text" maxlength="40"></div>
        <div class="auth-field"><label>Part number</label><input id="rq-pn" type="text" maxlength="80"></div>
        <div class="auth-field"><label>Quantity</label><input id="rq-qty" type="text" maxlength="40"></div>
      </div>
      <div class="auth-field"><label>What do you need? *</label><textarea id="rq-body" rows="5" maxlength="4000" required></textarea></div>
      <div id="rq-msg" class="err-msg"></div>
      <button class="btn btn-primary" type="submit" id="rq-submit">Send request</button>
      <p class="pf-note">Your request goes straight to this supplier. Circuits.com never charges buyers.</p>
    </form>
  </section>`;
}

function notFound(handle){
  return `<div class="empty"><div class="big">No profile at circuits.com/${escapeHtml(handle)}</div>
    <p>That name is not taken yet. <a href="/join">Claim it here</a>, or <a href="/directory">browse the directory</a>.</p></div>`;
}

function setMeta(name, content){
  let m = document.querySelector(`meta[name="${name}"]`);
  if(!m){ m = document.createElement('meta'); m.name = name; document.head.appendChild(m); }
  m.content = content;
}

/* Organization + AggregateRating structured data so the profile can win a
   rich result rather than a plain blue link. */
function jsonLd(co, avg, count, site){
  const data = {
    '@context': 'https://schema.org', '@type': 'Organization',
    name: co.name,
    url: 'https://circuits.com/' + co.handle,
    description: co.description || co.tagline || undefined,
    logo: isLogoUrl(co.logo) ? co.logo : undefined,
    sameAs: site ? [site] : undefined,
    telephone: co.phone || undefined,
    email: co.email || undefined,
    address: co.address || undefined
  };
  if(count) data.aggregateRating = { '@type': 'AggregateRating', ratingValue: avg.toFixed(1), reviewCount: count };
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.textContent = JSON.stringify(data, (k, v) => v === undefined ? undefined : v);
  document.head.appendChild(s);
}

function wireProfile(slug, co){
  trackEvent(slug, 'view');

  /* Gallery photos open full size — a 140px thumbnail of a warehouse tells a
     buyer nothing. */
  document.querySelectorAll('.pf-gallery img[data-full]').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.dataset.full, img.dataset.cap));
  });

  wireCopyLink();
  wireSave();
}

/* ---- saved suppliers ----
   A buyer comparing five distributors needs somewhere to put them, and making
   them create an account first would lose most of them. This lives in their
   own browser: no account, no server, nothing sent to us, so it is not
   tracking and needs no consent. The trade-off is honest and stated — it does
   not follow them to another device. */
const SAVED_KEY = 'cx_saved';

function savedList(){
  try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch(e){ return []; }
}
function isSaved(slug){ return savedList().some(c => c.slug === slug); }
function toggleSaved(entry){
  const list = savedList();
  const i = list.findIndex(c => c.slug === entry.slug);
  if(i >= 0) list.splice(i, 1);
  else list.unshift({ slug: entry.slug, handle: entry.handle, name: entry.name, at: Date.now() });
  try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 50))); }
  catch(e){ console.warn('could not save', e); }   // private mode, quota, etc.
  return i < 0;
}

function wireSave(){
  const btn = document.getElementById('pf-save');
  if(!btn) return;
  const entry = { slug: btn.dataset.slug, handle: btn.dataset.handle, name: btn.dataset.name };
  const paint = () => {
    const on = isSaved(entry.slug);
    btn.textContent = on ? 'Saved ✓' : 'Save this supplier';
    btn.classList.toggle('is-saved', on);
    btn.title = on
      ? 'Saved in this browser only. Click to remove.'
      : 'Keeps this supplier in a list in this browser. No account needed.';
  };
  btn.addEventListener('click', () => { toggleSaved(entry); paint(); });
  paint();
}

/* Copy the short link — this is what goes on adverts and email signatures.
   Person profiles need it too, and they never reach wireProfile(). */
function wireCopyLink(){
  const copy = document.getElementById('pf-copy');
  if(copy) copy.addEventListener('click', async () => {
    const label = copy.querySelector('b');
    try{
      await navigator.clipboard.writeText(copy.dataset.url);
      label.textContent = 'Copied';
    }catch(e){
      /* clipboard blocked (http, permissions) — select it so Ctrl+C still works */
      const r = document.createRange();
      r.selectNodeContents(copy.querySelector('span'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      label.textContent = 'Press Ctrl+C';
    }
    setTimeout(() => { label.textContent = 'Copy'; }, 2200);
  });
  const hit = (id, kind) => { const el = document.getElementById(id); if(el) el.addEventListener('click', () => trackEvent(slug, kind)); };
  hit('pf-site', 'website'); hit('pf-phone', 'phone'); hit('pf-email', 'email');
  document.querySelectorAll('[data-doc]').forEach(a => a.addEventListener('click', () => trackEvent(slug, 'doc')));

  const open = document.getElementById('rfq-open');
  if(open) open.addEventListener('click', () => {
    document.getElementById('rfq').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('rq-name').focus({ preventScroll: true });
  });

  const rf = document.getElementById('rfq-form');
  armSpamTrap(rf);
  if(rf) rf.addEventListener('submit', async e => {
    e.preventDefault();
    if(looksLikeSpam(rf)){ fakeSuccess(rf, 'Request sent.'); return; }
    const v = id => (document.getElementById(id).value || '').trim();
    const msg = document.getElementById('rq-msg');
    if(!isValidEmail(v('rq-email'))){ msg.textContent = 'Please enter a valid email address.'; return; }
    const btn = document.getElementById('rq-submit');
    btn.disabled = true; msg.textContent = '';
    try{
      await submitInquiry(slug, {
        name: v('rq-name'), email: v('rq-email'), company: v('rq-company'), phone: v('rq-phone'),
        part_number: v('rq-pn'), quantity: v('rq-qty'), body: v('rq-body'),
        subject: 'Quote request via Circuits.com'
      });
      trackEvent(slug, 'rfq');

      /* The supplier themselves — the whole point of the product. Goes through
         our own sending service because FormSubmit can only deliver to
         addresses that have confirmed themselves, which a customer's address
         has not. Deliberately not awaited: the request is already saved and
         will appear in their portal regardless. */
      notifySupplier(slug, {
        name: v('rq-name'), email: v('rq-email'), company: v('rq-company'),
        phone: v('rq-phone'), part_number: v('rq-pn'), quantity: v('rq-qty'), body: v('rq-body')
      });

      /* and the founders, so nothing is missed while the above beds in */
      sendFounderEmail('New quote request — ' + co.name, {
        supplier: co.name, supplier_email: co.email || '(none)', name: v('rq-name'),
        email: v('rq-email'), company: v('rq-company') || '(none)', phone: v('rq-phone') || '(none)',
        part_number: v('rq-pn') || '(none)', quantity: v('rq-qty') || '(none)', message: v('rq-body')
      }, 'Thanks — your quote request has been sent to ' + co.name + ' via Circuits.com. They typically reply directly to this email address.');
      rf.innerHTML = '<div class="success show">Request sent. ' + escapeHtml(co.name) + ' will reply to you directly.</div>';
    }catch(err){
      btn.disabled = false;
      msg.textContent = rateLimitMessage(err)
        || 'Sorry, that didn’t send. Please try again or email the supplier directly.';
    }
  });

  const rv = document.getElementById('review-form');
  armSpamTrap(rv);
  if(rv) rv.addEventListener('submit', async e => {
    e.preventDefault();
    if(looksLikeSpam(rv)){ fakeSuccess(rv, 'Thanks. Your review is with our team for checking.'); return; }
    const v = id => (document.getElementById(id).value || '').trim();
    const msg = document.getElementById('rv-msg');
    if(!isValidEmail(v('rv-email'))){ msg.textContent = 'Please enter a valid email address.'; return; }
    try{
      await submitReview(slug, { name: v('rv-name'), email: v('rv-email'), rating: +v('rv-rating'), body: v('rv-body') });
      rv.innerHTML = '<div class="success show">Thanks. Your review is with our team for checking.</div>';
    }catch(err){
      msg.textContent = rateLimitMessage(err) || 'Sorry, that didn’t send. Please try again.';
    }
  });
}
