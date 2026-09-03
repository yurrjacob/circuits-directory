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
const badgeTag = b => !b ? 'none'
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
    <button class="mini-btn" onclick="lockListing('${l.id}')">${l.locked_position?'Unlock':'Lock'}</button>
  </td>`;
}

/* Paid fixed placement: pin this listing to spot #N on its keyword. Staff only
   (the database reverts it for anyone else) and one company per spot per
   keyword (a unique index), so a taken spot comes back as an error here. */
async function lockListing(id){
  const l = allApps.find(a=>a.id===id); if(!l) return;
  const raw = prompt('Lock ' + l.company + ' to which spot on \u201c' + (l.keyword||'') + '\u201d?\n\nEnter a number (1 = top of the list). Leave it blank to unlock.',
    l.locked_position ? String(l.locked_position) : '');
  if(raw === null) return;
  const n = raw.trim() === '' ? null : parseInt(raw, 10);
  if(raw.trim() !== '' && !(n >= 1 && n <= 99)){ alert('Please enter a number from 1 to 99, or leave it blank to unlock.'); return; }
  const err = await updateApplication(id, { locked_position: n });
  if(err){
    alert(/duplicate|unique|23505/i.test((err.message||'') + (err.code||''))
      ? 'Spot #' + n + ' on \u201c' + (l.keyword||'') + '\u201d is already locked by another company. Unlock theirs first, or pick another spot.'
      : 'Could not save that: ' + (err.message || 'unknown error'));
    return;
  }
  await reload();
}

/* ---- badge editor (staff only) ----
   Two things live here that the public form cannot do: free text of our
   choosing, and the Circuits.com mark itself. The database is what actually
   enforces that, guard_verified_badge() refuses "Circuits.com", "Verified"
   and anything claiming a certification from ANY caller, staff included, so
   this is the convenience, not the control. */

async function editBadge(id){
  const l = allApps.find(a => a.id === id);
  if(!l) return;
  const cur = l.badge && l.badge.text ? l.badge.text : '';
  const answer = prompt(
    'Badge for ' + l.company + (l.keyword ? ' / ' + l.keyword : '') + '\n\n'
    + 'Type a label, or leave it blank to remove the badge.\n\n'
    + 'A Trust Badge is a paid label for this one keyword. Anything claiming a\n'
    + 'certification (ISO, Certified, Approved…) will be refused, and so will\n'
    + '"Circuits.com". Our mark belongs to the account, not to a listing.',
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
      <td class="kw">${esc(l.keyword)||'none'}</td>
      <td>${esc(appPriceLabel(l))}</td>
      <td>${l.banner ? '<span class="badge sponsored">Yes</span>' : 'No'}</td>
      <td>${badgeTag(l.badge)}</td>
      <td>${l.locked_position ? '<span class="badge sponsored">#' + l.locked_position + '</span>' : 'no'}</td>
      ${actionsCell(l)}
    </tr>`).join('');
  $('listings-empty').style.display = approved().length ? 'none' : 'block';
}

function renderBanners(){
  const rows = view(approved().filter(a=>a.banner), 'banners');
  $('banners-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      <td>${esc(l.company)}</td><td class="kw">${esc(l.keyword)||'none'}</td>
      <td>${esc(appPriceLabel(l))}</td>${actionsCell(l)}
    </tr>`).join('');
  $('banners-empty').style.display = approved().filter(a=>a.banner).length ? 'none' : 'block';
}

function renderBadges(){
  const rows = view(approved().filter(a=>a.badge), 'badges');
  $('badges-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      <td>${esc(l.company)}</td><td class="kw">${esc(l.keyword)||'none'}</td>
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
      <td>${esc(p.company)||'none'}</td>
      <td class="kw">${esc(p.keyword)||'none'}</td>
      <td>${esc(p.email)||'none'}</td>
      <td>${p.banner ? '<span class="badge sponsored">Yes</span>' : 'No'}${conflict?' <span class="warn-flag" title="This keyword already has a live Exclusive Sponsor banner">⚠</span>':''}</td>
      <td>${badgeTag(p.badge)}</td>
      <td class="row-actions">
        <button class="mini-btn green" onclick="approveApp('${p.id}')" ${conflict?'disabled title="Blocked: this keyword already has a live Exclusive Sponsor banner. Remove that banner first."':''}>Approve</button>
        <button class="mini-btn danger" onclick="rejectApp('${p.id}')">Reject</button>
      </td>
    </tr>`;}).join('');
  $('pending-empty').style.display = pending().length ? 'none' : 'block';
}

