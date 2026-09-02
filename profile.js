/* ===== Circuits.com — public company profile =====
   Renders circuits.com/<handle>. See profileHandle() for where the handle
   comes from; profiles are reached from search results, not a browsable list. */

/* (opening hours removed 2026-08-20 — the DAYS table went with them) */
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
function personProfile(p, staffRun){
  const name = p.display_name || p.handle;
  document.title = name + ' — Profile | Circuits.com';
  setMeta('description', name + ' on Circuits.com.');
  return `
  <div class="pf-head">
    <div class="pf-logo">${avatarSvg()}</div>
    <div class="pf-id">
      <h1>${escapeHtml(name)}${staffRun ? ' ' + teamMarkHtml() : ''}</h1>
      <p class="pf-tagline">circuits.com/${escapeHtml(p.handle)}</p>
    </div>
  </div>
  <div class="pf-layout"><div class="pf-main">
    ${p.title || p.bio || (p.years != null)
      ? section('About', `${p.title ? `<p class="pf-prose"><b>${escapeHtml(p.title)}</b>${p.years != null ? ` &middot; ${p.years} year${p.years === 1 ? '' : 's'} of experience` : ''}</p>` : ''}
          ${p.bio ? `<p class="pf-prose">${escapeHtml(p.bio)}</p>` : ''}`)
      : section('About', `<p class="pf-prose">This is a Circuits.com profile. Profiles are people;
      company listings are separate, and a profile can claim one to manage it.</p>`)}
    ${(p.keywords || []).length ? section('Keywords', `<div class="kw-tags">${p.keywords.map(k => `<span class="kw-tag">${escapeHtml(k)}</span>`).join('')}</div>`) : ''}
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
    if(!co){
      person = await fetchProfileByHandle(handle);
      if(person && typeof fetchTalentKeywords === 'function') person.keywords = await fetchTalentKeywords(person.user_id);
    }
  } catch(err){
    console.error('profile lookup failed', err);
    root.innerHTML = loadErrorHtml('circuits.com/' + handle);
    return false;
  }
  if(!co){
    if(person){
      /* the Circuits.com mark on an admin's own page — same database-decided
         rule as on staff-run company profiles */
      const staffRun = await profileRunByStaff(person.handle).catch(() => false);
      root.innerHTML = personProfile(person, staffRun); wireCopyLink(); return true;
    }
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
      <h1>${escapeHtml(co.name)}${staffRun ? ' ' + teamMarkHtml() : ''}${claimed ? '' : ' <span class="lb lb-unclaimed">Unclaimed</span>'}</h1>
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
  /* Only explain the star when there is a star to explain. fetchCompanyKeywords
     already drops paused and unapproved listings, so a banner here is a live
     sponsorship — a company with none never sees a note about one. */
  /* Each tag walks the visitor to the results page for that keyword and
     highlights this company's row there (?hl= picks it out) — the listing is
     where the position, the sponsor banner and the quote button live. */
  const anyBanner = kws.some(k => k.banner);
  html += section('Keyword Listings', kws.length
    ? `<div class="kw-tags pf-kws">${kws.map(k =>
        `<a class="kw-tag" href="/results?q=${encodeURIComponent(k.keyword)}&hl=${encodeURIComponent(slug)}">${escapeHtml(k.keyword)}${k.banner ? ' ★' : ''}`
        + badgeHtml(k.badge, 'kw-lb')
        + `</a>`
      ).join('')}</div>`
      + (anyBanner ? `<p class="pf-note">★ marks a Circuits-Keyword&trade; this company exclusively sponsors.</p>` : '')
    : '');

  /* Listing documents deliberately do NOT get their own section here — they
     belong to the keyword listing, not the profile. The only place one may
     surface is as evidence behind a certification below. */

  /* ---- one section per keyword listing (2026-09-02) ----
     Certifications, team, gallery and buyer reviews belong to the listing, not
     the company: a distributor's "PCB Assembly" listing shows its IPC people
     and its line photos; its "Connectors" listing shows something else. */
  const byListing = {};
  for(const r of reviews) (byListing[r.application_id || ''] = byListing[r.application_id || ''] || []).push(r);
  const certDoc = (ldocs, name) => ldocs.find(d =>
    (d.name || '').toLowerCase().includes((name || '').toLowerCase().slice(0, 12)) && (name || '').length > 3);
  for(const k of kws){
    const ldocs = (Array.isArray(k.docs) ? k.docs : []).filter(d => d && d.url);
    const gallery = Array.isArray(k.gallery) ? k.gallery.filter(g => g && g.url) : [];
    const certs = (Array.isArray(k.certifications) ? k.certifications : []).filter(c => c && (c.name || '').trim());
    const team = (Array.isArray(k.team) ? k.team : []).filter(t => t && ((t.name || '').trim() || t.photo));
    const rv = byListing[k.id] || [];
    let inner = '';
    if(k.description) inner += `<p class="pf-prose">${escapeHtml(k.description)}</p>`;
    if(ldocs.length) inner += `<p class="pf-ldocs">${ldocs.map(d =>
      `<a class="doc-link" href="${escapeHtml(safeUrl(d.url))}" target="_blank" rel="noopener nofollow">${escapeHtml(d.name || 'Document')}</a>`).join(' ')}</p>`;
    if(gallery.length) inner += `<h3 class="pf-sub">Gallery</h3><div class="pf-gallery">${gallery.map(g =>
        `<figure><img src="${escapeHtml(g.url)}" alt="${escapeHtml(g.caption || co.name)}" loading="lazy"
           data-full="${escapeHtml(g.url)}" data-cap="${escapeHtml(g.caption || '')}">
         ${g.caption ? `<figcaption>${escapeHtml(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`;
    /* Certifications are typed in by the company. Nobody at Circuits.com checks
       them, so the tooltip says whose claim it is and the row points at the
       evidence when a matching certificate is attached to this listing. */
    if(certs.length) inner += `<h3 class="pf-sub">Certifications &amp; approvals</h3>
      <ul class="pf-certs" title="Listed by the company. Circuits.com has not checked these.">${certs.map(c => {
        const doc = certDoc(ldocs, c.name);
        return `<li><b>${escapeHtml(c.name.trim())}</b>`
          + (c.issuer ? ` — ${escapeHtml(c.issuer)}` : '')
          + (c.year ? ` (${escapeHtml(String(c.year))})` : '')
          + (doc ? ` <a class="doc-link" href="${escapeHtml(safeUrl(doc.url))}" target="_blank" rel="noopener nofollow">certificate</a>` : '')
          + `</li>`;
      }).join('')}</ul>`;
    if(team.length) inner += `<h3 class="pf-sub">Team</h3><div class="pf-team">${team.map(t => `
        <div class="founder-card">
          <div class="founder-avatar">${t.photo ? `<img src="${escapeHtml(t.photo)}" alt="${escapeHtml(t.name || '')}">` : escapeHtml((t.name || '?').slice(0, 1).toUpperCase())}</div>
          <div><div class="founder-name">${escapeHtml(t.name || '')}</div>
          <div class="founder-role">${escapeHtml(t.role || '')}</div>
          ${t.email ? `<a class="founder-line" href="mailto:${escapeHtml(t.email)}">${escapeHtml(t.email)}</a>` : ''}</div>
        </div>`).join('')}</div>`;
    /* Reviews are off by default per listing; a listing with them off and none
       approved shows no review section at all. */
    if(k.reviews_enabled || rv.length) inner += `<h3 class="pf-sub">Buyer reviews</h3>
      ${rv.length ? `<div class="pf-reviews">${rv.map(r => `
      <div class="pf-review">
        <div class="pf-review-head">${stars(r.rating)} <b>${escapeHtml(r.author_name)}</b>
          <span class="pf-note">${new Date(r.created_at).toLocaleDateString()}</span></div>
        <p>${escapeHtml(r.body)}</p>
        ${r.reply ? `<div class="pf-reply"><b>${escapeHtml(co.name)} replied:</b> ${escapeHtml(r.reply)}</div>` : ''}
      </div>`).join('')}</div>` : '<p class="empty-line">No reviews yet. Be the first to review this listing.</p>'}
      ${k.reviews_enabled ? reviewForm(k.id) : ''}`;
    if(!inner) continue;
    html += `<section class="pf-sec pf-listing" id="kw-${escapeHtml(k.id)}">
      <h2 class="pf-sec-h"><a href="/results?q=${encodeURIComponent(k.keyword)}&hl=${encodeURIComponent(slug)}" class="tc">${escapeHtml(k.keyword)}</a>${k.banner ? ' ★' : ''}${badgeHtml(k.badge, 'kw-lb')}</h2>
      ${inner}</section>`;
  }

  /* The in-page quote form is OFF (Jacob, 2026-08-21: "Request a quote part
     of the profile should be removed. Just make it provide their emails and
     stuff"). rfqForm() and its wiring stay below, dormant, in case it comes
     back — buyers now reach the company by the contact details themselves. */

  /* ---- sidebar: one place for everything a buyer needs to act ---- */
  html += `</div><aside class="pf-side">
    <div class="pf-side-card">
      ${looksEmail(co.email)
        ? `<a class="btn btn-primary pf-cta" id="pf-email-cta"
             href="mailto:${escapeHtml(co.email.trim())}?subject=${encodeURIComponent('Enquiry via Circuits.com — ' + co.name)}">Email ${escapeHtml(co.name)}</a>`
        : ''}
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

    ${claimed
      ? ''
      : `<div class="pf-unclaimed-card">
           <b>This listing is unclaimed.</b>
           <p>Nobody has connected a Circuits.com account to ${escapeHtml(co.name)} yet, so the
           details here have not been confirmed by the company.</p>
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

function reviewForm(appId){
  return `
  <form class="pf-form review-form" data-app="${escapeHtml(appId)}" autocomplete="off">
    <h3>Leave a review</h3>
    <div class="form-row">
      <div class="auth-field"><label>Your name</label><input class="rv-name" type="text" required maxlength="80"></div>
      <div class="auth-field"><label>Your email <span class="pf-note">(not published)</span></label><input class="rv-email" type="email" required></div>
      <div class="auth-field"><label>Rating</label>
        <select class="rv-rating">${[5,4,3,2,1].map(n => `<option value="${n}">${'★'.repeat(n)} (${n})</option>`).join('')}</select>
      </div>
    </div>
    <div class="auth-field"><label>Your experience</label><textarea class="rv-body" rows="4" maxlength="1500" required></textarea></div>
    <div class="err-msg rv-msg"></div>
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
    <p>That name is not taken yet. <a href="/join">Claim it here</a>, or <a href="/">search for a company</a>.</p></div>`;
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

  /* Everything below needs `slug` and `co`, so it belongs to wireProfile. It
     once sat in wireCopyLink() because that function was missing its closing
     brace, which put the quote form out of reach of the company it was for:
     every request threw on `slug` and the buyer was told it had not sent. */
  const hit = (id, kind) => { const el = document.getElementById(id); if(el) el.addEventListener('click', () => trackEvent(slug, kind)); };
  hit('pf-site', 'website'); hit('pf-phone', 'phone'); hit('pf-email', 'email');
  hit('pf-email-cta', 'email');
  document.querySelectorAll('[data-doc]').forEach(a => a.addEventListener('click', () => trackEvent(slug, 'doc')));

  const open = document.getElementById('rfq-open');
  if(open) open.addEventListener('click', () => {
    document.getElementById('rfq').scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('rq-name').focus({ preventScroll: true });
  });

  /* The Request a Quote buttons on the results page link here as /handle#rfq.
     The browser resolves that hash while the page is still empty — this profile
     is rendered after the data arrives — so the jump silently does nothing.
     Land the buyer on the form now that it exists. */
  if(location.hash === '#rfq'){
    const sec = document.getElementById('rfq');
    if(sec){
      sec.scrollIntoView({ block: 'start' });
      const first = document.getElementById('rq-name');
      if(first) first.focus({ preventScroll: true });
    }
  }

  const rf = document.getElementById('rfq-form');
  armSpamTrap(rf);
  if(rf) rf.addEventListener('submit', async e => {
    e.preventDefault();
    if(looksLikeSpam(rf)){ fakeSuccess(rf, 'Request sent.'); return; }
    const v = id => (document.getElementById(id).value || '').trim();
    const msg = document.getElementById('rq-msg');
    if(!isValidEmail(v('rq-email'))){ msg.textContent = 'Please enter a valid email address.'; return; }
    if(v('rq-phone') && !isValidPhone(v('rq-phone'))){ msg.textContent = 'Please enter a valid phone number (at least 10 digits), or leave it blank.'; return; }
    const btn = document.getElementById('rq-submit');
    btn.disabled = true; msg.textContent = '';
    try{
      const sent = await submitInquiry(slug, {
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
      /* the token comes back from the insert and is the buyer's only route to
         this conversation later — it goes into their confirmation email */
      notifySupplier(slug, {
        name: v('rq-name'), email: v('rq-email'), company: v('rq-company'),
        phone: v('rq-phone'), part_number: v('rq-pn'), quantity: v('rq-qty'), body: v('rq-body')
      }, sent && sent.token);

      /* and the founders, so nothing is missed while the above beds in */
      sendFounderEmail('New quote request — ' + co.name, {
        supplier: co.name, supplier_email: co.email || '(none)', name: v('rq-name'),
        email: v('rq-email'), company: v('rq-company') || '(none)', phone: v('rq-phone') || '(none)',
        part_number: v('rq-pn') || '(none)', quantity: v('rq-qty') || '(none)', message: v('rq-body')
      }, 'Thanks — your quote request has been sent to ' + co.name + ' via Circuits.com. They typically reply directly to this email address.');
      /* Say where the answer will arrive. "They will reply directly" was true
         only if the supplier used their email client; a reply sent from the
         portal now reaches the buyer too, and this is the page it lands on. */
      rf.innerHTML = '<div class="success show">Request sent to ' + escapeHtml(co.name) + '.'
        + ' We have emailed you a copy'
        + (sent && sent.token ? ' with a link to follow the conversation' : '')
        + '. Their reply arrives at ' + escapeHtml(v('rq-email')) + '.</div>';
    }catch(err){
      btn.disabled = false;
      msg.textContent = rateLimitMessage(err)
        || 'Sorry, that didn’t send. Please try again or email the supplier directly.';
    }
  });

  /* one review form per listing that allows reviews */
  document.querySelectorAll('form.review-form').forEach(rv => {
    armSpamTrap(rv);
    rv.addEventListener('submit', async e => {
      e.preventDefault();
      if(looksLikeSpam(rv)){ fakeSuccess(rv, 'Thanks. Your review is with our team for checking.'); return; }
      const v = cls => (rv.querySelector('.' + cls).value || '').trim();
      const msg = rv.querySelector('.rv-msg');
      if(!isValidEmail(v('rv-email'))){ msg.textContent = 'Please enter a valid email address.'; return; }
      try{
        await submitReview(slug, { application_id: rv.dataset.app, name: v('rv-name'), email: v('rv-email'), rating: +v('rv-rating'), body: v('rv-body') });
        rv.innerHTML = '<div class="success show">Thanks. Your review is with our team for checking.</div>';
      }catch(err){
        msg.textContent = rateLimitMessage(err) || 'Sorry, that didn’t send. Please try again.';
      }
    });
  });
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
}
