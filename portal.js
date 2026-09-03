/* ===== Circuits.com, the profile dashboard =====
   Everything here is gated by RLS, not by this file. Hiding a button is a
   convenience; the database is what actually refuses the write. */

let PT = { slug: null, co: null, listings: [], inquiries: [], reviews: [], openInquiry: null, editing: null };

const SOCIAL_KEYS = [['linkedin','LinkedIn'],['x','X / Twitter'],['facebook','Facebook'],['youtube','YouTube'],['instagram','Instagram'],['github','GitHub']];

function el(id){ return document.getElementById(id); }
function val(id){ const e = el(id); return e ? (e.value || '').trim() : ''; }
function show(id, on){ const e = el(id); if(e) e.style.display = on ? '' : 'none'; }
function toast(text, ok){
  const t = el('pt-toast'); if(!t) return;
  t.textContent = text; t.style.color = ok ? '#3f6300' : '#b3261e'; t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

/* ===== Seeking Employment: experience, keywords, the listing (one saved profile) =====
   One account type since 2026-09-03: the same account has a Profile Details
   form (the public page, saved by saveProfile below) and this private side,
   the person behind it as recruiters see them. ME is the profiles row; an
   account from before profiles existed, or one made by the old Get Listed
   form, has no row yet: Profile Details creates it on first save. */
let ME = null, ME_FRESH = false;

function renderSeeking(me){
  ME_FRESH = !me;
  ME = me || { handle: '', display_name: '', keywords: [], credentials: [] };
  renderExperience(); renderRecruit();
}

const saveBtn = (id) => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px">
    <button class="btn btn-primary me-save" type="button">Save</button>
    <span id="${id}" class="pf-note me-msg"></span></div>`;

const freshNote = () => `<div class="pt-empty"><b>Save your Profile Details first</b>
    <p>Pick your Circuits.com address and name on the Profile Details tab and save. This tab opens up right after.</p></div>`;

function renderExperience(){
  const box = el('pt-experience'); if(!box) return;
  if(ME_FRESH){ box.innerHTML = freshNote(); return; }
  box.innerHTML = `
    <h3 style="margin-top:0">Experience</h3>
    <div class="grid2">
      <div class="auth-field"><label>Position Desired</label>
        <input id="me-title" type="text" maxlength="80" placeholder="RF Design Engineer" value="${escapeHtml(ME.title || '')}"></div>
      <div class="auth-field"><label>Years of experience</label>
        <input id="me-years" type="number" min="0" max="60" placeholder="8" value="${ME.years == null ? '' : ME.years}"></div>
    </div>
    <div class="auth-field"><label>Qualifying statement</label>
      <textarea id="me-bio" rows="5" maxlength="600" placeholder="What you do, what you are good at, what you are looking for.">${escapeHtml(ME.bio || '')}</textarea></div>
    <details class="pt-fold" open><summary>Certifications &amp; degrees <span class="pf-note" id="fold-creds-n"></span></summary><div class="pt-list" id="f-creds"></div></details>
    <details class="pt-fold" open><summary>Resume <span class="pf-note">${ME.resume_path ? '· on file' : '· none yet'}</span></summary>
      <div class="pt-list"><div class="pt-item" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span id="me-resume-state" class="pf-note" style="margin:0;flex:1">${ME.resume_path ? 'Resume on file. PDF, private until a company unlocks you.' : 'No resume yet. PDF, up to 10 MB, private until a company unlocks you.'}</span>
        ${ME.resume_path ? '<a class="mini-btn rp-add" href="#" id="me-resume-view">View</a><button class="mini-btn rp-add danger" type="button" id="me-resume-remove">Remove</button>' : ''}
        <label class="mini-btn green rp-add" style="cursor:pointer">${ME.resume_path ? 'Replace' : '+ Upload'}<input id="me-resume" type="file" accept="application/pdf" style="display:none"></label>
      </div></div></details>
    ${saveBtn('me-msg-2')}`;
  renderRepeater('creds', ME.credentials, ['name', 'issuer', 'year'], ['Certification or degree', 'Issued by', 'Year']);

  const up = el('me-resume');
  if(up) up.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const st = el('me-resume-state');
    if(f.type !== 'application/pdf'){ st.textContent = 'Please choose a PDF.'; return; }
    if(f.size > 10 * 1024 * 1024){ st.textContent = 'That PDF is over 10 MB.'; return; }
    st.textContent = 'Uploading…';
    const r = await uploadResume(f);
    if(r.error){ st.textContent = 'Upload failed: ' + r.error; return; }
    ME.resume_path = r.path; renderExperience(); renderRecruitPreview();
  });
  const view = el('me-resume-view');
  if(view) view.addEventListener('click', async e => {
    e.preventDefault(); const url = await resumeLink(ME.resume_path);
    if(url) window.open(url, '_blank', 'noopener'); else el('me-resume-state').textContent = 'Could not open the resume just now.';
  });
  const rm = el('me-resume-remove');
  if(rm) rm.addEventListener('click', async () => {
    if(!confirm('Remove your resume from Circuits.com?')) return;
    const err = await removeResume();
    if(err){ el('me-resume-state').textContent = err; return; }
    ME.resume_path = null; renderExperience(); renderRecruitPreview();
  });
}

/* Keywords are a table (Jacob, 2026-09-02): one row per keyword with its own
   field, an on/off switch, and a Preview button that shows the card the way
   a company searching that keyword sees it. */
let KW_ROWS = [], PREVIEW_KW = null;
function kwRowsFromMe(){
  const rows = Array.isArray(ME.keyword_rows) ? ME.keyword_rows : (ME.keywords || []).map(k => ({ keyword: k, enabled: true }));
  return rows.map(r => ({ keyword: r.keyword || '', enabled: r.enabled !== false }));
}
function drawKwTable(){
  const t = el('me-kw-rows'); if(!t) return;
  t.innerHTML = KW_ROWS.map((r, i) => `<tr class="${r.enabled ? '' : 'kw-off'}">
      <td><input type="text" class="kw-field" data-i="${i}" maxlength="40" placeholder="e.g. pcb layout" value="${escapeHtml(r.keyword)}" aria-label="Keyword ${i + 1}"></td>
      <td><label class="switch kw-switch"><input type="checkbox" data-on="${i}" ${r.enabled ? 'checked' : ''}><span class="knob" aria-hidden="true"></span><span class="sw-text">${r.enabled ? 'On' : 'Off'}</span></label></td>
      <td class="row-actions"><button type="button" class="mini-btn rp-add ${PREVIEW_KW === r.keyword && r.keyword ? 'green' : ''}" data-preview="${i}">Preview</button>
        <button type="button" class="pt-doc-x" data-rmkw="${i}" aria-label="Remove keyword">&times;</button></td>
    </tr>`).join('');
  const add = el('me-kw-add'); if(add) add.disabled = KW_ROWS.length >= 10;
  const n = el('me-kw-n'); if(n) n.innerHTML = `<b>${KW_ROWS.filter(r => r.keyword.trim()).length}</b> of 10 keywords, ${KW_ROWS.filter(r => r.keyword.trim() && r.enabled).length} on`;
}
function renderRecruit(){
  const box = el('pt-recruit'); if(!box) return;
  if(ME_FRESH){ box.innerHTML = ''; renderRecruitPreview(); return; }
  KW_ROWS = kwRowsFromMe();
  if(!KW_ROWS.length) KW_ROWS.push({ keyword: '', enabled: true });
  box.innerHTML = `
    <h3 style="margin-top:0">Your listing</h3>
    <div class="auth-field"><label>Your Circuits-Keywords&trade; <span class="cell-muted">(up to 10)</span></label>
      <div class="table-scroll"><table class="dash-table kw-table">
        <thead><tr><th>Keyword</th><th>On / Off</th><th></th></tr></thead>
        <tbody id="me-kw-rows"></tbody>
      </table></div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
        <button type="button" class="mini-btn green rp-add" id="me-kw-add">+ Add keyword</button>
        <span class="pf-note" id="me-kw-n" style="margin:0"></span></div>
      <div class="pf-note">The words a recruiter searches for. One idea per keyword: <b>pcb layout</b>, not <b>pcb layout and test</b>. Off keeps a keyword without being found by it.</div></div>
    <div class="grid2">
      <div class="auth-field"><label>Email for recruiters <span class="cell-muted">(private until a company unlocks you)</span></label>
        <input id="me-email" type="email" readonly value="${escapeHtml(ME.email || (PT.user && PT.user.email) || '')}" title="Change it under Account Settings">
        <div class="pf-note">Your sign-in email. Change it under Account Settings.</div></div>
      <div class="auth-field"><label>Phone for recruiters <span class="req">*</span> <span class="cell-muted">(private until a company unlocks you)</span></label>
        <input id="me-phone" type="tel" maxlength="40" placeholder="(555) 123-4567" value="${escapeHtml(ME.phone || '')}"></div>
    </div>
    <div class="pt-setting">
      <div class="pt-setting-text"><b>List me under Seeking Employment</b>
        <p class="pf-note">Companies searching your keywords see the preview. Switch it off any time.</p></div>
      <label class="switch"><input id="me-listed" type="checkbox" ${ME.talent_listed ? 'checked' : ''}>
        <span class="knob" aria-hidden="true"></span><span class="sr-only">List me under Seeking Employment</span></label>
    </div>
    ${ME.talent_listed ? (
        ME.talent_status === 'Approved' ? '<p class="pf-note" style="color:var(--green-dark)">Approved. Companies searching your keywords can find you.</p>'
      : ME.talent_status === 'Denied'   ? '<p class="pf-note" style="color:#b3261e">Not approved. Reply through the <a href="/contact">Contact page</a> if you think this is a mistake.</p>'
      : '<p class="pf-note">Waiting for Circuits.com to approve your listing. You get a message in your inbox when that is done.</p>') : ''}
    ${saveBtn('me-msg-3')}`;
  drawKwTable();
  const table = el('me-kw-rows');
  table.addEventListener('input', e => { const f = e.target.closest('.kw-field'); if(!f) return; KW_ROWS[+f.dataset.i].keyword = f.value; const n = el('me-kw-n'); if(n) n.innerHTML = `<b>${KW_ROWS.filter(r => r.keyword.trim()).length}</b> of 10 keywords, ${KW_ROWS.filter(r => r.keyword.trim() && r.enabled).length} on`; renderRecruitPreview(); });
  table.addEventListener('change', e => { const c = e.target.closest('[data-on]'); if(!c) return; KW_ROWS[+c.dataset.on].enabled = c.checked; drawKwTable(); renderRecruitPreview(); });
  table.addEventListener('click', e => {
    const pv = e.target.closest('[data-preview]'), rm = e.target.closest('[data-rmkw]');
    if(pv){ const k = KW_ROWS[+pv.dataset.preview].keyword.trim(); PREVIEW_KW = PREVIEW_KW === k ? null : k; drawKwTable(); renderRecruitPreview(); }
    if(rm){ KW_ROWS.splice(+rm.dataset.rmkw, 1); if(!KW_ROWS.length) KW_ROWS.push({ keyword: '', enabled: true }); drawKwTable(); renderRecruitPreview(); }
  });
  el('me-kw-add').addEventListener('click', () => { if(KW_ROWS.length >= 10) return; KW_ROWS.push({ keyword: '', enabled: true }); drawKwTable(); const last = table.querySelector('tr:last-child .kw-field'); if(last) last.focus(); });
  renderRecruitPreview();
}

/* the card exactly as a searching company sees it: public bits open, private bits blurred */
function renderRecruitPreview(){
  const box = el('pt-recruit-preview'); if(!box) return;
  if(ME_FRESH){ box.innerHTML = '<p class="pf-note">Your card appears here once your Profile Details are saved.</p>'; return; }
  const on = KW_ROWS.filter(r => r.keyword.trim() && r.enabled).map(r => r.keyword.trim());
  const pk = PREVIEW_KW && KW_ROWS.find(r => r.keyword.trim() === PREVIEW_KW);
  const kw = pk ? [PREVIEW_KW].concat(on.filter(k => k !== PREVIEW_KW)) : on;
  const row = { user_id: 'me', title: val('me-title') || ME.title, years: val('me-years') === '' ? ME.years : parseInt(val('me-years'), 10),
                bio: val('me-bio') || ME.bio, keywords: kw, credentials: (el('f-creds') && el('f-creds').__list) || ME.credentials };
  const cap = pk
    ? (pk.enabled ? `<p class="pf-note" style="margin:0 0 8px">Previewing a company searching <b>${escapeHtml(PREVIEW_KW)}</b>. Unlock shows what they see after paying.</p>`
                  : `<p class="pf-note" style="margin:0 0 8px;color:#b3261e"><b>${escapeHtml(PREVIEW_KW)}</b> is switched off, so a company searching it does not see you.</p>`)
    : '<p class="pf-note" style="margin:0 0 8px">Pick Preview beside a keyword to see that search. Unlock shows what a company sees after paying.</p>';
  box.innerHTML = cap + `<div class="tal-grid" style="grid-template-columns:1fr">${talentCardHtml(row, { access: true, kwHref: null })}</div>`;
  if(pk) box.querySelector('.kw-tag') && box.querySelector('.kw-tag').classList.add('on');
  /* Unlock works here: it is your own card, so it reveals your own details */
  const u = box.querySelector('button.tal-unlock');
  if(u) u.addEventListener('click', async () => {
    const priv = box.querySelector('.tal-private');
    const resume = ME.resume_path ? await resumeLink(ME.resume_path) : '';
    priv.innerHTML = talentContactHtml({ handle: ME.handle, display_name: ME.display_name, email: ME.email || (PT.user && PT.user.email) || '', phone: val('me-phone') || ME.phone || '', photo_url: ME.photo_url }, resume)
      + '<button type="button" class="mini-btn rp-add" id="me-relock">Lock again</button>';
    priv.querySelector('#me-relock').addEventListener('click', renderRecruitPreview);
  });
}

function wireSeeking(){
  document.addEventListener('click', async e => {
    const b = e.target.closest('.me-save'); if(!b) return;
    /* looked up on every call: a save re-renders the tab, and a message on the
       old, detached elements is a message nobody sees */
    const say = (t, bad) => document.querySelectorAll('.me-msg').forEach(m => { m.textContent = t; m.style.color = bad ? '#b3261e' : (t === 'Saving…' ? '' : '#3f6300'); });
    if(ME_FRESH){ say('Save your Profile Details first.', true); activateTab('profile'); return; }
    say('Saving…', false);
    const listed = !!(el('me-listed') && el('me-listed').checked);
    if(listed && !isValidPhone(val('me-phone'))){ say('A phone number (at least 10 digits) is needed to be listed. It stays private until a company unlocks you.', true); el('me-phone').focus(); return; }
    if(val('me-phone') && !isValidPhone(val('me-phone'))){ say('That phone number needs at least 10 digits.', true); el('me-phone').focus(); return; }
    const yearsRaw = val('me-years');
    const years = yearsRaw === '' ? null : parseInt(yearsRaw, 10);
    if(yearsRaw !== '' && !(years >= 0 && years <= 60)){ say('Years of experience should be 0 to 60.', true); return; }
    const kwRows = KW_ROWS.filter(r => r.keyword.trim());
    const keywords = kwRows.map(r => r.keyword.trim()), kwOn = kwRows.map(r => r.enabled);
    if(keywords.length > 10){ say('Ten keywords is the limit.', true); return; }
    const credentials = (el('f-creds') && el('f-creds').__list || []).filter(o => Object.values(o).some(v => (v || '').trim()));
    for(const c of credentials){ if((c.year || '').trim() && !isValidYear(c.year)){ say(`"${c.name || '(unnamed)'}" needs a 4-digit year.`, true); return; } }
    const fields = { phone: val('me-phone') || null,
      title: val('me-title') || null, years, bio: val('me-bio') || null, credentials,
      talent_listed: listed };
    const err = await updateMyProfile(fields);
    const kw = err ? {} : await setTalentKeywords(keywords, kwOn);
    const bad = err || kw.error;
    if(bad){ say(bad, true); return; }
    renderSeeking(await myProfile());
    say('Saved.', false);
  });
}

/* ---------- boot ---------- */
async function initPortal(){
  const user = await currentUser();
  if(!user){ show('pt-auth', true); show('pt-app', false); wireAuth(); return; }
  PT.user = user;

  /* One account type (Jacob, 2026-09-03). Every account has a profiles row
     (its address) and a companies row that shares the address: the company
     row is what keyword listings, job posts and Talent Access hang off, so an
     account that has never opened the portal gets one now (register_company
     is idempotent). An account with no profiles row at all (made by the old
     Get Listed form, or older than profiles) picks its address on the Profile
     Details tab; saveProfile creates both rows then. */
  let [cos, me] = await Promise.all([myCompanies(), myProfile()]);
  if(!cos.length && me){
    const r = await registerCompany();
    if(!r.error) cos = await myCompanies();
  }
  show('pt-auth', false); show('pt-app', true);

  /* An applicant who has not clicked the confirmation link yet: ownership is
     keyed on the CONFIRMED email, so say what is happening and hand them the fix. */
  const confirmed = !!(user.email_confirmed_at || user.confirmed_at);
  const pend = el('pt-pending');
  if(pend && !confirmed){
    pend.innerHTML = `<div class="pt-underreview" style="margin:14px 24px 0">
      <b>One step left: confirm your email.</b>
      We sent a link to <b>${escapeHtml(user.email || '')}</b> when this account was created.
      If you submitted a listing application, it is safe. It appears here the moment your email is confirmed.
      <div class="resend-line">Nothing arrived? Check spam, then
        <button type="button" id="pt-pending-resend">send the link again</button>.
        <span id="pt-pending-resend-msg"></span></div></div>`;
    el('pt-pending-resend').addEventListener('click', async () => {
      const m = el('pt-pending-resend-msg');
      m.textContent = 'Sending…';
      const err = await resendConfirmation(user.email);
      m.textContent = err || 'Sent. Give it a minute.';
    });
  }

  wireTabs();
  await wireAdminTab();
  renderAccount(user, 'pt-account-owner', true);
  wireSeeking();
  renderSeeking(me);
  wireJobs();
  wireRecruitSearch();
  renderJobBoard();

  if(!cos.length){
    /* no rows yet: the Profile Details form in "create" mode */
    renderFresh();
    return;
  }

  /* A suspended owner can still sign in and still sees their data, the
     database just refuses every edit. Without a notice the portal would look
     broken rather than suspended, so say so plainly and once, at the top. */
  const suspended = cos.filter(c => c.suspended_at);
  if(suspended.length){
    const host = el('pt-app');
    const note = document.createElement('div');
    note.className = 'pt-suspended';
    note.innerHTML =
      '<b>' + escapeHtml(suspended.map(c => c.name).join(', ')) +
      (suspended.length > 1 ? ' are' : ' is') + ' suspended.</b> ' +
      (suspended.length > 1 ? 'These listings are' : 'This listing is') +
      ' hidden from the directory and from keyword results, and cannot be edited ' +
      'while the suspension is in place. Nothing has been deleted. ' +
      '<a href="/contact">Contact us</a> and we will explain why and what happens next.';
    host.insertBefore(note, host.firstChild);
  }

  const picker = el('pt-company');
  picker.innerHTML = cos.map(c => `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</option>`).join('');
  picker.style.display = cos.length > 1 ? '' : 'none';
  picker.addEventListener('change', () => {
    if(PT_DIRTY && !confirm('You have unsaved profile changes. Switch company and lose them?')){
      picker.value = PT.slug; return;
    }
    loadCompany(picker.value);
  });

  /* "Get Listed" while signed in sends people to /portal#listings (nav.js);
     inbox notices about recruiting land on /portal#seeking. */
  const tab = (location.hash || '').replace('#', '');
  if(tab && document.querySelector(`.pt-tab[data-tab="${tab}"]`)) activateTab(tab);
  await loadCompany(cos[0].slug);
}

/* No profiles row and no company: the Profile Details form with nothing in it,
   and a note above it. Everything else waits for the first save. */
function renderFresh(){
  PT.slug = null; PT.co = { handle: '', name: '' }; PT.listings = []; PT.stats = {}; PT.upgrades = [];
  el('pt-name').textContent = PT.user.email || '';
  el('pt-view').style.display = 'none';
  el('pt-company').style.display = 'none';
  el('pt-fresh-note').innerHTML = '<p class="pf-note" style="color:#3f6300;margin:0 0 12px">This account has no Circuits.com address yet. Pick one below, add your name and save to create your profile.</p>';
  renderProfileForm();
  wireDirtyTracking();
  markClean();
  renderListings();
  renderPromote();
  const jobs = el('pt-jobs'); if(jobs) jobs.innerHTML = freshNote();
}

function activateTab(name){
  const b = document.querySelector(`.pt-tab[data-tab="${name}"]`);
  if(b) b.click();
}

/* Admin is something an account has, not a separate login. The tab is hidden
   for everyone else, but hiding a tab is presentation, not security: every
   action inside it is refused by the database unless is_staff() is true. */
async function wireAdminTab(){
  if(!(await checkStaff())) return false;
  show('pt-tab-admin', true);
  return true;
}

/* Sign in. Registration is open to anyone at /register (a listing still needs
   approval), so this card links there rather than dead-ending. */
function wireAuth(){
  el('pt-auth-form').addEventListener('submit', async e => {
    e.preventDefault();
    const msg = el('pt-auth-msg');
    el('pt-auth-submit').disabled = true;
    try{
      const { error } = await signIn(val('pt-email'), val('pt-password'));
      if(error){
        /* An unconfirmed email is fixable on the spot, offer the fix rather
           than parroting the raw error and leaving them stuck. */
        if(/not confirmed/i.test(error.message || '')){
          msg.innerHTML = 'Your email has not been confirmed yet. The sign-in works as soon as '
            + 'you click the link we sent you. <span class="resend-line">Nothing arrived? '
            + '<button type="button" id="pt-auth-resend">Send it again</button> '
            + '<span id="pt-auth-resend-msg"></span></span>';
          el('pt-auth-resend').addEventListener('click', async () => {
            const m = el('pt-auth-resend-msg');
            m.textContent = 'Sending…';
            const err2 = await resendConfirmation(val('pt-email'));
            m.textContent = err2 || 'Sent. Check spam too.';
          });
          el('pt-auth-submit').disabled = false;
          return;
        }
        msg.textContent = /invalid login/i.test(error.message || '')
          ? 'That email and password do not match an account. If you have not made one yet, create your profile below.'
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
  /* the whole public profile is one tab (2026-09-02) */
  const panel = el('tab-profile');
  if(panel && !panel.__dirtyWired){
    panel.__dirtyWired = true;
    panel.addEventListener('input', markDirty);
    panel.addEventListener('change', markDirty);
  }
  if(wireDirtyTracking.__unloadWired) return;
  wireDirtyTracking.__unloadWired = true;
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
    /* The console loads nothing until an admin actually opens it, a company
       owner who never sees this tab never fetches a row of anyone else's data. */
    if(b.dataset.tab === 'admin' && typeof initAdmin === 'function') initAdmin();
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
  el('pt-view').style.display = PT.co.handle ? '' : 'none';
  el('pt-fresh-note').innerHTML = '';
  /* Overview, Quote requests and Reviews are off the dashboard for now
     (Jacob, 2026-08-20, full copies in backups/dashboard-2026-08-20/), so
     their data is not fetched either. Their render functions stay below,
     dormant, for an easy restore. */
  const [listings, stats, upgrades] = await Promise.all([fetchMyListings(slug), listingSearchCounts(slug), myUpgradeRequests(slug)]);
  PT.listings = listings; PT.stats = stats; PT.upgrades = upgrades;
  renderReviewStatus();
  renderProfileForm();
  wireDirtyTracking();
  markClean();
  renderListings();
  wireAddListing();
  renderPromote();
  renderJobs();
  renderJobBoard();
}

/* Applying used to end in silence: the supplier refreshed the portal hoping,
   with nothing anywhere saying "we have it, we are looking at it". One banner
   above the tabs answers the only question they have while they wait. */
function renderReviewStatus(){
  const host = el('pt-app');
  if(!host) return;
  let note = document.getElementById('pt-review-note');
  if(!note){
    note = document.createElement('div');
    note.id = 'pt-review-note';
    const tabs = host.querySelector('.pt-tabs');
    if(!tabs) return;
    host.insertBefore(note, tabs);
  }
  const live = PT.listings.filter(l => l.status === 'Approved');
  const waiting = PT.listings.filter(l => l.status === 'Pending');
  const kws = waiting.map(l => l.keyword).filter(Boolean).map(escapeHtml);

  if(waiting.length && !live.length){
    note.className = 'pt-underreview';
    note.style.display = '';
    note.innerHTML = '<b>Your application is under review</b>, usually one business day. '
      + (kws.length ? 'Keyword' + (kws.length > 1 ? 's' : '') + ' requested: <b>' + kws.join('</b>, <b>') + '</b>. ' : '')
      + 'Nothing is public yet. We email you the decision, and this page updates as soon as it is made.';
  } else if(waiting.length){
    note.className = 'pt-underreview';
    note.style.display = '';
    note.innerHTML = '<b>Still under review:</b> ' + kws.join(', ')
      + '. Your live listing' + (live.length > 1 ? 's are' : ' is') + ' unaffected.';
  } else {
    note.style.display = 'none';
  }
}

/* A supplier should not have to open the tab to discover a new quote request.
   The badge counts requests that have never been looked at. Anything already
   Replied, Won, Lost or Closed is finished business and must not nag. */
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

/* New -> Open, for the one they actually opened. This used to fire for every
   request the moment the tab was clicked, which marked things read that nobody
   had looked at. Fire and forget: if the write fails it stays New and they see
   it again, which is the safe direction to fail in. */
function markInquirySeen(q){
  if(!q || q.status !== 'New') return;
  q.status = 'Open';
  setInquiryStatus(q.id, 'Open').catch(e => { q.status = 'New'; console.warn('mark seen failed', e); });
  const sel = document.querySelector(`[data-status="${q.id}"]`);
  if(sel) sel.value = 'Open';
  markUnread();
}

/* ---------- account ----------
   Change your password, end every session, leave. Boring, and the absence of
   any of it is the kind of thing that gets a site refused by a buyer's IT
   department. */
/* renderAccount(user, hostId, canDelete)
   hostId lets the same panel serve both the no-listing page (#pt-account) and a
   company owner's new Account tab (#pt-account-owner). canDelete is false for a
   listing owner, whose delete is refused server-side anyway (delete_own_account
   returns 'still_owns_listing'); showing them a button that always fails is
   worse than not showing it, so the section is omitted and they are pointed at
   us instead. */
async function renderAccount(user, hostId, canDelete){
  hostId = hostId || 'pt-account';
  if(canDelete === undefined) canDelete = true;
  const host = el(hostId);
  if(!host || !user) return;
  const confirmed = !!(user.email_confirmed_at || user.confirmed_at);

  host.innerHTML = `
    <div class="pt-account">
      <h3>Your account</h3>
      <p class="pf-note">Signed in as <b>${escapeHtml(user.email || '')}</b>
        ${confirmed
          ? '<span class="ac-ok">email confirmed</span>'
          : '<span class="ac-warn">email not confirmed yet. Check your inbox for the link</span>'}</p>

      <div class="auth-field"><label for="ac-email">Change sign-in email</label>
        <input id="ac-email" type="email" autocomplete="email" placeholder="new@address.com"></div>
      <button class="mini-btn" type="button" id="ac-email-save">Change email</button>
      <div id="ac-email-msg" class="pf-note"></div>
      <hr class="ac-rule">
      <div class="auth-field"><label for="ac-pass">New password</label>
        <input id="ac-pass" type="password" minlength="8" autocomplete="new-password"
               placeholder="At least 8 characters"></div>
      <div class="auth-field"><label for="ac-pass2">Confirm new password</label>
        <input id="ac-pass2" type="password" minlength="8" autocomplete="new-password"></div>
      <button class="mini-btn green" type="button" id="ac-save">Change password</button>
      <div id="ac-msg" class="pf-note"></div>

      <hr class="ac-rule">
      <button class="mini-btn" type="button" id="ac-signout-all">Sign out on every device</button>
      <p class="pf-note">Use this if you have signed in on a shared or lost computer.</p>
      ${canDelete ? `
      <hr class="ac-rule">
      <button class="mini-btn ac-danger" type="button" id="ac-delete">Delete my account</button>
      <p class="pf-note">Permanent. Your Circuits.com address is released and can be taken by
        someone else. An account with a live keyword listing or a paid job post cannot be
        deleted here, those are paid for and may be shared. Contact us for those.</p>
      <div id="ac-del-msg" class="pf-note"></div>` : `
      <hr class="ac-rule">
      <p class="pf-note">Need to close this account or hand the listing to a colleague?
        <a href="/contact">Contact us</a>. Company listings are paid for and may be shared,
        so we sort those out with you directly.</p>`}
    </div>`;

  /* these fields render after the page-load pass, so wire their eyes here */
  if(typeof wirePasswordToggles === 'function') wirePasswordToggles(host);

  el('ac-email-save').onclick = async () => {
    const msg = el('ac-email-msg'), v = (el('ac-email').value || '').trim();
    msg.style.color = '#b3261e';
    if(!isValidEmail(v)){ msg.textContent = 'Please enter a valid email address.'; return; }
    msg.style.color = ''; msg.textContent = 'Saving…';
    const err = await changeEmail(v);
    if(err){ msg.style.color = '#b3261e'; msg.textContent = err; return; }
    msg.textContent = 'Check ' + v + ' for a confirmation link. If a link also arrives at your current address, click both. Your sign-in email changes once that is done, and you will get a notice here.';
  };

  el('ac-save').onclick = async () => {
    const msg = el('ac-msg'), a = el('ac-pass').value, b = el('ac-pass2').value;
    msg.style.color = '#b3261e';
    if(a.length < 8){ msg.textContent = 'Use at least 8 characters.'; return; }
    if(a !== b){ msg.textContent = 'Those two passwords do not match.'; return; }
    msg.style.color = ''; msg.textContent = 'Saving…';
    const { error } = await setNewPassword(a);
    if(error){ msg.style.color = '#b3261e'; msg.textContent = error.message; return; }
    el('ac-pass').value = el('ac-pass2').value = '';
    msg.textContent = 'Password changed. Your other devices stay signed in until you sign them out.';
  };

  el('ac-signout-all').onclick = async () => {
    if(!confirm('Sign out of Circuits.com everywhere, including this browser?')) return;
    const err = await signOutEverywhere();
    if(err){ toast('Could not sign out everywhere: ' + err, false); return; }
    location.href = '/';
  };

  if(canDelete && el('ac-delete')) el('ac-delete').onclick = async () => {
    const msg = el('ac-del-msg');
    // typing the address is deliberate friction; this cannot be undone
    const typed = prompt('This cannot be undone.\n\nType your Circuits.com email address to confirm:');
    if(typed === null) return;
    if((typed || '').trim().toLowerCase() !== (user.email || '').toLowerCase()){
      msg.style.color = '#b3261e'; msg.textContent = 'That did not match your email address, so nothing was deleted.';
      return;
    }
    msg.style.color = ''; msg.textContent = 'Deleting…';
    const res = await deleteOwnAccount();
    if(res === 'deleted'){ await signOut(); location.href = '/'; return; }
    msg.style.color = '#b3261e';
    msg.textContent = res === 'still_owns_listing'
      ? 'This account has a live keyword listing or a paid job post, so it cannot be deleted here. '
        + 'Those are paid for and may be shared with colleagues. Contact us and we will sort it out.'
      : 'Your account could not be deleted just now. Please try again or contact us.';
  };
}

/* ---------- insights ----------
   The number that matters to a paying supplier is not "views", it is how many
   of those views turned into someone actually getting in touch. */
async function renderInsights(){
  const host = el('pt-insights');
  if(!host || !PT.slug) return;
  const d = await companyInsights(PT.slug, 30);
  if(!d){
    host.innerHTML = '<p class="pf-note">Your figures could not be loaded just now. '
      + 'Nothing has been lost. Reload the page to try again.</p>';
    return;
  }
  const views = Number(d.views) || 0;
  const contacts = Number(d.contacts) || 0;
  const quotes = Number(d.quotes) || 0;
  const pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;

  host.innerHTML = `
    <div class="ins-row">
      <div class="ins">
        <div class="ins-num">${views}${changeLabel(views, d.prev_views)}</div>
        <div class="ins-lbl">Profile views</div>
        <div class="pf-note">${Number(d.unique_visitors) || 0} identified visitor(s)${
          Number(d.anonymous_views) ? ` · ${d.anonymous_views} from visitors who declined analytics` : ''}</div>
      </div>
      <div class="ins">
        <div class="ins-num">${contacts}${changeLabel(contacts, d.prev_contacts)}</div>
        <div class="ins-lbl">Contact clicks</div>
        <div class="pf-note">${pctOf(contacts, views)}% of everyone who looked</div>
      </div>
      <div class="ins">
        <div class="ins-num">${quotes}${changeLabel(quotes, d.prev_quotes)}</div>
        <div class="ins-lbl">Quote requests</div>
        <div class="pf-note">${pctOf(quotes, views)}% of everyone who looked</div>
      </div>
    </div>
    <div class="funnel">
      <span><b>${views}</b> looked</span><i>→</i>
      <span><b>${contacts}</b> got in touch</span><i>→</i>
      <span><b>${quotes}</b> asked for a quote</span>
    </div>
    ${d.top_keyword ? `<p class="pf-note">Most of your views came from
      <b>${escapeHtml(d.top_keyword)}</b> (${d.top_keyword_views}).</p>` : ''}
    <p class="pf-note">Compared with the previous 30 days.</p>`;
}

/* ---------- what to do next ----------
   The dashboard used to open on five numbers and no answer to "so what should
   I do?". These are ordered by what actually costs the supplier money: an
   unanswered buyer first, then the fields that make a profile worth landing on.
   Weighted, because a missing logo hurts more than missing opening hours. */
const PROFILE_FIELDS = [
  { key: 'logo',        weight: 3, label: 'Add your company logo',
    why: 'Listings with a logo get noticeably more clicks than the grey placeholder.' },
  { key: 'description', weight: 3, label: 'Write a company description',
    why: 'This is what a buyer reads before deciding whether to contact you.' },
  { key: 'website',     weight: 2, label: 'Add your website' },
  { key: 'phone',       weight: 2, label: 'Add a phone number' },
  { key: 'email',       weight: 2, label: 'Add a contact email' },
  { key: 'tagline',     weight: 1, label: 'Add a one-line tagline' },
  { key: 'address',     weight: 1, label: 'Add your location' },
  { key: 'contact',     weight: 1, label: 'Name a contact person' }
];

function profileCompleteness(co){
  const filled = f => {
    const v = co && co[f.key];
    return typeof v === 'string' ? v.trim().length > 0 : !!v;
  };
  const total = PROFILE_FIELDS.reduce((a, f) => a + f.weight, 0);
  const got = PROFILE_FIELDS.filter(filled).reduce((a, f) => a + f.weight, 0);
  return { pct: Math.round(got / total * 100), missing: PROFILE_FIELDS.filter(f => !filled(f)) };
}

function renderNextSteps(){
  const host = el('pt-next');
  if(!host) return;
  const { pct, missing } = profileCompleteness(PT.co);
  const waiting = PT.inquiries.filter(q => ['New','Open'].includes(q.status));

  const actions = [];
  if(waiting.length){
    actions.push(`<li class="urgent"><b>${waiting.length} quote request${waiting.length > 1 ? 's' : ''}
      waiting for a reply.</b> Buyers usually go elsewhere if nobody answers.</li>`);
  }
  // three at a time; a list of eight chores gets ignored
  missing.slice(0, 3).forEach(f => {
    actions.push(`<li>${escapeHtml(f.label)}${f.why ? ' <span class="pf-note">' + escapeHtml(f.why) + '</span>' : ''}</li>`);
  });

  if(!actions.length && pct === 100){
    host.innerHTML = `<div class="pt-next done">
      <b>Your profile is complete and nothing is waiting on you.</b>
      <p class="pf-note">Anything a buyer sends will show up under Quote requests.</p></div>`;
    return;
  }

  host.innerHTML = `<div class="pt-next">
    <div class="pt-next-head">
      <div><b>Profile ${pct}% complete</b></div>
      <div class="pt-meter" role="img" aria-label="Profile ${pct} percent complete">
        <span style="width:${pct}%"></span>
      </div>
    </div>
    <ul class="pt-next-list">${actions.join('')}</ul>
    ${missing.length ? '<button type="button" class="mini-btn green" id="pt-next-go">Finish your profile</button>' : ''}
  </div>`;

  const go = el('pt-next-go');
  if(go) go.onclick = () => {
    const tab = document.querySelector('.pt-tab[data-tab="company"]'); // profile split into tabs 2026-08-20
    if(tab) tab.click();
  };
}

/* "up 18%" only means something against the period before it. No previous
   activity means there is no percentage to state, say "new" rather than
   inventing a division by zero. */
function changeLabel(now, before){
  now = Number(now) || 0; before = Number(before) || 0;
  if(!before) return now ? '<span class="delta up">new</span>' : '';
  const pct = Math.round((now - before) / before * 100);
  if(pct === 0) return '<span class="delta flat">no change</span>';
  return `<span class="delta ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
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

  renderInsights();
  renderNextSteps();
  wireViewRanges();
  drawViews();
}