/* Ideas: the free-text "Have Any Ideas?" box on the Get Listed form, one row
   per application that filled it in, newest first. Lived on the Website
   Applications sheet until 2026-09-01; it is read here, edited nowhere. */
function renderIdeas(){
  const rows = allApps.filter(a => a.message && String(a.message).trim())
    .slice().sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''));
  $('ideas-body').innerHTML = rows.map(a=>`
    <tr>
      <td class="cell-muted nowrap">${esc((a.created_at||'').slice(0,10))}</td>
      <td>${esc(a.company)||'none'}</td>
      <td class="cell-muted">${esc(a.contact)||''}${a.email?'<br><span class="cell-muted">'+esc(a.email)+'</span>':''}</td>
      <td class="idea-text">${esc(a.message)}</td>
    </tr>`).join('');
  $('ideas-empty').style.display = rows.length ? 'none' : 'block';
}

function renderAll(){ renderStats(); renderListings(); renderBanners(); renderBadges(); renderPending(); renderIdeas(); }
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
  /* the "What People Search For" bar has no limit box, a missing one must
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
  /* keep custom badge text selectable, add it as an option if it isn't one */
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
  if(!patch.keyword){ alert('The listing needs a keyword. That is what buyers search for.'); return; }
  if(patch.fee && !/\d/.test(patch.fee)){ alert('The fee needs an amount, e.g. $49/mo.'); return; }
  if(patch.banner && patch.status==='Approved'
     && bannerConflict({ id: editId, banner: true, keyword: patch.keyword })){
    alert('That keyword already has a live Exclusive Sponsor banner. Only one banner is allowed per keyword. Remove the existing banner first.');
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
    alert('That keyword already has a live Exclusive Sponsor banner. Only one banner is allowed per keyword. Remove the existing banner first.');
    return;
  }
  const err = await updateAppStatus(id,'Approved'); if(err){ alert(bannerError(err)); return; }
  /* Tell them. Until now a supplier applied and then refreshed the portal
     hoping, the notifier only knew how to send quote requests. */
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
  if(reason === null) return;                 // cancelled, change nothing
  await updateAppStatus(id,'Denied');
  notifyDecision(id, reason.trim());
  await reload();
}

/* ---- companies: suspend and reinstate ----
   Suspension is the alternative to deleting. A suspended company disappears
   from the directory and from keyword results, cannot be edited by its owner,
   and keeps every row it had, so this is fully reversible. */
let allCompanies = [];
async function reloadCompanies(){
  allCompanies = await fetchAllCompanies();
  const susp = allCompanies.filter(c => c.suspended_at).length;
  $('companies-hint').textContent = susp
    ? susp + (susp === 1 ? ' profile suspended' : ' profiles suspended')
    : 'Every Account On The Site. Suspend Hides Without Deleting. Talent Access Unlocks Seeking Employment Details';
  $('companies-body').innerHTML = allCompanies.map(c => `
    <tr class="${c.suspended_at ? 'row-waiting' : ''}">
      <td><a href="/${esc(c.handle || c.slug)}" target="_blank" rel="noopener">${esc(c.name)}</a></td>
      <td class="cell-muted">${c.handle ? 'circuits.com/' + esc(c.handle) : 'no address yet'}</td>
      <td class="cell-muted">${esc(c.email || 'none')}</td>
      <td>${c.suspended_at
            ? '<b>Suspended</b><br><span class="cell-muted">' + new Date(c.suspended_at).toLocaleDateString() + '</span>'
            : 'Active'}</td>
      <td>${accessUntil(c) > Date.now()
            ? '<b>Until ' + new Date(c.talent_access_until).toLocaleDateString() + '</b>'
            : '<span class="cell-muted">None</span>'}</td>
      <td class="row-actions">
        ${c.suspended_at
          ? `<button class="mini-btn green" onclick="setSuspended('${esc(c.slug)}', false)">Reinstate</button>`
          : `<button class="mini-btn" onclick="setSuspended('${esc(c.slug)}', true)">Suspend</button>`}
        <button class="mini-btn" onclick="setTalentAccessUI('${esc(c.slug)}')">Talent Access</button>
        <button class="mini-btn danger" onclick="deleteCompanyUI('${esc(c.slug)}')">Delete</button>
      </td></tr>`).join('');
  $('companies-empty').style.display = allCompanies.length ? 'none' : 'block';
}
function accessUntil(c){ return c && c.talent_access_until ? new Date(c.talent_access_until).getTime() : 0; }

