/* ===== Circuits.com — supplier portal =====
   Everything here is gated by RLS, not by this file. Hiding a button is a
   convenience; the database is what actually refuses the write. */

let PT = { slug: null, co: null, listings: [], inquiries: [], reviews: [] };

const HOUR_DAYS = [['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat'],['sun','Sun']];
const SOCIAL_KEYS = [['linkedin','LinkedIn'],['x','X / Twitter'],['facebook','Facebook'],['youtube','YouTube'],['instagram','Instagram'],['github','GitHub']];

function el(id){ return document.getElementById(id); }
function val(id){ const e = el(id); return e ? (e.value || '').trim() : ''; }
function show(id, on){ const e = el(id); if(e) e.style.display = on ? '' : 'none'; }
function toast(text, ok){
  const t = el('pt-toast'); if(!t) return;
  t.textContent = text; t.style.color = ok ? '#3f6300' : '#b3261e'; t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

/* ---------- boot ---------- */
async function initPortal(){
  const user = await currentUser();
  if(!user){ show('pt-auth', true); show('pt-app', false); wireAuth(); return; }

  const cos = await myCompanies();
  if(!cos.length){
    show('pt-auth', false); show('pt-app', false); show('pt-none', true);
    el('pt-none-email').textContent = user.email;
    /* Staff are not suppliers. Without this they just see "no company linked"
       and assume the portal is broken. */
    if(await checkStaff()) show('pt-none-staff', true);
    return;
  }
  show('pt-auth', false); show('pt-none', false); show('pt-app', true);

  const picker = el('pt-company');
  picker.innerHTML = cos.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
  picker.style.display = cos.length > 1 ? '' : 'none';
  picker.addEventListener('change', () => {
    if(PT_DIRTY && !confirm('You have unsaved profile changes. Switch company and lose them?')){
      picker.value = PT.slug; return;
    }
    loadCompany(picker.value);
  });

  wireTabs();
  await loadCompany(cos[0].slug);
}

/* Sign in only. Accounts are created on the Get Listed form, where the
   applicant also reserves their circuits.com address — there is deliberately
   no way to register from here. */
function wireAuth(){
  el('pt-auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = el('pt-auth-msg');
    el('pt-auth-submit').disabled = true;
    try{
      const { error } = await signIn(val('pt-email'), val('pt-password'));
      if(error){
        msg.textContent = /invalid login/i.test(error.message || '')
          ? 'That email and password do not match an account. Accounts are created when you get listed.'
          : error.message;
        el('pt-auth-submit').disabled = false;
        return;
      }
      location.reload();
    }catch(err){ msg.textContent = 'Something went wrong. Please try again.'; el('pt-auth-submit').disabled = false; }
  });
}

/* Unsaved-changes guard. Editing a profile is a lot of typing; closing the tab
   or signing out used to bin it silently. */
let PT_DIRTY = false;
function markDirty(){ PT_DIRTY = true; }
function markClean(){ PT_DIRTY = false; }
function wireDirtyTracking(){
  const panel = el('tab-profile');
  if(!panel || panel.__dirtyWired) return;
  panel.__dirtyWired = true;
  panel.addEventListener('input', markDirty);
  panel.addEventListener('change', markDirty);
  // adding or removing a certification/team/gallery row is an edit too
  panel.addEventListener('click', e => { if(e.target.closest('[data-add],[data-del]')) markDirty(); });
  window.addEventListener('beforeunload', e => {
    if(!PT_DIRTY) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function wireTabs(){
  document.querySelectorAll('.pt-tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.pt-tab').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.pt-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  }));
  el('pt-signout').addEventListener('click', async e => {
    e.preventDefault();
    if(PT_DIRTY && !confirm('You have unsaved profile changes. Sign out and lose them?')) return;
    markClean();
    await signOut();
    location.href = '/';
  });
}

