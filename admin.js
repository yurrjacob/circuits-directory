/* The Circuits.com admin console.

   This used to be its own page behind its own login. It now lives as a tab
   inside the portal, so there is one way in for everybody and admin is simply
   something an account has. Wrapped in a function so its short names ($, esc,
   panels) cannot collide with portal.js on the same page. */
(function(){
'use strict';
const $ = id => document.getElementById(id);
const esc = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let allApps = [];
let editId = null;
const panels = {
  listings: { sort:'company', limit:50 },
  banners:  { sort:'company', limit:50 },
  badges:   { sort:'company', limit:50 },
  pending:  { sort:'company', limit:50 }
};


const approved = () => allApps.filter(a=>a.status==='Approved');
const pending  = () => allApps.filter(a=>a.status==='Pending');
/* Renders the same way the public site does: our own mark is distinct from a
   paid Trust Badge, so staff see exactly what a buyer sees. */
const isCxBadge = b => !!b && /^circuits\.com$/i.test((b.text || '').trim());
const badgeTag = b => !b ? '—'
  : isCxBadge(b)
    ? `<span class="lb lb-cx" title="Circuits.com team"><img class="lb-cx-mark" src="/assets/favicon.png" alt="" aria-hidden="true">Circuits.com</span>`
    : `<span class="lb" style="background:${esc(b.color)}">${esc(b.text)}</span>`;

/* A keyword can only carry ONE live Exclusive Sponsor banner. An app conflicts
   when it wants a banner on a keyword that another APPROVED listing already
   runs a banner on (matched with the same normalization search uses). */
function bannerConflict(app){
  if(!app || !app.banner) return false;
  const k = normKw(app.keyword);
  if(!k) return false;
  return allApps.some(a => a.id!==app.id && a.banner && a.status==='Approved' && normKw(a.keyword)===k);
}

function sortRows(rows, key){
  const r = rows.slice();
  if(key==='keyword')    r.sort((a,b)=>(a.keyword||'').localeCompare(b.keyword||'') || (a.company||'').localeCompare(b.company||''));
  else if(key==='fee')   r.sort((a,b)=>appPrice(a)-appPrice(b) || (a.company||'').localeCompare(b.company||''));
  else                   r.sort((a,b)=>(a.company||'').localeCompare(b.company||'') || (a.keyword||'').localeCompare(b.keyword||''));
  return r;
}
const view = (rows, panel) => sortRows(rows, panels[panel].sort).slice(0, panels[panel].limit);

function actionsCell(l){
  return `<td class="row-actions">
    <button class="mini-btn" onclick="editListing('${l.id}')">Edit</button>
    <button class="mini-btn" onclick="editBadge('${l.id}')">Badge</button>
    <button class="mini-btn danger" onclick="removeListing('${l.id}')">Remove</button>
    <button class="mini-btn" onclick="togglePause('${l.id}')">${l.paused?'Unpause':'Pause'}</button>
  </td>`;
}

/* ---- badge editor (staff only) ----
   Two things live here that the public form cannot do: free text of our
   choosing, and the Circuits.com mark itself. The database is what actually
   enforces that — guard_verified_badge() refuses "Circuits.com", "Verified"
   and anything claiming a certification from a non-staff caller — so this is
   the convenience, not the control. */
const CX_BADGE = { text: 'Circuits.com', color: '#0f0f0f' };

async function editBadge(id){
  const l = all.find(a => a.id === id);
  if(!l) return;
  const cur = l.badge && l.badge.text ? l.badge.text : '';
  const answer = prompt(
    'Badge for ' + l.company + (l.keyword ? ' — ' + l.keyword : '') + '\n\n'
    + 'Type a label, or:\n'
    + '  cx     the Circuits.com team badge (our mark, staff only)\n'
    + '  blank  remove the badge\n\n'
    + 'Anything claiming a certification (ISO, Certified, Approved…) will be refused.',
    cur);
  if(answer === null) return;

  const text = answer.trim();
  let badge = null;
  if(text){
    if(/^cx$/i.test(text) || /^circuits\.com$/i.test(text)){
      badge = { ...CX_BADGE };
    } else {
      const color = prompt('Badge colour (hex)', (l.badge && l.badge.color) || '#c9a227');
      if(color === null) return;
      badge = { text: text.slice(0, 18), color: /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : '#c9a227' };
    }
  }
  const err = await updateApplication(id, { badge });
  if(err){
    // the database refuses misleading badges even from staff-facing code paths
    alert('Could not set that badge:\n\n' + (err.message || err));
    return;
  }
  await reload();
}

function renderStats(){
  const ap = approved();
  $('s-listings').textContent  = ap.length;
  $('s-companies').textContent = new Set(ap.map(a=>a.company)).size;
  $('s-sponsored').textContent = ap.filter(a=>a.banner).length;
  $('s-pending').textContent   = pending().length;
}

function renderListings(){
  const rows = view(approved(), 'listings');
  $('listings-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      <td>${esc(l.company)}</td>
      <td class="kw">${esc(l.keyword)||'—'}</td>
      <td>${esc(appPriceLabel(l))}</td>
      <td>${l.banner ? '<span class="badge sponsored">Yes</span>' : 'No'}</td>
      <td>${badgeTag(l.badge)}</td>
      ${actionsCell(l)}
    </tr>`).join('');
  $('listings-empty').style.display = approved().length ? 'none' : 'block';
}

function renderBanners(){
  const rows = view(approved().filter(a=>a.banner), 'banners');
  $('banners-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      <td>${esc(l.company)}</td><td class="kw">${esc(l.keyword)||'—'}</td>
      <td>${esc(appPriceLabel(l))}</td>${actionsCell(l)}
    </tr>`).join('');
  $('banners-empty').style.display = approved().filter(a=>a.banner).length ? 'none' : 'block';
}

function renderBadges(){
  const rows = view(approved().filter(a=>a.badge), 'badges');
  $('badges-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      <td>${esc(l.company)}</td><td class="kw">${esc(l.keyword)||'—'}</td>
      <td>${esc(appPriceLabel(l))}</td><td>${badgeTag(l.badge)}</td>${actionsCell(l)}
    </tr>`).join('');
  $('badges-empty').style.display = approved().filter(a=>a.badge).length ? 'none' : 'block';
}

function renderPending(){
  const rows = view(pending(), 'pending');
  $('pending-body').innerHTML = rows.map(p=>{
    const conflict = bannerConflict(p);
    return `
    <tr class="${conflict?'row-warn':''}">
      <td>${esc(p.company)||'—'}</td>
      <td class="kw">${esc(p.keyword)||'—'}</td>
      <td>${esc(p.email)||'—'}</td>
      <td>${p.banner ? '<span class="badge sponsored">Yes</span>' : 'No'}${conflict?' <span class="warn-flag" title="This keyword already has a live Exclusive Sponsor banner">⚠</span>':''}</td>
      <td>${badgeTag(p.badge)}</td>
      <td class="row-actions">
        <button class="mini-btn green" onclick="approveApp('${p.id}')" ${conflict?'disabled title="Blocked: this keyword already has a live Exclusive Sponsor banner. Remove that banner first."':''}>Approve</button>
        <button class="mini-btn danger" onclick="rejectApp('${p.id}')">Reject</button>
      </td>
    </tr>`;}).join('');
  $('pending-empty').style.display = pending().length ? 'none' : 'block';
}

function renderAll(){ renderStats(); renderListings(); renderBanners(); renderBadges(); renderPending(); }
function renderPanel(panel){ ({listings:renderListings,banners:renderBanners,badges:renderBadges,pending:renderPending}[panel])(); }
async function reload(){ allApps = await fetchApplications(); renderAll(); }

/* per-panel sort + limit controls */
document.querySelectorAll('.list-controls').forEach(bar=>{
  const panel = bar.dataset.panel;
  bar.querySelectorAll('.sort-btn').forEach(btn=>btn.addEventListener('click', ()=>{
    panels[panel].sort = btn.dataset.sort;
    bar.querySelectorAll('.sort-btn').forEach(b=>b.classList.toggle('active', b===btn));
    renderPanel(panel); savePrefs('admin', panels);
  }));
  bar.querySelector('.lc-limit').addEventListener('change', e=>{
    let n = parseInt(e.target.value,10); if(isNaN(n)||n<1) n=1; if(n>500) n=500;
    e.target.value = n; panels[panel].limit = n; renderPanel(panel); savePrefs('admin', panels);
  });
});

/* ---- Edit a single keyword row ---- */
function editListing(id){
  const l = allApps.find(a=>a.id===id); if(!l) return;
  editId = id;
  $('e-company').value = l.company||'';
  $('e-keyword').value = l.keyword||'';
  $('e-fee').value = l.fee||'';
  $('e-status').value = l.status||'Approved';
  /* keep custom badge text selectable — add it as an option if it isn't one */
  const badgeSel = $('e-badge'), bText = l.badge ? l.badge.text : '';
  if(bText && ![...badgeSel.options].some(o=>o.value===bText)){
    const o = document.createElement('option'); o.textContent = bText; badgeSel.appendChild(o);
  }
  badgeSel.value = bText;
  $('e-color').value = l.badge ? l.badge.color : '#c9a227';
  $('e-banner').checked = !!l.banner;
  $('edit-form').style.display = 'block';
  $('edit-form').scrollIntoView({behavior:'smooth', block:'center'});
}
function closeEdit(){ editId=null; $('edit-form').style.display='none'; }
$('e-cancel').addEventListener('click', closeEdit);
$('e-save').addEventListener('click', async ()=>{
  if(!editId) return;
  const badgeText = $('e-badge').value;
  const patch = {
    keyword: $('e-keyword').value.trim().toLowerCase(),
    fee: $('e-fee').value.trim() || null,
    status: $('e-status').value,
    banner: $('e-banner').checked,
    badge: badgeText ? { text: badgeText, color: $('e-color').value } : null
  };
  if(patch.banner && patch.status==='Approved'
     && bannerConflict({ id: editId, banner: true, keyword: patch.keyword })){
    alert('That keyword already has a live Exclusive Sponsor banner. Only one banner is allowed per keyword — remove the existing banner first.');
    return;
  }
  $('e-save').disabled = true;
  const err = await updateApplication(editId, patch);
  $('e-save').disabled = false;
  if(err){ alert(bannerError(err)); return; }
  closeEdit(); await reload();
});

function bannerError(err){
  if(err && (err.code==='23505' || /duplicate|unique/i.test(err.message||'')))
    return 'That keyword already has a premium banner. Only one premium banner is allowed per keyword.';
  return 'Could not save. Make sure you are signed in as staff.';
}

async function removeListing(id){ if(!confirm('Remove this keyword listing?')) return; await deleteApplication(id); await reload(); }
async function togglePause(id){ const l = allApps.find(a=>a.id===id); if(!l) return; await setPaused(id, !l.paused); await reload(); }
async function approveApp(id){
  const app = allApps.find(a=>a.id===id);
  if(app && bannerConflict(app)){
    alert('That keyword already has a live Exclusive Sponsor banner. Only one banner is allowed per keyword — remove the existing banner first.');
    return;
  }
  const err = await updateAppStatus(id,'Approved'); if(err){ alert(bannerError(err)); return; } await reload();
}
async function rejectApp(id){ await updateAppStatus(id,'Denied'); await reload(); }

/* ---- profile claims ---- */
let allClaims = [];
async function reloadClaims(){
  allClaims = await fetchClaims();
  const rows = allClaims.map(c=>`<tr>
    <td><a href="/${esc(c.company_slug)}" target="_blank" rel="noopener">${esc(c.company_slug)}</a></td>
    <td>${esc(c.name||'—')}${c.role_title?'<br><span class="cell-muted">'+esc(c.role_title)+'</span>':''}</td>
    <td class="cell-muted">${esc(c.email)}</td>
    <td class="cell-muted" style="max-width:280px">${esc(c.evidence||'—')}</td>
    <td>${esc(c.status)}</td>
    <td class="row-actions">${c.status==='Pending'
      ? `<button class="mini-btn green" onclick="decide('${c.id}',true)">Approve</button>
         <button class="mini-btn" onclick="decide('${c.id}',false)">Deny</button>` : ''}</td></tr>`).join('');
  $('claims-body').innerHTML = rows;
  $('claims-empty').style.display = allClaims.length ? 'none' : 'block';
}
async function decide(id, approve){
  const c = allClaims.find(x=>x.id===id); if(!c) return;
  const err = await decideClaim(c, approve);
  if(err){ alert('Could not update that claim: ' + err); return; }
  await reloadClaims();
}

/* ---- review moderation ---- */
let allReviews = [];
async function reloadReviews(){
  allReviews = await fetchAllReviews();
  /* Anything still Pending is invisible to the public until someone here acts,
     so it goes to the top rather than being buried under old decisions. */
  const rank = s => s === 'Pending' ? 0 : 1;
  allReviews.sort((a,b) => rank(a.status) - rank(b.status));
  const waiting = allReviews.filter(r => r.status === 'Pending').length;
  const hint = document.querySelector('#reviews-body')
    .closest('.panel').querySelector('.panel-head .hint');
  if(hint) hint.textContent = waiting
    ? waiting + (waiting === 1 ? ' review waiting' : ' reviews waiting')
    : 'Nothing waiting';
  $('reviews-body').innerHTML = allReviews.map(r=>`<tr class="${r.status==='Pending'?'row-waiting':''}">
    <td><a href="/${esc(r.company_slug)}" target="_blank" rel="noopener">${esc(r.company_slug)}</a></td>
    <td>${'★'.repeat(r.rating)}</td>
    <td class="cell-muted">${esc(r.author_name)}<br><span class="cell-muted">${esc(r.author_email)}</span></td>
    <td class="cell-muted" style="max-width:320px">${esc(r.body)}</td>
    <td>${esc(r.status)}</td>
    <td class="row-actions">
      ${r.status!=='Approved'?`<button class="mini-btn green" onclick="modReview('${r.id}','Approved')">Approve</button>`:''}
      ${r.status!=='Denied'?`<button class="mini-btn" onclick="modReview('${r.id}','Denied')">Deny</button>`:''}
    </td></tr>`).join('');
  $('reviews-empty').style.display = allReviews.length ? 'none' : 'block';
}
async function modReview(id, status){ await setReviewStatus(id, status); await reloadReviews(); }

/* ---- companies: suspend and reinstate ----
   Suspension is the alternative to deleting. A suspended company disappears
   from the directory and from keyword results, cannot be edited by its owner,
   and keeps every row it had, so this is fully reversible. */
let allCompanies = [];
async function reloadCompanies(){
  allCompanies = await fetchAllCompanies();
  const susp = allCompanies.filter(c => c.suspended_at).length;
  $('companies-hint').textContent = susp
    ? susp + (susp === 1 ? ' company suspended' : ' companies suspended')
    : 'Suspend Hides A Listing Without Deleting Anything';
  $('companies-body').innerHTML = allCompanies.map(c => `
    <tr class="${c.suspended_at ? 'row-waiting' : ''}">
      <td><a href="/${esc(c.handle || c.slug)}" target="_blank" rel="noopener">${esc(c.name)}</a></td>
      <td class="cell-muted">circuits.com/${esc(c.handle || '—')}</td>
      <td class="cell-muted">${esc(c.email || '—')}</td>
      <td>${c.suspended_at
            ? '<b>Suspended</b><br><span class="cell-muted">' + new Date(c.suspended_at).toLocaleDateString() + '</span>'
            : 'Active'}</td>
      <td class="row-actions">
        ${c.suspended_at
          ? `<button class="mini-btn green" onclick="setSuspended('${esc(c.slug)}', false)">Reinstate</button>`
          : `<button class="mini-btn" onclick="setSuspended('${esc(c.slug)}', true)">Suspend</button>`}
      </td></tr>`).join('');
  $('companies-empty').style.display = allCompanies.length ? 'none' : 'block';
}

async function setSuspended(slug, suspend){
  const co = allCompanies.find(c => c.slug === slug);
  const name = co ? co.name : slug;
  /* A reason is required going in, because the audit entry is permanent and a
     bare "suspended" tells nobody anything six months later. */
  const reason = prompt(
    (suspend ? 'Suspend ' : 'Reinstate ') + name + '.\n\n'
    + (suspend
        ? 'This hides the listing from the directory and from search, and blocks the owner from editing it. Nothing is deleted.\n\nWhy?'
        : 'This puts the listing back in the directory.\n\nWhy?'));
  if(reason === null) return;
  if(!reason.trim()){ alert('Please give a reason — it goes in the permanent audit log.'); return; }
  const err = await suspendCompany(slug, suspend, reason.trim());
  if(err){ alert('Could not do that: ' + err); return; }
  await reloadCompanies();
  await reloadAudit();
}

/* ---- audit log ---- */
async function reloadAudit(){
  const rows = await fetchSecurityLog(100);
  $('audit-body').innerHTML = rows.map(r => `
    <tr>
      <td class="cell-muted nowrap">${new Date(r.at).toLocaleString()}</td>
      <td class="cell-muted">${esc(r.actor || 'system')}</td>
      <td><b>${esc(r.action)}</b></td>
      <td class="cell-muted">${esc(r.target || '')}</td>
      <td class="cell-muted" style="max-width:320px">${esc(
        r.detail && r.detail.reason ? r.detail.reason
          : r.detail ? JSON.stringify(r.detail) : '')}</td>
    </tr>`).join('');
  $('audit-empty').style.display = rows.length ? 'none' : 'block';
}

function syncControls(){ document.querySelectorAll('.list-controls').forEach(bar=>{ const p = panels[bar.dataset.panel]; bar.querySelectorAll('.sort-btn').forEach(b=>b.classList.toggle('active', b.dataset.sort===p.sort)); bar.querySelector('.lc-limit').value = p.limit; }); } /* Opened from the Admin tab in the portal, not on page load: a company owner
   who is not staff never runs any of this, and never fetches any of it. */
let started = false;
window.initAdmin = async function(){
  if(started) return;
  if(!(await checkStaff())) return;        // belt and braces; the database is the real gate
  started = true;
  reloadClaims(); reloadReviews(); reloadCompanies(); reloadAudit();
  const saved = await loadPrefs('admin');
  if(saved) for(const k in panels){
    if(saved[k] && saved[k].sort) panels[k].sort = saved[k].sort;
    if(saved[k] && saved[k].limit) panels[k].limit = saved[k].limit;
  }
  syncControls(); reload();
};
})();