/* Talent Access (MVP2): a monthly subscription recorded by staff after payment.
   Months are added to whatever is left, so renewing early loses nothing. */
async function setTalentAccessUI(slug){
  const co = allCompanies.find(c => c.slug === slug);
  const name = co ? co.name : slug;
  const left = accessUntil(co) > Date.now() ? 'Active until ' + new Date(co.talent_access_until).toLocaleDateString() + '.' : 'No access at the moment.';
  const raw = prompt(name + ': Talent Access.\n' + left + '\n\nMonths to add (1-12). Leave blank to revoke access now.', '1');
  if(raw === null) return;
  let until = null;
  if(raw.trim()){
    const months = parseInt(raw, 10);
    if(!(months >= 1 && months <= 12)){ alert('Months should be 1 to 12.'); return; }
    const d = new Date(Math.max(Date.now(), accessUntil(co)));
    d.setMonth(d.getMonth() + months);
    until = d.toISOString();
  }
  const err = await setTalentAccess(slug, until);
  if(err){ alert('Could not do that: ' + err); return; }
  await reloadCompanies();
}

/* ---- Upgrade Applications: badge / banner / locked position, asked from Listings ----
   A Trust Badge request carries the label and colour the company chose;
   Approve applies exactly that to the listing, Deny closes the request and
   tells the company. Payment is taken outside the site first. */
const UPGRADE_NAMES = { badge: 'Trust Badge', banner: 'Sponsor banner', lock: 'Locked position' };
let openUpgrades = [];
async function reloadUpgrades(){
  const body = $('upgrades-body'); if(!body) return;
  openUpgrades = await fetchUpgradeRequests();
  body.innerHTML = openUpgrades.map(r => `
    <tr class="row-waiting">
      <td>${esc(r.company || r.company_slug)}</td>
      <td>${esc(r.keyword || 'none')}</td>
      <td><b>${esc(UPGRADE_NAMES[r.kind] || r.kind)}</b></td>
      <td>${r.kind === 'badge' ? `<span class="lb" style="background:${esc(r.badge_color || '#c9a227')}">${esc(r.badge_text || '')}</span>` : r.kind === 'lock' ? 'Spot chosen on Approve' : 'Exclusive banner'}</td>
      <td class="cell-muted">${new Date(r.created_at).toLocaleDateString()}</td>
      <td class="row-actions">
        <button class="mini-btn green" onclick="approveUpgrade('${esc(r.id)}')">Approve</button>
        <button class="mini-btn danger" onclick="denyUpgrade('${esc(r.id)}')">Deny</button>
      </td></tr>`).join('');
  $('upgrades-empty').style.display = openUpgrades.length ? 'none' : 'block';
}
async function approveUpgrade(id){
  const r = openUpgrades.find(u => u.id === id); if(!r) return;
  const l = allApps.find(a => a.id === r.application_id);
  if(!l){ alert('That listing is gone.'); return; }
  let fields;
  if(r.kind === 'badge'){
    fields = { badge: { text: (r.badge_text || '').slice(0, 18), color: r.badge_color || '#c9a227' } };
    if(!fields.badge.text){ alert('This request has no badge label. Deny it and ask the company to request again.'); return; }
  }else if(r.kind === 'banner'){
    if(bannerConflict({ ...l, banner: true })){ alert('Blocked: "' + (l.keyword || '') + '" already has a live Exclusive Sponsor banner. Remove that one first.'); return; }
    fields = { banner: true };
  }else{
    const raw = prompt('Lock ' + l.company + ' to which spot on “' + (l.keyword || '') + '”? (1 = top)', '1');
    if(raw === null) return;
    const n = parseInt(raw, 10);
    if(!(n >= 1 && n <= 99)){ alert('Please enter a number from 1 to 99.'); return; }
    fields = { locked_position: n };
  }
  if(!confirm('Approve this ' + UPGRADE_NAMES[r.kind] + ' for ' + l.company + '? Only do this once payment is taken. It goes live now.')) return;
  const err = await updateApplication(l.id, fields);
  if(err){
    alert(/duplicate|unique|23505/i.test((err.message || '') + (err.code || ''))
      ? 'That spot on “' + (l.keyword || '') + '” is already locked by another company.'
      : 'Could not apply that: ' + (err.message || err));
    return;
  }
  const derr = await handleUpgradeRequest(id, 'Approved');
  if(derr) alert('Applied, but the request could not be closed: ' + derr);
  await reload(); await reloadUpgrades();
}
async function denyUpgrade(id){
  const r = openUpgrades.find(u => u.id === id); if(!r) return;
  if(!confirm('Deny this ' + UPGRADE_NAMES[r.kind] + ' request? The company is told it was not approved.')) return;
  const err = await handleUpgradeRequest(id, 'Denied');
  if(err){ alert('Could not do that: ' + err); return; }
  await reloadUpgrades();
}