async function loadCompany(slug){
  PT.slug = slug;
  PT.co = await fetchCompany(slug);
  if(!PT.co){ toast('Could not load that company.', false); return; }
  el('pt-name').textContent = PT.co.name;
  el('pt-view').href = profileUrl(PT.co.handle) || '#';
  const [listings, inquiries, reviews, stats] = await Promise.all([
    fetchMyListings(slug), fetchInquiries(slug), fetchMyReviews(slug), companyStats(slug, 30)
  ]);
  PT.listings = listings; PT.inquiries = inquiries; PT.reviews = reviews;
  markUnread();
  renderOverview(stats);
  renderProfileForm();
  wireDirtyTracking();
  markClean();
  renderListings();
  renderInquiries();
  renderReviews();
  renderPromote();
}

/* A supplier should not have to open the tab to discover a new quote request. */
function markUnread(){
  const tab = document.querySelector('.pt-tab[data-tab="inquiries"]');
  if(!tab) return;
  const n = PT.inquiries.filter(q => q.status === 'New').length;
  tab.textContent = 'Quote requests';
  if(n){
    const b = document.createElement('span');
    b.className = 'pt-badge';
    b.textContent = n;
    tab.appendChild(b);
  }
}

/* ---------- overview ---------- */
function renderOverview(stats){
  const sum = kind => stats.filter(s => s.kind === kind).reduce((a, s) => a + Number(s.hits), 0);
  const live = PT.listings.filter(l => l.status === 'Approved' && !l.paused).length;
  const newq = PT.inquiries.filter(q => q.status === 'New').length;
  el('pt-stats').innerHTML = [
    ['Live listings', live],
    ['Profile views (30d)', sum('view')],
    ['Contact clicks (30d)', sum('website') + sum('phone') + sum('email')],
    ['Quote requests (30d)', sum('rfq')],
    ['Unread requests', newq]
  ].map(([lbl, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${lbl}</div></div>`).join('');

  /* last 14 days of profile views */
  const byDay = {};
  stats.filter(s => s.kind === 'view').forEach(s => { byDay[s.day] = Number(s.hits); });
  const days = [];
  for(let i = 13; i >= 0; i--){
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push([d, byDay[d] || 0]);
  }
  const max = Math.max(1, ...days.map(d => d[1]));
  el('pt-chart').innerHTML = days.map(([d, n]) =>
    `<div class="b" style="height:${Math.max(2, Math.round(n / max * 100))}%" title="${d}: ${n} views"><span>${d.slice(8)}</span></div>`
  ).join('');
  el('pt-chart-note').textContent = sum('view') === 0
    ? 'No views recorded yet — tracking starts the first time someone opens your profile.'
    : 'Unique visitors per day, last 14 days.';
}

/* ---------- profile editing ---------- */
function renderProfileForm(){
  const c = PT.co;
  const set = (id, v) => { if(el(id)) el(id).value = v || ''; };
  set('f-name', c.name);
  set('f-tagline', c.tagline); set('f-desc', c.description); set('f-website', c.website);
  set('f-phone', c.phone); set('f-email', c.email); set('f-contact', c.contact);
  set('f-address', c.address); set('f-founded', c.founded); set('f-employees', c.employees);
  set('f-handle', c.handle);
  el('f-reviews-on').checked = !!c.reviews_enabled;
  wireHandleCheck();
  el('pt-logo-prev').innerHTML = isLogoUrl(c.logo) ? `<img src="${escapeHtml(c.logo)}" alt="logo">` : avatarSvg();

  const hours = c.hours && typeof c.hours === 'object' ? c.hours : {};
  el('f-hours').innerHTML = HOUR_DAYS.map(([k, label]) =>
    `<div class="auth-field"><label>${label}</label><input id="h-${k}" type="text" placeholder="8:00–17:00" value="${escapeHtml(hours[k] || '')}"></div>`
  ).join('');

  const soc = c.socials && typeof c.socials === 'object' ? c.socials : {};
  el('f-socials').innerHTML = SOCIAL_KEYS.map(([k, label]) =>
    `<div class="auth-field"><label>${label}</label><input id="s-${k}" type="text" placeholder="https://…" value="${escapeHtml(soc[k] || '')}"></div>`
  ).join('');

  renderRepeater('certs', c.certifications, ['name', 'issuer', 'year'], ['Certification', 'Issuer', 'Year']);
  renderRepeater('team', c.team, ['name', 'role', 'email'], ['Name', 'Role', 'Email']);
  renderRepeater('gallery', c.gallery, ['url', 'caption'], ['Image URL', 'Caption']);
}

/* Live availability check on the vanity handle. Debounced so typing does not
   hammer the database; the unique index is what actually enforces it. */
let handleTimer = null;
function wireHandleCheck(){
  const input = el('f-handle');
  if(!input || input.__wired) return;
  input.__wired = true;
  input.addEventListener('input', () => {
    input.value = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const msg = el('handle-msg');
    clearTimeout(handleTimer);
    if(input.value === (PT.co.handle || '')){ msg.textContent = ''; return; }
    msg.textContent = 'Checking…'; msg.style.color = '';
    handleTimer = setTimeout(async () => {
      const why = await handleAvailable(input.value, PT.slug);
      msg.textContent = why || ('circuits.com/' + input.value + ' is available.');
      msg.style.color = why ? '#b3261e' : '#3f6300';
    }, 400);
  });
}

/* One generic list editor covers certifications, team and gallery. */
function renderRepeater(key, items, fields, labels){
  const list = Array.isArray(items) ? items.slice() : [];
  const box = el('f-' + key);
  function draw(){
    box.innerHTML = list.map((it, i) =>
      `<div class="pt-item"><div class="pt-row">${fields.map((f, j) =>
        `<div class="auth-field"><label>${labels[j]}</label><input data-k="${key}" data-i="${i}" data-f="${f}" type="text" value="${escapeHtml(it[f] || '')}"></div>`
      ).join('')}</div><button type="button" class="mini-btn" data-del="${i}">Remove</button></div>`
    ).join('') + `<button type="button" class="mini-btn green" data-add="1">+ Add</button>`;
  }
  box.onclick = e => {
    const add = e.target.closest('[data-add]'), del = e.target.closest('[data-del]');
    if(add){ list.push({}); draw(); }
    if(del){ list.splice(+del.dataset.del, 1); draw(); }
  };
  box.oninput = e => {
    const t = e.target; if(!t.dataset.f) return;
    list[+t.dataset.i][t.dataset.f] = t.value;
  };
  box.__list = list;
  draw();
}

async function saveProfile(){
  const btn = el('pt-save'); btn.disabled = true;
  /* The address is optional on save. It used to abort the whole save when the
     field was empty or invalid, which silently threw away every other edit —
     change your contact person with a blank address and nothing persisted. */
  const wantHandle = val('f-handle');
  const handleChanged = wantHandle !== (PT.co.handle || '');
  if(handleChanged && wantHandle){
    const why = await handleAvailable(wantHandle, PT.slug);
    if(why){ btn.disabled = false; toast('Address not saved: ' + why + ' Your other changes were not saved either — fix the address or put the old one back.', false); return; }
  }
  const hours = {}, socials = {};
  HOUR_DAYS.forEach(([k]) => { const v = val('h-' + k); if(v) hours[k] = v; });
  SOCIAL_KEYS.forEach(([k]) => { const v = val('s-' + k); if(v) socials[k] = v; });
  const clean = key => (el('f-' + key).__list || []).filter(o => Object.values(o).some(v => (v || '').trim()));

  const fields = {
    name: val('f-name') || PT.co.name,   // never let the company lose its name
    tagline: val('f-tagline') || null,
    description: val('f-desc') || null,
    website: val('f-website') || null,
    phone: val('f-phone') || null,
    email: val('f-email') || null,
    contact: val('f-contact') || null,
    address: val('f-address') || null,
    founded: val('f-founded') || null,
    employees: val('f-employees') || null,
    reviews_enabled: el('f-reviews-on').checked,
    hours, socials,
    certifications: clean('certs'), team: clean('team'), gallery: clean('gallery')
  };
  /* only touch the address when it actually changed and is non-empty, so a
     blank field can never wipe an existing circuits.com/<handle> */
  if(handleChanged && wantHandle) fields.handle = wantHandle;

  const file = el('pt-logo').files && el('pt-logo').files[0];
  if(file){ const url = await uploadImage(file); if(url) fields.logo = url; }

  const err = await updateCompany(PT.slug, fields);
  btn.disabled = false;
  if(err){ toast('Could not save: ' + err, false); return; }
  toast('Profile saved.', true);
  markClean();
  PT.co = await fetchCompany(PT.slug);
  el('pt-name').textContent = PT.co.name;
  const opt = el('pt-company') && el('pt-company').querySelector(`option[value="${PT.slug}"]`);
  if(opt) opt.textContent = PT.co.name;
  renderProfileForm();
  renderPromote();
  markClean();
}

/* ---------- listings ---------- */
function renderListings(){
  const rows = PT.listings.map(l => `
    <div class="pt-item">
      <div class="pt-item-head">
        <div><b>${escapeHtml(l.keyword || '(no keyword)')}</b>
          <span class="badge ${l.status === 'Approved' ? (l.paused ? '' : 'live') : ''}">${l.paused ? 'Paused' : escapeHtml(l.status)}</span>
          ${l.banner ? '<span class="badge sponsored">Sponsored</span>' : ''}
          ${l.badge ? `<span class="lb" style="background:${escapeHtml(l.badge.color)}">${escapeHtml(l.badge.text)}</span>` : ''}
        </div>
        <div>
          <span class="pf-note">${escapeHtml(l.fee || '')}</span>
          ${l.status === 'Approved'
            ? `<button class="mini-btn" data-pause="${l.id}" data-to="${l.paused ? '0' : '1'}">${l.paused ? 'Resume' : 'Pause'}</button>` : ''}
        </div>
      </div>
    </div>`).join('');
  el('pt-listings').innerHTML = rows || `<div class="pt-empty">
    <b>No listings yet</b>
    <p>Once Circuits.com approves a Circuits-Keyword™ for you, it appears here and you can pause or resume it.</p>
  </div>`;
  el('pt-listings').onclick = async e => {
    const b = e.target.closest('[data-pause]'); if(!b) return;
    b.disabled = true;
    await setPaused(b.dataset.pause, b.dataset.to === '1');
    PT.listings = await fetchMyListings(PT.slug);
    renderListings();
    toast('Listing updated.', true);
  };
}

async function requestKeyword(){
  const kw = cleanKw(val('pt-newkw'));
  if(!kw){ toast('Enter a keyword first.', false); return; }
  if(PT.listings.some(l => normKw(l.keyword) === normKw(kw))){ toast('You already have that keyword.', false); return; }
  const err = await addApplicationKeywords({
    company: PT.co.name, contact: PT.co.contact, email: PT.co.email,
    phone: PT.co.phone, website: PT.co.website, logo: PT.co.logo || '',
    banner: false, badge: null, message: 'Keyword requested from the supplier portal.',
    terms: true, status: 'Pending'
  }, [kw]).then(() => null, e => e.message || 'failed');
  if(err){ toast('Could not send that request: ' + err, false); return; }
  el('pt-newkw').value = '';
  PT.listings = await fetchMyListings(PT.slug);
  renderListings();
  toast('Requested. Circuits.com will review it.', true);
  sendFounderEmail('Keyword request — ' + PT.co.name, {
    company: PT.co.name, keyword: kw, email: PT.co.email || '(none)', source: 'Supplier portal'
  });
}

/* ---------- inquiries ---------- */
function renderInquiries(){
  el('pt-inquiries').innerHTML = (PT.inquiries.map(q => `
    <div class="pt-item" data-q="${q.id}">
      <div class="pt-item-head">
        <div><b>${escapeHtml(q.from_name)}</b>
          ${q.from_company ? `<span class="pf-note">${escapeHtml(q.from_company)}</span>` : ''}
          <span class="badge ${q.status === 'New' ? 'live' : ''}">${escapeHtml(q.status)}</span></div>
        <div class="pf-note">${new Date(q.created_at).toLocaleString()}</div>
      </div>
      <p class="pf-note" style="margin:6px 0">
        ${q.part_number ? 'Part: ' + escapeHtml(q.part_number) + ' · ' : ''}
        ${q.quantity ? 'Qty: ' + escapeHtml(q.quantity) + ' · ' : ''}
        <a href="mailto:${escapeHtml(q.from_email)}">${escapeHtml(q.from_email)}</a>
        ${q.phone ? ' · ' + escapeHtml(q.phone) : ''}
      </p>
      <p class="pt-quote-body">${escapeHtml(q.body)}</p>
      <div class="pt-thread" id="th-${q.id}"></div>
      <div class="pt-reply">
        <label for="msg-${q.id}">Reply to ${escapeHtml(q.from_name)}</label>
        <textarea id="msg-${q.id}" rows="3" placeholder="Emailed to the buyer and kept on this thread."></textarea>
        <div class="pt-reply-foot">
          <button class="mini-btn green" data-send="${q.id}">Send reply</button>
          <label class="pt-status">Status
            <select data-status="${q.id}">
              ${['New','Open','Won','Lost','Closed'].map(s => `<option ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </label>
        </div>
      </div>
    </div>`).join('') || `<div class="pt-empty">
      <b>No quote requests yet</b>
      <p>When a buyer uses the Request a Quote button on your profile, it lands here and you are emailed. Replies are kept on the thread.</p>
    </div>`);

  PT.inquiries.forEach(q => drawThread(q.id));

  el('pt-inquiries').onclick = async e => {
    const b = e.target.closest('[data-send]'); if(!b) return;
    const id = b.dataset.send, box = el('msg-' + id), body = (box.value || '').trim();
    if(!body) return;
    b.disabled = true;
    const err = await postMessage(id, body);
    b.disabled = false;
    if(err){ toast('Could not send: ' + err, false); return; }
    box.value = '';
    drawThread(id);
    const q = PT.inquiries.find(x => x.id === id);
    sendFounderEmail('Supplier reply — ' + PT.co.name, {
      supplier: PT.co.name, buyer: q.from_name, buyer_email: q.from_email, message: body
    }, 'Reply from ' + PT.co.name + ' via Circuits.com:\n\n' + body);
    toast('Reply sent.', true);
  };
  el('pt-inquiries').onchange = async e => {
    const s = e.target.closest('[data-status]'); if(!s) return;
    await setInquiryStatus(s.dataset.status, s.value);
    toast('Status updated.', true);
  };
}

async function drawThread(id){
  const msgs = await fetchThread(id);
  const box = el('th-' + id); if(!box) return;
  box.innerHTML = msgs.map(m =>
    `<div class="pt-msg ${escapeHtml(m.author)}"><b>${m.author === 'supplier' ? 'You' : 'Buyer'}:</b> ${escapeHtml(m.body)}
     <span class="pf-note">${new Date(m.created_at).toLocaleString()}</span></div>`).join('');
}


/* ---------- promote: printable artwork ----------
   Everything is drawn in real inches so it prints at true size; the previews
   are just CSS-scaled copies of the same markup. */
function qrSvg(text){
  if(typeof qrcode !== 'function') return '<span class="kit-qr-missing">QR unavailable</span>';
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function renderPromote(){
  const kit = el('promo-kit');
  if(!kit || !PT.co) return;
  const co = PT.co;
  if(!co.handle){
    kit.innerHTML = '<p class="empty-line">Set your Circuits.com address on the Profile tab first — '
      + 'every item here is built around it.</p>';
    return;
  }
  const url   = 'https://circuits.com/' + co.handle;
  const short = 'circuits.com/' + co.handle;
  const name  = escapeHtml(co.name);
  const qr    = qrSvg(url);
  const mark  = isLogoUrl(co.logo)
    ? `<img class="kit-logo" src="${escapeHtml(co.logo)}" alt="">`
    : `<span class="kit-logo kit-logo-text">${escapeHtml((co.name || '?').slice(0,1).toUpperCase())}</span>`;

  /* one 2in sticker, reused at several sizes */
  const sticker = `<div class="kit-sticker">
      <div class="kit-sticker-qr">${qr}</div>
      <div class="kit-sticker-txt"><b>${escapeHtml(short)}</b><span>Find us on Circuits.com</span></div>
    </div>`;

  kit.innerHTML = `
  <div class="kit-item">
    <div class="kit-head">
      <div><h3>Business card back</h3>
        <p class="pf-note">3.5 &times; 2 in. Hand it over and they can pull up your full listing.</p></div>
      <button class="mini-btn green" data-print="card" data-page="3.5in 2in">Print</button>
    </div>
    <div class="kit-preview" data-scale="1.5">
      <div class="kit-art kit-card" data-art="card">
        <div class="kit-card-l">${mark}<div class="kit-card-name">${name}</div>
          <div class="kit-card-url">${escapeHtml(short)}</div></div>
        <div class="kit-card-r"><div class="kit-qr">${qr}</div><span>Scan for our listing</span></div>
      </div>
    </div>
  </div>

  <div class="kit-item">
    <div class="kit-head">
      <div><h3>QR sticker sheet</h3>
        <p class="pf-note">Letter size. Six 2 in and twelve 1 in stickers &mdash; reels, bins, toolboxes, shipping boxes.</p></div>
      <button class="mini-btn green" data-print="stickers" data-page="letter">Print</button>
    </div>
    <div class="kit-preview" data-scale="3.2">
      <div class="kit-art kit-sheet" data-art="stickers">
        <div class="kit-grid kit-grid-2">${sticker.repeat(6)}</div>
        <div class="kit-grid kit-grid-1">${`<div class="kit-sticker kit-sticker-sm"><div class="kit-sticker-qr">${qr}</div><b>${escapeHtml(short)}</b></div>`.repeat(12)}</div>
      </div>
    </div>
  </div>

  <div class="kit-item">
    <div class="kit-head">
      <div><h3>Counter sign</h3>
        <p class="pf-note">Letter size. For a trade show table, trade counter or noticeboard.</p></div>
      <button class="mini-btn green" data-print="sign" data-page="letter">Print</button>
    </div>
    <div class="kit-preview" data-scale="3.2">
      <div class="kit-art kit-sign" data-art="sign">
        ${mark}
        <div class="kit-sign-name">${name}</div>
        <div class="kit-sign-lead">Scan to see our parts, documents and contacts</div>
        <div class="kit-sign-qr">${qr}</div>
        <div class="kit-sign-url">${escapeHtml(short)}</div>
      </div>
    </div>
  </div>

  <div class="kit-item">
    <div class="kit-head">
      <div><h3>Email signature</h3>
        <p class="pf-note">Nothing to print &mdash; paste it into Outlook or Gmail and it works every day.</p></div>
    </div>
    <div class="kit-sig">
      <label>Plain text</label>
      <textarea id="sig-text" rows="3" readonly>${escapeHtml(co.name + (co.contact ? ' — ' + co.contact : ''))}
${escapeHtml(short)}${co.phone ? '\n' + escapeHtml(co.phone) : ''}</textarea>
      <button class="mini-btn" data-copy="sig-text">Copy plain text</button>

      <label style="margin-top:14px">Formatted (Outlook, Gmail)</label>
      <div class="kit-sig-html" id="sig-html"><b>${name}</b>${co.contact ? ' &mdash; ' + escapeHtml(co.contact) : ''}<br>
        <a href="${escapeHtml(url)}">${escapeHtml(short)}</a>${co.phone ? '<br>' + escapeHtml(co.phone) : ''}</div>
      <button class="mini-btn" data-copy-rich="sig-html">Copy formatted</button>
    </div>
  </div>`;

  wirePromote();
}

function wirePromote(){
  const kit = el('promo-kit');
  if(!kit || kit.__wired) return;
  kit.__wired = true;

  kit.addEventListener('click', async e => {
    const printBtn = e.target.closest('[data-print]');
    const copyBtn  = e.target.closest('[data-copy]');
    const richBtn  = e.target.closest('[data-copy-rich]');

    if(printBtn) printArt(printBtn.dataset.print, printBtn.dataset.page);

    if(copyBtn){
      const ta = el(copyBtn.dataset.copy);
      try{ await navigator.clipboard.writeText(ta.value); copyBtn.textContent = 'Copied'; }
      catch(err){ ta.select(); copyBtn.textContent = 'Press Ctrl+C'; }
      setTimeout(() => { copyBtn.textContent = 'Copy plain text'; }, 2200);
    }

    if(richBtn){
      const box = el(richBtn.dataset.copyRich);
      try{
        await navigator.clipboard.write([new ClipboardItem({
          'text/html':  new Blob([box.innerHTML], { type: 'text/html' }),
          'text/plain': new Blob([box.innerText],  { type: 'text/plain' })
        })]);
        richBtn.textContent = 'Copied';
      }catch(err){
        /* older browsers, or no rich-clipboard permission: select it instead */
        const r = document.createRange(); r.selectNodeContents(box);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        richBtn.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => { richBtn.textContent = 'Copy formatted'; }, 2200);
    }
  });
}

/* Print exactly one item at its own paper size. @page cannot be switched with a
   class, so the rule is injected for the duration of the print. */
function printArt(kind, page){
  const art = document.querySelector(`[data-art="${kind}"]`);
  if(!art) return;
  document.querySelectorAll('.kit-art').forEach(a => a.classList.remove('kit-art-active'));
  art.classList.add('kit-art-active');

  const style = document.createElement('style');
  style.id = 'kit-page-size';
  style.textContent = `@page { size: ${page}; margin: ${kind === 'card' ? '0' : '0.4in'}; }`;
  document.head.appendChild(style);
  document.body.setAttribute('data-printing', kind);

  const cleanup = () => {
    document.body.removeAttribute('data-printing');
    art.classList.remove('kit-art-active');
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(() => { if(document.body.hasAttribute('data-printing')) cleanup(); }, 1000);
}

/* ---------- reviews ---------- */
function renderReviews(){
  el('pt-reviews').innerHTML = (PT.reviews.map(r => `
    <div class="pt-item">
      <div class="pt-item-head">
        <div class="pt-review-who">
          <span class="stars">${'★'.repeat(r.rating)}<span class="stars-off">${'★'.repeat(5 - r.rating)}</span></span>
          <b>${escapeHtml(r.author_name)}</b>
          <span class="badge ${r.status === 'Approved' ? 'live' : ''}">${escapeHtml(r.status)}</span>
        </div>
        <div class="pf-note">${new Date(r.created_at).toLocaleDateString()}</div>
      </div>
      <p class="pt-quote-body">${escapeHtml(r.body)}</p>
      <div class="pt-reply">
        <label for="rp-${r.id}">Your public reply</label>
        <textarea id="rp-${r.id}" rows="3" placeholder="Answer publicly — this appears under the review.">${escapeHtml(r.reply || '')}</textarea>
        <button class="mini-btn green" data-reply="${r.id}">Save reply</button>
      </div>
    </div>`).join('') || `<div class="pt-empty">
      <b>No reviews yet</b>
      <p>Buyers can leave a review once you switch reviews on under Profile. You are notified here, and you can reply publicly to each one.</p>
    </div>`);

  el('pt-reviews').onclick = async e => {
    const b = e.target.closest('[data-reply]'); if(!b) return;
    b.disabled = true;
    await replyToReview(b.dataset.reply, (el('rp-' + b.dataset.reply).value || '').trim());
    b.disabled = false;
    toast('Reply saved. It shows under the review once the review is approved.', true);
  };
  el('pt-reviews-note').textContent = PT.reviews.some(r => r.status === 'Pending')
    ? 'Pending reviews are not public yet — Circuits.com checks them first. You cannot approve your own.'
    : '';
}
