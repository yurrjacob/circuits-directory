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

async function initProfile(){
  const handle = profileHandle();
  const root = document.getElementById('profile-body');
  if(!handle){ root.innerHTML = notFound(''); return false; }

  const co = await fetchCompanyByHandle(handle);
  if(!co){ root.innerHTML = notFound(handle); return false; }

  const slug = co.slug;   // internal key: everything else still hangs off this
  const [kws, reviews] = await Promise.all([
    fetchCompanyKeywords(slug), fetchReviews(slug)
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
      <h1>${escapeHtml(co.name)}</h1>
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
     The trust badge certifies a company for a particular keyword, so it belongs
     against that keyword — "PCB Design (Certified)", not "Jacob (Certified)". */
  html += section('Keyword Listings', kws.length
    ? `<div class="kw-tags pf-kws">${kws.map(k =>
        `<a class="kw-tag" href="/results?q=${encodeURIComponent(k.keyword)}">${escapeHtml(k.keyword)}${k.banner ? ' ★' : ''}`
        + (k.badge ? `<span class="lb kw-lb" style="background:${escapeHtml(k.badge.color)}">${escapeHtml(k.badge.text)}</span>` : '')
        + `</a>`
      ).join('')}</div>
      <p class="pf-note">★ marks a Circuits-Keyword&trade; this company exclusively sponsors.</p>` : '');

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

  /* ---- certifications ---- */
  const certs = Array.isArray(co.certifications) ? co.certifications : [];
  html += section('Certifications & approvals', certs.length
    ? `<ul class="pf-certs">${certs.map(c =>
        `<li><b>${escapeHtml(c.name || '')}</b>${c.issuer ? ` — ${escapeHtml(c.issuer)}` : ''}${c.year ? ` (${escapeHtml(String(c.year))})` : ''}</li>`
      ).join('')}</ul>` : '');

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

    <p class="pf-claim">Is this your company's listing?
      <a href="/claim?c=${encodeURIComponent(co.handle)}">Claim this listing</a>
      to manage it from your Circuits.com profile.</p>
  </aside></div>`;

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

  /* Copy the short link — this is what goes on adverts and email signatures. */
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
  if(rf) rf.addEventListener('submit', async e => {
    e.preventDefault();
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
      /* the supplier is notified by Circuits.com, not by the buyer's own client */
      sendFounderEmail('New quote request — ' + co.name, {
        supplier: co.name, supplier_email: co.email || '(none)', name: v('rq-name'),
        email: v('rq-email'), company: v('rq-company') || '(none)', phone: v('rq-phone') || '(none)',
        part_number: v('rq-pn') || '(none)', quantity: v('rq-qty') || '(none)', message: v('rq-body')
      }, 'Thanks — your quote request has been sent to ' + co.name + ' via Circuits.com. They typically reply directly to this email address.');
      rf.innerHTML = '<div class="success show">Request sent. ' + escapeHtml(co.name) + ' will reply to you directly.</div>';
    }catch(err){
      btn.disabled = false;
      msg.textContent = 'Sorry, that didn’t send. Please try again or email the supplier directly.';
    }
  });

  const rv = document.getElementById('review-form');
  if(rv) rv.addEventListener('submit', async e => {
    e.preventDefault();
    const v = id => (document.getElementById(id).value || '').trim();
    const msg = document.getElementById('rv-msg');
    if(!isValidEmail(v('rv-email'))){ msg.textContent = 'Please enter a valid email address.'; return; }
    try{
      await submitReview(slug, { name: v('rv-name'), email: v('rv-email'), rating: +v('rv-rating'), body: v('rv-body') });
      rv.innerHTML = '<div class="success show">Thanks. Your review is with our team for checking.</div>';
    }catch(err){ msg.textContent = 'Sorry, that didn’t send. Please try again.'; }
  });
}