/* ---------- profile views ----------
   One line graph that rescales to the chosen window. Short windows count by
   hour, long ones by month, because 365 daily points on a 700px chart is mush. */
const VIEW_RANGES = {
  '24h': { label: '24 Hours', ms: 864e5,        bucket: 'hour',  tick: d => d.getHours() + ':00' },
  '7d':  { label: '7 Days',   ms: 7 * 864e5,    bucket: 'day',   tick: d => d.toLocaleDateString(undefined, { weekday: 'short' }) },
  '30d': { label: '30 Days',  ms: 30 * 864e5,   bucket: 'day',   tick: d => (d.getMonth() + 1) + '/' + d.getDate() },
  '3m':  { label: '3 Months', ms: 91 * 864e5,   bucket: 'week',  tick: d => (d.getMonth() + 1) + '/' + d.getDate() },
  '6m':  { label: '6 Months', ms: 182 * 864e5,  bucket: 'week',  tick: d => d.toLocaleDateString(undefined, { month: 'short' }) },
  '1y':  { label: '1 Year',   ms: 365 * 864e5,  bucket: 'month', tick: d => d.toLocaleDateString(undefined, { month: 'short' }) }
};
let PT_RANGE = '30d';
let PT_CUSTOM = null;   // {from, to} as Date, set by the custom picker