/* ---- send a message: staff-written notification into one or many inboxes ---- */
/* Specific users: one input per person, + adds a row, × removes one (never the last). */
const ntUsers = $('nt-users');
if(ntUsers) ntUsers.addEventListener('click', e => {
  const add = e.target.closest('[data-adduser]'), rm = e.target.closest('[data-rmuser]');
  if(add){
    const row = ntUsers.querySelector('.nt-user').cloneNode(true);
    row.querySelector('input').value = '';
    ntUsers.insertBefore(row, add); row.querySelector('input').focus();
  }
  if(rm){
    const rows = ntUsers.querySelectorAll('.nt-user');
    if(rows.length > 1) rm.closest('.nt-user').remove(); else rows[0].querySelector('input').value = '';
  }
});
function ntUserList(){ return Array.from(document.querySelectorAll('#nt-users .nt-user-in')).map(i => i.value.trim()).filter(Boolean); }
function notifyAudienceUI(){
  const a = $('nt-aud').value;
  $('nt-users-field').style.display = a === 'users' ? '' : 'none';
  $('nt-kw-field').style.display = a === 'keyword' ? '' : 'none';
}
async function sendNotificationUI(){
  const v = id => ($(id).value || '').trim();
  const aud = v('nt-aud'), subject = v('nt-subject'), body = v('nt-body'), link = v('nt-link'), msg = $('nt-msg');
  const to = aud === 'users' ? ntUserList().join(', ') : aud === 'keyword' ? 'keyword:' + v('nt-kw') : aud;
  const label = { users: 'those users', keyword: 'everyone listed under "' + v('nt-kw') + '"', companies: 'every account', individuals: 'every individual account', everyone: 'every user on the site' }[aud];
  if(!subject || !body || to === 'keyword:' || !to){ msg.textContent = 'Recipient, subject and message are all needed.'; return; }
  if(aud !== 'users' && !confirm(`Send "${subject}" to ${label}? This cannot be recalled.`)) return;
  $('nt-send').disabled = true; msg.textContent = 'Sending…';
  const r = await sendNotification(to, subject, body, link);
  $('nt-send').disabled = false;
  if(r.error){ msg.textContent = 'Could not send: ' + r.error; return; }
  const missed = r.unknown.length ? ' Not found: ' + r.unknown.join(', ') + '.' : '';
  if(!r.sent){ msg.textContent = 'Nobody matched.' + (missed || ' Nothing is listed under that keyword yet.'); return; }
  msg.textContent = 'Sent to ' + r.sent + (r.sent === 1 ? ' inbox.' : ' inboxes.') + missed;
  ['nt-subject', 'nt-body', 'nt-link'].forEach(id => { $(id).value = ''; });
  document.querySelectorAll('#nt-users .nt-user').forEach((r, i) => { if(i) r.remove(); else r.querySelector('input').value = ''; });
}

