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

function initResults(){
  const params = new URLSearchParams(location.search);
  const q = params.get('q') || '';
  const data = lookupKeyword(q);

  // mini search prefilled
  const mini = document.getElementById('mini-search');
  const miniForm = document.getElementById('mini-form');
  if(mini) mini.value = q;
  if(miniForm) miniForm.addEventListener('submit', e=>{ e.preventDefault(); gotoSearch(mini.value); });

  const termEls = document.querySelectorAll('[data-term]');
  termEls.forEach(el=> el.textContent = q || '—');

  if(!q || !data){
    document.getElementById('results-body').innerHTML =
      `<div class="empty"><div class="big">Type a keyword to see suppliers</div>
       <p>Try <a href="results.html?q=circuits">circuits</a>, <a href="results.html?q=microcontrollers">microcontrollers</a>, or <a href="results.html?q=sensors">sensors</a>.</p></div>`;
    return;
  }

  const count = data.companies.length + 1;
  const countEl = document.getElementById('result-count');
  if(countEl) countEl.textContent = count;

  // Premium banner
  const p = data.premium;
  const premiumHtml = `
    <div class="premium">
      <div class="premium-card">
        <span class="premium-badge">Premium &middot; Sponsored</span>
        <div class="premium-logo">${initials(p.name)}</div>
        <div class="premium-body">
          <h3><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a></h3>
          <p>${escapeHtml(p.blurb)}</p>
        </div>
        <div class="premium-contact">
          ${escapeHtml(p.contact)}<br>
          <a href="tel:${escapeHtml(p.phone)}">${escapeHtml(p.phone)}</a><br>
          <a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>
        </div>
      </div>
    </div>`;

  // Table rows
  const BADGE_CLASS = {Verified:'lb-verified',Trusted:'lb-trusted',Authorized:'lb-authorized','Top Rated':'lb-toprated',Certified:'lb-certified','Premier Partner':'lb-premier','Official Supplier':'lb-official','Preferred Vendor':'lb-preferred','Elite Seller':'lb-elite',Established:'lb-established'};
  const rows = data.companies.map(c=>`
    <tr>
      <td>
        <div class="co">
          <span class="co-logo" style="background:${c.color}">${initials(c.name)}</span>
          <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a>
          ${c.badge ? `<span class="lb ${BADGE_CLASS[c.badge]||''}">${escapeHtml(c.badge)}</span>` : ''}
        </div>
      </td>
      <td class="cell-muted">${escapeHtml(c.contact)}</td>
      <td class="cell-muted"><a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></td>
      <td class="cell-muted"><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></td>
    </tr>`).join('');

  document.getElementById('results-body').innerHTML = premiumHtml + `
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

  // Custom badge builder (text + color, live preview)
  const badgeText = document.getElementById('badge-text');
  const swatches = document.getElementById('swatches');
  const badgePreview = document.getElementById('badge-preview');
  const DEFAULT_COLOR = '#1f9d55';
  function updatePreview(){
    if(badgePreview) badgePreview.textContent = (badgeText && badgeText.value.trim()) || 'Your Badge';
  }
  function selectColor(color){
    if(badgePreview) badgePreview.style.background = color;
    if(swatches) swatches.querySelectorAll('.swatch').forEach(s=>s.classList.toggle('selected', s.dataset.color===color));
  }
  if(badgeText) badgeText.addEventListener('input', updatePreview);
  if(swatches) swatches.addEventListener('click', e=>{
    const s = e.target.closest('.swatch'); if(!s) return;
    selectColor(s.dataset.color);
  });
  selectColor(DEFAULT_COLOR); updatePreview();
  function resetBadge(){ if(badgeText) badgeText.value=''; selectColor(DEFAULT_COLOR); updatePreview(); }

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
  if(form) form.addEventListener('submit', e=>{
    e.preventDefault();
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