/* Fill in the empty buckets. Without this a quiet week draws as a straight
   line between two busy days and overstates what happened. */
function bucketSeries(rows, from, to, bucket){
  const step = { hour: 36e5, day: 864e5, week: 7 * 864e5 }[bucket] || null;
  const key = d => {
    const x = new Date(d);
    if(bucket === 'hour'){ x.setMinutes(0, 0, 0); }
    else if(bucket === 'month'){ x.setDate(1); x.setHours(0, 0, 0, 0); }
    else if(bucket === 'week'){
      x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // ISO weeks start Monday
    } else { x.setHours(0, 0, 0, 0); }
    return x.getTime();
  };
  /* Two clocks, one chart. Postgres truncates buckets in UTC; key() truncates
     in the viewer's timezone. A UTC Monday-midnight lands on Sunday evening
     locally and used to truncate into the WEEK BEFORE, so every point missed
     its grid slot. Anchoring each database bucket at its midpoint first makes
     it truncate into the same local period it actually covers. */
  const anchor = { hour: 18e5, day: 432e5, week: 3.5 * 864e5, month: 15 * 864e5 }[bucket] || 0;
  const got = {};
  for(const r of rows) got[key(new Date(new Date(r.bucket).getTime() + anchor))] = Number(r.hits) || 0;

  const out = [];
  let cur = new Date(key(from));
  const end = to.getTime();
  let guard = 0;
  while(cur.getTime() <= end && guard++ < 800){
    const t = cur.getTime();
    out.push([new Date(t), got[t] || 0]);
    /* Step by calendar, not by fixed milliseconds: adding 7×24h walks off
       local midnight the first time the range crosses a DST change, after
       which no grid key matches and the chart flatlines at zero, which is
       exactly what "6 months" did every spring. */
    cur = new Date(t);
    if(bucket === 'month')     cur.setMonth(cur.getMonth() + 1);
    else if(bucket === 'week') cur.setDate(cur.getDate() + 7);
    else if(bucket === 'day')  cur.setDate(cur.getDate() + 1);
    else                       cur = new Date(t + step);
  }
  return out;
}

/* Geometry lives in one place so the hover handler can reuse the exact same
   maths the drawing used, rather than approximating it. */