/* ---- recruits (MVP2): people listed in the Recruits Directory ---- */
let allRecruits = [];
async function reloadRecruits(){
  const body = $('recruits-body'); if(!body) return;
  allRecruits = await fetchRecruits();
  const order = { Pending: 0, Approved: 1, Denied: 2 };
  allRecruits.sort((a, b) => (order[a.talent_status] ?? 9) - (order[b.talent_status] ?? 9));
  body.innerHTML = allRecruits.map(r => `
    <tr class="${r.talent_status === 'Pending' ? 'row-waiting' : ''}">
      <td><a href="/${esc(r.handle)}" target="_blank" rel="noopener">${esc(r.display_name || r.handle)}</a></td>
      <td>${esc(r.title || 'none')}</td>
      <td>${r.years == null ? 'none' : r.years}</td>
      <td class="cell-muted">${new Date(r.updated_at).toLocaleDateString()}</td>
      <td>${r.talent_status === 'Pending' ? '<b>Pending</b>' : esc(r.talent_status)}</td>
      <td class="row-actions">
        ${r.talent_status !== 'Approved' ? `<button class="mini-btn green" onclick="setRecruitStatus('${esc(r.user_id)}', 'Approved')">Approve</button>` : ''}
        ${r.talent_status !== 'Denied' ? `<button class="mini-btn" onclick="setRecruitStatus('${esc(r.user_id)}', 'Denied')">Deny</button>` : ''}
      </td></tr>`).join('');
  $('recruits-empty').style.display = allRecruits.length ? 'none' : 'block';
}
async function setRecruitStatus(userId, status){
  const r = allRecruits.find(x => x.user_id === userId);
  const who = r ? (r.display_name || r.handle) : 'this person';
  if(status === 'Denied' && !confirm('Deny ' + who + '? They leave the Recruits Directory and get a message saying so. Their profile stays as it is.')) return;
  const err = await setTalentStatus(userId, status);
  if(err){ alert('Could not do that: ' + err); return; }
  await reloadRecruits();
}

/* ---- jobs (MVP2): live for 30 days per payment, recorded by staff ---- */
let allJobs = [];
function jobState(j){
  if(j.closed_at) return 'Paused';
  if(j.paid_until && new Date(j.paid_until) > new Date()) return 'Live until ' + new Date(j.paid_until).toLocaleDateString();
  if(j.paid_until) return 'Expired';
  return 'Awaiting payment';
}
async function reloadJobs(){
  const body = $('jobs-body'); if(!body) return;
  allJobs = await fetchAllJobs();
  body.innerHTML = allJobs.map(j => `
    <tr class="${jobState(j) === 'Awaiting payment' ? 'row-waiting' : ''}">
      <td><a href="/${esc(j.company_handle || j.company_slug)}" target="_blank" rel="noopener">${esc(j.company_name)}</a></td>
      <td><b>${esc(j.title)}</b>${j.location ? '<br><span class="cell-muted">' + esc(j.location) + '</span>' : ''}</td>
      <td class="cell-muted">${esc((j.keywords || []).join(', ') || 'none')}</td>
      <td class="cell-muted">${new Date(j.created_at).toLocaleDateString()}</td>
      <td>${esc(jobState(j))}</td>
      <td class="row-actions">
        ${j.closed_at ? '' : `<button class="mini-btn green" onclick="markJobPaid('${esc(j.id)}')">Approve (30 days)</button>
        <button class="mini-btn" onclick="closeJob('${esc(j.id)}')">Deny</button>`}
      </td></tr>`).join('');
  $('jobs-empty').style.display = allJobs.length ? 'none' : 'block';
}
async function markJobPaid(id){
  const j = allJobs.find(x => x.id === id);
  const from = Math.max(Date.now(), j && j.paid_until ? new Date(j.paid_until).getTime() : 0);
  const err = await updateJob(id, { paid_until: new Date(from + 30 * 864e5).toISOString() });
  if(err){ alert('Could not do that: ' + err); return; }
  await reloadJobs();
}
async function closeJob(id){
  const j = allJobs.find(x => x.id === id);
  if(!confirm('Deny ' + (j ? '"' + j.title + '"' : 'this job') + '? It is paused, comes off the Employment Board, and the company gets a message. They can switch it back to Live from their dashboard.')) return;
  const err = await updateJob(id, { closed_at: new Date().toISOString() });
  if(err){ alert('Could not do that: ' + err); return; }
  await reloadJobs();
}

