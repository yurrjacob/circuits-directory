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
   paid Trust Badge chosen for that one keyword, and there is no other kind:
   our own team mark is not a badge and never sits on a listing. */
const badgeTag = b => !b ? '—'
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
   and anything claiming a certification from ANY caller, staff included — so
   this is the convenience, not the control. */

async function editBadge(id){
  const l = allApps.find(a => a.id === id);
  if(!l) return;
  const cur = l.badge && l.badge.text ? l.badge.text : '';
  const answer = prompt(
    'Badge for ' + l.company + (l.keyword ? ' — ' + l.keyword : '') + '\n\n'
    + 'Type a label, or leave it blank to remove the badge.\n\n'
    + 'A Trust Badge is a paid label for this one keyword. Anything claiming a\n'
    + 'certification (ISO, Certified, Approved…) will be refused, and so will\n'
    + '"Circuits.com" — our mark belongs to the account, not to a listing.',
    cur);
  if(answer === null) return;

  const text = answer.trim();
  let badge = null;
  if(text){
    const color = prompt('Badge colour (hex)', (l.badge && l.badge.color) || '#c9a227');
    if(color === null) return;
    badge = { text: text.slice(0, 18), color: /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : '#c9a227' };
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
  /* the "What People Search For" bar has no limit box — a missing one must
     not crash this whole file at load (it did: initAdmin was never defined
     and the admin tab sat empty) */
  const lcLimit = bar.querySelector('.lc-limit');
  if(lcLimit) lcLimit.addEventListener('change', e=>{
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
  if(!patch.keyword){ alert('The listing needs a keyword — that is what buyers search for.'); return; }
  if(patch.fee && !/\d/.test(patch.fee)){ alert('The fee needs an amount, e.g. $49/mo.'); return; }
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
  const err = await updateAppStatus(id,'Approved'); if(err){ alert(bannerError(err)); return; }
  /* Tell them. Until now a supplier applied and then refreshed the portal
     hoping — the notifier only knew how to send quote requests. */
  notifyDecision(id, '');
  await reload();
}
async function rejectApp(id){
  /* A denial with no reason reads as a shrug, and the supplier has no idea
     whether to fix something and come back. Optional, but asked for every time
     so it is the default rather than an afterthought. */
  const reason = prompt(
    'Why is this being denied?\n\n'
    + 'This is sent to the supplier. Leave it blank to send the plain notice with no reason.',
    '');
  if(reason === null) return;                 // cancelled — change nothing
  await updateAppStatus(id,'Denied');
  notifyDecision(id, reason.trim());
  await reload();
}

/* ---- profile claims ---- */
let allClaims = [];
/* The claimant's own words, plus the one fact they cannot fake: where their
   email actually comes from. Shown together so the typed justification is read
   against the evidence rather than on its own. */
const CLAIM_SIGNAL = {
  'domain-match':    { label: 'Company domain',  cls: 'ok'   },
  'listed-address':  { label: 'Listed address',  cls: 'ok'   },
  'free-mailbox':    { label: 'Personal email',  cls: 'warn' },
  'different-domain':{ label: 'Different domain',cls: 'warn' },
  'unknown':         { label: 'No email',        cls: 'warn' }
};
function claimSignalHtml(ev){
  if(!ev) return '';   // lookup failed: show nothing rather than a reassuring guess
  const s = CLAIM_SIGNAL[ev.verdict] || CLAIM_SIGNAL.unknown;
  return `<div class="claim-signal ${s.cls}" title="${esc(ev.detail)}">${esc(s.label)}</div>`;
}
async function reloadClaims(){
  allClaims = await fetchClaims();
  /* only for claims still awaiting a decision — the rest are history */
  await Promise.all(allClaims.map(async c => {
    if(c.status === 'Pending') c._ev = await claimEvidence(c.company_slug, c.email);
  }));
  const rows = allClaims.map(c=>`<tr>
    <td><a href="/${esc(c.company_slug)}" target="_blank" rel="noopener">${esc(c.company_slug)}</a></td>
    <td>${esc(c.name||'—')}${c.role_title?'<br><span class="cell-muted">'+esc(c.role_title)+'</span>':''}</td>
    <td class="cell-muted">${esc(c.email)}${claimSignalHtml(c._ev)}</td>
    <td class="cell-muted" style="max-width:280px">${esc(c.evidence||'—')}${
      c._ev ? '<div class="claim-why">' + esc(c._ev.detail) + '</div>' : ''}</td>
    <td>${esc(c.status)}</td>
    <td class="row-actions">${c.status==='Pending'
      ? `<button class="mini-btn green" onclick="decide('${c.id}',true)">Approve</button>
         <button class="mini-btn" onclick="decide('${c.id}',false)">Deny</button>` : ''}</td></tr>`).join('');
  $('claims-body').innerHTML = rows;
  $('claims-empty').style.display = allClaims.length ? 'none' : 'block';
}
async function decide(id, approve){
  const c = allClaims.find(x=>x.id===id); if(!c) return;
  /* Approving hands over the listing's quote requests, and taking that back
     later does not un-send the ones that went to the wrong inbox. When the
     email is not from the company, say so once before it happens. */
  if(approve && c._ev && (c._ev.verdict === 'free-mailbox'
      || c._ev.verdict === 'different-domain' || c._ev.verdict === 'unknown')){
    const ok = confirm(c._ev.detail + '\n\nApproving gives ' + (c.email || 'this person')
      + ' control of ' + c.company_slug + ', including every quote request sent to it.'
      + '\n\nApprove anyway?');
    if(!ok) return;
  }
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

/* ---- quote requests the supplier is sitting on ----
   The database counts New/Open inquiries older than three days with no
   supplier-authored message. The "Nudge" action is a plain mailto from the
   staff member's own mail client — it works today, with no sending key. */
async function reloadUnanswered(){
  const rows = await adminUnansweredInquiries(3);
  const total = rows.reduce((a, r) => a + Number(r.waiting), 0);
  if($('s-unanswered')) $('s-unanswered').textContent = total;
  $('unanswered-body').innerHTML = rows.map(r => `
    <tr class="row-waiting">
      <td>${esc(r.company)}</td>
      <td><b>${r.waiting}</b> request${Number(r.waiting) === 1 ? '' : 's'}</td>
      <td class="cell-muted nowrap">${new Date(r.oldest).toLocaleDateString()}</td>
      <td class="row-actions">${r.email
        ? `<a class="mini-btn" href="mailto:${esc(r.email)}?subject=${encodeURIComponent('Buyers are waiting on you at Circuits.com')}&body=${encodeURIComponent('Hi,\n\nQuote requests are waiting in your Circuits.com portal with no reply yet. Buyers usually move on after a few days.\n\nSign in at https://circuits.com/portal to answer them.\n\n- The Circuits.com team')}">Nudge by email</a>`
        : '<span class="cell-muted">no email on file</span>'}</td>
    </tr>`).join('');
  $('unanswered-empty').style.display = rows.length ? 'none' : 'block';
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

/* ---- demand: what people looked for, and who is waiting ----
   The whole reason for logging searches. A list of terms nobody could be sold
   is the sales list, and the ones with a buyer attached are warm. */
let searchView = { days: 30, missedOnly: false };

async function reloadSearches(){
  const rows = await fetchTopSearches(searchView.days, searchView.missedOnly);
  $('searches-body').innerHTML = rows.map(r => `
    <tr>
      <td><b>${esc(r.term)}</b></td>
      <td>${r.searches}</td>
      <td>${r.misses > 0 ? '<b>' + r.misses + '</b>' : '0'}</td>
      <td class="cell-muted nowrap">${new Date(r.last_seen).toLocaleDateString()}</td>
      <td><a class="mini-btn" href="/results?q=${encodeURIComponent(r.term)}" target="_blank" rel="noopener">See it</a></td>
    </tr>`).join('');
  $('searches-empty').style.display = rows.length ? 'none' : 'block';
}

async function reloadWanted(){
  const rows = await fetchWanted();
  $('wanted-body').innerHTML = rows.map(w => `
    <tr${w.handled ? ' style="opacity:.5"' : ''}>
      <td class="cell-muted nowrap">${new Date(w.at).toLocaleDateString()}</td>
      <td><b>${esc(w.keyword)}</b></td>
      <td><a href="mailto:${esc(w.email)}?subject=${encodeURIComponent('Your Circuits.com request for "' + w.keyword + '"')}">${esc(w.email)}</a></td>
      <td class="cell-muted" style="max-width:340px">${esc(w.note || '')}</td>
      <td><button class="mini-btn" onclick="markWanted('${w.id}', ${w.handled ? 'false' : 'true'})">${w.handled ? 'Reopen' : 'Mark done'}</button></td>
    </tr>`).join('');
  $('wanted-empty').style.display = rows.length ? 'none' : 'block';
}

async function markWanted(id, handled){
  const err = await setWantedHandled(id, handled);
  if(err){ alert('Could not update:\n\n' + err); return; }
  reloadWanted();
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-searches]');
  if(!b) return;
  searchView.missedOnly = b.dataset.searches === 'missed';
  document.querySelectorAll('[data-searches]').forEach(x => x.classList.toggle('active', x === b));
  reloadSearches();
});
document.addEventListener('change', e => {
  if(e.target.id !== 's-days') return;
  searchView.days = +e.target.value || 30;
  reloadSearches();
});

function syncControls(){ document.querySelectorAll('.list-controls').forEach(bar=>{ const p = panels[bar.dataset.panel]; if(!p) return; /* the searches bar keeps its own controls */ bar.querySelectorAll('.sort-btn').forEach(b=>b.classList.toggle('active', b.dataset.sort===p.sort)); const l = bar.querySelector('.lc-limit'); if(l) l.value = p.limit; }); } /* Opened from the Admin tab in the portal, not on page load: a company owner
   who is not staff never runs any of this, and never fetches any of it. */
let started = false;
window.initAdmin = async function(){
  if(started) return;
  if(!(await checkStaff())) return;        // belt and braces; the database is the real gate
  started = true;
  reloadClaims(); reloadReviews(); reloadCompanies(); reloadAudit();
  reloadSearches(); reloadWanted(); reloadUnanswered();
  const saved = await loadPrefs('admin');
  if(saved) for(const k in panels){
    if(saved[k] && saved[k].sort) panels[k].sort = saved[k].sort;
    if(saved[k] && saved[k].limit) panels[k].limit = saved[k].limit;
  }
  syncControls(); reload();
};

/* The table rows are built as HTML strings with onclick="..." on each button,
   and an inline handler is evaluated in global scope — so wrapping this file
   put every row button out of its own reach. Anything a row calls has to be
   published deliberately; everything else stays private to this file.
   tools/check.js fails if a new onclick appears without being listed here. */
Object.assign(window, {
  editListing, editBadge, removeListing, togglePause,
  approveApp, rejectApp, decide, modReview, setSuspended, markWanted
});
})();