const G = { W: 720, H: 260, L: 46, R: 14, T: 16, B: 34 };
function chartGeom(series){
  const n = series.length;
  const iw = G.W - G.L - G.R, ih = G.H - G.T - G.B;
  const peak = Math.max(1, ...series.map(s => s[1]));
  /* a readable ceiling: 1-2-5 steps, so the axis reads 0/5/10 not 0/3.5/7 */
  const mag = Math.pow(10, Math.floor(Math.log10(peak)));
  const step = [1, 2, 5, 10].find(m => peak <= m * mag) || 10;
  const top = Math.max(1, step * mag);
  return {
    n, iw, ih, top,
    x: i => G.L + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw),
    y: v => G.T + ih - (v / top) * ih
  };
}

function lineChartSvg(series, tick){
  const g = chartGeom(series);
  const { n } = g;
  const base = G.T + g.ih;

  const pts = series.map((s, i) => [g.x(i), g.y(s[1])]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = pts.length
    ? line + ` L ${pts[pts.length - 1][0].toFixed(1)} ${base} L ${pts[0][0].toFixed(1)} ${base} Z` : '';

  /* whole numbers only, "2.5 views" is not a thing */
  const ticks = [...new Set([0, Math.round(g.top / 2), g.top])].sort((a, b) => a - b);
  const grid = ticks.map(v =>
    `<line class="g-grid" x1="${G.L}" x2="${G.W - G.R}" y1="${g.y(v).toFixed(1)}" y2="${g.y(v).toFixed(1)}"></line>`
    + `<text class="g-ylbl" x="${G.L - 10}" y="${(g.y(v) + 4).toFixed(1)}">${v}</text>`).join('');

  /* Pick label positions by spacing, not by count. Taking every Nth point and
     then bolting the last one on lets the final pair land 2 points apart. */
  const MIN_GAP = 76;                       // viewBox units; a date label is ~66
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(g.iw / MIN_GAP))));
  const wanted = [];
  for(let i = 0; i < n; i += every) wanted.push(i);
  if(n && wanted[wanted.length - 1] !== n - 1) wanted.push(n - 1);

  const keep = [];
  for(const i of wanted){
    if(!keep.length || g.x(i) - g.x(keep[keep.length - 1]) >= MIN_GAP) keep.push(i);
    else if(i === n - 1) keep[keep.length - 1] = i;   // the end label wins the tie
  }
  const xlabels = keep.map(i =>
    `<text class="g-xlbl" x="${g.x(i).toFixed(1)}" y="${G.H - 12}">${escapeHtml(tick(series[i][0]))}</text>`
  ).join('');

  /* Dots only while they still read as dots. Denser than that, the line is
     the information and the hover gives you the number. */
  const dots = n <= 32
    ? pts.map(p => `<circle class="g-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3"></circle>`).join('')
    : '';

  return `<svg class="g-chart" viewBox="0 0 ${G.W} ${G.H}" role="img" aria-label="Profile views over time">
    <line class="g-axis" x1="${G.L}" x2="${G.L}" y1="${G.T}" y2="${base}"></line>
    ${grid}
    ${area ? `<path class="g-area" d="${area}"></path>` : ''}
    ${line ? `<path class="g-line" d="${line}"></path>` : ''}
    ${dots}${xlabels}
    <line class="g-hover-line" x1="0" x2="0" y1="${G.T}" y2="${base}" style="display:none"></line>
    <circle class="g-hover-dot" r="4.5" style="display:none"></circle>
  </svg>`;
}

/* Hover readout. The dots carry no <title> because a native tooltip is slow
   to appear and cannot be styled; this tracks the nearest point instead. */
function attachChartHover(wrap, series, fmt){
  const svg = wrap.querySelector('.g-chart');
  if(!svg || !series.length) return;
  const g = chartGeom(series);
  const tip = document.createElement('div');
  tip.className = 'g-tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const vline = svg.querySelector('.g-hover-line');
  const vdot = svg.querySelector('.g-hover-dot');

  const hide = () => { tip.hidden = true; vline.style.display = 'none'; vdot.style.display = 'none'; };

  svg.addEventListener('mousemove', e => {
    const r = svg.getBoundingClientRect();
    if(!r.width) return;
    const vx = (e.clientX - r.left) / r.width * G.W;          // client px -> viewBox units
    const i = g.n <= 1 ? 0
      : Math.max(0, Math.min(g.n - 1, Math.round((vx - G.L) / g.iw * (g.n - 1))));
    const [when, hits] = series[i];
    const px = g.x(i), py = g.y(hits);

    vline.setAttribute('x1', px); vline.setAttribute('x2', px); vline.style.display = '';
    vdot.setAttribute('cx', px);  vdot.setAttribute('cy', py);  vdot.style.display = '';

    tip.textContent = fmt(when) + ' · ' + hits + (hits === 1 ? ' view' : ' views');
    tip.hidden = false;
    /* position in real pixels, clamped so it never hangs off the panel */
    const scale = r.width / G.W;
    const left = Math.max(0, Math.min(r.width - tip.offsetWidth, px * scale - tip.offsetWidth / 2));
    tip.style.left = left + 'px';
    tip.style.top  = Math.max(0, py * scale - tip.offsetHeight - 10) + 'px';
  });
  svg.addEventListener('mouseleave', hide);
}

async function drawViews(){
  const host = el('pt-chart');
  if(!host || !PT.co) return;
  const r = VIEW_RANGES[PT_RANGE];
  const to   = PT_CUSTOM ? PT_CUSTOM.to   : new Date();
  const from = PT_CUSTOM ? PT_CUSTOM.from : new Date(Date.now() - r.ms);

  /* pick a sane bucket for a custom span too */
  let bucket = r ? r.bucket : 'day';
  let tick = r ? r.tick : (d => (d.getMonth() + 1) + '/' + d.getDate());
  if(PT_CUSTOM){
    const span = to - from;
    bucket = span <= 2 * 864e5 ? 'hour' : span <= 60 * 864e5 ? 'day' : span <= 400 * 864e5 ? 'week' : 'month';
    tick = bucket === 'hour' ? (d => d.getHours() + ':00')
         : bucket === 'month' ? (d => d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }))
         : (d => (d.getMonth() + 1) + '/' + d.getDate());
  }

  host.innerHTML = '<p class="pf-note"><span class="spin" aria-hidden="true"></span>Loading…</p>';
  const rows = await companyViews(PT.co.slug, from.toISOString(), to.toISOString(), bucket);
  const series = bucketSeries(rows, from, to, bucket);
  const total = series.reduce((a, s) => a + s[1], 0);

  host.innerHTML = lineChartSvg(series, tick);

  /* the hover readout says the full date; the axis only has room for a stub */
  const full = bucket === 'hour'
    ? (d => d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric' }))
    : bucket === 'month'
      ? (d => d.toLocaleDateString(undefined, { month:'long', year:'numeric' }))
      : (d => d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' }));
  attachChartHover(host, series, full);

  const note = el('pt-chart-note');
  const per = { hour:'hour', day:'day', week:'week', month:'month' }[bucket] || bucket;
  if(note) note.textContent = total === 0
    ? 'No views recorded in this period. Tracking starts the first time someone opens your profile.'
    : total + (total === 1 ? ' view' : ' views') + ' in this period, one point per ' + per + '.';
}

let PT_RANGE_WIRED = false;
function wireViewRanges(){
  const bar = el('pt-range');
  /* renderOverview runs again on every company switch; without this the click
     handlers stack up and one click redraws the chart several times. */
  if(!bar || PT_RANGE_WIRED) return;
  PT_RANGE_WIRED = true;
  bar.innerHTML = Object.entries(VIEW_RANGES).map(([k, r]) =>
    `<button type="button" class="range-btn${k === PT_RANGE ? ' active' : ''}" data-range="${k}">${r.label}</button>`
  ).join('') + `<button type="button" class="range-btn" data-range="custom">Custom</button>`;

  bar.addEventListener('click', e => {
    const b = e.target.closest('.range-btn');
    if(!b) return;
    const custom = el('pt-range-custom');
    if(b.dataset.range === 'custom'){
      if(custom) custom.style.display = custom.style.display === 'none' ? 'flex' : 'none';
      return;
    }
    PT_RANGE = b.dataset.range;
    PT_CUSTOM = null;
    if(custom) custom.style.display = 'none';
    bar.querySelectorAll('.range-btn').forEach(x => x.classList.toggle('active', x === b));
    drawViews();
  });

  const apply = el('pt-range-apply');
  if(apply) apply.addEventListener('click', ()=>{
    const f = el('pt-from').value, t = el('pt-to').value;
    if(!f || !t) return;
    const from = new Date(f + 'T00:00:00'), to = new Date(t + 'T23:59:59');
    if(!(from < to)) { alert('The start date needs to come before the end date.'); return; }
    PT_CUSTOM = { from, to };
    bar.querySelectorAll('.range-btn').forEach(x => x.classList.toggle('active', x.dataset.range === 'custom'));
    drawViews();
  });
}

/* ---------- logo cropping ----------
   Logos are shown as a square everywhere on the site, so a wide or tall image
   picked straight off a company's desktop gets letterboxed or squashed. This
   lets them choose the square themselves: drag to move, slider to zoom, and
   what they see in the box is exactly what gets uploaded.
   ponytail: canvas and a range input, no cropping library. */
const CROP_BOX = 260;   // on-screen preview, matches the canvas in portal.html
const CROP_OUT = 512;   // saved size, big enough for retina, small enough to load fast
const CROP_MAX_MB = 8;

let CROP = null;        // { img, scale, min, x, y } while the panel is open

function closeCropper(){
  CROP = null;
  const p = el('pt-crop');
  if(p) p.style.display = 'none';
  const inp = el('pt-logo');
  if(inp) inp.value = '';
}

function drawCrop(){
  const c = el('pt-crop-c');
  if(!c || !CROP) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, CROP_BOX, CROP_BOX);
  /* white behind the logo: the thumbnail sits on white everywhere on the site,
     so a transparent PNG must be judged against the same background here */
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CROP_BOX, CROP_BOX);
  const w = CROP.img.naturalWidth * CROP.scale;
  const h = CROP.img.naturalHeight * CROP.scale;
  ctx.drawImage(CROP.img, CROP.x, CROP.y, w, h);
}

/* Keep the picture covering the box, so a crop can never contain blank edges. */
function clampCrop(){
  const w = CROP.img.naturalWidth * CROP.scale;
  const h = CROP.img.naturalHeight * CROP.scale;
  CROP.x = Math.min(0, Math.max(CROP_BOX - w, CROP.x));
  CROP.y = Math.min(0, Math.max(CROP_BOX - h, CROP.y));
}

function openCropper(file){
  const inp = el('pt-logo');
  if(file.size > CROP_MAX_MB * 1024 * 1024){
    toast(`That image is over ${CROP_MAX_MB}MB. Please pick a smaller one.`, false);
    if(inp) inp.value = '';
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    if(!img.naturalWidth || !img.naturalHeight){
      toast('That file is not an image we can read.', false);
      if(inp) inp.value = '';
      return;
    }
    /* start zoomed just enough to cover the square, centred */
    const min = Math.max(CROP_BOX / img.naturalWidth, CROP_BOX / img.naturalHeight);
    CROP = { img, min, scale: min, x: 0, y: 0 };
    CROP.x = (CROP_BOX - img.naturalWidth * min) / 2;
    CROP.y = (CROP_BOX - img.naturalHeight * min) / 2;
    const z = el('pt-crop-z');
    if(z){ z.min = String(min); z.max = String(min * 4); z.step = String(min / 100); z.value = String(min); }
    el('pt-crop').style.display = '';
    drawCrop();
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('That file could not be opened as an image.', false);
    if(inp) inp.value = '';
  };
  img.src = url;
}

function wireLogoCrop(){
  const inp = el('pt-crop-c') && el('pt-logo');
  if(!inp || inp.__cropWired) return;
  inp.__cropWired = true;

  inp.onchange = () => { if(inp.files && inp.files[0]) openCropper(inp.files[0]); };

  const canvas = el('pt-crop-c');
  let drag = null;
  canvas.style.touchAction = 'none';   // let us pan on a phone without scrolling the page
  canvas.addEventListener('pointerdown', e => {
    if(!CROP) return;
    drag = { x: e.clientX - CROP.x, y: e.clientY - CROP.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if(!drag || !CROP) return;
    CROP.x = e.clientX - drag.x;
    CROP.y = e.clientY - drag.y;
    clampCrop();
    drawCrop();
  });
  const stop = () => { drag = null; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  el('pt-crop-z').oninput = e => {
    if(!CROP) return;
    /* zoom about the centre of the box, so the part they are looking at stays put */
    const next = +e.target.value;
    const k = next / CROP.scale;
    CROP.x = CROP_BOX / 2 - (CROP_BOX / 2 - CROP.x) * k;
    CROP.y = CROP_BOX / 2 - (CROP_BOX / 2 - CROP.y) * k;
    CROP.scale = next;
    clampCrop();
    drawCrop();
  };

  el('pt-crop-no').onclick = () => closeCropper();

  el('pt-crop-ok').onclick = () => {
    if(!CROP) return;
    const out = document.createElement('canvas');
    out.width = out.height = CROP_OUT;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, CROP_OUT, CROP_OUT);
    const k = CROP_OUT / CROP_BOX;
    ctx.drawImage(CROP.img, CROP.x * k, CROP.y * k,
      CROP.img.naturalWidth * CROP.scale * k, CROP.img.naturalHeight * CROP.scale * k);
    out.toBlob(blob => {
      if(!blob){ toast('That crop could not be saved. Try a different image.', false); return; }
      PT.logoFile = new File([blob], 'logo.png', { type: 'image/png' });
      PT.clearLogo = false;
      el('pt-logo-prev').innerHTML = `<img src="${out.toDataURL('image/png')}" alt="logo">`;
      const rm = el('pt-logo-rm');
      if(rm) rm.style.display = '';
      closeCropper();
      markDirty();
      toast('Logo cropped. Save to publish it.', true);
    }, 'image/png');
  };
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
  wireHandleCheck();
  PT.clearLogo = false;
  PT.logoFile = null;
  el('pt-logo-prev').innerHTML = isLogoUrl(c.logo) ? `<img src="${escapeHtml(c.logo)}" alt="logo">` : avatarSvg();
  const rmLogo = el('pt-logo-rm');
  if(rmLogo){
    rmLogo.style.display = isLogoUrl(c.logo) ? '' : 'none';
    rmLogo.onclick = () => {
      PT.clearLogo = true;
      PT.logoFile = null;
      closeCropper();
      el('pt-logo-prev').innerHTML = avatarSvg();
      rmLogo.style.display = 'none';
      markDirty();
      toast('Logo will be removed when you save.', true);
    };
  }
  wireLogoCrop();

  const soc = c.socials && typeof c.socials === 'object' ? c.socials : {};
  el('f-socials').innerHTML = SOCIAL_KEYS.map(([k, label]) =>
    `<div class="auth-field"><label>${label}</label><input id="s-${k}" type="text" placeholder="https://…" value="${escapeHtml(soc[k] || '')}"></div>`
  ).join('');
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
      const why = await handleAvailable(input.value, PT.slug, PT.user && PT.user.id);
      msg.textContent = why || ('circuits.com/' + input.value + ' is available.');
      msg.style.color = why ? '#b3261e' : '#3f6300';
    }, 400);
  });
}

