/* ===== Circuits.com — supplier portal =====
   Everything here is gated by RLS, not by this file. Hiding a button is a
   convenience; the database is what actually refuses the write. */

let PT = { slug: null, co: null, listings: [], inquiries: [], reviews: [], openInquiry: null, editing: null };

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

/* Your profile: the thing you always have, whether or not you manage a listing. */
function renderMyProfile(me){
  const box = el('pt-me');
  if(!box) return;
  if(!me){
    box.innerHTML = `<p class="pf-note">This account has no Circuits.com address yet.
      <a href="/register">Create a profile</a> to claim one.</p>`;
    return;
  }
  box.innerHTML = `
    <div class="auth-field"><label>Your Circuits.com address</label>
      <div class="handle-row"><span class="handle-prefix">circuits.com/</span>
        <input id="me-handle" type="text" maxlength="32" spellcheck="false" value="${escapeHtml(me.handle)}"></div>
      <div id="me-handle-msg" class="pf-note"></div>
    </div>
    <div class="auth-field"><label>Display name</label>
      <input id="me-name" type="text" maxlength="120" value="${escapeHtml(me.display_name || '')}"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary" type="button" id="me-save">Save profile</button>
      <a class="mini-btn" href="/${escapeHtml(me.handle)}" target="_blank" rel="noopener">View profile ↗</a>
    </div>
    <div id="me-msg" class="pf-note"></div>`;

  el('me-save').addEventListener('click', async ()=>{
    const msg = el('me-msg');
    const handle = el('me-handle').value.trim().toLowerCase();
    const name = el('me-name').value.trim();
    msg.textContent = 'Saving…'; msg.style.color = '';
    if(handle !== me.handle){
      const why = await handleAvailable(handle);
      if(why){ msg.textContent = why; msg.style.color = '#b3261e'; return; }
    }
    const err = await updateMyProfile({ handle, display_name: name || null });
    msg.textContent = err || 'Saved. Your profile is at circuits.com/' + handle;
    msg.style.color = err ? '#b3261e' : '#3f6300';
    if(!err) me.handle = handle;
  });
}