/* Deletion is final: the company row, its listings, jobs, reviews and requests
   all go. Typing the exact name is the confirmation; a reason goes in the log. */
async function deleteCompanyUI(slug){
  const co = allCompanies.find(c => c.slug === slug);
  const name = co ? co.name : slug;
  const typed = prompt('Delete ' + name + ' for good? This removes the company page, every keyword listing, job post, review and request it has. The owner keeps their sign-in.\n\nType the company name exactly to confirm:');
  if(typed === null) return;
  if(typed.trim() !== name.trim()){ alert('The name did not match. Nothing was deleted.'); return; }
  const reason = prompt('Reason (goes in the permanent audit log):');
  if(reason === null) return;
  const err = await deleteCompany(slug, reason);
  if(err){ alert('Could not delete: ' + err); return; }
  await reloadCompanies(); reload();
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
  if(!reason.trim()){ alert('Please give a reason. It goes in the permanent audit log.'); return; }
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

/* ---- demand: what people looked for ----
   The whole reason for logging searches. A list of terms nobody could be sold
   is the sales list. (The "buyers waiting" list went with the capture form,
   2026-09-01.) */
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
/* Sub-tabs: one room at a time (Listings / Upgrades / Companies / Employment /
   Messages / Activity). Data still loads for every panel; only what is on screen changes. */
function showAdminGroup(g){
  document.querySelectorAll('.adm-tab').forEach(b => b.classList.toggle('active', b.dataset.adm === g));
  document.querySelectorAll('#tab-admin .panel[data-adm]').forEach(p => p.classList.toggle('adm-on', p.dataset.adm === g));
  /* the Website Applications sheet is its own page, framed in; it loads on first open */
  const fr = $('apps-frame');
  if(g === 'applications' && fr && !fr.src) fr.src = '/applications?embed=1';
  try{ localStorage.setItem('cx_admin_group', g); }catch(e){}
}
document.querySelectorAll('.adm-tab').forEach(b => b.addEventListener('click', () => showAdminGroup(b.dataset.adm)));
let remembered = 'companies';
try{ remembered = localStorage.getItem('cx_admin_group') || remembered; }catch(e){}
showAdminGroup(document.querySelector(`.adm-tab[data-adm="${remembered}"]`) ? remembered : 'companies');

let started = false;
window.initAdmin = async function(){
  if(started) return;
  if(!(await checkStaff())) return;        // belt and braces; the database is the real gate
  started = true;
  reloadCompanies(); reloadAudit(); reloadSearches(); reloadRecruits(); reloadJobs(); reloadUpgrades();
  const saved = await loadPrefs('admin');
  if(saved) for(const k in panels){
    if(saved[k] && saved[k].sort) panels[k].sort = saved[k].sort;
    if(saved[k] && saved[k].limit) panels[k].limit = saved[k].limit;
  }
  syncControls(); reload();
};

/* The table rows are built as HTML strings with onclick="..." on each button,
   and an inline handler is evaluated in global scope, so wrapping this file
   put every row button out of its own reach. Anything a row calls has to be
   published deliberately; everything else stays private to this file.
   tools/check.js fails if a new onclick appears without being listed here. */
Object.assign(window, {
  editListing, editBadge, removeListing, togglePause, lockListing,
  approveApp, rejectApp, setSuspended, setTalentAccessUI, markJobPaid, closeJob, approveUpgrade, denyUpgrade, sendNotificationUI, notifyAudienceUI, setRecruitStatus, deleteCompanyUI
});
})();
