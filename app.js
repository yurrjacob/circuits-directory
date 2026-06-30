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

/* Results page rendering */
function escapeHtml(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function initials(name){return name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();}

async function initResults(){
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || '';
  const COLORS = ['#76c000','#0f6fff','#ff7a00','#9b51e0','#e02d5b','#00a8a8','#444b54','#c9a400'];

  const mini = document.getElementById('mini-search');
  const miniForm = document.getElementById('mini-form');
  if(mini) mini.value = q;
  if(miniForm) miniForm.addEventListener('submit', e=>{ e.preventDefault(); gotoSearch(mini.value); });
  document.querySelectorAll('[data-term]').forEach(el=> el.textContent = q || '—');

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
    body.innerHTML = `<div class="empty"><div class="big">No suppliers listed for &ldquo;${escapeHtml(q)}&rdquo; yet</div>
      <p>Be the first — <a href="join.html">list your company</a> under this keyword.</p></div>`;
    return;
  }

  const featured = listings.find(l => l.banner);
  let html = '';
  if(featured){
    html += `<div class="premium"><div class="premium-card">
      <span class="premium-badge">Premium &middot; Sponsored</span>
      <div class="premium-logo">${initials(featured.company)}</div>
      <div class="premium-body">
        <h3><a href="${escapeHtml(featured.website||'#')}" target="_blank" rel="noopener">${escapeHtml(featured.company)}</a></h3>
        <p>${escapeHtml(featured.message||'')}</p>
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
          <span class="co-logo" style="background:${COLORS[i%COLORS.length]}">${initials(c.company)}</span>
          <a href="${escapeHtml(c.website||'#')}" target="_blank" rel="noopener">${escapeHtml(c.company)}</a>
          ${c.badge ? `<span class="lb" style="background:${escapeHtml(c.badge.color)}">${escapeHtml(c.badge.text)}</span>` : ''}
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
    const v = (kwInput.value||'').trim().toLowerCase();
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

  // Trust badge builder (option + color, live preview)
  const badgeOpts = document.getElementById('badge-opts');
  const swatches = document.getElementById('swatches');
  const badgePreview = document.getElementById('badge-preview');
  const DEFAULT_TEXT = 'Featured';
  const DEFAULT_COLOR = '#1f9d55';
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
  function resetBadge(){ selectText(DEFAULT_TEXT); selectColor(DEFAULT_COLOR); }

  // Logo upload preview
  const logoInput = document.getElementById('logo-input');
  const logoPrev = document.getElementById('logo-preview');
  const logoImg = document.getElementById('logo-preview-img');
  const logoName = document.getElementById('logo-name');
  if(logoInput) logoInput.addEventListener('change', ()=>{
    const f = logoInput.files && logoInput.files[0];
    if(!f){ logoPrev.style.display='none'; return; }
    logoName.textContent = f.name;
    logoImg.src = URL.createObjectURL(f);
    logoPrev.style.display = 'flex';
  });

  const msg = document.getElementById('msg');
  const msgCount = document.getElementById('msg-count');
  if(msg) msg.addEventListener('input', ()=>{ msgCount.textContent = `${msg.value.length} / 600`; });

  const form = document.getElementById('join-form');
  if(form) form.addEventListener('submit', async e=>{
    e.preventDefault();
    const submitBtn = form.querySelector('.submit');
    const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
    const application = {
      company: v('f-company'), contact: v('f-contact'), email: v('f-email'),
      phone: v('f-phone'), website: v('f-website'),
      logo: (logoInput && logoInput.files && logoInput.files[0]) ? logoInput.files[0].name : '',
      keywords: keywords.slice(),
      banner: !!(document.getElementById('promo-check') && document.getElementById('promo-check').checked),
      badge: { text: curBadgeText, color: curBadgeColor },
      message: msg ? msg.value.trim() : '',
      terms: !!(document.getElementById('f-terms') && document.getElementById('f-terms').checked),
      status: 'Pending'
    };
    try {
      if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Submitting…'; }
      if(window.addApplication) await addApplication(application);
    } catch(err) {
      if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
      alert('Sorry — we couldn’t submit your application right now. Please try again.');
      return;
    }
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Submit Application →'; }
    const ok = document.getElementById('success');
    ok.classList.add('show');
    form.reset();
    keywords = []; renderKw();
    resetBadge();
    if(logoPrev) logoPrev.style.display='none';
    if(msgCount) msgCount.textContent='0 / 600';
    window.scrollTo({top:0,behavior:'smooth'});
  });
}
