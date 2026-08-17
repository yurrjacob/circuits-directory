/* ===== Circuits.com — shared front-end behavior ===== */


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
/* Each founder gets his own FormSubmit send (no CC), so one un-activated
   form can never block the other. IMPORTANT: FormSubmit requires a ONE-TIME
   activation per address — check mike@circuits.com AND john@circuits.com
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
     activated the applicant may get two copies — acceptable vs. getting none.) */
  await Promise.all(FOUNDER_EMAILS.map(to => sendOne(to, true)));
}

/* Results page rendering */
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
/* "View Documentation" link(s) for a listing's uploaded documents */
function docLinks(c){
  const docs = Array.isArray(c && c.docs) ? c.docs : [];
  if(!docs.length) return '';
  if(docs.length === 1) return `<a class="doc-link" href="${escapeHtml(docs[0].url)}" target="_blank" rel="noopener">View Docs</a>`;
  return `<span class="doc-link">View Docs:${docs.map((d,i)=>` <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener" title="${escapeHtml(d.name)}">${i+1}</a>`).join('')}</span>`;
}
function initials(name){return name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}
/* default logo placeholder: a generic person silhouette (white on the tile's
   varying color) shown whenever a listing has no uploaded logo */
function avatarSvg(){return '<svg class="silhouette" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8.2" r="4.2"/><path d="M12 13.6c-4.5 0-7.7 2.4-7.7 5.4V21h15.4v-2c0-3-3.2-5.4-7.7-5.4z"/></svg>';}

