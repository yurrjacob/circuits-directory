/* The Circuits.com admin console.

   This used to be its own page behind its own login. It now lives as a tab
   inside the portal, so there is one way in for everybody and admin is simply
   something an account has. Wrapped in a function so its short names ($, esc,
   panels) cannot collide with portal.js on the same page. */
(function(){
'use strict';
const $ = id => document.getElementById(id);

/* In-page dialogs (2026-10-28). The admin used the browser's confirm() and
   prompt(). Once Chrome's "prevent this page from creating additional
   dialogs" box is ticked (it is offered after a few dialogs in a row), every
   later confirm() returns false and every prompt() returns null on the spot,
   so Deny, Suspend and Delete did nothing at all: no question, no request, no
   error (Jacob, 2026-10-28: "Deny and Suspend and Delete buttons not
   working"). These draw in the page, so nothing can switch them off.
   askConfirm resolves true or false, askText the typed text or null, and tell
   shows a message without waiting. */
function adminDialog(message, opts){
  const o = opts || {};
  return new Promise(resolve => { try{
    const wrap = document.createElement('div');
    wrap.className = 'pf-modal adm-dialog';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = `<div class="pf-modal-box adm-dialog-box">
        <p class="adm-dialog-msg"></p>
        ${o.input ? '<input type="text" class="adm-dialog-in" autocomplete="off">' : ''}
        <div class="adm-dialog-acts">
          ${o.alertOnly ? '' : '<button type="button" class="btn btn-outline" data-v="no">Cancel</button>'}
          <button type="button" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-v="yes"></button>
        </div></div>`;
    wrap.querySelector('.adm-dialog-msg').textContent = message;
    wrap.querySelector('[data-v="yes"]').textContent = o.okText || (o.alertOnly ? 'OK' : o.danger ? 'Yes, do it' : 'OK');
    const inp = wrap.querySelector('.adm-dialog-in');
    if(inp){ inp.value = o.value == null ? '' : String(o.value); if(o.placeholder) inp.placeholder = o.placeholder; }
    const done = v => { document.removeEventListener('keydown', onKey, true); wrap.remove(); resolve(v); };
    const yes = () => done(o.input ? (inp.value) : true);
    const no = () => done(o.input ? null : false);
    const onKey = e => { if(e.key === 'Escape'){ e.preventDefault(); no(); } else if(e.key === 'Enter' && (o.input || document.activeElement === wrap.querySelector('[data-v="yes"]'))){ e.preventDefault(); yes(); } };
    wrap.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if(b) (b.dataset.v === 'yes' ? yes : no)(); else if(e.target === wrap) no(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(wrap);
    (inp || wrap.querySelector('[data-v="yes"]')).focus();
  }catch(e){ resolve(o.input ? null : false); } });   // no page to draw on: cancel, never act
}
const askConfirm = (message, opts) => adminDialog(message, Object.assign({ danger: /delete|deny|remove|suspend|reject/i.test(message) }, opts));
const askText = (message, value) => adminDialog(message, { input: true, value });
const tell = message => { adminDialog(String(message), { alertOnly: true }); };
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let allApps = [];
let editId = null;
const panels = {
  listings: { sort:'company', limit:50 },
  banners:  { sort:'company', limit:50 },
  badges:   { sort:'company', limit:50 },
  pending:  { sort:'company', limit:50 }
};


/* Directory Admin (named Profiles Admin until 2026-10-28) and Club Admin split the rows: a
   listing whose page is a club shows only under Club Admin. */
let clubSlugs = new Set();
const isClubApp = a => !!a && clubSlugs.has(a.company_slug);
const approved = () => allApps.filter(a=>a.status==='Approved' && !isClubApp(a));
const pending  = () => allApps.filter(a=>a.status==='Pending' && !isClubApp(a));
const clubApproved = () => allApps.filter(a=>a.status==='Approved' && isClubApp(a));
const clubPending  = () => allApps.filter(a=>a.status==='Pending' && isClubApp(a));
/* Renders the same way the public site does: our own mark is distinct from a
   paid Trust Badge chosen for that one keyword, and there is no other kind:
   our own team mark is not a badge and never sits on a listing. */
const badgeTag = b => !b ? 'none'
  : `<span class="lb" style="${badgeStyle(b.color)}">${esc(b.text)}</span>`;

/* A company name with its username underneath, everywhere the admin lists
   one: the name alone is ambiguous the day a second "Acme" signs up, the
   address (circuits.com/acme) never is. Rows filed without an account, the
   free Get Listed form does that, say so rather than showing nothing. */
const coCell = (name, handle) =>
  `<td>${esc(name)||'none'}<br><span class="cell-muted">${handle ? 'circuits.com/' + esc(handle) : 'no username yet'}</span></td>`;

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
  const raw = await askText('Lock ' + l.company + ' to which spot on \u201c' + (l.keyword||'') + '\u201d?\n\nEnter a number (1 = top of the list). Leave it blank to unlock.',
    l.locked_position ? String(l.locked_position) : '');
  if(raw === null) return;
  const n = raw.trim() === '' ? null : parseInt(raw, 10);
  if(raw.trim() !== '' && !(n >= 1 && n <= 99)){ tell('Please enter a number from 1 to 99, or leave it blank to unlock.'); return; }
  const err = await updateApplication(id, { locked_position: n });
  if(err){
    tell(/duplicate|unique|23505/i.test((err.message||'') + (err.code||''))
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
  const answer = await askText(
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
    const color = await askText('Badge color (hex)', (l.badge && l.badge.color) || '#c9a227');
    if(color === null) return;
    badge = { text: text.slice(0, 18), color: /^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : '#c9a227' };
  }
  const err = await updateApplication(id, { badge });
  if(err){
    // the database refuses misleading badges even from staff-facing code paths
    tell('Could not set that badge:\n\n' + (err.message || err));
    return;
  }
  await reload();
}

/* the four numbers follow the side the switch is on (2026-10-19) */
let adminMode = 'profiles';
function renderStats(){
  const club = adminMode === 'clubs';
  const ap = club ? clubApproved() : approved();
  $('s-listings').textContent  = ap.length;
  $('s-companies').textContent = club ? allClubs.length : new Set(ap.map(a=>a.company)).size;
  $('s-sponsored').textContent = ap.filter(a=>a.banner).length;
  $('s-pending').textContent   = club ? clubPending().length + allClubs.filter(c => c.club_status === 'Pending').length : pending().length;
  const lbl = (id, t) => { const e = $(id); if(e) e.textContent = t; };
  lbl('s-listings-l', club ? 'Club Keywords' : 'Keyword Listings');
  lbl('s-companies-l', club ? 'Club Pages' : 'Companies');
  lbl('s-sponsored-l', 'Sponsored Banners');
  lbl('s-pending-l', club ? 'Waiting For Approval' : 'Pending Applications');
}

function renderListings(){
  const rows = view(approved(), 'listings');
  $('listings-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      ${coCell(l.company, l.company_handle)}
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
      ${coCell(l.company, l.company_handle)}<td class="kw">${esc(l.keyword)||'none'}</td>
      <td>${esc(appPriceLabel(l))}</td>${actionsCell(l)}
    </tr>`).join('');
  $('banners-empty').style.display = approved().filter(a=>a.banner).length ? 'none' : 'block';
}

function renderBadges(){
  const rows = view(approved().filter(a=>a.badge), 'badges');
  $('badges-body').innerHTML = rows.map(l=>`
    <tr class="${l.paused?'row-paused':''}">
      ${coCell(l.company, l.company_handle)}<td class="kw">${esc(l.keyword)||'none'}</td>
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
      ${coCell(p.company, p.company_handle)}
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
   per submission that filled it in, newest first. Lived on the Website
   Applications sheet until 2026-09-01; it is read here, edited nowhere.

   Two things in that column are not ideas. The Get Listed form writes its own
   note, "[Locked position #3 requested for: ...]", at the top of the same
   field for staff to read when approving; that is a request, not something
   the applicant said, so it comes off. And one submit files one application
   row per keyword, every row carrying the same text, so a five-keyword
   applicant showed up five times: one row per idea per company here. */
const ideaText = m => String(m || '').replace(/^\s*(\[[^\]]*\]\s*)+/, '').trim();
function renderIdeas(){
  const seen = new Set();
  const rows = allApps.filter(a => !isClubApp(a)).map(a => Object.assign({}, a, { idea: ideaText(a.message) }))
    .filter(a => a.idea)
    .sort((a,b) => (b.created_at||'').localeCompare(a.created_at||''))
    .filter(a => {
      const key = (a.company_slug || a.email || a.company || '') + '\n' + a.idea;
      if(seen.has(key)) return false;
      seen.add(key); return true;
    });
  $('ideas-body').innerHTML = rows.map(a=>`
    <tr>
      <td class="cell-muted nowrap">${a.created_at ? new Date(a.created_at).toLocaleDateString() : ''}</td>
      ${coCell(a.company, a.company_handle)}
      <td class="cell-muted">${esc(a.contact)||''}${a.email?'<br><span class="cell-muted">'+esc(a.email)+'</span>':''}</td>
      <td class="idea-text">${esc(a.idea)}</td>
    </tr>`).join('');
  $('ideas-empty').style.display = rows.length ? 'none' : 'block';
}

function renderAll(){ renderStats(); renderListings(); renderBanners(); renderBadges(); renderPending(); renderIdeas(); renderClubKeywords(); renderClubUpgrades(); }

/* ---- Club Admin (Jacob, 2026-10-19: "a separate club admin ... so we can
   test everything including club keywords, badges, upgrades") ---- */
const clubName = slug => (allClubs.find(c => c.slug === slug) || {}).name || slug;
const clubHandle = slug => (allClubs.find(c => c.slug === slug) || {}).handle || '';
const clubCell = l => coCell(clubName(l.company_slug), clubHandle(l.company_slug) || l.company_handle);
const lockCell = l => `<td>${l.locked_position ? '<span class="badge sponsored">#' + l.locked_position + '</span>' : 'no'}</td>`;
const extrasRow = l => `<tr class="${l.paused ? 'row-paused' : ''}">${clubCell(l)}<td class="kw">${esc(l.keyword) || 'none'}</td>
      <td>${l.banner ? '<span class="badge sponsored">Yes</span>' : 'No'}</td><td>${badgeTag(l.badge)}</td>${lockCell(l)}${actionsCell(l)}</tr>`;
function renderClubKeywords(){
  const pb = $('ck-pending-body'), lb = $('ck-live-body'); if(!pb || !lb) return;
  const pend = clubPending(), live = sortRows(clubApproved(), 'company');
  pb.innerHTML = pend.map(p => `<tr class="row-waiting">${clubCell(p)}<td class="kw">${esc(p.keyword) || 'none'}</td>
      <td class="cell-muted">${esc(p.email) || 'none'}</td><td class="cell-muted">${p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</td>
      <td class="row-actions"><button class="mini-btn green" onclick="approveApp('${p.id}')">Approve</button>
        <button class="mini-btn danger" onclick="rejectApp('${p.id}')">Reject</button></td></tr>`).join('');
  $('ck-pending-empty').style.display = pend.length ? 'none' : 'block';
  lb.innerHTML = live.map(extrasRow).join('');
  $('ck-live-empty').style.display = live.length ? 'none' : 'block';
  $('ck-hint').textContent = pend.length ? pend.length + (pend.length === 1 ? ' club keyword waiting for approval' : ' club keywords waiting for approval')
    : live.length + (live.length === 1 ? ' live club keyword' : ' live club keywords');
}
function renderClubUpgrades(){
  const rb = $('cu-req-body'), lb = $('cu-live-body'); if(!rb || !lb) return;
  const reqs = openUpgrades.filter(r => clubSlugs.has(r.company_slug));
  rb.innerHTML = reqs.map(upgradeRow).join('');
  $('cu-req-empty').style.display = reqs.length ? 'none' : 'block';
  const live = sortRows(clubApproved().filter(l => l.banner || l.badge || l.locked_position), 'company');
  lb.innerHTML = live.map(extrasRow).join('');
  $('cu-live-empty').style.display = live.length ? 'none' : 'block';
}
/* ---- Club Admin, Members & Officers (Jacob, 2026-10-28) ----
   Waiting and live, like Club Keywords. Only staff can approve, deny or set a
   badge (the database keeps an owner's hands off all three). A badge starts
   as the club's name for a member and the officer's title for an officer. */
let clubEmails = {};
const PERSON_LIST = { team: 'Officer', members: 'Member' };
function clubPeopleRows(){
  const rows = [];
  for(const c of allClubs) for(const list of ['team', 'members'])
    for(const p of (Array.isArray(c[list]) ? c[list] : []))
      if(p && p.id && (p.name || p.handle)) rows.push({ c, list, p, key: c.slug + '|' + list + '|' + p.id });
  return rows;
}
function personBadgeDefault(r){ return r.list === 'team' ? (r.p.role || 'Officer') : (r.c.name || 'Member'); }
function personRow(r, pending){
  const p = r.p, b = p.badge || {}, k = esc(r.key);
  const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#3f6300';
  return `<tr class="${pending ? 'row-waiting' : ''}">
      <td><a href="/${esc(r.c.handle || r.c.slug)}" target="_blank" rel="noopener">${esc(r.c.name)}</a><br><span class="cell-muted">${esc(r.c.college_name || '')}</span></td>
      <td><b>${esc(p.name || p.handle)}</b></td>
      <td>${r.list === 'team' ? esc(p.role || 'Officer') + ' <span class="cell-muted">(Officer)</span>' : 'Member'}</td>
      <td class="cell-muted">${clubEmails[r.c.slug + ':' + p.id] ? `<a href="mailto:${esc(clubEmails[r.c.slug + ':' + p.id])}">${esc(clubEmails[r.c.slug + ':' + p.id])}</a>` : 'none'}</td>
      <td>${p.handle ? `<a href="/${esc(p.handle)}" target="_blank" rel="noopener">circuits.com/${esc(p.handle)}</a>` : '<span class="cell-muted">none, named only</span>'}</td>
      <td>${p.confirmed ? '<b>Yes</b>' : '<span class="cell-muted">No</span>'}</td>
      <td><span class="adm-badge-edit"><input type="text" id="pb-t-${k}" value="${esc(b.text || personBadgeDefault(r))}" maxlength="40" aria-label="Badge text"><input type="color" id="pb-c-${k}" value="${esc(color)}" aria-label="Badge colour"></span>
        <span class="adm-badge-prev" style="color:${esc(color)}">${esc(b.text || personBadgeDefault(r))}</span></td>
      <td class="row-actions">
        ${pending ? `<button class="mini-btn green" onclick="approvePersonUI('${k}')">Approve</button><button class="mini-btn" onclick="denyPersonUI('${k}')">Deny</button>`
          : `<button class="mini-btn green" onclick="savePersonBadgeUI('${k}')">Save badge</button><button class="mini-btn" onclick="denyPersonUI('${k}')">Unapprove</button>`}
        <button class="mini-btn danger" onclick="removePersonUI('${k}')">Remove</button></td></tr>`;
}
async function renderClubPeople(){
  const body = $('cp-body'), pend = $('cp-pending-body'); if(!body || !pend) return;
  try{ clubEmails = await fetchClubEmails(allClubs.map(c => c.slug)); }catch(e){ clubEmails = {}; }
  const rows = clubPeopleRows();
  const waiting = rows.filter(r => r.p.status === 'Pending' || r.p.status === 'Denied');
  const live = rows.filter(r => !r.p.status || r.p.status === 'Approved');
  waiting.sort((a, b) => (a.p.status === 'Denied') - (b.p.status === 'Denied'));
  pend.innerHTML = waiting.map(r => personRow(r, true)).join('');
  body.innerHTML = live.map(r => personRow(r, false)).join('');
  $('cp-pending-empty').style.display = waiting.length ? 'none' : 'block';
  $('cp-empty').style.display = live.length ? 'none' : 'block';
  const n = waiting.filter(r => r.p.status === 'Pending').length;
  $('cp-hint').textContent = n ? `${n} ${n === 1 ? 'person' : 'people'} waiting for approval` : 'Everyone Listed On A Club Page. Approve Puts Their Badge On Their Own Profile';
}
/* one change to one person, written back as the club's whole list */
async function changePerson(key, fn, done){
  const [slug, list, id] = String(key).split('|');
  const c = allClubs.find(x => x.slug === slug);
  if(!c || !PERSON_LIST[list]) return;
  const arr = (Array.isArray(c[list]) ? c[list] : []).map(x => Object.assign({}, x));
  const i = arr.findIndex(x => x && x.id === id); if(i < 0) return;
  const next = fn(arr[i], arr, i);
  if(next === false) return;
  const err = await updateClubPeople(slug, { [list]: arr.filter(Boolean) });
  if(err){ tell('Could not save: ' + err); return; }
  if(done && typeof toast === 'function') toast(done, true);
  await reloadClubs();
}
function badgeFromRow(key){
  const t = document.getElementById('pb-t-' + key), c = document.getElementById('pb-c-' + key);
  const text = t ? t.value.trim() : '', color = c && /^#[0-9a-f]{6}$/i.test(c.value) ? c.value : '';
  return text ? Object.assign({ text }, color ? { color } : {}) : null;
}
async function approvePersonUI(key){
  const badge = badgeFromRow(key);
  await changePerson(key, p => { p.status = 'Approved'; if(badge) p.badge = badge; }, 'Approved. Their badge is on their profile.');
}
async function denyPersonUI(key){
  const [slug, list, id] = String(key).split('|');
  const c = allClubs.find(x => x.slug === slug); if(!c) return;
  const p = (c[list] || []).find(x => x && x.id === id); if(!p) return;
  if(!await askConfirm('Deny ' + (p.name || p.handle) + ' on ' + c.name + '? They stay on the club\'s list but carry no badge.')) return;
  await changePerson(key, q => { q.status = 'Denied'; }, 'Denied.');
}
async function savePersonBadgeUI(key){
  const badge = badgeFromRow(key);
  await changePerson(key, p => { if(badge) p.badge = badge; else delete p.badge; }, 'Badge saved.');
}
async function removePersonUI(key){
  const [slug, list, id] = String(key).split('|');
  const c = allClubs.find(x => x.slug === slug); if(!c) return;
  const p = (c[list] || []).find(x => x && x.id === id); if(!p) return;
  if(!await askConfirm('Remove ' + (p.name || p.handle) + ' from ' + c.name + '? They come off the club page and lose the badge.')) return;
  await changePerson(key, (q, arr, i) => { arr[i] = null; }, 'Removed.');
}
/* ---- Club Admin, Club Applications (Jacob, 2026-10-28) ----
   Website Applications for clubs: pending, then approved (denied ones wait
   with the pending). The Club Badge starts as the club's name; staff set
   its text and colour, and the club page shows it. */
function clubAppRow(c, pending){
  const s = esc(c.slug), b = c.club_badge || {};
  const color = /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#3f6300';
  const text = (b.text || '').trim() || c.name || '';
  const cell = (f, v, type) => `<td><input class="adm-cell-in" type="${type || 'text'}" id="ca-${f}-${s}" value="${esc(v || '')}" aria-label="${f}"></td>`;
  return `<tr class="${pending ? 'row-waiting' : ''}">
      <td><a href="/${esc(c.handle || c.slug)}" target="_blank" rel="noopener"><b>${esc(c.name)}</b></a></td>
      <td>${esc(c.college_name || 'none')}</td>
      <td><a class="web-link" href="/${esc(c.handle || c.slug)}" target="_blank" rel="noopener">circuits.com/${esc(c.handle || c.slug)}</a></td>
      ${cell('contact', c.contact)}${cell('email', c.email, 'email')}${cell('phone', c.phone)}${cell('website', c.website)}
      <td class="cell-muted">${new Date(c.created_at).toLocaleDateString()}</td>
      <td><span class="adm-badge-edit"><input type="text" id="cb-t-${s}" value="${esc(text)}" maxlength="40" aria-label="Club badge text"><input type="color" id="cb-c-${s}" value="${esc(color)}" aria-label="Club badge colour"></span>
        <span class="adm-badge-prev" style="color:${esc(color)}">${esc(text)}</span></td>
      <td>${c.suspended_at ? '<b>Suspended</b>' : c.club_status === 'Pending' ? '<b>Pending</b>' : esc(c.club_status || 'Pending')}</td>
      <td class="row-actions">
        ${c.club_status !== 'Approved' ? `<button class="mini-btn green" onclick="approveClubAppUI('${s}')">Approve</button>` : ''}
        ${c.club_status !== 'Denied' ? `<button class="mini-btn" onclick="setClubStatusUI('${s}', 'Denied')">Deny</button>` : ''}
        <button class="mini-btn" onclick="saveClubAppUI('${s}')">Save</button>
        <button class="mini-btn danger" onclick="deleteCompanyUI('${s}')">Delete</button></td></tr>`;
}
function renderClubApps(){
  const pend = $('ca-pending-body'), body = $('ca-body'); if(!pend || !body) return;
  const waiting = allClubs.filter(c => c.club_status !== 'Approved'), live = allClubs.filter(c => c.club_status === 'Approved');
  pend.innerHTML = waiting.map(c => clubAppRow(c, true)).join('');
  body.innerHTML = live.map(c => clubAppRow(c, false)).join('');
  $('ca-pending-empty').style.display = waiting.length ? 'none' : 'block';
  $('ca-empty').style.display = live.length ? 'none' : 'block';
  const n = allClubs.filter(c => c.club_status === 'Pending').length;
  $('ca-hint').textContent = n ? `${n} club application${n === 1 ? '' : 's'} waiting` : 'Every Club That Asked For A Page. Approve Or Deny New Ones; Edit Details And The Club Badge In Place';
}
/* the row as staff left it: contact details and the Club Badge */
function clubAppFields(slug){
  const v = f => { const i = document.getElementById(`ca-${f}-${slug}`); return i ? i.value.trim() : null; };
  const t = document.getElementById('cb-t-' + slug), c = document.getElementById('cb-c-' + slug);
  const fields = {};
  for(const f of ['contact', 'email', 'phone', 'website']){ const x = v(f); if(x !== null) fields[f] = x || null; }
  if(fields.email && !isValidEmail(fields.email)) return { error: '"' + fields.email + '" is not an email address.' };
  if(t){ const text = t.value.trim(); fields.club_badge = text ? { text, color: c && /^#[0-9a-f]{6}$/i.test(c.value) ? c.value : '#3f6300' } : null; }
  return { fields };
}
async function saveClubAppUI(slug){
  const c = allClubs.find(x => x.slug === slug); if(!c) return;
  const r = clubAppFields(slug); if(r.error){ tell(r.error); return; }
  const err = await updateClubPeople(slug, r.fields);
  if(err){ tell('Could not save: ' + err); return; }
  if(typeof toast === 'function') toast(c.name + ' saved.', true);
  await reloadClubs();
}
async function approveClubAppUI(slug){
  const c = allClubs.find(x => x.slug === slug); if(!c) return;
  const r = clubAppFields(slug); if(r.error){ tell(r.error); return; }
  const err = await updateClubPeople(slug, r.fields);
  if(err){ tell('Could not save: ' + err); return; }
  await setClubStatusUI(slug, 'Approved');
}

let allProjects = [];
async function reloadClubProjects(){
  const body = $('cj-body'); if(!body) return;
  allProjects = await fetchAllProjects(allClubs.map(c => c.slug));
  body.innerHTML = allProjects.map(p => {
    const team = (Array.isArray(p.team) ? p.team : []).filter(t => t && (t.name || t.handle)).length;
    /* Project Name, Club Name, College or University Name, # of Products
       Listed (Jacob, 2026-10-28): the products are the Project Parts rows */
    const club = allClubs.find(c => c.slug === p.company_slug) || {};
    const parts = (Array.isArray(p.parts) ? p.parts : []).filter(x => x && (x.name || '').trim()).length;
    return `<tr class="${p.published === false ? 'row-paused' : ''}">
      <td><a href="/${esc(clubHandle(p.company_slug) || p.company_slug)}#project-${esc(String(p.id))}" target="_blank" rel="noopener"><b>${esc(p.title)}</b></a>${p.year ? ` <span class="cell-muted">${esc(p.year)}</span>` : ''}<br><span class="cell-muted">${team} on the team</span></td>
      <td>${esc(clubName(p.company_slug))}</td><td>${esc(club.college_name || 'none')}</td>
      <td><b>${parts}</b></td>
      <td>${p.published === false ? 'Hidden' : 'Shown'}</td>
      <td class="row-actions"><button class="mini-btn" onclick="toggleProjectUI('${esc(String(p.id))}')">${p.published === false ? 'Show' : 'Hide'}</button>
        <button class="mini-btn danger" onclick="deleteProjectUI('${esc(String(p.id))}')">Delete</button></td></tr>`; }).join('');
  $('cj-empty').style.display = allProjects.length ? 'none' : 'block';
}
async function toggleProjectUI(id){
  const p = allProjects.find(x => String(x.id) === id); if(!p) return;
  const err = await setProjectPublished(p.id, p.published === false);
  if(err){ tell('Could not do that: ' + err); return; }
  await reloadClubProjects();
}
async function deleteProjectUI(id){
  const p = allProjects.find(x => String(x.id) === id); if(!p) return;
  if(!await askConfirm('Delete "' + p.title + '" from ' + clubName(p.company_slug) + ' for good? It comes off the club page and off every team member\'s profile.')) return;
  const err = await deleteProject(p.id);
  if(err){ tell('Could not delete: ' + err); return; }
  await reloadClubProjects();
}
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
  /* the form opens in whichever panel the Edit was pressed in, Club Keywords included */
  const host = document.querySelector('#tab-admin .panel.adm-on .panel-body');
  if(host && !host.contains($('edit-form'))) host.prepend($('edit-form'));
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
  if(!patch.keyword){ tell('The listing needs a keyword. That is what buyers search for.'); return; }
  if(patch.fee && !/\d/.test(patch.fee)){ tell('The fee needs an amount, e.g. $49/mo.'); return; }
  if(patch.banner && patch.status==='Approved'
     && bannerConflict({ id: editId, banner: true, keyword: patch.keyword })){
    tell('That keyword already has a live Exclusive Sponsor banner. Only one banner is allowed per keyword. Remove the existing banner first.');
    return;
  }
  $('e-save').disabled = true;
  const err = await updateApplication(editId, patch);
  $('e-save').disabled = false;
  if(err){ tell(bannerError(err)); return; }
  closeEdit(); await reload();
});

function bannerError(err){
  if(err && (err.code==='23505' || /duplicate|unique/i.test(err.message||'')))
    return 'That keyword already has a premium banner. Only one premium banner is allowed per keyword.';
  return 'Could not save. Make sure you are signed in as staff.';
}

async function removeListing(id){ if(!await askConfirm('Remove this keyword listing?')) return; const err = await deleteApplication(id); if(err){ tell('Could not remove it: ' + (err.message || err)); return; } await reload(); }
async function togglePause(id){ const l = allApps.find(a=>a.id===id); if(!l) return; const err = await setPaused(id, !l.paused); if(err){ tell('Could not change that: ' + (err.message || err)); return; } await reload(); }
/* one decision at a time: a double click must not send two emails (audit, 2026-09-15) */
let deciding = false;
async function approveApp(id){
  if(deciding) return; deciding = true;
  try{ await approveAppNow(id); } finally { deciding = false; }
}
async function approveAppNow(id){
  const app = allApps.find(a=>a.id===id);
  if(app && bannerConflict(app)){
    tell('That keyword already has a live Exclusive Sponsor banner. Only one banner is allowed per keyword. Remove the existing banner first.');
    return;
  }
  const err = await updateAppStatus(id,'Approved'); if(err){ tell(bannerError(err)); return; }
  /* Tell them. Until now a supplier applied and then refreshed the portal
     hoping, the notifier only knew how to send quote requests. */
  notifyDecision(id, '');
  await reload();
}
async function rejectApp(id){
  /* A denial with no reason reads as a shrug, and the supplier has no idea
     whether to fix something and come back. Optional, but asked for every time
     so it is the default rather than an afterthought. */
  const reason = await askText(
    'Why is this being denied?\n\n'
    + 'This is sent to the supplier. Leave it blank to send the plain notice with no reason.',
    '');
  if(reason === null) return;                 // cancelled, change nothing
  if(deciding) return; deciding = true;
  try{
    const err = await updateAppStatus(id,'Denied');
    if(err){ tell('Could not deny it: ' + (err.message || err)); return; }   // no email for a change that did not happen
    notifyDecision(id, reason.trim());
    await reload();
  } finally { deciding = false; }
}

/* ---- companies: suspend and reinstate ----
   Suspension is the alternative to deleting. A suspended company disappears
   from the directory and from keyword results, cannot be edited by its owner,
   and keeps every row it had, so this is fully reversible. */
let allCompanies = [];
/* All Profiles (Jacob, 2026-10-28): every profile URL on the site, newest
   first, with when it was made and whether its email is confirmed. It used to
   list company pages only, so a person who made a profile and no page never
   showed up anywhere. Club pages live under Club Admin. */
let allProfiles = [];
const NEW_DAYS = 7;
const isNew = d => d && (Date.now() - new Date(d).getTime()) < NEW_DAYS * 864e5;
const dateCell = d => d ? new Date(d).toLocaleDateString() + (isNew(d) ? ' <span class="badge pending">New</span>' : '') : '';
const confirmedCell = r => r.source === 'page' ? '<span class="cell-muted">no sign-in</span>' : r.confirmed ? 'Yes' : '<b>Not yet</b>';
async function reloadCompanies(){
  /* each profile's picture (Jacob, 2026-10-30): the page's logo, else the
     person's own photo, the same picture their profile shows */
  const [profiles, accounts] = await Promise.all([fetchAdminProfiles(), fetchAdminAccounts()]);
  allProfiles = profiles;
  const pic = {};
  accounts.forEach(a => { if(a.handle && a.logo) pic['h:' + a.handle.toLowerCase()] = a.logo; });
  const orphan = allProfiles.filter(r => r.source === 'page' && r.company_slug).map(r => r.company_slug);
  const logos = await fetchCompanyLogos(orphan);
  allProfiles.forEach(r => { r.pic = pic['h:' + String(r.handle || '').toLowerCase()] || logos[r.company_slug] || ''; });
  allCompanies = allProfiles.filter(r => r.company_slug).map(r => ({ slug: r.company_slug, name: r.company_name || r.display_name, handle: r.handle, suspended_at: r.suspended_at }));
  const susp = allProfiles.filter(r => r.suspended_at).length, fresh = allProfiles.filter(r => isNew(r.created_at)).length;
  $('companies-hint').textContent = allProfiles.length + ' profiles' + (fresh ? ', ' + fresh + ' new this week' : '') + (susp ? ', ' + susp + ' suspended' : '')
    + '. Suspend hides without deleting. Delete removes the page and everything it has';
  /* suspended accounts in their own list below the rest (Jacob, 2026-10-30) */
  const row = r => {
    const url = r.handle ? `<a href="/${esc(r.handle)}" target="_blank" rel="noopener">circuits.com/${esc(r.handle)}</a>` : '<span class="cell-muted">no username yet</span>';
    const act = r.company_slug
      ? (r.suspended_at ? `<button class="mini-btn green" onclick="setSuspended('${esc(r.company_slug)}', false)">Reinstate</button>`
                        : `<button class="mini-btn" onclick="setSuspended('${esc(r.company_slug)}', true)">Suspend</button>`)
        + `<button class="mini-btn danger" onclick="deleteCompanyUI('${esc(r.company_slug)}')">Delete</button>`
      : (r.handle ? (r.suspended_at ? `<button class="mini-btn green" onclick="setProfileSuspendedUI('${esc(r.handle)}', false)">Reinstate</button>`
                                    : `<button class="mini-btn" onclick="setProfileSuspendedUI('${esc(r.handle)}', true)">Suspend</button>`) : '');
    return `<tr class="${r.suspended_at ? 'row-waiting' : isNew(r.created_at) ? 'row-new' : ''}">
      <td><span class="prof-cell"><span class="acc-av prof-av">${isLogoUrl(r.pic) ? `<img src="${esc(r.pic)}" alt="" loading="lazy">` : esc(String(r.display_name || r.company_name || r.handle || '?').trim().slice(0, 1).toUpperCase())}</span>
        <span><b>${esc(r.display_name || r.company_name || r.handle || 'none')}</b><br>${url}</span></span></td>
      <td class="cell-muted">${esc(r.email || 'none')}</td>
      <td class="cell-muted nowrap">${dateCell(r.created_at)}</td>
      <td>${confirmedCell(r)}</td>
      <td>${r.company_slug ? esc(r.company_name || r.company_slug) : '<span class="cell-muted">profile only</span>'}</td>
      <td>${r.suspended_at ? '<b>Suspended</b><br><span class="cell-muted">' + new Date(r.suspended_at).toLocaleDateString() + '</span>' : 'Active'}</td>
      <td class="row-actions">${act}</td></tr>`; };
  const live = allProfiles.filter(r => !r.suspended_at), off = allProfiles.filter(r => r.suspended_at);
  $('companies-body').innerHTML = live.map(row).join('');
  $('companies-empty').style.display = live.length ? 'none' : 'block';
  if($('companies-susp-body')){
    $('companies-susp-body').innerHTML = off.map(row).join('');
    $('companies-susp-empty').style.display = off.length ? 'none' : 'block';
    $('companies-susp-h').textContent = 'Suspended' + (off.length ? ' \u00b7 ' + off.length : '');
  }
  /* the same rows, the last 30 days, above Website Applications */
  const recent = allProfiles.filter(r => r.source === 'profile' && r.created_at && (Date.now() - new Date(r.created_at).getTime()) < 30 * 864e5);
  if($('newprof-body')){
    $('newprof-body').innerHTML = recent.map(r => `<tr class="${isNew(r.created_at) ? 'row-new' : ''}">
      <td>${r.handle ? `<a href="/${esc(r.handle)}" target="_blank" rel="noopener">circuits.com/${esc(r.handle)}</a>` : '<span class="cell-muted">none</span>'}</td>
      <td>${esc(r.display_name || '')}</td><td class="cell-muted">${esc(r.email || '')}</td>
      <td class="cell-muted nowrap">${dateCell(r.created_at)}</td><td>${confirmedCell(r)}</td></tr>`).join('');
    $('newprof-empty').style.display = recent.length ? 'none' : 'block';
    $('newprof-hint').textContent = recent.length + ' profile URL' + (recent.length === 1 ? '' : 's') + ' created in the last 30 days, newest first';
  }
}
async function setProfileSuspendedUI(handle, suspend){
  const reason = await askText((suspend ? 'Suspend circuits.com/' : 'Reinstate circuits.com/') + handle + '.\n\nWhy? (goes in the permanent audit log)');
  if(reason === null) return;
  if(!reason.trim()){ tell('Please give a reason. It goes in the permanent audit log.'); return; }
  const err = await suspendProfile(handle, suspend, reason.trim());
  if(err){ tell('Could not do that: ' + err); return; }
  if(typeof toast === 'function') toast('circuits.com/' + handle + (suspend ? ' is suspended.' : ' is reinstated.'), true);
  await reloadCompanies();
}
/* ---- Manage Accounts (Jacob, 2026-10-30) ----
   Every account, searchable and filtered to the ones that need a hand. Picking
   one opens its editor: keywords first (live at once, the owner is told on
   the site and by email), then profile details, logo and banner, and the
   account itself (address, sign-in email). The buttons work through data-acc
   attributes and one listener each, so none of them needs a window export. */
const ACC = { list: [], filter: 'all', q: '', sel: null, co: null, kws: [], wired: false, busy: false };
const KW_FREE = 10;
const ACC_FILTERS = [
  ['all', 'All', () => true],
  ['unconfirmed', 'Unconfirmed', a => a.confirmed === false],
  ['nokw', 'No keywords', a => !a.kw_live],
  ['under10', 'Under 10 keywords', a => (a.kw_live || 0) < KW_FREE],
  ['new', 'New this week', a => isNew(a.created_at)],
  ['suspended', 'Suspended', a => !!a.suspended_at]];
const accName = a => a.company_name || a.display_name || a.handle || 'No name';
const accAvatar = a => isLogoUrl(a.logo) ? `<img src="${esc(a.logo)}" alt="">` : esc(accName(a).trim().slice(0, 1).toUpperCase() || '?');
const accCur = () => ACC.list.find(x => x.user_id === ACC.sel);
const accVal = id => { const i = $('acc-' + id); return i ? String(i.value || '').trim() : ''; };
function accTags(a){
  return [a.suspended_at ? '<span class="acc-tag bad">Suspended</span>' : '',
    a.confirmed === false ? '<span class="acc-tag warn">Unconfirmed</span>' : '',
    isNew(a.created_at) ? '<span class="acc-tag new">New</span>' : '',
    `<span class="acc-tag${a.kw_live ? ' ok' : ''}">${a.kw_live || 0} of ${KW_FREE} keywords</span>`].join('');
}
async function loadAccounts(keepSel){
  const list = $('acc-list'); if(!list) return;
  wireAccounts();
  if(!ACC.list.length) list.innerHTML = '<div class="acc-empty">Loading accounts…</div>';
  ACC.list = await fetchAdminAccounts();
  renderAccountList();
  if(keepSel && ACC.sel) await openAccount(ACC.sel);
}
/* the filter and the search together; suspended accounts last */
function accShown(){
  const f = (ACC_FILTERS.find(x => x[0] === ACC.filter) || ACC_FILTERS[0])[2];
  const q = ACC.q.trim().toLowerCase();
  return ACC.list.filter(a => f(a) && (!q || [a.display_name, a.company_name, a.handle, a.signin_email]
      .some(v => String(v || '').toLowerCase().includes(q))))
    .sort((a, b) => (a.suspended_at ? 1 : 0) - (b.suspended_at ? 1 : 0));
}
function renderAccountList(){
  const unconf = ACC.list.filter(a => a.confirmed === false && !a.suspended_at && a.signin_email);
  $('acc-filters').innerHTML = ACC_FILTERS.map(([k, label, f]) =>
    `<button type="button" class="acc-chip${ACC.filter === k ? ' on' : ''}" data-acc-filter="${k}" aria-pressed="${ACC.filter === k}">${label} <b>${ACC.list.filter(f).length}</b></button>`).join('');
  const all = $('acc-resend-all');
  all.hidden = !unconf.length;
  all.textContent = 'Resend to all unconfirmed (' + unconf.length + ')';
  const rows = accShown();
  $('acc-list').innerHTML = rows.length ? rows.map(a => `<button type="button" class="acc-item${a.user_id === ACC.sel ? ' on' : ''}${a.suspended_at ? ' off' : ''}" data-acc-open="${esc(a.user_id)}" role="option" aria-selected="${a.user_id === ACC.sel}">
      <span class="acc-av">${accAvatar(a)}</span>
      <span class="acc-who"><b>${esc(accName(a))}</b><span>circuits.com/${esc(a.handle || '')}</span><span class="acc-tags">${accTags(a)}</span></span></button>`).join('')
    : '<div class="acc-empty">No account matches.</div>';
  $('acc-hint').textContent = ACC.list.length + ' accounts, ' + unconf.length + ' unconfirmed, '
    + ACC.list.filter(a => !a.kw_live).length + ' with no keywords';
}
async function openAccount(uid){
  const a = ACC.list.find(x => x.user_id === uid); if(!a) return;
  ACC.sel = uid; ACC.co = null; ACC.kws = [];
  renderAccountList();
  $('acc-editor').innerHTML = '<div class="acc-empty">Loading…</div>';
  if(a.company_slug){
    const [co, kws] = await Promise.all([fetchCompany(a.company_slug), fetchMyListings(a.company_slug)]);
    if(ACC.sel !== uid) return;   // another account was picked meanwhile
    ACC.co = co; ACC.kws = (kws || []).filter(k => k.keyword && !k.is_club);
  }
  renderAccountEditor(a);
}
function renderAccountEditor(a){
  const co = ACC.co || {}, ed = $('acc-editor');
  const v = (k, fb) => esc(co[k] != null && co[k] !== '' ? co[k] : (fb || ''));
  const live = ACC.kws.filter(k => k.status === 'Approved'), waiting = ACC.kws.filter(k => k.status === 'Pending');
  const field = (id, label, val, type) => `<label class="acc-f"><span>${label}</span><input id="acc-${id}" type="${type || 'text'}" value="${val}" autocomplete="off"></label>`;
  const logo = co.logo || a.logo, cover = co.cover_url;
  const kwChip = k => {
    const st = k.status === 'Approved' ? (k.paused ? 'paused' : 'live') : k.status === 'Pending' ? 'wait' : 'off';
    const label = k.status === 'Approved' ? (k.paused ? 'Paused' : 'Live') : k.status;
    return `<span class="acc-kw ${st}">${esc(k.keyword)}<i>${esc(label)}</i>`
      + (k.status === 'Pending' ? `<button type="button" data-acc="approve-kw" data-kw="${esc(k.keyword)}">Make live</button>` : '') + '</span>';
  };
  ed.innerHTML = `
  <div class="acc-head">
    <span class="acc-av acc-av-lg">${accAvatar(a)}</span>
    <div class="acc-head-t"><h3>${esc(accName(a))}</h3>
      <p><a class="web-link" href="/${esc(a.handle)}" target="_blank" rel="noopener">circuits.com/${esc(a.handle)} &#8599;</a></p>
      <p class="cell-muted">Signs in with ${esc(a.signin_email || 'no email')} &middot; joined ${new Date(a.created_at).toLocaleDateString()}
        &middot; ${a.last_sign_in ? 'last signed in ' + new Date(a.last_sign_in).toLocaleDateString() : 'never signed in'}</p>
      <div class="acc-tags">${accTags(a)}</div></div>
    <div class="acc-head-acts">
      ${a.confirmed === false ? '<button type="button" class="btn btn-primary" data-acc="resend">Resend confirmation email</button>' : ''}
      ${a.suspended_at ? '<button type="button" class="mini-btn green" data-acc="reinstate">Reinstate</button>' : '<button type="button" class="mini-btn" data-acc="suspend">Suspend</button>'}
    </div>
  </div>

  <section class="acc-card">
    <h4>Directory Keywords <span class="cell-muted">${live.length} of ${KW_FREE} live${waiting.length ? ', ' + waiting.length + ' waiting' : ''}</span></h4>
    <div class="acc-kws">${ACC.kws.length ? ACC.kws.map(kwChip).join('') : '<span class="cell-muted">No keywords yet.</span>'}</div>
    <div class="acc-addkw"><input id="acc-newkw" type="text" placeholder="Add keywords, separated by commas: PCB Assembly, Flex PCB" autocomplete="off" aria-label="Keywords to add">
      <button type="button" class="btn btn-primary" data-acc="add-kw">Add &amp; make live</button></div>
    <p class="acc-note">Live in the Directory at once. ${esc(accName(a))} gets an email and a notice on Circuits.com naming what was added.</p>
  </section>

  <section class="acc-card">
    <h4>Profile Details${a.company_slug ? '' : ' <span class="cell-muted">profile only: saving makes its page</span>'}</h4>
    <div class="acc-grid">
      ${field('name', 'Name (Company, Club or Org) *', v('name', a.display_name))}
      ${field('contact', 'Contact Person *', v('contact', a.display_name))}
      ${field('email', 'Public Email', v('email', a.signin_email), 'email')}
      ${field('phone', 'Public Phone', v('phone'))}
      ${field('website', 'Website', v('website'))}
      ${field('address', 'Address (City, Country)', v('address'))}
      ${field('tagline', 'Tagline', v('tagline'))}
      ${field('founded', 'Founded', v('founded'))}
      ${field('employees', 'Employees', v('employees'))}
      <label class="acc-f"><span>Profile Title</span><select id="acc-title_source">
        <option value="company"${co.title_source !== 'contact' ? ' selected' : ''}>Use Company Name</option>
        <option value="contact"${co.title_source === 'contact' ? ' selected' : ''}>Use Contact Person</option></select></label>
    </div>
    <label class="acc-f acc-f-wide"><span>About</span><textarea id="acc-description" rows="4">${v('description')}</textarea></label>
    <div class="acc-save"><button type="button" class="btn btn-primary" data-acc="save-details">Save details</button><span class="acc-msg" id="acc-details-msg" role="status"></span></div>
  </section>

  <section class="acc-card">
    <h4>Logo &amp; Banner</h4>
    <div class="acc-media">
      <div class="acc-media-one"><div class="acc-logo">${isLogoUrl(logo) ? `<img src="${esc(logo)}" alt="">` : '<span>No logo</span>'}</div>
        <div class="acc-media-acts"><label class="btn btn-outline cb-file">Choose Logo<input type="file" data-acc-file="logo" accept="image/png,image/jpeg,image/webp"></label>
          ${isLogoUrl(logo) ? '<button type="button" class="mini-btn" data-acc="rm-logo">Remove</button>' : ''}</div></div>
      <div class="acc-media-one acc-media-wide"><div class="acc-cover">${isLogoUrl(cover) ? `<img src="${esc(cover)}" alt="">` : '<span>No banner</span>'}</div>
        <div class="acc-media-acts"><label class="btn btn-outline cb-file">Choose Banner<input type="file" data-acc-file="cover" accept="image/png,image/jpeg,image/webp"></label>
          ${isLogoUrl(cover) ? '<button type="button" class="mini-btn" data-acc="rm-cover">Remove</button>' : ''}</div></div>
    </div>
  </section>

  <section class="acc-card">
    <h4>Account</h4>
    <div class="acc-grid acc-grid-2">
      <label class="acc-f"><span>Circuits.com address</span><span class="acc-handle"><i>circuits.com/</i><input id="acc-handle" type="text" value="${esc(a.handle || '')}" spellcheck="false" autocomplete="off"></span></label>
      <div class="acc-f-btn"><button type="button" class="btn btn-outline" data-acc="set-handle">Change address</button></div>
      <label class="acc-f"><span>Sign-in email</span><input id="acc-signin" type="email" value="${esc(a.signin_email || '')}" autocomplete="off"></label>
      <div class="acc-f-btn"><button type="button" class="btn btn-outline" data-acc="set-email">Change sign-in email</button></div>
    </div>
    <p class="acc-note">A new address breaks any link already printed with the old one. A new sign-in email works at once, and the owner is told on the site and by email.</p>
  </section>`;
}
function wireAccounts(){
  if(ACC.wired) return;
  ACC.wired = true;
  const q = $('acc-q');
  if(q) q.addEventListener('input', () => { ACC.q = q.value; renderAccountList(); });
  $('acc-filters').addEventListener('click', e => { const b = e.target.closest('[data-acc-filter]'); if(!b) return; ACC.filter = b.dataset.accFilter; renderAccountList(); });
  $('acc-list').addEventListener('click', e => { const b = e.target.closest('[data-acc-open]'); if(b) openAccount(b.dataset.accOpen); });
  $('acc-resend-all').addEventListener('click', resendAllUnconfirmed);
  const ed = $('acc-editor');
  ed.addEventListener('click', e => { const b = e.target.closest('[data-acc]'); if(b) accAction(b.dataset.acc, b); });
  ed.addEventListener('change', e => { const i = e.target.closest('[data-acc-file]'); if(i) accUpload(i.dataset.accFile, i); });
  ed.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.id === 'acc-newkw'){ e.preventDefault(); accAction('add-kw', null); } });
}
/* a profile-only account gets its page the moment staff save something to it */
async function accSlug(a){
  if(a.company_slug) return a.company_slug;
  const r = await adminEnsurePage(a.user_id);
  if(r.error){ tell('Could not make the page: ' + r.error); return null; }
  a.company_slug = r.slug;
  return r.slug;
}
const accToast = t => { if(typeof toast === 'function') toast(t, true); };
async function accAction(act, btn){
  const a = accCur(); if(!a || ACC.busy) return;
  ACC.busy = true; if(btn) btn.disabled = true;
  try{ await accDo(act, a, btn); }
  finally{ ACC.busy = false; if(btn && btn.isConnected) btn.disabled = false; }
}
async function accDo(act, a, btn){
  const name = accName(a);
  if(act === 'resend'){
    const err = await resendConfirmation(a.signin_email);
    if(err){ tell(err); return; }
    accToast('Confirmation email sent again to ' + a.signin_email + '.');
    return;
  }
  if(act === 'suspend' || act === 'reinstate'){
    const off = act === 'suspend';
    const reason = await askText((off ? 'Suspend ' : 'Reinstate ') + name + '.\n\nWhy? (goes in the permanent audit log)');
    if(reason === null) return;
    if(!reason.trim()){ tell('Please give a reason. It goes in the permanent audit log.'); return; }
    const err = a.company_slug ? await suspendCompany(a.company_slug, off, reason.trim()) : await suspendProfile(a.handle, off, reason.trim());
    if(err){ tell('Could not do that: ' + err); return; }
    accToast(name + (off ? ' is suspended.' : ' is reinstated.'));
    await reloadCompanies(); await loadAccounts(true);
    return;
  }
  if(act === 'add-kw' || act === 'approve-kw'){
    const kws = act === 'approve-kw' ? [btn.dataset.kw]
      : accVal('newkw').split(/[,;\n]+/).map(k => k.trim()).filter(k => k.length >= 2);
    if(!kws.length){ tell('Type at least one keyword, two letters or more. Separate several with commas.'); return; }
    const live = ACC.kws.filter(k => k.status === 'Approved').length;
    if(act === 'add-kw' && live + kws.length > KW_FREE
      && !await askConfirm(name + ' has ' + live + ' live keywords. Adding ' + kws.length + ' more goes past the ' + KW_FREE + ' free ones. Add them anyway?', { danger: false })) return;
    const r = await adminAddKeywords(a.user_id, kws);
    if(r.error){ tell('Could not add: ' + r.error); return; }
    const added = r.added || [], skipped = r.skipped || [];
    accToast(added.length ? 'Live now: ' + added.join(', ') + '. ' + name + ' has been told.' : 'Nothing new to add.');
    if(skipped.length) tell('Already live, so left as they were: ' + skipped.join(', ') + '.');
    await loadAccounts(true);
    return;
  }
  if(act === 'save-details'){
    const f = {
      name: accVal('name'), contact: accVal('contact'), email: accVal('email') || null, phone: accVal('phone') || null,
      website: accVal('website') || null, address: accVal('address') || null, tagline: accVal('tagline') || null,
      founded: accVal('founded') || null, employees: accVal('employees') || null,
      description: accVal('description') || null, title_source: accVal('title_source') || 'company' };
    const bad = !f.name ? 'A name is needed.' : !f.contact ? 'A contact person is needed.'
      : f.email && !isValidEmail(f.email) ? 'Public Email is not an email address.'
      : f.phone && !isValidPhone(f.phone) ? 'Public Phone needs at least 10 digits.'
      : f.website && !isValidWebsite(f.website) ? 'Website needs to be a web address.'
      : f.founded && !isValidYear(f.founded) ? 'Founded needs to be a 4-digit year.' : '';
    const msg = $('acc-details-msg');
    if(bad){ msg.textContent = 'Not saved: ' + bad; msg.className = 'acc-msg bad'; return; }
    const slug = await accSlug(a); if(!slug) return;
    const err = await updateCompany(slug, f);
    if(err){ msg.textContent = 'Not saved: ' + err; msg.className = 'acc-msg bad'; return; }
    const e2 = await adminUpdateProfile(a.user_id, { display_name: f.contact || f.name });
    if(e2) console.warn('profile mirror', e2);
    accToast(name + ' saved.');
    await loadAccounts(true);
    const m2 = $('acc-details-msg'); if(m2){ m2.textContent = '✓ Saved'; m2.className = 'acc-msg ok'; }
    return;
  }
  if(act === 'rm-logo' || act === 'rm-cover'){
    if(!await askConfirm('Remove the ' + (act === 'rm-logo' ? 'logo' : 'banner') + ' from ' + name + '?')) return;
    const slug = await accSlug(a); if(!slug) return;
    const err = await updateCompany(slug, act === 'rm-logo' ? { logo: null } : { cover_url: null });
    if(err){ tell('Could not remove it: ' + err); return; }
    if(act === 'rm-logo') await adminUpdateProfile(a.user_id, { photo_url: null });
    accToast('Removed.');
    await loadAccounts(true);
    return;
  }
  if(act === 'set-handle'){
    const h = accVal('handle').toLowerCase().replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?circuits\.com\//, '');
    if(!h || h === a.handle){ tell('Type the new address first.'); return; }
    if(!await askConfirm('Move ' + name + ' from circuits.com/' + a.handle + ' to circuits.com/' + h + '? Any link already printed with the old address stops working.', { danger: false })) return;
    const err = await adminSetHandle(a.user_id, h);
    if(err){ tell('Address not changed: ' + err); return; }
    accToast(name + ' is now at circuits.com/' + h + '.');
    await reloadCompanies(); await loadAccounts(true);
    return;
  }
  if(act === 'set-email'){
    const e = accVal('signin').toLowerCase();
    if(!isValidEmail(e)){ tell('That is not an email address.'); return; }
    if(e === String(a.signin_email || '').toLowerCase()){ tell('That is already the sign-in email.'); return; }
    if(!await askConfirm(name + ' signs in with ' + a.signin_email + '. Change it to ' + e + '? It works at once; the old email stops working for sign-in.', { danger: false })) return;
    const r = await adminSetEmail(a.user_id, e);
    if(r.error){ tell('Sign-in email not changed: ' + r.error); return; }
    if(r.confirmed === false){
      const err = await resendConfirmation(e);
      accToast(err ? 'Changed. The confirmation email could not go yet: ' + err : 'Changed, and the confirmation email went to ' + e + '.');
    }else accToast('Sign-in email changed to ' + e + '.');
    await reloadCompanies(); await loadAccounts(true);
  }
}
async function accUpload(kind, input){
  const a = accCur(); const f = input.files && input.files[0]; input.value = '';
  if(!a || !f || ACC.busy) return;
  if(!/^image\/(png|jpeg|webp)$/.test(f.type)){ tell('Use a PNG, JPEG or WebP picture.'); return; }
  if(f.size > 4 * 1024 * 1024){ tell('That picture is over 4 MB.'); return; }
  ACC.busy = true;
  try{
    const slug = await accSlug(a); if(!slug) return;
    const url = kind === 'logo' ? await uploadImage(f) : await uploadCover(f);
    if(!url){ tell('The upload did not go through. Try a smaller picture.'); return; }
    const err = await updateCompany(slug, kind === 'logo' ? { logo: url } : { cover_url: url });
    if(err){ tell('Could not save it: ' + err); return; }
    if(kind === 'logo') await adminUpdateProfile(a.user_id, { photo_url: url });
    accToast(kind === 'logo' ? 'Logo saved.' : 'Banner saved.');
  }finally{ ACC.busy = false; }
  await loadAccounts(true);
}
/* one at a time, a little apart, so the mail service does not throttle us */
async function resendAllUnconfirmed(){
  const todo = ACC.list.filter(a => a.confirmed === false && !a.suspended_at && a.signin_email);
  if(!todo.length || ACC.busy) return;
  if(!await askConfirm('Send the confirmation email again to ' + todo.length + ' unconfirmed account' + (todo.length === 1 ? '' : 's') + '?', { danger: false })) return;
  const btn = $('acc-resend-all');
  ACC.busy = true; btn.disabled = true;
  const failed = [];
  try{
    for(const [i, a] of todo.entries()){
      btn.textContent = 'Sending ' + (i + 1) + ' of ' + todo.length + '…';
      const err = await resendConfirmation(a.signin_email);
      if(err) failed.push(a.signin_email + ': ' + err);
      if(i < todo.length - 1) await new Promise(r => setTimeout(r, 1200));
    }
  }finally{ ACC.busy = false; btn.disabled = false; renderAccountList(); }
  if(failed.length) tell('Sent ' + (todo.length - failed.length) + ' of ' + todo.length + '. Not sent:\n' + failed.join('\n'));
  else accToast('Confirmation emails sent again to ' + todo.length + ' accounts.');
}

/* ---- Manage Clubs (Jacob, 2026-10-12): approve and manage club pages ----
   New clubs arrive Pending (the database sets it) and sort first. Approve
   puts the club on the Global Club List and tells its owner; Deny keeps it
   off. Suspend and Delete work the same as on All Profiles. */
let allClubs = [];
async function reloadClubs(){
  const body = $('clubs-body'); if(!body) return;
  allClubs = await fetchAdminClubs();
  clubSlugs = new Set(allClubs.map(c => c.slug));
  const order = { Pending: 0, Approved: 1, Denied: 2 };
  allClubs.sort((a, b) => (order[a.club_status] ?? 9) - (order[b.club_status] ?? 9));
  const waiting = allClubs.filter(c => c.club_status === 'Pending').length;
  $('clubs-hint').textContent = waiting
    ? waiting + (waiting === 1 ? ' club waiting for approval' : ' clubs waiting for approval')
    : 'Every Student Club Page. Approve To Put A Club On The Global Club List, Deny To Keep It Off';
  const n = a => (Array.isArray(a) ? a : []).filter(x => x && ((x.name || '').trim() || (x.handle || '').trim())).length;
  body.innerHTML = allClubs.map(c => `
    <tr class="${c.club_status === 'Pending' ? 'row-waiting' : ''}">
      <td><a href="/${esc(c.handle || c.slug)}" target="_blank" rel="noopener"><b>${esc(c.name)}</b></a><br><span class="cell-muted">circuits.com/${esc(c.handle || c.slug)}</span></td>
      <td>${esc(c.college_name || 'none')}</td>
      <td>${esc(c.contact || 'none')}${c.phone ? '<br><span class="cell-muted">' + esc(c.phone) + '</span>' : ''}</td>
      <td class="cell-muted">${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : 'none'}</td>
      <td class="cell-muted">${n(c.members)} members<br>${n(c.team)} officers</td>
      <td>${(c.keywords || []).length ? c.keywords.map(k => `<span class="kw-tag${k.status === 'Approved' ? '' : ' kw-off'}" title="${esc(k.status)}">${esc(k.keyword)}</span>`).join(' ') : '<span class="cell-muted">none yet</span>'}</td>
      <td class="cell-muted">${new Date(c.created_at).toLocaleDateString()}</td>
      <td>${c.suspended_at ? '<b>Suspended</b>' : c.club_status === 'Pending' ? '<b>Pending</b>' : esc(c.club_status)}</td>
      <td class="row-actions">
        ${c.club_status !== 'Approved' ? `<button class="mini-btn green" onclick="setClubStatusUI('${esc(c.slug)}', 'Approved')">Approve</button>` : ''}
        ${c.club_status !== 'Denied' ? `<button class="mini-btn" onclick="setClubStatusUI('${esc(c.slug)}', 'Denied')">Deny</button>` : ''}
        ${c.suspended_at
          ? `<button class="mini-btn green" onclick="setSuspended('${esc(c.slug)}', false)">Reinstate</button>`
          : `<button class="mini-btn" onclick="setSuspended('${esc(c.slug)}', true)">Suspend</button>`}
        <button class="mini-btn danger" onclick="deleteCompanyUI('${esc(c.slug)}')">Delete</button>
      </td></tr>`).join('');
  $('clubs-adm-empty').style.display = allClubs.length ? 'none' : 'block';
  renderClubApps();
  renderClubPeople();
  reloadClubProjects();
  if(allApps.length) renderAll();
}
async function setClubStatusUI(slug, status){
  const c = allClubs.find(x => x.slug === slug);
  const name = c ? c.name : 'this club';
  if(status === 'Denied' && !await askConfirm('Deny ' + name + '? It stays off the Global Club List and its owner gets a message saying so. The page itself stays as it is.')) return;
  const err = await setClubStatus(slug, status);
  if(err){ tell('Could not do that: ' + err); return; }
  if(typeof toast === 'function') toast(name + (status === 'Approved' ? ' is approved and on the Global Club List.' : status === 'Denied' ? ' was denied.' : ' is back under review.'), true);
  await reloadClubs();
}

/* Talent Access retired 2026-09-13: Recruiting is free, any signed-in account
   views a recruit's details. companies.talent_access_until stays, unused. */

/* ---- Upgrade Applications: badge / banner / locked position, asked from Listings ----
   A Trust Badge request carries the label and colour the company chose;
   Approve applies exactly that to the listing, Deny closes the request and
   tells the company. Payment is taken outside the site first. */
const UPGRADE_NAMES = { badge: 'Trust Badge', banner: 'Sponsor banner', lock: 'Locked position' };
let openUpgrades = [];
async function reloadUpgrades(){
  const body = $('upgrades-body'); if(!body) return;
  openUpgrades = await fetchUpgradeRequests();
  const mine = openUpgrades.filter(r => !clubSlugs.has(r.company_slug));
  body.innerHTML = mine.map(upgradeRow).join('');
  $('upgrades-empty').style.display = mine.length ? 'none' : 'block';
  renderClubUpgrades();
}
function upgradeRow(r){
  return `
    <tr class="row-waiting">
      ${coCell(r.company || r.company_slug, r.company_handle)}
      <td>${esc(r.keyword || 'none')}</td>
      <td><b>${esc(UPGRADE_NAMES[r.kind] || r.kind)}</b></td>
      <td>${r.kind === 'badge' ? `<span class="lb" style="${badgeStyle(r.badge_color)}">${esc(r.badge_text || '')}</span>` : r.kind === 'lock' ? 'Spot chosen on Approve' : 'Exclusive banner'}</td>
      <td class="cell-muted">${new Date(r.created_at).toLocaleDateString()}</td>
      <td class="row-actions">
        <button class="mini-btn green" onclick="approveUpgrade('${esc(r.id)}')">Approve</button>
        <button class="mini-btn danger" onclick="denyUpgrade('${esc(r.id)}')">Deny</button>
      </td></tr>`;
}
async function approveUpgrade(id){
  const r = openUpgrades.find(u => u.id === id); if(!r) return;
  const l = allApps.find(a => a.id === r.application_id);
  if(!l){ tell('That listing is gone.'); return; }
  let fields;
  if(r.kind === 'badge'){
    fields = { badge: { text: (r.badge_text || '').slice(0, 18), color: hexColor(r.badge_color) } };
    if(!fields.badge.text){ tell('This request has no badge label. Deny it and ask the company to request again.'); return; }
  }else if(r.kind === 'banner'){
    if(bannerConflict({ ...l, banner: true })){ tell('Blocked: "' + (l.keyword || '') + '" already has a live Exclusive Sponsor banner. Remove that one first.'); return; }
    fields = { banner: true };
  }else{
    const raw = await askText('Lock ' + l.company + ' to which spot on “' + (l.keyword || '') + '”? (1 = top)', '1');
    if(raw === null) return;
    const n = parseInt(raw, 10);
    if(!(n >= 1 && n <= 99)){ tell('Please enter a number from 1 to 99.'); return; }
    fields = { locked_position: n };
  }
  if(!await askConfirm('Approve this ' + UPGRADE_NAMES[r.kind] + ' for ' + l.company + '? Only do this once payment is taken. It goes live now.')) return;
  if(deciding) return; deciding = true;
  try{ await approveUpgradeNow(id, r, l, fields); } finally { deciding = false; }
}
async function approveUpgradeNow(id, r, l, fields){
  const err = await updateApplication(l.id, fields);
  if(err){
    tell(/duplicate|unique|23505/i.test((err.message || '') + (err.code || ''))
      ? 'That spot on “' + (l.keyword || '') + '” is already locked by another company.'
      : 'Could not apply that: ' + (err.message || err));
    return;
  }
  const derr = await handleUpgradeRequest(id, 'Approved');
  if(derr) tell('Applied, but the request could not be closed: ' + derr);
  await reload(); await reloadUpgrades();
}
async function denyUpgrade(id){
  const r = openUpgrades.find(u => u.id === id); if(!r) return;
  if(!await askConfirm('Deny this ' + UPGRADE_NAMES[r.kind] + ' request? The company is told it was not approved.')) return;
  const err = await handleUpgradeRequest(id, 'Denied');
  if(err){ tell('Could not do that: ' + err); return; }
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
  if(aud !== 'users' && !await askConfirm(`Send "${subject}" to ${label}? This cannot be recalled.`)) return;
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

/* ---- recruits (MVP2): people listed on the Talent Board ---- */
let allRecruits = [];
async function reloadRecruits(){
  const body = $('recruits-body'); if(!body) return;
  allRecruits = await fetchRecruits();
  /* switched-on and waiting first, then the rest by state */
  const order = { Pending: 0, Approved: 1, Denied: 2 };
  allRecruits.sort((a, b) => (b.talent_listed - a.talent_listed) || ((order[a.talent_status] ?? 9) - (order[b.talent_status] ?? 9)));
  body.innerHTML = allRecruits.map(r => `
    <tr class="${r.talent_listed && r.talent_status === 'Pending' ? 'row-waiting' : ''}">
      <td><a href="/${esc(r.handle)}" target="_blank" rel="noopener">${esc(r.display_name || r.handle)}</a></td>
      <td>${esc(r.title || 'none')}</td>
      <td>${r.years == null ? 'none' : r.years}</td>
      <td>${(r.keywords || []).length ? (r.keywords || []).map(k => `<span class="kw-tag${k.enabled === false ? ' kw-off' : ''}">${esc(k.keyword)}</span>`).join(' ') : '<span class="cell-muted">none yet</span>'}</td>
      <td>${r.talent_listed ? 'On' : '<span class="cell-muted">Off, not switched on yet</span>'}</td>
      <td class="cell-muted">${new Date(r.updated_at).toLocaleDateString()}</td>
      <td>${r.talent_status === 'Pending' ? (r.talent_listed ? '<b>Pending</b>' : 'Pending') : esc(r.talent_status)}</td>
      <td class="row-actions">
        ${r.talent_status !== 'Approved' ? `<button class="mini-btn green" onclick="setRecruitStatus('${esc(r.user_id)}', 'Approved')">Approve</button>` : ''}
        ${r.talent_status !== 'Denied' ? `<button class="mini-btn" onclick="setRecruitStatus('${esc(r.user_id)}', 'Denied')">Deny</button>` : ''}
      </td></tr>`).join('');
  $('recruits-empty').style.display = allRecruits.length ? 'none' : 'block';
}
async function setRecruitStatus(userId, status){
  const r = allRecruits.find(x => x.user_id === userId);
  const who = r ? (r.display_name || r.handle) : 'this person';
  if(status === 'Denied' && !await askConfirm('Deny ' + who + '? They leave the Talent Board and get a message saying so. Their profile stays as it is.')) return;
  const err = await setTalentStatus(userId, status);
  if(err){ tell('Could not do that: ' + err); return; }
  await reloadRecruits();
}

/* ---- jobs (MVP2): free; live for 30 days per approval, recorded by staff ---- */
let allJobs = [];
function jobState(j){
  if(j.closed_at) return 'Paused';
  if(j.paid_until && new Date(j.paid_until) > new Date()) return 'Live until ' + new Date(j.paid_until).toLocaleDateString();
  if(j.paid_until) return 'Expired';
  return 'Awaiting approval';
}
async function reloadJobs(){
  const body = $('jobs-body'); if(!body) return;
  allJobs = await fetchAllJobs();
  body.innerHTML = allJobs.map(j => `
    <tr class="${jobState(j) === 'Awaiting approval' ? 'row-waiting' : ''}">
      <td><a href="/${esc(j.company_handle || j.company_slug)}" target="_blank" rel="noopener">${esc(j.company_name)}</a><br><span class="cell-muted">${j.company_handle ? 'circuits.com/' + esc(j.company_handle) : 'no username yet'}</span></td>
      <td><b>${esc(j.title)}</b>${j.location ? '<br><span class="cell-muted">' + esc(j.location) + '</span>' : ''}</td>
      <td class="cell-muted">${esc((j.keywords || []).join(', ') || 'none')}</td>
      <td class="cell-muted">${new Date(j.created_at).toLocaleDateString()}</td>
      <td>${esc(jobState(j))}</td>
      <td class="row-actions">
        ${j.closed_at ? '' : `<button class="mini-btn green" onclick="approveJob('${esc(j.id)}')">Approve (30 days)</button>
        <button class="mini-btn" onclick="closeJob('${esc(j.id)}')">Deny</button>`}
      </td></tr>`).join('');
  $('jobs-empty').style.display = allJobs.length ? 'none' : 'block';
}
async function approveJob(id){
  const j = allJobs.find(x => x.id === id);
  const from = Math.max(Date.now(), j && j.paid_until ? new Date(j.paid_until).getTime() : 0);
  const err = await updateJob(id, { paid_until: new Date(from + 30 * 864e5).toISOString() });
  if(err){ tell('Could not do that: ' + err); return; }
  await reloadJobs();
}
async function closeJob(id){
  const j = allJobs.find(x => x.id === id);
  if(!await askConfirm('Deny ' + (j ? '"' + j.title + '"' : 'this job') + '? It is paused, comes off the Job Board, and the company gets a message. They can switch it back to Live from their dashboard.')) return;
  const err = await updateJob(id, { closed_at: new Date().toISOString() });
  if(err){ tell('Could not do that: ' + err); return; }
  await reloadJobs();
}

/* Deletion is final: the company row, its listings, jobs, reviews and requests
   all go. Typing the exact name is the confirmation; a reason goes in the log. */
async function deleteCompanyUI(slug){
  const co = allCompanies.find(c => c.slug === slug) || allClubs.find(c => c.slug === slug);
  const name = co ? co.name : slug;
  const typed = await askText('Delete ' + name + ' for good? This removes the company page, every keyword listing, job post, review and request it has. The owner keeps their sign-in.\n\nType the company name exactly to confirm:');
  if(typed === null) return;
  if(typed.trim() !== name.trim()){ tell('The name did not match. Nothing was deleted.'); return; }
  const reason = await askText('Reason (goes in the permanent audit log):');
  if(reason === null) return;
  const err = await deleteCompany(slug, reason);
  if(err){ tell('Could not delete: ' + err); return; }
  if(typeof toast === 'function') toast(name + ' was deleted.', true);
  await reloadCompanies(); await reloadClubs(); reload();
}

async function setSuspended(slug, suspend){
  const co = allCompanies.find(c => c.slug === slug) || allClubs.find(c => c.slug === slug);
  const name = co ? co.name : slug;
  /* A reason is required going in, because the audit entry is permanent and a
     bare "suspended" tells nobody anything six months later. */
  const reason = await askText(
    (suspend ? 'Suspend ' : 'Reinstate ') + name + '.\n\n'
    + (suspend
        ? 'This hides the listing from the directory and from search, and blocks the owner from editing it. Nothing is deleted.\n\nWhy?'
        : 'This puts the listing back in the directory.\n\nWhy?'));
  if(reason === null) return;
  if(!reason.trim()){ tell('Please give a reason. It goes in the permanent audit log.'); return; }
  const err = await suspendCompany(slug, suspend, reason.trim());
  if(err){ tell('Could not do that: ' + err); return; }
  if(typeof toast === 'function') toast(name + (suspend ? ' is suspended.' : ' is reinstated.'), true);
  await reloadCompanies();
  await reloadClubs();
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
/* Profiles Admin / Club Admin (2026-10-19): a sub-tab belongs to one side,
   marked adm-club for the club side. Showing a sub-tab shows its side too. */
const sideOf = g => { const b = document.querySelector(`.adm-tab[data-adm="${g}"]`); return b && b.classList.contains('adm-club') ? 'clubs' : 'profiles'; };
function showAdminMode(mode){
  document.querySelectorAll('.adm-mode-btn').forEach(b => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
  const tab = document.getElementById('tab-admin'); if(tab) tab.classList.toggle('adm-clubs', mode === 'clubs');
  if(adminMode !== mode){ adminMode = mode; renderStats(); }
}
document.querySelectorAll('.adm-mode-btn').forEach(b => b.addEventListener('click', () => {
  const mode = b.dataset.mode;
  let last = ''; try{ last = localStorage.getItem('cx_admin_group_' + mode) || ''; }catch(e){}
  const first = document.querySelector(mode === 'clubs' ? '.adm-tab.adm-club' : '.adm-tab:not(.adm-club)');
  showAdminGroup(last && sideOf(last) === mode && document.querySelector(`.adm-tab[data-adm="${last}"]`) ? last : first.dataset.adm, true);
}));
function showAdminGroup(g, fromClick){
  showAdminMode(sideOf(g));
  try{ localStorage.setItem('cx_admin_group_' + sideOf(g), g); }catch(e){}
  document.querySelectorAll('.adm-tab').forEach(b => b.classList.toggle('active', b.dataset.adm === g));
  document.querySelectorAll('#tab-admin .panel[data-adm]').forEach(p => p.classList.toggle('adm-on', p.dataset.adm === g));
  /* the Website Applications sheet is its own page, framed in; it loads on first open */
  const fr = $('apps-frame');
  if(g === 'applications' && fr && !fr.src) fr.src = '/applications?embed=1';
  if(g === 'accounts') loadAccounts(true);
  try{ localStorage.setItem('cx_admin_group', g); }catch(e){}
  /* a reload stays on this sub-tab (Jacob, 2026-09-15): it rides in the
     address as #admin:<group>, the way the dashboard tabs do */
  if(fromClick){ try{ history.replaceState(null, '', '#admin:' + g); }catch(e){} }
}
window.showAdminGroup = showAdminGroup;
document.querySelectorAll('.adm-tab').forEach(b => b.addEventListener('click', () => showAdminGroup(b.dataset.adm, true)));
let remembered = 'companies';
try{ remembered = localStorage.getItem('cx_admin_group') || remembered; }catch(e){}
showAdminGroup(document.querySelector(`.adm-tab[data-adm="${remembered}"]`) ? remembered : 'companies');

let started = false;
window.initAdmin = async function(){
  if(started) return;
  if(!(await checkStaff())) return;        // belt and braces; the database is the real gate
  started = true;
  await reloadClubs();   // the club set first, so Directory Admin never shows a club row
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
  approveApp, rejectApp, setSuspended, approveJob, closeJob, approveUpgrade, denyUpgrade, sendNotificationUI, notifyAudienceUI, setRecruitStatus, deleteCompanyUI, setClubStatusUI, toggleProjectUI, deleteProjectUI, setProfileSuspendedUI,
  approvePersonUI, denyPersonUI, savePersonBadgeUI, removePersonUI, saveClubAppUI, approveClubAppUI
});
})();