/* One generic list editor covers certifications, team and gallery, per
   keyword listing since 2026-09-02 (key is e.g. "certs-<listing id>").
   A field marked 'img' gets a real file upload, asking a supplier for an
   "image URL" is asking them to go and host a file somewhere first, which is
   why the gallery and team photos were unusable. */
function renderRepeater(key, items, fields, labels, types){
  const list = Array.isArray(items) ? items.slice() : [];
  const box = el('f-' + key);
  const kind = f => (types || [])[fields.indexOf(f)] || 'text';

  function cell(it, i, f, label){
    if(kind(f) !== 'img'){
      return `<div class="auth-field"><label>${label}</label>
        <input data-k="${key}" data-i="${i}" data-f="${f}" type="text" value="${escapeHtml(it[f] || '')}"></div>`;
    }
    return `<div class="auth-field"><label>${label}</label>
      <div class="rp-img">
        ${isLogoUrl(it[f]) ? `<img src="${escapeHtml(it[f])}" alt="">` : '<span class="rp-img-ph">None</span>'}
        <input type="file" accept="image/png,image/jpeg,image/webp" data-i="${i}" data-f="${f}" data-upload>
        ${isLogoUrl(it[f]) ? `<button type="button" class="mini-btn" data-clear="${i}" data-cf="${f}">Clear</button>` : ''}
      </div></div>`;
  }

  function draw(){
    box.innerHTML = list.map((it, i) =>
      `<div class="pt-item"><div class="pt-row">${fields.map((f, j) => cell(it, i, f, labels[j])).join('')}</div>
       <button type="button" class="mini-btn rp-add" data-del="${i}">Remove</button></div>`
    ).join('') + `<button type="button" class="mini-btn green rp-add" data-add="1">+ Add</button>`;
    /* the fold's summary line says what is inside without opening it */
    const n = el('fold-' + key + '-n');
    if(n) n.textContent = list.length ? '· ' + list.length : '· none yet';
  }

  box.onclick = e => {
    const add = e.target.closest('[data-add]'),
          del = e.target.closest('[data-del]'),
          clr = e.target.closest('[data-clear]');
    if(add){ list.push({}); draw(); }
    if(del){ list.splice(+del.dataset.del, 1); draw(); }
    if(clr){ list[+clr.dataset.clear][clr.dataset.cf] = ''; draw(); }
  };
  box.oninput = e => {
    const t = e.target;
    if(!t.dataset.f || t.type === 'file') return;
    list[+t.dataset.i][t.dataset.f] = t.value;
  };
  box.onchange = async e => {
    const inp = e.target.closest('[data-upload]');
    if(!inp || !inp.files || !inp.files[0]) return;
    const i = +inp.dataset.i, f = inp.dataset.f;
    const holder = inp.closest('.rp-img');
    holder.classList.add('busy');
    const url = await uploadImage(inp.files[0]);
    holder.classList.remove('busy');
    if(!url){ toast('That image could not be uploaded. Try a smaller PNG or JPEG.', false); return; }
    list[i][f] = url;
    draw();
  };
  box.__list = list;
  draw();
}

/* Validation the listing showcase shares with the old company one: every
   optional field still has a shape when filled in (Jacob, 2026-08-20). */
function showcaseProblem(certs, team){
  for(const m of team){
    if((m.email || '').trim() && !isValidEmail(m.email)) return `Team member "${m.name || m.email}" has an invalid email address.`;
  }
  for(const c of certs){
    if((c.year || '').trim() && !isValidYear(c.year)) return `Certification "${c.name || '(unnamed)'}" needs a 4-digit year.`;
  }
  return null;
}

