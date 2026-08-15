/* ===== Circuits.com — supplier portal =====
   Everything here is gated by RLS, not by this file. Hiding a button is a
   convenience; the database is what actually refuses the write. */

let PT = { slug: null, co: null, listings: [], products: [], inquiries: [], reviews: [] };

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
    return;
  }
  show('pt-auth', false); show('pt-none', false); show('pt-app', true);

  const picker = el('pt-company');
  picker.innerHTML = cos.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
  picker.style.display = cos.length > 1 ? '' : 'none';
  picker.addEventListener('change', () => loadCompany(picker.value));

  wireTabs();
  await loadCompany(cos[0].slug);
}

function wireAuth(){
  const form = el('pt-auth-form');
  let mode = 'signin';
  el('pt-auth-toggle').addEventListener('click', e => {
    e.preventDefault();
    mode = mode === 'signin' ? 'signup' : 'signin';
    el('pt-auth-title').textContent = mode === 'signin' ? 'Supplier sign in' : 'Create a supplier account';
    el('pt-auth-submit').textContent = mode === 'signin' ? 'Sign in →' : 'Create account →';
    el('pt-auth-toggle').textContent = mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in';
    el('pt-auth-msg').textContent = '';
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = val('pt-email'), pw = val('pt-password');
    const msg = el('pt-auth-msg');
    el('pt-auth-submit').disabled = true;
    try{
      if(mode === 'signin'){
        const { error } = await signIn(email, pw);
        if(error){ msg.textContent = error.message; el('pt-auth-submit').disabled = false; return; }
        location.reload();
      } else {
        const { data, error } = await signUp(email, pw);
        if(error){ msg.textContent = error.message; el('pt-auth-submit').disabled = false; return; }
        if(data && data.session){ location.reload(); return; }
        msg.style.color = '#3f6300';
        msg.textContent = 'Account created. Confirm your email, then sign in — use the same address that is on your listing.';
        el('pt-auth-submit').disabled = false;
      }
    }catch(err){ msg.textContent = 'Something went wrong. Please try again.'; el('pt-auth-submit').disabled = false; }
  });
}

function wireTabs(){
  document.querySelectorAll('.pt-tab').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.pt-tab').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.pt-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
  }));
  el('pt-signout').addEventListener('click', async e => { e.preventDefault(); await signOut(); location.href = '/'; });
}