/* ---------- boot ---------- */
async function initPortal(){
  const user = await currentUser();
  if(!user){ show('pt-auth', true); show('pt-app', false); wireAuth(); return; }

  const [cos, me] = await Promise.all([myCompanies(), myProfile()]);

  /* Having a profile and managing a listing are different things. A profile
     with no listing is a normal, finished state — not an error. */
  if(!cos.length){
    show('pt-auth', false); show('pt-app', false); show('pt-none', true);
    el('pt-none-email').textContent = user.email;
    renderMyProfile(me);
    renderAccount(user);
    /* An admin does not have to run a listing. Give them the console on its
       own rather than a "no company linked" page that looks broken. */
    if(await checkStaff()){
      show('pt-none', false); show('pt-app', true);
      document.body.classList.add('pt-admin-only');
      wireTabs();
      await wireAdminTab();
      const t = el('pt-tab-admin');
      if(t) t.click();
    }
    return;
  }
  show('pt-auth', false); show('pt-none', false); show('pt-app', true);

  /* A suspended owner can still sign in and still sees their data — the
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

  wireTabs();
  await wireAdminTab();
  await loadCompany(cos[0].slug);
}

/* Admin is something an account has, not a separate login. The tab is hidden
   for everyone else — but hiding a tab is presentation, not security: every
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
    /* Opening the tab is what "seen" means. Without this every request stays
       New for ever unless the supplier remembers to touch the dropdown, so the
       unread count stops meaning anything and gets ignored. */
    /* Opening the tab shows the list; it does not mean any request was read.
       markInquirySeen() fires when one is actually opened. */
    if(b.dataset.tab === 'inquiries'){ PT.openInquiry = null; renderInquiries(); }
    /* The console loads nothing until an admin actually opens it — a company
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
async function renderAccount(user){
  const host = el('pt-account');
  if(!host || !user) return;
  const confirmed = !!(user.email_confirmed_at || user.confirmed_at);

  host.innerHTML = `
    <div class="pt-account">
      <h3>Your account</h3>
      <p class="pf-note">Signed in as <b>${escapeHtml(user.email || '')}</b>
        ${confirmed
          ? '<span class="ac-ok">email confirmed</span>'
          : '<span class="ac-warn">email not confirmed yet — check your inbox for the link</span>'}</p>

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

      <hr class="ac-rule">
      <button class="mini-btn ac-danger" type="button" id="ac-delete">Delete my account</button>
      <p class="pf-note">Permanent. Your Circuits.com address is released and can be taken by
        someone else. Company listings are not deleted this way &mdash; contact us for those.</p>
      <div id="ac-del-msg" class="pf-note"></div>
    </div>`;

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

  el('ac-delete').onclick = async () => {
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
      ? 'This account manages a company listing, so it cannot be deleted here. '
        + 'Listings are paid for and may be shared with colleagues — contact us and we will sort it out.'
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
      + 'Nothing has been lost — reload the page to try again.</p>';
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
    const tab = document.querySelector('.pt-tab[data-tab="profile"]');
    if(tab) tab.click();
  };
}

/* "up 18%" only means something against the period before it. No previous
   activity means there is no percentage to state — say "new" rather than
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
  const got = {};
  for(const r of rows) got[key(r.bucket)] = Number(r.hits) || 0;

  const out = [];
  let cur = new Date(key(from));
  const end = to.getTime();
  let guard = 0;
  while(cur.getTime() <= end && guard++ < 800){
    const t = cur.getTime();
    out.push([new Date(t), got[t] || 0]);
    if(bucket === 'month'){ cur = new Date(cur); cur.setMonth(cur.getMonth() + 1); }
    else cur = new Date(t + step);
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

  /* whole numbers only — "2.5 views" is not a thing */
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

  host.innerHTML = '<p class="pf-note">Loading…</p>';
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
    ? 'No views recorded in this period — tracking starts the first time someone opens your profile.'
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
const CROP_OUT = 512;   // saved size — big enough for retina, small enough to load fast
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
  el('f-reviews-on').checked = !!c.reviews_enabled;
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

  const hours = c.hours && typeof c.hours === 'object' ? c.hours : {};
  el('f-hours').innerHTML = HOUR_DAYS.map(([k, label]) =>
    `<div class="auth-field"><label>${label}</label><input id="h-${k}" type="text" placeholder="8:00–17:00" value="${escapeHtml(hours[k] || '')}"></div>`
  ).join('');

  const soc = c.socials && typeof c.socials === 'object' ? c.socials : {};
  el('f-socials').innerHTML = SOCIAL_KEYS.map(([k, label]) =>
    `<div class="auth-field"><label>${label}</label><input id="s-${k}" type="text" placeholder="https://…" value="${escapeHtml(soc[k] || '')}"></div>`
  ).join('');

  renderRepeater('certs', c.certifications, ['name', 'issuer', 'year'],
                 ['Certification', 'Issuer', 'Year']);
  renderRepeater('team', c.team, ['name', 'role', 'email', 'photo'],
                 ['Name', 'Role', 'Email', 'Photo'], ['text', 'text', 'text', 'img']);
  renderRepeater('gallery', c.gallery, ['url', 'caption'],
                 ['Image', 'Caption'], ['img', 'text']);
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

/* One generic list editor covers certifications, team and gallery.
   A field marked 'img' gets a real file upload — asking a supplier for an
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
       <button type="button" class="mini-btn" data-del="${i}">Remove</button></div>`
    ).join('') + `<button type="button" class="mini-btn green" data-add="1">+ Add</button>`;
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
    markDirty();
    draw();
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

  /* PT.logoFile is the square the company cropped, not the file it picked. */
  if(PT.logoFile){
    const url = await uploadImage(PT.logoFile);
    if(url) fields.logo = url;
    else { btn.disabled = false; toast('That logo could not be uploaded. Try a smaller PNG or JPEG.', false); return; }
  }
  else if(PT.clearLogo){ fields.logo = null; }

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
          <button class="mini-btn" data-edit="${l.id}">Edit</button>
          ${l.status === 'Approved'
            ? `<button class="mini-btn" data-pause="${l.id}" data-to="${l.paused ? '0' : '1'}">${l.paused ? 'Resume' : 'Pause'}</button>` : ''}
        </div>
      </div>
      ${listingSummary(l)}
      ${PT.editing === l.id ? listingEditor(l) : ''}
    </div>`).join('');
  el('pt-listings').innerHTML = rows || `<div class="pt-empty">
    <b>No listings yet</b>
    <p>Once Circuits.com approves a Circuits-Keyword™ for you, it appears here and you can pause or resume it.</p>
  </div>`;
  wireListings();
}

/* What the listing looks like to a buyer, shown closed. Suppliers could not see
   their own description or documents from here at all — only the keyword and
   its status — so there was no way to notice a stale datasheet. */
function listingSummary(l){
  if(PT.editing === l.id) return '';
  const docs = Array.isArray(l.docs) ? l.docs : [];
  return `<div class="pt-listing-sum">
    <p>${l.description ? escapeHtml(l.description) : '<i>No description. Buyers see only your company name on this keyword.</i>'}</p>
    <span class="pf-note">${docs.length ? docs.length + (docs.length === 1 ? ' document' : ' documents') : 'No documents'}</span>
  </div>`;
}

function listingEditor(l){
  const docs = Array.isArray(l.docs) ? l.docs : [];
  return `<div class="pt-listing-edit">
    <label class="pt-lbl" for="ed-desc-${l.id}">Description <span class="pf-note">— shown to buyers searching “${escapeHtml(l.keyword || '')}”</span></label>
    <textarea id="ed-desc-${l.id}" maxlength="300" rows="3"
      placeholder="What you supply under this keyword.">${escapeHtml(l.description || '')}</textarea>
    <div class="pf-note" id="ed-count-${l.id}">${(l.description || '').length}/300</div>

    <label class="pt-lbl">Documents <span class="pf-note">— datasheets and catalogues, shown as “View Docs”</span></label>
    <div class="pt-docs" id="ed-docs-${l.id}">
      ${docs.map((d, i) => `<span class="pt-doc">
        <a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${escapeHtml(d.name || 'Document')}</a>
        <button type="button" class="pt-doc-x" data-rmdoc="${l.id}" data-i="${i}" aria-label="Remove ${escapeHtml(d.name || 'document')}">×</button>
      </span>`).join('') || '<span class="pf-note">None yet.</span>'}
    </div>
    <input type="file" id="ed-file-${l.id}" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg">

    <div class="pt-edit-actions">
      <button class="btn btn-primary" data-save="${l.id}">Save</button>
      <button class="mini-btn" data-cancel="1">Cancel</button>
      <span class="pf-note">Keyword, sponsorship, badge and price are set by Circuits.com — contact us to change those.</span>
    </div>
  </div>`;
}

function wireListings(){
  const root = el('pt-listings');

  root.onclick = async e => {
    const pause = e.target.closest('[data-pause]');
    if(pause){
      pause.disabled = true;
      await setPaused(pause.dataset.pause, pause.dataset.to === '1');
      PT.listings = await fetchMyListings(PT.slug);
      renderListings();
      toast('Listing updated.', true);
      return;
    }

    const edit = e.target.closest('[data-edit]');
    if(edit){ PT.editing = (PT.editing === edit.dataset.edit) ? null : edit.dataset.edit; renderListings(); return; }

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
      save.disabled = true;
      const err = await updateMyListing(id, { description: val('ed-desc-' + id) });
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
   These used to render every request fully expanded on one page — body, whole
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

/* Short and relative near the top of the list, absolute once it is old —
   "2:41 PM" is what you want for today and useless for last month. */
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
        <span class="q-sub">${line ? '<b>' + line + '</b> — ' : ''}${preview}</span>
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
      /* Opening one is what "seen" means now — not opening the tab. Only this
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
       buyer_email, which meant the reply had no recipient — the supplier was
       told "Reply sent", the buyer never heard anything, and the request just
       looked ignored. */
    /* The buyer has no account, so a reply that only lands in this thread is a
       reply nobody receives. This emails them and links back to the thread,
       where they can answer — which is what "Reply in your portal" has been
       promising suppliers all along. */
    notifyBuyerOfReply(id, body);

    sendFounderEmail('Supplier reply — ' + PT.co.name, {
      supplier: PT.co.name, buyer: q.from_name, email: q.from_email, message: body
    }, 'Reply from ' + PT.co.name + ' via Circuits.com:\n\n' + body
       + '\n\nYou can answer this email directly — it goes back to ' + PT.co.name + '.');

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
  /* The original request is the first thing in the thread — it is the message
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

function renderPromote(){
  const kit = el('promo-kit');
  if(!kit || !PT.co) return;
  const co = PT.co;
  if(!co.handle){
    kit.innerHTML = `<div class="pt-empty"><b>Pick your address first</b>
      <p>Everything here is built around circuits.com/&lt;your name&gt;. Set it on the Profile tab and these appear.</p></div>`;
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
   window, so it stays crisp — it is live markup, not an image. */
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