async function initResults(forcedTerm){
  const params = new URLSearchParams(location.search);
  const q = forcedTerm || params.get('q') || '';
  const COLORS = ['#76c000','#0f6fff','#ff7a00','#9b51e0','#e02d5b','#00a8a8','#444b54','#c9a400'];

  const mini = document.getElementById('mini-search');
  const miniForm = document.getElementById('mini-form');
  if(mini) mini.value = q;
  if(miniForm) miniForm.addEventListener('submit', e=>{ e.preventDefault(); gotoSearch(mini.value); });
  document.querySelectorAll('[data-term]').forEach(el=> el.textContent = q || '…');

  const body = document.getElementById('results-body');

  if(!q){
    body.innerHTML = `<div class="empty"><div class="big">Type a keyword to see suppliers</div>
      <p>Try <a href="/results?q=circuits">circuits</a>, <a href="/results?q=microcontrollers">microcontrollers</a>, or <a href="/results?q=sensors">sensors</a>.</p></div>`;
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
      <div class="big">This Circuits-Keyword&trade; is available</div>
    </div>
    <div class="premium"><div class="premium-card">
      <span class="premium-badge">Exclusive Sponsor</span>
      <div class="premium-logo">${avatarSvg()}</div>
      <div class="premium-body">
        <h3>Your Company or Name</h3>
        <p>Own the Exclusive Circuits-Keyword™ Sponsor Banner for &ldquo;${term}&rdquo;.<br>Own the First Listing Every Viewer Sees.</p>
      </div>
      <div class="premium-contact">Your Contact<br>(555) 123-4567<br>sales@yourcompany.com</div>
    </div></div>
    <div class="listings" style="margin-bottom:10px">
      <div class="table-wrap">
        <table class="listings-table">
          <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody><tr>
            <td><div class="co">
              <span class="co-logo" style="background:var(--dark)">${avatarSvg()}</span>
              <a href="/join">Your Company or Name</a>
              <span class="lb" style="background:#c9a227">Authorized</span>
            </div></td>
            <td class="cell-muted" data-label="Contact">Your Contact</td>
            <td class="cell-muted" data-label="Phone">(555) 123-4567</td>
            <td class="cell-muted" data-label="Email">sales@yourcompany.com</td>
          </tr></tbody>
        </table>
      </div>
    </div>
    <div class="empty" style="margin:10px auto 60px">
      <a class="btn btn-primary" href="/join" style="padding:14px 28px;font-size:1rem;display:inline-block;font-weight:700">Be The First Listed For &ldquo;${term}&rdquo;</a>
    </div>`;
    return;
  }

  const featured = listings.find(l => l.banner);
  let html = '';
  if(featured){
    const fLogo = isLogoUrl(featured.logo)
      ? `<img src="${escapeHtml(featured.logo)}" alt="${escapeHtml(featured.company)} logo">`
      : avatarSvg();
    html += `<div class="premium"><div class="premium-card">
      <span class="premium-badge">Exclusive Sponsor</span>
      <div class="premium-logo">${fLogo}</div>
      <div class="premium-body">
        <h3>${featured.company_handle
          ? `<a href="${escapeHtml(profileUrl(featured.company_handle))}">${escapeHtml(featured.company)}</a>`
          : escapeHtml(featured.company)}</h3>
        <p>${escapeHtml(featured.description||'')}</p>
        ${featured.website ? `<a class="doc-link" href="${escapeHtml(featured.website)}" target="_blank" rel="noopener nofollow">Website</a>` : ''}
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
          ${c.company_handle ? `<a class="co-logo-link" href="${escapeHtml(profileUrl(c.company_handle))}" aria-label="${escapeHtml(c.company)} profile">` : ''}
          ${isLogoUrl(c.logo)
            ? `<span class="co-logo"><img src="${escapeHtml(c.logo)}" alt="${escapeHtml(c.company)} logo"></span>`
            : `<span class="co-logo" style="background:${COLORS[i%COLORS.length]}">${avatarSvg()}</span>`}
          ${c.company_handle ? '</a>' : ''}
          ${c.company_handle
            ? `<a href="${escapeHtml(profileUrl(c.company_handle))}">${escapeHtml(c.company)}</a>`
            : escapeHtml(c.company)}
          ${c.badge ? `<span class="lb" style="background:${escapeHtml(c.badge.color)}">${escapeHtml(c.badge.text)}</span>` : ''}
          ${c.website ? `<a class="doc-link" href="${escapeHtml(c.website)}" target="_blank" rel="noopener nofollow">Website</a>` : ''}
          ${docLinks(c)}
        </div>
      </td>
      <td class="cell-muted" data-label="Contact">${escapeHtml(c.contact||'—')}</td>
      <td class="cell-muted" data-label="Phone"><a href="tel:${escapeHtml(c.phone||'')}">${escapeHtml(c.phone||'—')}</a></td>
      <td class="cell-muted" data-label="Email"><a href="mailto:${escapeHtml(c.email||'')}">${escapeHtml(c.email||'—')}</a></td>
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
    if(kwTags) kwTags.innerHTML = keywords.map((k,i)=>{
      const esc = k.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      return `<span class="kw-tag"><a class="kw-check-link" href="/results?q=${encodeURIComponent(k)}" target="_blank" rel="noopener" title="Check availability: opens this keyword's live listing page in a new tab">${esc}</a><button type="button" data-i="${i}" aria-label="Remove">×</button></span>`;
    }).join('');
    if(kwCount) kwCount.innerHTML = `<b>${keywords.length}</b> keyword${keywords.length===1?'':'s'}`;
  }
  function addKw(){
    // approval-level ruleset: lowercase, no hyphens, no plurals
    const v = (typeof cleanKw==='function') ? cleanKw(kwInput.value) : (kwInput.value||'').trim().toLowerCase();
    if(!v || keywords.includes(v)) return;
    keywords.push(v); kwInput.value=''; renderKw(); renderQuote(); kwInput.focus();
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
  if(customBtn) customBtn.addEventListener('click', selectCustom);
  if(customInput) customInput.addEventListener('input', ()=>{
    curBadgeText = customInput.value.trim() || 'Your Badge';
    if(badgePreview) badgePreview.textContent = curBadgeText;
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
  /* no logo picked yet — show a "Your Logo" placeholder, never initials */
  if(pvLogo){ pvLogo.classList.add('logo-ph'); pvLogo.textContent = 'Your Logo'; }
  if(bpLogo){ bpLogo.classList.add('logo-ph'); bpLogo.textContent = 'Your Logo'; }
}
if(bpContact) bpContact.textContent = fieldVal('f-contact') || 'Jane Doe, VP Sales';
if(bpPhone) bpPhone.textContent = fieldVal('f-phone') || '(555) 123-4567';
if(bpEmail) bpEmail.textContent = fieldVal('f-email') || 'sales@company.com';
/* the profile description is written by staff after review, so the preview
   keeps its example text — the Step 5 suggestions box does NOT feed it */
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
  handleInput.value = handleInput.value.toLowerCase().replace(/[^a-z0-9_-]/g,'');
  clearTimeout(handleTimer);
  handleState = 'checking';
  if(!handleInput.value){ handleMsg.textContent=''; handleState=''; return; }
  handleMsg.textContent = 'Checking…'; handleMsg.style.color = '';
  handleTimer = setTimeout(async ()=>{
    const why = await handleAvailable(handleInput.value, null);
    handleState = why ? 'bad' : 'ok';
    handleMsg.textContent = why || ('circuits.com/' + handleInput.value + ' is yours to reserve.');
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
    check('f-handle', handleFormatOk(v('f-handle')) && handleState !== 'bad',
      handleState === 'bad' ? 'That Circuits.com address is not available.'
                            : 'Choose your Circuits.com address (3–32 letters, numbers, hyphens or underscores).');
    check('f-pass', v('f-pass').length >= 8, 'Your password must be at least 8 characters.');
    check('f-pass2', v('f-pass') === v('f-pass2') && !!v('f-pass2'), 'The two passwords do not match.');
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
    base.requested_handle = v('f-handle');
    try {
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }

      /* The account is created HERE — Get Listed is the only route to one.
         Re-check the handle at submit time: someone may have taken it while
         this form was open. The unique index is the real guard. */
      const why = await handleAvailable(base.requested_handle, null);
      if(why){
        if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
        setErr(document.getElementById('f-handle'), 'That address just became unavailable: ' + why);
        document.getElementById('f-handle').scrollIntoView({behavior:'smooth', block:'center'});
        return;
      }
      const { error: authErr } = await signUp(base.email, v('f-pass'));
      if(authErr && !/already registered|already exists/i.test(authErr.message || '')){
        if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
        setErr(document.getElementById('f-email'), authErr.message);
        return;
      }

      /* Uploads are best-effort: a failed logo/document upload must NEVER
         stop the application data from reaching the database. */
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
      circuits_address: 'circuits.com/' + base.requested_handle,
      logo: base.logo || '(none)',
      keywords: kwList,
      exclusive_sponsor: base.banner ? 'Yes' : 'No',
      trust_badge: wantsBadge ? (curBadgeText + ' (' + curBadgeColor + ')') : 'No',
      documentation: base.docs.length ? base.docs.map(d=>d.name).join(', ') : '(none)',
      ideas: base.message || '(none)'
    }, 'Thanks for applying to list ' + base.company + ' on Circuits.com! We received your application and will respond within 1 business day.\n\n'
      + 'Here is a copy of what you submitted:\n'
      + '- Company: ' + base.company + '\n'
      + '- Contact: ' + base.contact + '\n'
      + '- Email: ' + base.email + '\n'
      + '- Phone: ' + (base.phone || '(not provided)') + '\n'
      + '- Website: ' + (base.website || '(none)') + '\n'
      + '- Your Circuits.com address: circuits.com/' + base.requested_handle + ' (reserved for you)\n'
      + '- Keywords: ' + kwList + '\n'
      + '- Exclusive Circuits-Keyword™ Sponsor: ' + (base.banner ? 'Yes' : 'No') + '\n'
      + '- Circuits.com Trust Badge: ' + (wantsBadge ? curBadgeText : 'No') + '\n'
      + '- Documentation: ' + (base.docs.length ? base.docs.map(d=>d.name).join(', ') : '(none)') + '\n'
      + '- Ideas: ' + (base.message || '(none)') + '\n\n'
      + '- John & Mike, Circuits.com');
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
    const ok = document.getElementById('success');
    const okHandle = document.getElementById('success-handle');
    if(okHandle) okHandle.innerHTML = '<b>circuits.com/' + escapeHtml(base.requested_handle)
      + '</b> is reserved for you. ';
    ok.classList.add('show');
    form.reset();
    keywords = []; renderKw();
    resetBadge();
    renderQuote();
    logoUrl = null;
    if(handleMsg) handleMsg.textContent = '';
    if(passMsg) passMsg.textContent = '';
    handleState = '';
    clearDocs();
    updatePreviews();
    if(logoPrev) logoPrev.style.display='none';
    if(msgCount) msgCount.textContent='0 / 600';
    window.scrollTo({top:0,behavior:'smooth'});
  });
}
/* end */
