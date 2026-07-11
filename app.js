/* ===== Circuits.com — shared front-end behavior ===== */


function gotoSearch(term){
  const q = (term||'').trim();
  if(!q) return;
  window.location.href = 'results.html?q=' + encodeURIComponent(q);
}

/* Home page search wiring */
function initHome(){
  const input = document.getElementById('home-search');
  const form  = document.getElementById('home-form');
  if(form){
    form.addEventListener('submit', e=>{ e.preventDefault(); gotoSearch(input.value); });
  }
}

/* ---- validators (shared) ---- */
function isValidEmail(s){ return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test((s||'').trim()); }
function isValidPhone(s){ const d=(s||'').replace(/\D/g,''); return d.length>=10 && d.length<=15; }
function isValidWebsite(s){ return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([\/?#]\S*)?$/i.test((s||'').trim()); }

/* ---- email notifications to the founders (via FormSubmit) ----
   Note: the first submission triggers a one-time activation email to
   mike@circuits.com — click the link inside it once and delivery is live. */
const FOUNDER_EMAIL = 'mike@circuits.com';
const FOUNDER_CC    = 'john@circuits.com';
async function sendFounderEmail(subject, fields, autoresponse){
  const payload = Object.assign({
    _subject: subject,
    _cc: FOUNDER_CC,
    _template: 'table',
    _captcha: 'false'
  }, fields);
  if(autoresponse) payload._autoresponse = autoresponse;
  try{
    await fetch('https://formsubmit.co/ajax/' + FOUNDER_EMAIL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify(payload)
    });
  }catch(err){ console.warn('Email notification failed:', err); }
}

/* Results page rendering */
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
/* "View Documentation" link(s) for a listing's uploaded documents */
function docLinks(c){
  const docs = Array.isArray(c && c.docs) ? c.docs : [];
  if(!docs.length) return '';
  if(docs.length === 1) return `<a class="doc-link" href="${escapeHtml(docs[0].url)}" target="_blank" rel="noopener">View Documentation</a>`;
  return `<span class="doc-link">View Documentation:${docs.map((d,i)=>` <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" title="${escapeHtml(d.name)}">${i+1}</a>`).join('')}</span>`;
}
function initials(name){return name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}

async function initResults(){
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || '';
  const COLORS = ['#76c000','#0f6fff','#ff7a00','#9b51e0','#e02d5b','#00a8a8','#444b54','#c9a400'];

  const mini = document.getElementById('mini-search');
  const miniForm = document.getElementById('mini-form');
  if(mini) mini.value = q;
  if(miniForm) miniForm.addEventListener('submit', e=>{ e.preventDefault(); gotoSearch(mini.value); });
  document.querySelectorAll('[data-term]').forEach(el=> el.textContent = q || '…');

  const body = document.getElementById('results-body');

  if(!q){
    body.innerHTML = `<div class="empty"><div class="big">Type a keyword to see suppliers</div>
      <p>Try <a href="results.html?q=circuits">circuits</a>, <a href="results.html?q=microcontrollers">microcontrollers</a>, or <a href="results.html?q=sensors">sensors</a>.</p></div>`;
    return;
  }

  body.innerHTML = `<div class="empty"><div class="big">Searching…</div></div>`;

  let listings = [];
  try { listings = await fetchApprovedByKeyword(q); } catch(e){ listings = []; }

  const countEl = document.getElementById('result-count');
  if(countEl) countEl.textContent = listings.length;

  if(!listings.length){
    const term = escapeHtml(q);
    body.innerHTML = `
    <div class="empty" style="margin-bottom:4px">
      <div class="big">No suppliers are listed for &ldquo;${term}&rdquo; yet. This keyword is wide open</div>
      <p>This is what <b>your company</b> could look like listed under &ldquo;${term}&rdquo;:</p>
    </div>
    <div class="premium"><div class="premium-card">
      <span class="premium-badge">Featured Sponsor</span>
      <div class="premium-logo" style="background:#76c000">YC</div>
      <div class="premium-body">
        <h3>Your Company Name</h3>
        <p>Own the exclusive Featured Circuits-Keyword™ Sponsor Banner for &ldquo;${term}&rdquo;, the first listing every viewer sees.</p>
      </div>
      <div class="premium-contact">Your Contact<br>(555) 123-4567<br>sales@yourcompany.com</div>
    </div></div>
    <div class="listings" style="margin-bottom:10px">
      <div class="table-wrap">
        <table class="listings-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody><tr>
            <td><div class="co">
              <span class="co-logo" style="background:#76c000">YC</span>
              <a href="join.html">Your Company Name</a>
              <span class="lb" style="background:#c9a227">Authorized</span>
            </div></td>
            <td class="cell-muted">Your Contact</td>
            <td class="cell-muted">(555) 123-4567</td>
            <td class="cell-muted">sales@yourcompany.com</td>
          </tr></tbody>
        </table>
      </div>
    </div>
    <div class="empty" style="margin:10px auto 60px">
      <div class="big">Claim &ldquo;${term}&rdquo; before a competitor does</div>
      <p style="margin:8px 0 18px">Be the first supplier buyers see when they search this keyword.</p>
      <a class="btn btn-primary" href="join.html" style="padding:12px 26px;font-size:1rem;display:inline-block">List Your Company →</a>
    </div>`;
    return;
  }

  const featured = listings.find(l => l.banner);
  let html = '';
  if(featured){
    const fLogo = isLogoUrl(featured.logo)
      ? `<img src="${escapeHtml(featured.logo)}" alt="${escapeHtml(featured.company)} logo">`
      : initials(featured.company);
    html += `<div class="premium"><div class="premium-card">
      <span class="premium-badge">Featured Sponsor</span>
      <div class="premium-logo">${fLogo}</div>
      <div class="premium-body">
        <h3><a href="${escapeHtml(featured.website||'#')}" target="_blank" rel="noopener">${escapeHtml(featured.company)}</a></h3>
        <p>${escapeHtml(featured.message||'')}</p>
        ${docLinks(featured)}
      </div>
      <div class="premium-contact">
        ${escapeHtml(featured.contact||'')}<br>
        <a href="tel:${escapeHtml(featured.phone||'')}">${escapeHtml(featured.phone||'')}</a><br>
        <a href="mailto:${escapeHtml(featured.email||'')}">${escapeHtml(featured.email||'')}</a>
      </div>
    </div></div>`;
  }

  const rows = listings.map((c,i)=>`
    <tr>
      <td>
        <div class="co">
          ${isLogoUrl(c.logo)
            ? `<span class="co-logo"><img src="${escapeHtml(c.logo)}" alt="${escapeHtml(c.company)} logo"></span>`
            : `<span class="co-logo" style="background:${COLORS[i%COLORS.length]}">${initials(c.company)}</span>`}
          <a href="${escapeHtml(c.website||'#')}" target="_blank" rel="noopener">${escapeHtml(c.company)}</a>
          ${c.badge ? `<span class="lb" style="background:${escapeHtml(c.badge.color)}">${escapeHtml(c.badge.text)}</span>` : ''}
          ${docLinks(c)}
        </div>
      </td>
      <td class="cell-muted">${escapeHtml(c.contact||'—')}</td>
      <td class="cell-muted"><a href="tel:${escapeHtml(c.phone||'')}">${escapeHtml(c.phone||'—')}</a></td>
      <td class="cell-muted"><a href="mailto:${escapeHtml(c.email||'')}">${escapeHtml(c.email||'—')}</a></td>
    </tr>`).join('');

  body.innerHTML = html + `
    <div class="listings">
      <div class="table-wrap">
        <table class="listings-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

/* Join form behavior */
function initJoin(){
  let keywords = [];
  const kwInput = document.getElementById('kw-input');
  const kwAdd = document.getElementById('kw-add');
  const kwTags = document.getElementById('kw-tags');
  const kwCount = document.getElementById('kw-count');

  function renderKw(){
    if(kwTags) kwTags.innerHTML = keywords.map((k,i)=>
      `<span class="kw-tag">${k.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}<button type="button" data-i="${i}" aria-label="Remove">×</button></span>`
    ).join('');
    if(kwCount) kwCount.innerHTML = `<b>${keywords.length}</b> keyword${keywords.length===1?'':'s'}`;
  }
  function addKw(){
    // approval-level ruleset: lowercase, no hyphens, no plurals
    const v = (typeof cleanKw==='function') ? cleanKw(kwInput.value) : (kwInput.value||'').trim().toLowerCase();
    if(!v || keywords.includes(v)) return;
    keywords.push(v); kwInput.value=''; renderKw(); kwInput.focus();
  }
  if(kwAdd) kwAdd.addEventListener('click', addKw);
  if(kwInput) kwInput.addEventListener('keydown', e=>{ if(e.key==='Enter'){ e.preventDefault(); addKw(); } });
  if(kwTags) kwTags.addEventListener('click', e=>{
    const b = e.target.closest('button'); if(!b) return;
    keywords.splice(+b.dataset.i,1); renderKw();
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
  const DEFAULT_TEXT = 'Authorized';
  const DEFAULT_COLOR = '#c9a227'; /* gold */
  let curBadgeText = DEFAULT_TEXT, curBadgeColor = DEFAULT_COLOR;
  function selectText(text){
    curBadgeText = text;
    if(badgePreview) badgePreview.textContent = text;
    if(badgeOpts) badgeOpts.querySelectorAll('.opt-btn').forEach(b=>b.classList.toggle('selected', b.dataset.text===text));
  }
  function selectColor(color){
    curBadgeColor = color;
    if(badgePreview) badgePreview.style.background = color;
    if(swatches) swatches.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected', s.dataset.color===color));
  }
  if(badgeOpts) badgeOpts.addEventListener('click', e=>{
    const b = e.target.closest('.opt-btn'); if(!b) return;
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
  if(badgeCheck) badgeCheck.addEventListener('change', syncBadgeGate);
  syncBadgeGate();
  function resetBadge(){ selectText(DEFAULT_TEXT); selectColor(DEFAULT_COLOR); syncBadgeGate(); }

  // Logo upload preview
  const logoInput = document.getElementById('logo-input');
  const logoPrev = document.getElementById('logo-preview');
  const logoImg = document.getElementById('logo-preview-img');
  const logoName = document.getElementById('logo-name');
  const LOGO_TYPES = ['image/png','image/jpeg','image/svg+xml','image/webp'];
  const LOGO_MAX = 2 * 1024 * 1024; // 2 MB
  let logoUrl = null;
  if(logoInput) logoInput.addEventListener('change', ()=>{
    const f = logoInput.files && logoInput.files[0];
    if(!f){ logoPrev.style.display='none'; setErr(logoInput,''); logoUrl=null; updatePreviews(); return; }
    if(!LOGO_TYPES.includes(f.type)){
      setErr(logoInput, 'Logo must be a PNG, JPG, SVG, or WebP image.');
      logoInput.value=''; logoPrev.style.display='none'; logoUrl=null; updatePreviews(); return;
    }
    if(f.size > LOGO_MAX){
      setErr(logoInput, 'Logo file is too large (max 2 MB).');
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
  const docsInput = document.getElementById('docs-input');
  const docsList = document.getElementById('docs-list');
  const DOC_TYPES = ['application/pdf','image/png','image/jpeg','image/webp'];
  const DOC_MAX = 10 * 1024 * 1024; // 10 MB each
  const DOC_LIMIT = 5;
  function clearDocs(){ if(docsInput) docsInput.value=''; if(docsList) docsList.innerHTML=''; }
  if(docsInput) docsInput.addEventListener('change', ()=>{
    const files = Array.from(docsInput.files || []);
    if(files.length > DOC_LIMIT){ setErr(docsInput, 'You can upload up to ' + DOC_LIMIT + ' documents.'); clearDocs(); return; }
    if(files.some(f => !DOC_TYPES.includes(f.type))){ setErr(docsInput, 'Documents must be PDF, PNG, JPEG, or WebP files.'); clearDocs(); return; }
    if(files.some(f => f.size > DOC_MAX)){ setErr(docsInput, 'Each document must be 10 MB or smaller.'); clearDocs(); return; }
    setErr(docsInput,'');
    if(docsList) docsList.innerHTML = files.map(f=>`<span>${escapeHtml(f.name)}</span>`).join('');
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
  if(pvLogo) pvLogo.innerHTML = `<img src="${logoUrl}" alt="Your logo">`;
  if(bpLogo) bpLogo.innerHTML = `<img src="${logoUrl}" alt="Your logo">`;
} else {
  const ini = initials(company || 'AAA Electronics');
  if(pvLogo) pvLogo.textContent = ini;
  if(bpLogo) bpLogo.textContent = ini;
}
if(bpContact) bpContact.textContent = fieldVal('f-contact') || 'Jane Doe, VP Sales';
if(bpPhone) bpPhone.textContent = fieldVal('f-phone') || '(555) 123-4567';
if(bpEmail) bpEmail.textContent = fieldVal('f-email') || 'sales@company.com';
const m = document.getElementById('msg');
if(bpMessage) bpMessage.textContent = (m && m.value.trim()) || 'Prominent profile description shown to every viewer.';
}
['f-company','f-contact','f-phone','f-email','msg'].forEach(function(id){
const el = document.getElementById(id);
if(el) el.addEventListener('input', updatePreviews);
});
updatePreviews();

const msg = document.getElementById('msg');
  const msgCount = document.getElementById('msg-count');
  if(msg) msg.addEventListener('input', ()=>{ msgCount.textContent = `${msg.value.length} / 600`; });

  const form = document.getElementById('join-form');
  function validate(){
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    let firstBad = null;
    const check = (id, ok, errText)=>{
      const el = document.getElementById(id); if(!el) return;
      setErr(el, ok ? '' : errText);
      if(!ok && !firstBad) firstBad = el;
    };
    check('f-company', !!v('f-company'), 'Please enter your company name.');
    check('f-contact', !!v('f-contact'), 'Please enter a contact person.');
    check('f-email', isValidEmail(v('f-email')), 'Please enter a valid email address (e.g. sales@company.com).');
    check('f-phone', !v('f-phone') || isValidPhone(v('f-phone')), 'Please enter a valid phone number (at least 10 digits).');
    check('f-website', !v('f-website') || isValidWebsite(v('f-website')), 'Please enter a valid website (e.g. www.company.com).');
    /* terms must be accepted before the form can be submitted */
    const termsBox = document.getElementById('f-terms');
    const termsErr = document.getElementById('terms-err');
    const termsOk = !!(termsBox && termsBox.checked);
    if(termsErr) termsErr.style.display = termsOk ? 'none' : 'block';
    if(!termsOk && !firstBad) firstBad = termsBox;
    if(firstBad){ firstBad.scrollIntoView({behavior:'smooth', block:'center'}); firstBad.focus({preventScroll:true}); return false; }
    return true;
  }

  if(form) form.addEventListener('submit', async e=>{
    e.preventDefault();
    if(!validate()) return;
    const submitBtn = form.querySelector('.submit');
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    let website = v('f-website');
    if(website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    const wantsBadge = !!(badgeCheck && badgeCheck.checked);
    const base = {
      company: v('f-company'), contact: v('f-contact'), email: v('f-email'),
      phone: v('f-phone'), website,
      logo: '',
      banner: !!(document.getElementById('promo-check') && document.getElementById('promo-check').checked),
      badge: wantsBadge ? { text: curBadgeText, color: curBadgeColor } : null,
      message: msg ? msg.value.trim() : '',
      terms: !!(document.getElementById('f-terms') && document.getElementById('f-terms').checked),
      status: 'Pending'
    };
    try {
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
      /* store the actual logo file so it can be viewed everywhere on the site */
      const logoFile = logoInput && logoInput.files && logoInput.files[0];
      if(logoFile) base.logo = await uploadLogo(logoFile);
      /* store uploaded documentation so viewers can open it from the listing */
      base.docs = [];
      const docFiles = (docsInput && docsInput.files) ? Array.from(docsInput.files) : [];
      for(const f of docFiles){ const d = await uploadDoc(f); if(d) base.docs.push(d); }
      await addApplicationKeywords(base, keywords);
    } catch(err) {
      if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
      alert('Sorry, we couldn’t submit your application right now. Please try again.');
      return;
    }
    /* notify the founders + send the applicant a confirmation email with a copy of what they submitted */
    const kwList = keywords.map(cleanKw).join(', ') || '(none)';
    sendFounderEmail('New Listing Application - ' + base.company, {
      company: base.company,
      contact: base.contact,
      email: base.email,
      phone: base.phone || '(not provided)',
      website: base.website || '(none)',
      logo: base.logo || '(none)',
      keywords: kwList,
      featured_sponsor: base.banner ? 'Yes' : 'No',
      trust_badge: wantsBadge ? (curBadgeText + ' (' + curBadgeColor + ')') : 'No',
      documentation: base.docs.length ? base.docs.map(d=>d.name).join(', ') : '(none)',
      message: base.message || '(none)'
    }, 'Thanks for applying to list ' + base.company + ' on Circuits.com! We received your application and will respond within 1 business day.\n\n'
      + 'Here is a copy of what you submitted:\n'
      + '- Company: ' + base.company + '\n'
      + '- Contact: ' + base.contact + '\n'
      + '- Email: ' + base.email + '\n'
      + '- Phone: ' + (base.phone || '(not provided)') + '\n'
      + '- Website: ' + (base.website || '(none)') + '\n'
      + '- Keywords: ' + kwList + '\n'
      + '- Featured Circuits-Keyword™ Sponsor: ' + (base.banner ? 'Yes' : 'No') + '\n'
      + '- Circuits.com Trust Badge: ' + (wantsBadge ? curBadgeText : 'No') + '\n'
      + '- Documentation: ' + (base.docs.length ? base.docs.map(d=>d.name).join(', ') : '(none)') + '\n'
      + '- Message: ' + (base.message || '(none)') + '\n\n'
      + '- John & Mike, Circuits.com');
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
    const ok = document.getElementById('success');
    ok.classList.add('show');
    form.reset();
    keywords = []; renderKw();
    resetBadge();
    logoUrl = null;
    clearDocs();
    updatePreviews();
    if(logoPrev) logoPrev.style.display='none';
    if(msgCount) msgCount.textContent='0 / 600';
    window.scrollTo({top:0,behavior:'smooth'});
  });
}