async function saveProfile(){
  const btns = [...document.querySelectorAll('.pt-save')];
  const btn = { set disabled(v){ btns.forEach(b => b.disabled = v); } }; // every tab's Save moves together
  btn.disabled = true;
  /* The address is optional on save. It used to abort the whole save when the
     field was empty or invalid, which silently threw away every other edit, change your contact person with a blank address and nothing persisted. */
  const wantHandle = val('f-handle');
  const handleChanged = wantHandle !== (PT.co.handle || '');
  const fresh = !PT.slug;   // no rows yet: this save creates the profile and its company row
  if(fresh && !wantHandle){ btn.disabled = false; toast('Pick your Circuits.com address first.', false); el('f-handle').focus(); return; }
  if(!val('f-name')){ btn.disabled = false; toast('Not saved: a name is needed. Yours, or your company\'s.', false); el('f-name').focus(); return; }
  if(handleChanged && wantHandle){
    const why = await handleAvailable(wantHandle, PT.slug, PT.user && PT.user.id);
    if(why){ btn.disabled = false; toast('Address not saved: ' + why + ' Your other changes were not saved either. Fix the address or put the old one back.', false); return; }
  }
  const socials = {};
  SOCIAL_KEYS.forEach(([k]) => { const v = val('s-' + k); if(v) socials[k] = v; });
  /* every optional field still has a shape when filled in, nothing that is
     not an email/phone/website/year gets saved as one (Jacob, 2026-08-20) */
  let bad =
    (val('f-email')   && !isValidEmail(val('f-email')))     ? 'Public email is not a valid email address.' :
    (val('f-phone')   && !isValidPhone(val('f-phone')))     ? 'Phone needs to be a real phone number (at least 10 digits).' :
    (val('f-website') && !isValidWebsite(val('f-website'))) ? 'Website needs to be a web address (e.g. www.company.com).' :
    (val('f-founded') && !isValidYear(val('f-founded')))    ? 'Founded needs to be a 4-digit year (e.g. 1998).' : null;
  if(!bad) for(const [k, label] of SOCIAL_KEYS){
    const v = val('s-' + k);
    if(v && !isValidWebsite(v)){ bad = label + ' needs to be a link (https://…).'; break; }
  }
  if(bad){ btn.disabled = false; toast('Not saved: ' + bad, false); return; }

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
    socials
  };
  /* only touch the address when it actually changed and is non-empty, so a
     blank field can never wipe an existing circuits.com/<handle> */
  if(handleChanged && wantHandle) fields.handle = wantHandle;

  /* PT.logoFile is the square the company cropped, not the file it picked. */
  if(PT.logoFile){
    const url = await uploadImage(PT.logoFile);
    if(url) fields.logo = url;
    else { btn.disabled = false; toast('That logo could not be uploaded. Try a smaller PNG or JPEG.', false); return; }
  }
  else if(PT.clearLogo){ fields.logo = null; }

  if(fresh){
    /* first save: the profiles row (the address), then the company row that
       shares it, then the rest of the form lands on that row below */
    const e1 = await createMyProfile(wantHandle, fields.name);
    if(e1){ btn.disabled = false; toast('Could not create your profile: ' + e1, false); return; }
    const r = await registerCompany();
    if(r.error){ btn.disabled = false; toast('Could not create your profile: ' + r.error, false); return; }
    PT.slug = r.slug;
    delete fields.handle;
  }

  const err = await updateCompany(PT.slug, fields);
  btn.disabled = false;
  if(err){ toast('Could not save: ' + err, false); return; }
  /* the person behind the account shares the name, the picture and the
     address, so recruiters and the public page agree */
  const mine = { display_name: fields.name };
  if('logo' in fields) mine.photo_url = fields.logo;
  if(fields.handle) mine.handle = fields.handle;
  const e2 = await updateMyProfile(mine);
  if(e2) console.warn('profile mirror', e2);
  toast(fresh ? 'Profile created. Your page is at circuits.com/' + wantHandle : 'Profile saved.', true);
  markClean();
  if(fresh){
    renderSeeking(await myProfile());
    await loadCompany(PT.slug);
    return;
  }
  PT.co = await fetchCompany(PT.slug);
  ME = (await myProfile()) || ME;
  el('pt-name').textContent = PT.co.name;
  const opt = el('pt-company') && el('pt-company').querySelector(`option[value="${PT.slug}"]`);
  if(opt) opt.textContent = PT.co.name;
  renderProfileForm();
  renderPromote();
  renderRecruitPreview();
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
          ${l.locked_position ? `<span class="badge">#${l.locked_position} locked</span>` : ''}
        </div>
        <div>
          <span class="pf-note">${escapeHtml(l.fee || 'Free')}</span>
          <button class="mini-btn" data-edit="${l.id}">Edit</button>
          ${l.status === 'Approved' ? `<button class="mini-btn" data-pause="${l.id}" data-to="${l.paused ? '0' : '1'}">${l.paused ? 'Resume' : 'Pause'}</button>` : ''}
        </div>
      </div>
      ${listingStats(l)}
      ${listingSummary(l)}
      ${PT.editing === l.id ? listingEditor(l) : ''}
      ${l.status === 'Approved' ? upgradePanel(l) : ''}
    </div>`).join('');
  el('pt-listings').innerHTML = rows || `<div class="pt-empty">
    <b>No Directory listings yet</b>
    <p>Ask for one below. Once Circuits.com approves a Circuits-Keyword™ for you, it appears here and you can pause or resume it.</p>
  </div>`;
  const open = PT.listings.find(l => l.id === PT.editing);
  if(open){
    renderRepeater('certs-' + open.id, open.certifications, ['name', 'issuer', 'year'], ['Certification', 'Issuer', 'Year']);
    renderRepeater('team-' + open.id, open.team, ['name', 'role', 'email', 'photo'], ['Name', 'Role', 'Email', 'Photo'], ['text', 'text', 'text', 'img']);
    renderRepeater('gallery-' + open.id, open.gallery, ['url', 'caption'], ['Image', 'Caption'], ['img', 'text']);
  }
  wireListings();
}

/* Stats and standing of one listing: searches for its keyword in the last 30
   days (from the searches table), and which paid extras it carries. */
function listingStats(l){
  const n = (PT.stats || {})[l.keyword_norm];
  const pend = (PT.upgrades || []).filter(u => u.application_id === l.id).map(u => u.kind);
  const bits = [
    n == null ? null : `<b>${n}</b> search${n === 1 ? '' : 'es'} for this keyword in the last 30 days`,
    'Trust Badge: ' + (l.badge ? escapeHtml(l.badge.text) : 'none'),
    'Sponsor banner: ' + (l.banner ? 'running' : 'none'),
    'Position: ' + (l.locked_position ? '#' + l.locked_position + ' locked' : 'rotates with every search'),
    pend.length ? '<span style="color:#8a6100">Upgrade requested: ' + pend.map(k => UPGRADES[k].name).join(', ') + '</span>' : null
  ].filter(Boolean);
  return `<div class="pt-stats">${bits.map(b => `<span>${b}</span>`).join('')}</div>`;
}

/* Paid extras. Payment is recorded by Circuits.com staff for now, so a click
   raises a request they see in the console; the price is what they charge.
   ponytail: no checkout, add Stripe when the volume justifies it. */
const UPGRADES = {
  badge:  { name: 'Trust Badge',      price: '$' + BADGE_FEE + '/month',  why: 'A short label beside your keyword, in the colour you choose. Cannot claim a certification.' },
  banner: { name: 'Sponsor banner',   price: '$' + BANNER_FEE + '/month', why: 'The exclusive banner above every result for this keyword: logo, pitch, contact and documents.' },
  lock:   { name: 'Locked position',  price: 'Ask us',                    why: 'Results shuffle on every search. A locked position pins you to #1, #2 or #3 every time.' }
};
/* The Trust Badge is the one upgrade with attributes: the label and the colour
   are chosen here, travel with the request, and staff approve exactly that. */
const BADGE_COLORS = [['#c9a227', 'Gold'], ['#b06c22', 'Bronze'], ['#5d6a7e', 'Steel']];
function badgeRequestForm(l){
  return `<div class="pt-badge-req">
    <input class="up-text" type="text" maxlength="18" placeholder="Label, e.g. Featured" aria-label="Badge label">
    <select class="up-color" aria-label="Badge colour">${BADGE_COLORS.map(([hex, name]) => `<option value="${hex}">${name}</option>`).join('')}</select>
    <span class="lb up-preview" style="background:${BADGE_COLORS[0][0]}">Your label</span>
    <button class="mini-btn green" data-request="${l.id}" data-kind="badge">Request</button>
  </div>`;
}
function upgradePanel(l){
  const mine = (PT.upgrades || []).filter(u => u.application_id === l.id);
  const pend = new Map(mine.map(u => [u.kind, u]));
  const has = { badge: !!l.badge, banner: !!l.banner, lock: !!l.locked_position };
  const requested = k => k === 'badge' && pend.get(k).badge_text
    ? `<span class="badge pending">Requested</span> <span class="lb" style="background:${escapeHtml(pend.get(k).badge_color || '#c9a227')}">${escapeHtml(pend.get(k).badge_text)}</span>`
    : '<span class="badge pending">Requested</span>';
  return `<div class="pt-upgrade">
    <b class="pt-upgrade-title">Upgrades</b>
    ${Object.entries(UPGRADES).map(([k, u]) => `<div class="pt-upgrade-row">
      <div><b>${u.name}</b> <span class="pf-note">${u.price}</span><p class="pf-note">${u.why}</p></div>
      ${has[k] ? '<span class="badge live">Active</span>'
        : pend.has(k) ? requested(k)
        : k === 'badge' ? badgeRequestForm(l)
        : `<button class="mini-btn green" data-request="${l.id}" data-kind="${k}">Request</button>`}
    </div>`).join('')}
    <p class="pf-note" style="margin:8px 0 0">We confirm each request by email, take payment, and switch it on.</p>
  </div>`;
}

/* What the listing looks like to a buyer, shown closed. Suppliers could not see
   their own description or documents from here at all, only the keyword and
   its status, so there was no way to notice a stale datasheet. */
function listingSummary(l){
  if(PT.editing === l.id) return '';
  const docs = Array.isArray(l.docs) ? l.docs : [];
  const n = (a, one, many) => Array.isArray(a) && a.length ? a.length + ' ' + (a.length === 1 ? one : many) : null;
  const bits = [docs.length ? docs.length + (docs.length === 1 ? ' document' : ' documents') : 'No documents',
    n(l.certifications, 'certification', 'certifications'), n(l.team, 'team member', 'team members'),
    n(l.gallery, 'photo', 'photos'), l.reviews_enabled ? 'Buyer reviews on' : null].filter(Boolean);
  return `<div class="pt-listing-sum">
    <p>${l.description ? escapeHtml(l.description) : '<i>No description. Buyers see only your company name and contact information on this keyword.</i>'}</p>
    <span class="pf-note">${bits.join(' · ')}</span>
  </div>`;
}

function listingEditor(l){
  const docs = Array.isArray(l.docs) ? l.docs : [];
  return `<div class="pt-listing-edit">
    <label class="pt-lbl" for="ed-desc-${l.id}">Description <span class="pf-note">shown to buyers searching “${escapeHtml(l.keyword || '')}”</span></label>
    <textarea id="ed-desc-${l.id}" maxlength="300" rows="3"
      placeholder="What you supply under this keyword.">${escapeHtml(l.description || '')}</textarea>
    <div class="pf-note" id="ed-count-${l.id}">${(l.description || '').length}/300</div>

    <label class="pt-lbl">Documents <span class="pf-note">datasheets and catalogues, shown as “View Docs”</span></label>
    <div class="pt-docs" id="ed-docs-${l.id}">
      ${docs.map((d, i) => `<span class="pt-doc">
        <a href="${escapeHtml(safeUrl(d.url))}" target="_blank" rel="noopener nofollow">${escapeHtml(d.name || 'Document')}</a>
        <button type="button" class="pt-doc-x" data-rmdoc="${l.id}" data-i="${i}" aria-label="Remove ${escapeHtml(d.name || 'document')}">×</button>
      </span>`).join('') || '<span class="pf-note">None yet.</span>'}
    </div>
    <input type="file" id="ed-file-${l.id}" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg">

    <label class="pt-lbl" style="margin-top:14px">Showcase <span class="pf-note">shown with this listing on your profile</span></label>
    <details class="pt-fold"><summary>Certifications <span class="pf-note" id="fold-certs-${l.id}-n"></span></summary><div class="pt-list" id="f-certs-${l.id}"></div></details>
    <details class="pt-fold"><summary>Team <span class="pf-note" id="fold-team-${l.id}-n"></span></summary><div class="pt-list" id="f-team-${l.id}"></div></details>
    <details class="pt-fold"><summary>Gallery <span class="pf-note" id="fold-gallery-${l.id}-n"></span></summary><div class="pt-list" id="f-gallery-${l.id}"></div></details>
    <div class="pt-setting">
      <div class="pt-setting-text">
        <b>Buyer reviews</b>
        <p class="pf-note">Let buyers review this listing on your profile. Circuits.com checks every review before it appears, and you can reply publicly.</p>
      </div>
      <label class="switch">
        <input id="ed-reviews-${l.id}" type="checkbox" ${l.reviews_enabled ? 'checked' : ''}>
        <span class="knob" aria-hidden="true"></span>
        <span class="sr-only">Allow buyers to review this listing</span>
      </label>
    </div>

    <div class="pt-edit-actions">
      <button class="btn btn-primary" data-save="${l.id}">Save</button>
      <button class="mini-btn" data-cancel="1">Cancel</button>
      <span class="pf-note">Keyword, sponsorship, badge and price are set by Circuits.com. Contact us to change those.</span>
    </div>
  </div>`;
}

function wireListings(){
  const root = el('pt-listings');

  root.onclick = async e => {
    const pause = e.target.closest('[data-pause]');
    if(pause){
      pause.disabled = true;
      const perr = await setPaused(pause.dataset.pause, pause.dataset.to === '1');
      PT.listings = await fetchMyListings(PT.slug);
      renderListings();
      if(perr){
        toast('That listing could not be updated. If it is under review or suspended, contact us and we will sort it out.', false);
      }else{
        toast(pause.dataset.to === '1' ? 'Listing paused.' : 'Listing resumed.', true);
      }
      return;
    }

    const edit = e.target.closest('[data-edit]');
    if(edit){ PT.editing = (PT.editing === edit.dataset.edit) ? null : edit.dataset.edit; renderListings(); return; }

    const req = e.target.closest('[data-request]');
    if(req){
      let badge = null;
      if(req.dataset.kind === 'badge'){
        const box = req.closest('.pt-badge-req');
        badge = { text: box.querySelector('.up-text').value.trim(), color: box.querySelector('.up-color').value };
        if(!badge.text){ toast('Type the label you want on your badge first.', false); box.querySelector('.up-text').focus(); return; }
      }
      req.disabled = true;
      const err = await requestUpgrade(req.dataset.request, PT.slug, req.dataset.kind, null, badge);
      if(err){ req.disabled = false; toast('Could not send that request: ' + err, false); return; }
      PT.upgrades = await myUpgradeRequests(PT.slug);
      renderListings();
      toast('Requested. We will email you to confirm and take payment.', true);
      return;
    }

    if(e.target.closest('[data-cancel]')){ PT.editing = null; renderListings(); return; }

    const rm = e.target.closest('[data-rmdoc]');
    if(rm){
      const l = PT.listings.find(x => x.id === rm.dataset.rmdoc); if(!l) return;
      const docs = (Array.isArray(l.docs) ? l.docs : []).slice();
      docs.splice(+rm.dataset.i, 1);
      /* saved immediately: a removed datasheet that reappears because the
         supplier forgot to press Save is the wrong way round */
      const err = await updateMyListing(l.id, { docs });
      if(err){ toast('Could not remove that document: ' + err, false); return; }
      PT.listings = await fetchMyListings(PT.slug);
      renderListings();
      toast('Document removed.', true);
      return;
    }

    const save = e.target.closest('[data-save]');
    if(save){
      const id = save.dataset.save;
      const clean = key => (el('f-' + key + '-' + id).__list || []).filter(o => Object.values(o).some(v => (v || '').trim()));
      const certifications = clean('certs'), team = clean('team'), gallery = clean('gallery');
      const bad = showcaseProblem(certifications, team);
      if(bad){ toast('Not saved: ' + bad, false); return; }
      save.disabled = true;
      const err = await updateMyListing(id, { description: val('ed-desc-' + id), certifications, team, gallery,
        reviews_enabled: !!(el('ed-reviews-' + id) && el('ed-reviews-' + id).checked) });
      save.disabled = false;
      if(err){ toast('Could not save: ' + err, false); return; }
      PT.editing = null;
      PT.listings = await fetchMyListings(PT.slug);
      renderListings();
      toast('Listing saved.', true);
    }
  };

  root.oninput = e => {
    const t = e.target;
    if(t.tagName === 'TEXTAREA' && t.id.startsWith('ed-desc-')){
      const c = el('ed-count-' + t.id.slice(8));
      if(c) c.textContent = t.value.length + '/300';
    }
    /* live preview of the badge being requested */
    const box = t.closest('.pt-badge-req');
    if(box){
      const pv = box.querySelector('.up-preview');
      pv.textContent = box.querySelector('.up-text').value.trim() || 'Your label';
      pv.style.background = box.querySelector('.up-color').value;
    }
  };

  root.onchange = async e => {
    const f = e.target;
    if(f.type !== 'file' || !f.id.startsWith('ed-file-')) return;
    const id = f.id.slice(8);
    const file = f.files && f.files[0]; if(!file) return;
    const l = PT.listings.find(x => x.id === id); if(!l) return;
    if(file.size > 10 * 1024 * 1024){ toast('That file is over 10 MB.', false); return; }
    f.disabled = true;
    toast('Uploading…', true);
    const doc = await uploadDoc(file);
    f.disabled = false;
    if(!doc){ toast('Upload failed.', false); return; }
    const docs = (Array.isArray(l.docs) ? l.docs : []).concat([doc]);
    const err = await updateMyListing(id, { docs });
    if(err){ toast('Could not attach that document: ' + err, false); return; }
    PT.listings = await fetchMyListings(PT.slug);
    renderListings();
    toast('Document added.', true);
  };
}

/* ---------- inquiries ---------- */
/* ---------- quote requests: an inbox ----------
   These used to render every request fully expanded on one page, body, whole
   thread, reply box and status dropdown, all at once, and it fetched every
   thread on every draw. With more than about three requests it was unreadable
   and slow. Now it is a list you open one at a time, like mail: the list says
   who and what, opening one shows the conversation, and only the open one
   fetches its messages. */

function inquirySummary(q){
  const bits = [];
  if(q.part_number) bits.push(escapeHtml(q.part_number));
  if(q.quantity) bits.push('qty ' + escapeHtml(q.quantity));
  const line = bits.join(' · ');
  const preview = (q.body || '').replace(/\s+/g, ' ').trim();
  return { line, preview: escapeHtml(preview.length > 110 ? preview.slice(0, 110) + '…' : preview) };
}

/* Short and relative near the top of the list, absolute once it is old, "2:41 PM" is what you want for today and useless for last month. */
function inquiryWhen(iso){
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if(sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = (now - d) / 86400000;
  if(days < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderInquiryList(){
  const rows = PT.inquiries.map(q => {
    const { line, preview } = inquirySummary(q);
    const unread = q.status === 'New';
    return `
    <button type="button" class="q-row${unread ? ' q-unread' : ''}" data-open="${q.id}">
      <span class="q-dot" aria-hidden="true"></span>
      <span class="q-main">
        <span class="q-top">
          <b class="q-who">${escapeHtml(q.from_name)}${q.from_company ? ' <span class="q-co">' + escapeHtml(q.from_company) + '</span>' : ''}</b>
          <span class="q-when">${escapeHtml(inquiryWhen(q.created_at))}</span>
        </span>
        <span class="q-sub">${line ? '<b>' + line + '</b>: ' : ''}${preview}</span>
      </span>
      <span class="badge ${unread ? 'live' : ''} q-state">${escapeHtml(q.status)}</span>
    </button>`;
  }).join('');

  el('pt-inquiries').innerHTML = rows
    ? `<div class="q-list">${rows}</div>`
    : `<div class="pt-empty">
        <b>No quote requests yet</b>
        <p>When a buyer uses the Request a Quote button on your profile, it lands here and you are emailed. Replies are kept on the thread.</p>
      </div>`;
}

function renderInquiryThread(q){
  const { line } = inquirySummary(q);
  const detail = (label, value, href) => value
    ? `<div class="q-d"><span>${escapeHtml(label)}</span>${href
        ? `<a href="${escapeHtml(href)}">${escapeHtml(value)}</a>` : `<b>${escapeHtml(value)}</b>`}</div>`
    : '';

  el('pt-inquiries').innerHTML = `
    <div class="q-open" data-q="${q.id}">
      <div class="q-open-head">
        <button type="button" class="mini-btn" data-back="1">← All requests</button>
        <label class="pt-status">Status
          <select data-status="${q.id}">
            ${['New','Open','Replied','Won','Lost','Closed'].map(s => `<option ${s === q.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </label>
      </div>

      <h3 class="q-title">${escapeHtml(q.from_name)}${q.from_company ? ' <span class="q-co">' + escapeHtml(q.from_company) + '</span>' : ''}</h3>
      <p class="pf-note q-date">${new Date(q.created_at).toLocaleString()}</p>

      <div class="q-details">
        ${detail('Email', q.from_email, 'mailto:' + q.from_email)}
        ${detail('Phone', q.phone, q.phone ? 'tel:' + String(q.phone).replace(/[^\d+]/g, '') : '')}
        ${detail('Part number', q.part_number)}
        ${detail('Quantity', q.quantity)}
      </div>

      <div class="q-thread" id="th-${q.id}"></div>

      <div class="pt-reply">
        <label for="msg-${q.id}">Reply to ${escapeHtml(q.from_name)}</label>
        <textarea id="msg-${q.id}" rows="4" placeholder="Emailed to ${escapeHtml(q.from_email)} and kept on this thread."></textarea>
        <div class="pt-reply-foot">
          <button class="mini-btn green" data-send="${q.id}">Send reply</button>
        </div>
      </div>
    </div>`;

  drawThread(q.id, q);
}

function renderInquiries(){
  const open = PT.openInquiry && PT.inquiries.find(q => q.id === PT.openInquiry);
  if(open) renderInquiryThread(open); else renderInquiryList();

  el('pt-inquiries').onclick = async e => {
    const row = e.target.closest('[data-open]');
    if(row){
      PT.openInquiry = row.dataset.open;
      const q = PT.inquiries.find(x => x.id === PT.openInquiry);
      renderInquiries();
      /* Opening one is what "seen" means now, not opening the tab. Only this
         request changes, so the others stay unread and keep their badge. */
      if(q && q.status === 'New') markInquirySeen(q);
      return;
    }
    if(e.target.closest('[data-back]')){ PT.openInquiry = null; renderInquiries(); return; }

    const b = e.target.closest('[data-send]'); if(!b) return;
    const id = b.dataset.send, box = el('msg-' + id), body = (box.value || '').trim();
    if(!body) return;
    b.disabled = true;
    const err = await postMessage(id, body);
    b.disabled = false;
    if(err){ toast('Could not send: ' + err, false); return; }
    box.value = '';
    const q = PT.inquiries.find(x => x.id === id);
    drawThread(id, q);
    /* The field MUST be called `email`: sendFounderEmail reads fields.email to
       set _replyto and to address the auto-response. It used to be named
       buyer_email, which meant the reply had no recipient, the supplier was
       told "Reply sent", the buyer never heard anything, and the request just
       looked ignored. */
    /* The buyer has no account, so a reply that only lands in this thread is a
       reply nobody receives. This emails them and links back to the thread,
       where they can answer, which is what "Reply in your portal" has been
       promising suppliers all along. */
    notifyBuyerOfReply(id, body);

    sendFounderEmail('Supplier reply: ' + PT.co.name, {
      supplier: PT.co.name, buyer: q.from_name, email: q.from_email, message: body
    }, 'Reply from ' + PT.co.name + ' via Circuits.com:\n\n' + body
       + '\n\nYou can answer this email directly. It goes back to ' + PT.co.name + '.');

    /* Answering is what moves a request along, so record it here rather than
       relying on the supplier to also remember the dropdown. Resolved requests
       are left alone: a follow-up message should not undo Won or Lost. */
    if(!['Won','Lost','Closed'].includes(q.status)){
      await setInquiryStatus(id, 'Replied');
      q.status = 'Replied';
      const sel = document.querySelector(`[data-status="${id}"]`);
      if(sel) sel.value = 'Replied';
      markUnread();
    }
    toast('Reply sent to ' + q.from_name + '.', true);
  };

  el('pt-inquiries').onchange = async e => {
    const s = e.target.closest('[data-status]'); if(!s) return;
    const q = PT.inquiries.find(x => x.id === s.dataset.status);
    if(q) q.status = s.value;
    await setInquiryStatus(s.dataset.status, s.value);
    markUnread();
    toast('Status updated.', true);
  };
}

async function drawThread(id, q){
  const box = el('th-' + id); if(!box) return;
  box.innerHTML = '<p class="pf-note">Loading the conversation…</p>';
  const msgs = await fetchThread(id);
  if(el('th-' + id) !== box) return;          // they went back before it arrived
  const them = (q && q.from_name) ? escapeHtml(q.from_name) : 'Buyer';
  /* The original request is the first thing in the thread, it is the message
     they sent, so it reads as one conversation rather than a form plus a log. */
  const first = q ? `<div class="pt-msg buyer"><b>${them}:</b> ${escapeHtml(q.body)}
     <span class="pf-note">${new Date(q.created_at).toLocaleString()}</span></div>` : '';
  box.innerHTML = first + msgs.map(m =>
    `<div class="pt-msg ${escapeHtml(m.author)}"><b>${m.author === 'supplier' ? 'You' : them}:</b> ${escapeHtml(m.body)}
     <span class="pf-note">${new Date(m.created_at).toLocaleString()}</span></div>`).join('');
}


/* ---------- promote: printable artwork ----------
   Drawn in real inches so it prints at true size; the previews are the same
   markup scaled down. Light or dark is a class on the wrapper, so one toggle
   restyles every piece. */
let KIT_STYLE = 'light';

function qrSvg(text){
  if(typeof qrcode !== 'function') return '<span class="kit-qr-missing">QR unavailable</span>';
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/* ---------- search recruits (company Employment tab) ----------
   The same search the Seeking Employment page runs, inside the dashboard.
   The database gates the private details; this only decides what to draw. */
function wireRecruitSearch(){
  const form = el('rs-form'), out = el('rs-results'), note = el('rs-note');
  if(!form || form.__wired) return;
  form.__wired = true;
  let access = null;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = val('rs-q');
    out.innerHTML = loadingHtml('Searching…');
    if(access === null) access = await hasTalentAccess();
    note.innerHTML = access
      ? '<b>Talent Access is active.</b> Unlock anyone to see their name, contact details and resume.'
      : 'Searching is free. Unlocking someone needs Talent Access, a monthly subscription. <a href="/contact">Contact us</a> to add it.';
    let rows = [];
    try{ rows = await talentSearch(q); }
    catch(err){ out.innerHTML = loadErrorHtml('Seeking Employment', 'Try again'); return; }
    if(!rows.length){ out.innerHTML = `<div class="empty"><div class="big">Nobody seeking employment${q ? ' for &ldquo;' + escapeHtml(q) + '&rdquo;' : ''} yet</div></div>`; return; }
    out.innerHTML = `<div class="tal-grid">${rows.map(r => talentCardHtml(r, { locked: true, access, signedIn: true, kwHref: null })).join('')}</div>`;
  });
  out.addEventListener('click', async e => {
    const b = e.target.closest('button.tal-unlock'); if(!b) return;
    b.disabled = true; b.textContent = 'Unlocking…';
    const c = await talentContact(b.dataset.uid);
    const box = el('priv-' + b.dataset.uid);
    if(!c){ b.disabled = false; b.textContent = 'Unlock'; box.insertAdjacentHTML('beforeend', '<p class="pf-note" style="color:#b3261e">Could not unlock. Is your Talent Access still active?</p>'); return; }
    const resume = c.resume_path ? await resumeLink(c.resume_path) : '';
    box.innerHTML = talentContactHtml(c, resume);
  });
}

