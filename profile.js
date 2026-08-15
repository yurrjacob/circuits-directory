/* ===== Circuits.com — public company profile =====
   Renders /company/<slug>. The slug comes from the <meta name="company-slug">
   tag baked in by tools/build-profiles.js, or from ?c= as a fallback so the
   page also works before the static files are generated. */

const DAYS = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];
const SOCIALS = [['linkedin','LinkedIn'],['x','X'],['facebook','Facebook'],['youtube','YouTube'],['instagram','Instagram'],['github','GitHub']];

function profileSlug(){
  const meta = document.querySelector('meta[name="company-slug"]');
  if(meta && meta.content && meta.content !== '{{SLUG}}') return meta.content;
  return new URLSearchParams(location.search).get('c') || '';
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

function section(title, inner, extra){
  if(!inner) return '';
  return `<section class="pf-sec"${extra || ''}><h2>${escapeHtml(title)}</h2>${inner}</section>`;
}

async function initProfile(){
  const slug = profileSlug();
  const root = document.getElementById('profile-body');
  if(!slug){ root.innerHTML = notFound(''); return; }

  const co = await fetchCompany(slug);
  if(!co){ root.innerHTML = notFound(slug); return; }

  const [kws, products, reviews] = await Promise.all([
    fetchCompanyKeywords(slug), fetchProducts(slug), fetchReviews(slug)
  ]);

  const sponsored = kws.some(k => k.banner);
  const badge = (kws.find(k => k.badge) || {}).badge;
  const docs = [];
  const seenDoc = new Set();
  for(const k of kws) for(const d of (Array.isArray(k.docs) ? k.docs : []))
    if(d && d.url && !seenDoc.has(d.url)){ seenDoc.add(d.url); docs.push(d); }

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const site = safeUrl(co.website);

  document.title = co.name + ' — Supplier Profile | Circuits.com';
  setMeta('description', (co.tagline || co.description || (co.name + ' on the Circuits.com supplier directory.')).slice(0, 155));

  /* ---- hero ---- */
  const logo = isLogoUrl(co.logo)
    ? `<img src="${escapeHtml(co.logo)}" alt="${escapeHtml(co.name)} logo">`
    : avatarSvg();

  let html = `
  <div class="pf-head">
    <div class="pf-logo">${logo}</div>
    <div class="pf-id">
      <h1>${escapeHtml(co.name)}
        ${badge ? `<span class="lb" style="background:${escapeHtml(badge.color)}">${escapeHtml(badge.text)}</span>` : ''}
        ${sponsored ? '<span class="lb lb-sponsor">Exclusive Sponsor</span>' : ''}
      </h1>
      ${co.tagline ? `<p class="pf-tagline">${escapeHtml(co.tagline)}</p>` : ''}
      <div class="pf-meta">
        ${reviews.length ? `${stars(avg)} <span>${avg.toFixed(1)} · ${reviews.length} review${reviews.length === 1 ? '' : 's'}</span>` : ''}
        ${co.address ? `<span>${escapeHtml(co.address)}</span>` : ''}
        ${co.founded ? `<span>Founded ${escapeHtml(co.founded)}</span>` : ''}
        ${co.employees ? `<span>${escapeHtml(co.employees)} employees</span>` : ''}
      </div>
    </div>
    <div class="pf-actions">
      <button class="btn btn-primary" id="rfq-open">Request a Quote</button>
      ${site ? `<a class="btn" id="pf-site" href="${escapeHtml(site)}" target="_blank" rel="noopener nofollow">Visit Website</a>` : ''}
      ${co.phone ? `<a class="btn" id="pf-phone" href="tel:${escapeHtml(co.phone)}">${escapeHtml(co.phone)}</a>` : ''}
      ${co.email ? `<a class="btn" id="pf-email" href="mailto:${escapeHtml(co.email)}">Email ${escapeHtml(co.contact || 'supplier')}</a>` : ''}
    </div>
  </div>`;

  /* ---- about ---- */
  html += section('About ' + co.name, co.description
    ? `<p class="pf-prose">${escapeHtml(co.description).replace(/\n+/g, '</p><p class="pf-prose">')}</p>` : '');

  /* ---- keywords ---- */
  html += section('Listed under', kws.length
    ? `<div class="kw-tags pf-kws">${kws.map(k =>
        `<a class="kw-tag" href="/results?q=${encodeURIComponent(k.keyword)}">${escapeHtml(k.keyword)}${k.banner ? ' ★' : ''}</a>`
      ).join('')}</div>
      <p class="pf-note">★ marks a Circuits-Keyword&trade; this company exclusively sponsors.</p>` : '');

  /* ---- products ---- */
  html += section('Products & parts', products.length
    ? `<div class="pf-grid">${products.map(p => `
        <div class="pf-card">
          ${p.image ? `<div class="pf-card-img"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" loading="lazy"></div>` : ''}
          <b>${escapeHtml(p.name)}</b>
          ${p.part_number ? `<code class="pf-pn">${escapeHtml(p.part_number)}</code>` : ''}
          ${p.description ? `<p>${escapeHtml(p.description)}</p>` : ''}
          <div class="pf-card-foot">
            ${p.price ? `<span class="pf-price">${escapeHtml(p.price)}</span>` : ''}
            ${safeUrl(p.datasheet) ? `<a href="${escapeHtml(safeUrl(p.datasheet))}" target="_blank" rel="noopener" class="doc-link">Datasheet</a>` : ''}
          </div>
        </div>`).join('')}</div>` : '');

  /* ---- documents ---- */
  html += section('Documentation', docs.length
    ? `<ul class="pf-docs">${docs.map(d =>
        `<li><a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" data-doc>${escapeHtml(d.name || 'Document')}</a></li>`
      ).join('')}</ul>` : '');

  /* ---- gallery ---- */
  const gallery = Array.isArray(co.gallery) ? co.gallery : [];
  html += section('Gallery', gallery.length
    ? `<div class="pf-gallery">${gallery.map(g =>
        `<figure><img src="${escapeHtml(g.url)}" alt="${escapeHtml(g.caption || co.name)}" loading="lazy">
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

  /* ---- hours + contact ---- */
  const hours = co.hours && typeof co.hours === 'object' ? co.hours : {};
  const openDays = DAYS.filter(([k]) => hours[k]);
  html += section('Hours & contact', (openDays.length || co.address || co.contact)
    ? `<div class="grid2">
        <div>${openDays.length ? `<table class="pf-hours">${openDays.map(([k, label]) =>
            `<tr><th>${label}</th><td>${escapeHtml(hours[k])}</td></tr>`).join('')}</table>` : ''}</div>
        <div class="pf-contact">
          ${co.contact ? `<div><b>${escapeHtml(co.contact)}</b></div>` : ''}
          ${co.address ? `<div>${escapeHtml(co.address)}</div>` : ''}
          ${co.phone ? `<div><a href="tel:${escapeHtml(co.phone)}">${escapeHtml(co.phone)}</a></div>` : ''}
          ${co.email ? `<div><a href="mailto:${escapeHtml(co.email)}">${escapeHtml(co.email)}</a></div>` : ''}
          ${socialLinks(co.socials)}
        </div>
       </div>` : '');

  /* ---- reviews ---- */
  html += section('Buyer reviews', `
    ${reviews.length ? `<div class="pf-reviews">${reviews.map(r => `
      <div class="pf-review">
        <div class="pf-review-head">${stars(r.rating)} <b>${escapeHtml(r.author_name)}</b>
          <span class="pf-note">${new Date(r.created_at).toLocaleDateString()}</span></div>
        <p>${escapeHtml(r.body)}</p>
        ${r.reply ? `<div class="pf-reply"><b>${escapeHtml(co.name)} replied:</b> ${escapeHtml(r.reply)}</div>` : ''}
      </div>`).join('')}</div>` : '<p class="empty-line">No reviews yet. Be the first to review this supplier.</p>'}
    ${co.reviews_enabled ? reviewForm() : ''}`);

  /* ---- RFQ + claim ---- */
  html += rfqForm(co);
  html += `<div class="claim-line" id="claim-line">
      Do you work at ${escapeHtml(co.name)}?
      <a href="/claim?c=${encodeURIComponent(slug)}">Claim this profile</a> to edit it and receive quote requests.
    </div>`;

  root.innerHTML = html;
  jsonLd(co, avg, reviews.length, site);
  wireProfile(slug, co);
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
    <h2>Request a quote from ${escapeHtml(co.name)}</h2>
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

function notFound(slug){
  return `<div class="empty"><div class="big">No profile for &ldquo;${escapeHtml(slug)}&rdquo;</div>
    <p>This company may not be listed yet. <a href="/join">List it here</a> or <a href="/directory">browse the directory</a>.</p></div>`;
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
    url: 'https://circuits.com/company/' + co.slug,
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