async function loadCompany(slug){
  PT.slug = slug;
  PT.co = await fetchCompany(slug);
  if(!PT.co){ toast('Could not load that company.', false); return; }
  el('pt-name').textContent = PT.co.name;
  el('pt-view').href = '/company/' + slug;
  const [listings, products, inquiries, reviews, stats] = await Promise.all([
    fetchMyListings(slug), fetchProducts(slug), fetchInquiries(slug), fetchMyReviews(slug), companyStats(slug, 30)
  ]);
  PT.listings = listings; PT.products = products; PT.inquiries = inquiries; PT.reviews = reviews;
  renderOverview(stats);
  renderProfileForm();
  renderListings();
  renderProducts();
  renderInquiries();
  renderReviews();
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
  set('f-tagline', c.tagline); set('f-desc', c.description); set('f-website', c.website);
  set('f-phone', c.phone); set('f-email', c.email); set('f-contact', c.contact);
  set('f-address', c.address); set('f-founded', c.founded); set('f-employees', c.employees);
  el('f-reviews-on').checked = !!c.reviews_enabled;
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
  const hours = {}, socials = {};
  HOUR_DAYS.forEach(([k]) => { const v = val('h-' + k); if(v) hours[k] = v; });
  SOCIAL_KEYS.forEach(([k]) => { const v = val('s-' + k); if(v) socials[k] = v; });
  const clean = key => (el('f-' + key).__list || []).filter(o => Object.values(o).some(v => (v || '').trim()));

  const fields = {
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
  const file = el('pt-logo').files && el('pt-logo').files[0];
  if(file){ const url = await uploadImage(file); if(url) fields.logo = url; }

  const err = await updateCompany(PT.slug, fields);
  btn.disabled = false;
  if(err){ toast('Could not save: ' + err, false); return; }
  toast('Profile saved.', true);
  PT.co = await fetchCompany(PT.slug);
  renderProfileForm();
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
  el('pt-listings').innerHTML = rows || '<p class="empty-line">No listings yet.</p>';
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

/* ---------- products ---------- */
function renderProducts(){
  el('pt-products').innerHTML = (PT.products.map(p => `
    <div class="pt-item">
      <div class="pt-item-head">
        <div><b>${escapeHtml(p.name)}</b> ${p.part_number ? `<code class="pf-pn">${escapeHtml(p.part_number)}</code>` : ''}
          ${p.price ? `<span class="pf-note">${escapeHtml(p.price)}</span>` : ''}</div>
        <div><button class="mini-btn" data-edit="${p.id}">Edit</button>
             <button class="mini-btn" data-delp="${p.id}">Delete</button></div>
      </div>
      ${p.description ? `<p class="pf-note">${escapeHtml(p.description)}</p>` : ''}
    </div>`).join('') || '<p class="empty-line">No products yet.</p>');

  el('pt-products').onclick = async e => {
    const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-delp]');
    if(ed){
      const p = PT.products.find(x => x.id === ed.dataset.edit);
      ['name','part_number','description','price','image','datasheet'].forEach(f => { el('p-' + f).value = p[f] || ''; });
      el('p-id').value = p.id;
      el('p-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if(dl){
      if(!confirm('Delete this product?')) return;
      await deleteProduct(dl.dataset.delp);
      PT.products = await fetchProducts(PT.slug);
      renderProducts(); toast('Product deleted.', true);
    }
  };
}

async function submitProduct(e){
  e.preventDefault();
  if(!val('p-name')){ toast('Product needs a name.', false); return; }
  const btn = el('p-save'); btn.disabled = true;
  let image = val('p-image');
  const file = el('p-image-file').files && el('p-image-file').files[0];
  if(file){ const url = await uploadImage(file); if(url) image = url; }
  const err = await saveProduct({
    id: val('p-id') || null, company_slug: PT.slug, name: val('p-name'),
    part_number: val('p-part_number'), description: val('p-description'),
    price: val('p-price'), image, datasheet: val('p-datasheet')
  });
  btn.disabled = false;
  if(err){ toast('Could not save: ' + err, false); return; }
  el('product-form').reset(); el('p-id').value = '';
  PT.products = await fetchProducts(PT.slug);
  renderProducts(); toast('Product saved.', true);
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
      <p>${escapeHtml(q.body)}</p>
      <div class="pt-thread" id="th-${q.id}"></div>
      <div class="pt-row" style="margin-top:8px">
        <textarea id="msg-${q.id}" rows="2" placeholder="Reply — emailed to the buyer and kept on this thread"></textarea>
      </div>
      <div style="margin-top:6px">
        <button class="mini-btn green" data-send="${q.id}">Send reply</button>
        <select data-status="${q.id}" style="height:32px">
          ${['New','Open','Won','Lost','Closed'].map(s => `<option ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>`).join('') || '<p class="empty-line">No quote requests yet.</p>');

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

/* ---------- reviews ---------- */
function renderReviews(){
  el('pt-reviews').innerHTML = (PT.reviews.map(r => `
    <div class="pt-item">
      <div class="pt-item-head">
        <div>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} <b>${escapeHtml(r.author_name)}</b>
          <span class="badge ${r.status === 'Approved' ? 'live' : ''}">${escapeHtml(r.status)}</span></div>
        <div class="pf-note">${new Date(r.created_at).toLocaleDateString()}</div>
      </div>
      <p>${escapeHtml(r.body)}</p>
      <div class="pt-row" style="margin-top:6px">
        <textarea id="rp-${r.id}" rows="2" placeholder="Public reply">${escapeHtml(r.reply || '')}</textarea>
      </div>
      <button class="mini-btn green" data-reply="${r.id}" style="margin-top:6px">Save reply</button>
    </div>`).join('') || '<p class="empty-line">No reviews yet.</p>');

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