/* ---- Get another listing: up to 10 keywords, filed as Pending under this
   company. Company details come from the account, so nothing is retyped. ---- */
function wireAddListing(){
  const input = el('al-input'), tags = el('al-tags'), count = el('al-count'), msg = el('al-msg'), submit = el('al-submit');
  if(!input || input.__wired) return;
  input.__wired = true;
  let kws = [];
  const draw = () => {
    tags.innerHTML = kws.map((k, i) => `<span class="kw-tag"><a class="kw-check-link" href="/results?q=${encodeURIComponent(k)}" target="_blank" rel="noopener">${escapeHtml(k)}</a><button type="button" data-i="${i}" aria-label="Remove">&times;</button></span>`).join('');
    count.innerHTML = `<b>${kws.length}</b> of 10 keywords`;
  };
  const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? '#b3261e' : ''; };
  const add = () => {
    const k = cleanKw(input.value);
    if(!k) return;
    if(kws.includes(k)){ input.value = ''; return; }
    if((PT.listings || []).some(l => l.keyword_norm === normKw(k))){ say('You already have a listing for "' + k + '".', true); return; }
    if(kws.length >= 10){ say('Ten keywords at a time. Remove one to add another.', true); return; }
    kws.push(k); input.value = ''; say(''); draw(); input.focus();
  };
  el('al-add').addEventListener('click', add);
  input.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); add(); } });
  el('al-check').addEventListener('click', () => { const k = cleanKw(input.value); if(!k){ input.focus(); return; } window.open('/results?q=' + encodeURIComponent(k), '_blank', 'noopener'); });
  tags.addEventListener('click', e => { const b = e.target.closest('button'); if(!b) return; kws.splice(+b.dataset.i, 1); draw(); });
  submit.addEventListener('click', async () => {
    if(input.value.trim()) add();
    if(!PT.slug){ say('Save your Profile Details first, then ask for listings here.', true); activateTab('profile'); return; }
    if(!kws.length){ say('Add at least one keyword. That is what buyers search to find you.', true); input.focus(); return; }
    const co = PT.co || {};
    const base = {
      company: co.name, contact: co.contact || '', email: co.email || (PT.user && PT.user.email) || '',
      phone: co.phone || '', website: co.website || '', logo: co.logo || '',
      company_slug: PT.slug, company_handle: co.handle || null,
      banner: false, badge: null, message: '', terms: true, status: 'Pending'
    };
    submit.disabled = true; say('Sending…');
    try{ await addApplicationKeywords(base, kws); }
    catch(e){ submit.disabled = false; say('Could not send that just now. Try again in a moment.', true); return; }
    submit.disabled = false; kws = []; draw();
    say('Requested. Each keyword shows above as Pending until Circuits.com approves it. We have emailed you a copy.');
    notifyListingRequest(base.email, base.company);   // copy to the company, alert to staff
    PT.listings = await fetchMyListings(PT.slug);
    renderListings();
  });
}

/* ---- Recruiting board (Jacob, 2026-09-02): both sides in one place, for
   anyone with an account. Hiring (open roles) on one side, Seeking Employment
   (people looking) on the other. Names stay blurred here; a company unlocks
   them through the search on the Hiring tab. ---- */
async function renderJobBoard(){
  const boxes = document.querySelectorAll('.pt-board');
  if(!boxes.length) return;
  boxes.forEach(b => { b.innerHTML = '<h2>Recruiting Board</h2><p class="pf-note">Loading…</p>'; });
  let jobs = [], people = [];
  try{ [jobs, people] = await Promise.all([jobSearch(''), talentSearch('')]); }
  catch(e){ boxes.forEach(b => { b.innerHTML = '<h2>Recruiting Board</h2><p class="pf-note">The board could not load just now. Reload to try again.</p>'; }); return; }
  const jobRow = j => `<div class="pt-board-row">
      <div><b>${escapeHtml(j.title)}</b> <span class="cell-muted">${escapeHtml(j.company_name)}${j.location ? ', ' + escapeHtml(j.location) : ''}</span>
        <div class="pf-note" style="margin:2px 0 0">${escapeHtml((j.keywords || []).join(', ') || 'No keywords')}</div></div>
      <a class="mini-btn" href="/jobs?q=${encodeURIComponent((j.keywords || [])[0] || '')}" target="_blank" rel="noopener">View</a></div>`;
  const personRow = r => `<div class="pt-board-row">
      <div><b>${escapeHtml(r.title || 'Circuits industry professional')}</b> <span class="cell-muted">${r.years != null ? r.years + ' yr' + (Number(r.years) === 1 ? '' : 's') : ''}</span>
        <div class="pf-note" style="margin:2px 0 0">${escapeHtml((r.keywords || []).join(', ') || 'No keywords')}</div></div>
      <a class="mini-btn" href="/talent?q=${encodeURIComponent((r.keywords || [])[0] || '')}" target="_blank" rel="noopener">View</a></div>`;
  const html = `<h2>Recruiting Board</h2>
    <p class="kit-intro">Everything in Recruiting right now, both sides: who is hiring, and who is seeking employment.</p>
    <div class="grid2 pt-board-grid">
      <div><h3>Hiring <span class="cell-muted">(${jobs.length})</span></h3>${jobs.length ? jobs.map(jobRow).join('') : '<p class="pf-note">No open roles right now.</p>'}</div>
      <div><h3>Seeking Employment <span class="cell-muted">(${people.length})</span></h3>${people.length ? people.map(personRow).join('') : '<p class="pf-note">Nobody is listed yet.</p>'}</div>
    </div>`;
  boxes.forEach(b => { b.innerHTML = html; });
}

/* ---- jobs (MVP2) ----
   A post is a row the owner writes; "live" is a fact staff record (paid_until)
   and the Job Board reads. Applicants come from job_applicants(), which the
   database only answers for the employer or staff. */
function jobStateLabel(j){
  if(j.closed_at) return null;   // the Live/Paused switch says it
  if(j.paid_until && new Date(j.paid_until) > new Date()) return { text: 'Live until ' + new Date(j.paid_until).toLocaleDateString(), cls: 'live' };
  if(j.paid_until) return { text: 'Expired. Contact us to renew.', cls: '' };
  return { text: 'Awaiting payment. We will confirm by email.', cls: 'pending' };
}
async function renderJobs(){
  const box = el('pt-jobs'); if(!box) return;
  const jobs = await myJobs(PT.slug);
  box.innerHTML = jobs.length ? jobs.map(j => {
    const st = jobStateLabel(j);
    return `<div class="pt-job" data-job="${escapeHtml(j.id)}">
      <div class="pt-job-head">
        <div><b>${escapeHtml(j.title)}</b>${j.location ? ' <span class="cell-muted">' + escapeHtml(j.location) + '</span>' : ''}
          <div class="pf-note" style="margin:4px 0 0">${escapeHtml((j.keywords || []).join(', ') || 'No keywords yet')}</div></div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${st ? `<span class="badge ${st.cls}">${escapeHtml(st.text)}</span>` : ''}
          <button type="button" class="mini-btn" data-applicants="${escapeHtml(j.id)}">New Applicants</button>
          <label class="switch pt-job-sw"><input type="checkbox" data-open="${escapeHtml(j.id)}" ${j.closed_at ? '' : 'checked'}>
            <span class="knob" aria-hidden="true"></span><span class="sw-text">${j.closed_at ? 'Paused' : 'Live'}</span></label></div>
      </div>
      <div class="pt-applicants" id="apps-${escapeHtml(j.id)}" style="display:none"></div>
    </div>`;
  }).join('') : '<p class="pf-note">No jobs posted yet.</p>';
}
function wireJobs(){
  const box = el('pt-jobs'), post = el('job-post');
  if(!box || !post) return;
  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-applicants]');
    if(a){
      const panel = el('apps-' + a.dataset.applicants);
      if(panel.style.display !== 'none'){ panel.style.display = 'none'; return; }
      panel.style.display = ''; panel.innerHTML = '<span class="pf-note">Loading…</span>';
      const rows = await jobApplicants(a.dataset.applicants);
      panel.innerHTML = rows.length ? rows.map(r => `<div class="pt-app">
          <b><a href="/${escapeHtml(r.handle)}" target="_blank" rel="noopener">${escapeHtml(r.display_name || r.handle)}</a></b>
          ${r.title ? ' <span class="cell-muted">' + escapeHtml(r.title) + (r.years != null ? ', ' + r.years + ' yrs' : '') + '</span>' : ''}
          <span class="cell-muted"> · ${new Date(r.created_at).toLocaleDateString()}</span>
          ${r.email ? ' · <a href="mailto:' + escapeHtml(r.email) + '">' + escapeHtml(r.email) + '</a>' : ''}
          ${r.phone ? ' · ' + escapeHtml(r.phone) : ''}
          ${r.resume_path ? ' · <a href="#" data-resume="' + escapeHtml(r.resume_path) + '">Resume (PDF)</a>' : ''}
          ${r.note ? '<div class="pf-note" style="margin:4px 0 0">' + escapeHtml(r.note) + '</div>' : ''}
        </div>`).join('') : '<span class="pf-note">No applicants yet.</span>';
      return;
    }
    const r = e.target.closest('[data-resume]');
    if(r){
      e.preventDefault();
      const url = await resumeLink(r.dataset.resume);
      if(url) window.open(url, '_blank', 'noopener'); else toast('Could not open that resume just now.', false);
      return;
    }
  });
  /* Live/Paused switch: pausing takes the post off the Hiring board at
     once; switching it back on restores it (while payment still covers it). */
  box.addEventListener('change', async e => {
    const sw = e.target.closest('[data-open]'); if(!sw) return;
    const live = sw.checked;
    sw.disabled = true;
    const err = await updateJob(sw.dataset.open, { closed_at: live ? null : new Date().toISOString() });
    sw.disabled = false;
    if(err){ sw.checked = !live; toast(err, false); return; }
    renderJobs();
  });
  post.addEventListener('click', async () => {
    const msg = el('job-msg');
    if(!PT.slug){ msg.textContent = 'Save your Profile Details first, then post here.'; msg.style.color = '#b3261e'; activateTab('profile'); return; }
    const title = val('job-title');
    if(!title){ msg.textContent = 'A job title is needed.'; msg.style.color = '#b3261e'; return; }
    const keywords = val('job-keywords').split(',').map(s => s.trim()).filter(Boolean);
    if(!keywords.length){ msg.textContent = 'Add at least one keyword so people can find it.'; msg.style.color = '#b3261e'; return; }
    if(keywords.length > 10){ msg.textContent = 'Ten keywords is the limit.'; msg.style.color = '#b3261e'; return; }
    msg.textContent = 'Posting…'; msg.style.color = ''; post.disabled = true;
    const r = await postJob(PT.slug, { title, location: val('job-location'), description: val('job-desc'), apply_email: val('job-email') });
    post.disabled = false;
    if(r.error){ msg.textContent = r.error; msg.style.color = '#b3261e'; return; }
    const kw = await setJobKeywords(r.id, keywords);
    if(kw.error){ msg.textContent = 'Posted, but the keywords were refused: ' + kw.error; msg.style.color = '#b3261e'; renderJobs(); return; }
    ['job-title','job-location','job-keywords','job-desc','job-email'].forEach(id => { el(id).value = ''; });
    msg.textContent = 'Posted. It goes live once we confirm payment.'; msg.style.color = '#3f6300';
    renderJobs();
  });
}

function renderPromote(){
  const kit = el('promo-kit');
  if(!kit) return;
  const co = PT.co;
  if(!co || !co.handle){
    kit.innerHTML = `<div class="pt-empty"><b>Pick your address first</b>
      <p>Everything here is built around circuits.com/&lt;your name&gt;. Set it under Profile Details, save, and these appear.</p></div>`;
    return;
  }

  const url   = 'https://circuits.com/' + co.handle;
  const short = 'circuits.com/' + co.handle;
  const name  = escapeHtml(co.name);
  const qr    = qrSvg(url);
  const live  = PT.listings.filter(l => l.status === 'Approved' && !l.paused).map(l => l.keyword).filter(Boolean);
  const kws   = live.slice(0, 3).join(' · ');
  const tag   = co.tagline ? escapeHtml(co.tagline) : (kws ? escapeHtml(kws) : 'Find us on Circuits.com');

  const mark = isLogoUrl(co.logo)
    ? `<img class="kit-logo" src="${escapeHtml(co.logo)}" alt="">`
    : `<span class="kit-logo kit-logo-text">${escapeHtml((co.name || '?').slice(0,1).toUpperCase())}</span>`;

  const qrBox = (cls) => `<div class="kit-qrbox ${cls || ''}">${qr}</div>`;

  /* --- the pieces --- */
  const card = `<div class="kit-art kit-card" data-art="card">
      <span class="kit-accent"></span>
      <div class="kit-card-l">
        ${mark}
        <div class="kit-card-name">${name}</div>
        <div class="kit-card-tag">${tag}</div>
        <div class="kit-card-url">${escapeHtml(short)}</div>
      </div>
      <div class="kit-card-r">${qrBox()}<span class="kit-scan">Scan for parts &amp; contacts</span></div>
    </div>`;

  const round = `<div class="kit-st kit-st-round">${qrBox('sm')}<b>${escapeHtml(short)}</b></div>`;
  const wide  = `<div class="kit-st kit-st-wide">${qrBox('sm')}
      <div><b>${escapeHtml(short)}</b><span>Scan for parts &amp; contacts</span></div></div>`;
  const tiny  = `<div class="kit-st kit-st-tiny">${qrBox('xs')}<b>${escapeHtml(co.handle)}</b></div>`;

  const stickers = `<div class="kit-art kit-sheet" data-art="stickers">
      <div class="kit-row kit-row-wide">${wide.repeat(4)}</div>
      <div class="kit-row kit-row-round">${round.repeat(6)}</div>
      <div class="kit-row kit-row-tiny">${tiny.repeat(10)}</div>
    </div>`;

  const sign = `<div class="kit-art kit-sign" data-art="sign">
      ${mark}
      <div class="kit-sign-name">${name}</div>
      <div class="kit-sign-lead">${tag}</div>
      ${qrBox('big')}
      <div class="kit-sign-url">${escapeHtml(short)}</div>
      <div class="kit-sign-foot">Scan for parts, documents and contacts</div>
    </div>`;

  const shelf = `<div class="kit-art kit-shelf" data-art="shelf">
      ${Array.from({length:8}, () => `<div class="kit-shelf-row">
        ${qrBox('xs')}
        <div class="kit-shelf-txt"><b>${name}</b><span>${escapeHtml(short)}</span></div>
        <div class="kit-shelf-blank">Part / bin</div>
      </div>`).join('')}
    </div>`;

  const decal = `<div class="kit-art kit-decal" data-art="decal">
      <span class="kit-accent"></span>
      ${mark}
      <div class="kit-decal-txt"><b>${name}</b><span>${escapeHtml(short)}</span></div>
      ${qrBox()}
    </div>`;

  /* id, title, size label, what it is for, markup, paper, [width in, height in, preview scale] */
  const ITEMS = [
    ['card',     'Business card back',     '3.5 × 2 in',     'Hand it over and they can pull up everything you stock.',        card,     '3.5in 2in', 3.5, 2,    0.80],
    ['decal',    'Window decal',           '6 × 2 in',       'Shop window, van door, workshop entrance.',                      decal,    '6in 2in',   6,   2,    0.62],
    ['stickers', 'Sticker sheet',          'Letter · 20 up', 'Reels, bins, toolboxes, shipping boxes, hard hats.',             stickers, 'letter',    7.8, 5.2,  0.46],
    ['shelf',    'Shelf &amp; bin labels', 'Letter · 8 up',  'Trade counter shelving and stores. Write the part in the blank.', shelf,    'letter',    7.8, 9.8,  0.30],
    ['sign',     'Counter sign',           'Letter',         'Trade show table, trade counter, noticeboard.',                  sign,     'letter',    7.8, 10.1, 0.30]
  ];

  kit.className = 'kit kit-' + KIT_STYLE;
  kit.innerHTML = `
  <div class="kit-bar">
    <span>Style</span>
    <div class="kit-toggle">
      <button type="button" data-style="light" class="${KIT_STYLE === 'light' ? 'on' : ''}">Light</button>
      <button type="button" data-style="dark" class="${KIT_STYLE === 'dark' ? 'on' : ''}">Dark</button>
    </div>
    <span class="kit-bar-note">Dark uses more ink but stands out on a busy counter.</span>
  </div>

  ${ITEMS.map(([id, title, size, why, art, page, w, h, s]) => `
    <div class="kit-item">
      <div class="kit-head">
        <div>
          <h3>${title} <span class="kit-size">${size}</span></h3>
          <p class="pf-note">${why}</p>
        </div>
        <button class="mini-btn green" data-print="${id}" data-page="${page}">Print</button>
      </div>
      <div class="kit-stage" role="button" tabindex="0" aria-label="Enlarge ${title}"
           data-zoom data-w="${w}" data-h="${h}">
        <div class="kit-scaler" style="--s:${s};--w:${w}in;--h:${h}in">${art}</div>
        <span class="kit-zoom-hint">Click to enlarge</span>
      </div>
    </div>`).join('')}

  <div class="kit-item">
    <div class="kit-head"><div><h3>Email signature</h3>
      <p class="pf-note">Nothing to print. Paste it once and it goes out on every email you send.</p></div></div>
    <div class="kit-sig">
      <label>Plain text</label>
      <textarea id="sig-text" rows="3" readonly>${escapeHtml(co.name + (co.contact ? ', ' + co.contact : ''))}
${escapeHtml(short)}${co.phone ? '\n' + escapeHtml(co.phone) : ''}</textarea>
      <button class="mini-btn" data-copy="sig-text">Copy plain text</button>

      <label style="margin-top:14px">Formatted (Outlook, Gmail)</label>
      <div class="kit-sig-html" id="sig-html"><b>${name}</b>${co.contact ? ', ' + escapeHtml(co.contact) : ''}<br>
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

  kit.addEventListener('keydown', e => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const stage = e.target.closest('[data-zoom]');
    if(stage){ e.preventDefault(); zoomArt(stage); }
  });

  kit.addEventListener('click', async e => {
    const styleBtn = e.target.closest('[data-style]');
    const printBtn = e.target.closest('[data-print]');
    const copyBtn  = e.target.closest('[data-copy]');
    const richBtn  = e.target.closest('[data-copy-rich]');

    if(styleBtn){ KIT_STYLE = styleBtn.dataset.style; kit.__wired = false; renderPromote(); return; }
    if(printBtn){ printArt(printBtn.dataset.print, printBtn.dataset.page); return; }

    const stage = e.target.closest('[data-zoom]');
    if(stage){ zoomArt(stage); return; }

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
        const r = document.createRange(); r.selectNodeContents(box);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        richBtn.textContent = 'Press Ctrl+C';
      }
      setTimeout(() => { richBtn.textContent = 'Copy formatted'; }, 2200);
    }
  });
}

/* Click a preview to see it big. The artwork is cloned and re-scaled to fit the
   window, so it stays crisp, it is live markup, not an image. */
function zoomArt(stage){
  const art = stage.querySelector('.kit-art');
  if(!art) return;
  const w = parseFloat(stage.dataset.w), h = parseFloat(stage.dataset.h);
  const fit = Math.min((window.innerWidth - 120) / (w * 96),
                       (window.innerHeight - 150) / (h * 96));
  const s = Math.max(0.2, Math.min(fit, 2));

  const box = document.createElement('div');
  box.className = 'kit-lb' + (el('promo-kit').classList.contains('kit-dark') ? ' kit-dark' : '');
  box.innerHTML = `<button class="kit-lb-x" aria-label="Close">×</button>
    <div class="kit-scaler" style="--s:${s};--w:${w}in;--h:${h}in"></div>
    <p class="kit-lb-note">${w} × ${h} in at full size · click anywhere or press Esc to close</p>`;
  box.querySelector('.kit-scaler').appendChild(art.cloneNode(true));

  const close = () => {
    box.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
  };
  const onKey = ev => { if(ev.key === 'Escape') close(); };

  box.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(box);
  box.querySelector('.kit-lb-x').focus();
}

/* Print exactly one piece at its own paper size. @page cannot be switched with
   a class, so the rule is injected for the duration of the print. */
function printArt(kind, page){
  const art = document.querySelector(`[data-art="${kind}"]`);
  if(!art) return;
  document.querySelectorAll('.kit-art').forEach(a => a.classList.remove('kit-art-active'));
  art.classList.add('kit-art-active');

  const style = document.createElement('style');
  style.textContent = `@page { size: ${page}; margin: ${page.includes('letter') ? '0.35in' : '0'}; }`;
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
        <textarea id="rp-${r.id}" rows="3" placeholder="Answer publicly. This appears under the review.">${escapeHtml(r.reply || '')}</textarea>
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
    ? 'Pending reviews are not public yet. Circuits.com checks them first. You cannot approve your own.'
    : '';
}
