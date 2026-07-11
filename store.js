/* ===== Circuits.com — Supabase-backed data store =====
   Real persistence shared across all clients and devices.
   Requires the Supabase JS client (loaded from CDN) before this file.
   The URL and publishable key below are PUBLIC by design (safe to embed);
   all access is enforced server-side by Row Level Security. */

const SUPABASE_URL = 'https://ghpruernzhjwsgsezdyn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zmOQinynNkuWdHUeHrFdDA_y6UnLyL4';

const sb = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

/* ---- pricing ---- */
const BASE_FEE = 49, BANNER_FEE = 99, BADGE_FEE = 29;
function effPrice(v, fallback){
  return (v==null || v==='' || isNaN(Number(v))) ? fallback : Number(v);
}
function appPrice(a){
  let p = effPrice(a && a.listing_price, BASE_FEE);
  if(a && a.banner) p += effPrice(a.banner_price, BANNER_FEE);
  if(a && a.badge)  p += effPrice(a.badge_price, BADGE_FEE);
  return p;
}
function appPriceLabel(a){ return (a && a.fee) ? a.fee : ('$' + appPrice(a) + '/mo'); }

/* ---- read ---- */
async function fetchApplications(){
  if(!sb) return [];
  // secondary sort by id keeps rows from jumping when timestamps tie
  const { data, error } = await sb.from('applications').select('*')
    .order('created_at', { ascending:false }).order('id', { ascending:true });
  if(error){ console.error('fetchApplications', error); return []; }
  return data || [];
}
async function fetchApproved(){
  if(!sb) return [];
  const { data, error } = await sb.from('applications').select('*').eq('status','Approved')
    .order('created_at', { ascending:false }).order('id', { ascending:true });
  if(error){ console.error('fetchApproved', error); return []; }
  return data || [];
}
/* ===== Keyword matching ruleset =====
   1. Lowercase everything.
   2. Strip every non-letter/digit (hyphens, spaces, punctuation) — "semi-conductors" == "semi conductors" == "semiconductors".
   3. Singularize the plural tail — "sensors" == "sensor", "switches" == "switch", "batteries" == "battery".
   4. EXACT match only after normalization. No substring/partial matching, so
      "list test 2" never matches "list test 3" and "zzz" only matches "zzz".
   5. Blank/empty keywords never match anything. */
function singularize(n){
  if(n.length>4 && n.endsWith('ies')) return n.slice(0,-3)+'y';   // batteries -> battery
  if(n.length>3 && /(?:x|z|ch|sh)es$/.test(n)) return n.slice(0,-2); // switches -> switch, boxes -> box
  if(n.length>3 && n.endsWith('s') && !n.endsWith('ss')) return n.slice(0,-1); // sensors -> sensor, fuses -> fuse
  return n;
}
function normKw(s){
  return singularize((s||'').toLowerCase().replace(/[^a-z0-9]/g,''));
}
/* Approval-level cleanup for stored keywords: lowercase, no hyphens, no plurals. */
function cleanKw(s){
  let v = (s||'').toLowerCase().replace(/-+/g,' ').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
  return v.replace(/([a-z0-9]+)$/, w => singularize(w));
}
/* One live listing per company for a searched keyword (skips paused ones). */
async function fetchApprovedByKeyword(keyword){
  const all = (await fetchApproved()).filter(a => !a.paused);
  const k = normKw(keyword);
  if(!k) return [];
  const match = all.filter(a => normKw(a.keyword) === k);
  const seen = new Set(), out = [];
  for(const a of match){ if(seen.has(a.company)) continue; seen.add(a.company); out.push(a); }
  return out;
}

/* ---- company logo storage (Supabase Storage, public bucket "logos") ---- */
async function uploadLogo(file){
  if(!sb || !file) return '';
  const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.' + ext;
  const { error } = await sb.storage.from('logos').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if(error){ console.error('uploadLogo', error); return ''; }
  return sb.storage.from('logos').getPublicUrl(path).data.publicUrl;
}
function isLogoUrl(s){ return /^https?:\/\//i.test(s||''); }

/* ---- listing documentation storage (Supabase Storage, public bucket "docs") ---- */
async function uploadDoc(file){
  if(!sb || !file) return null;
  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g,'');
  const path = Date.now() + '-' + Math.random().toString(36).slice(2,8) + '.' + ext;
  const { error } = await sb.storage.from('docs').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
  if(error){ console.error('uploadDoc', error); return null; }
  return { name: file.name, url: sb.storage.from('docs').getPublicUrl(path).data.publicUrl };
}

/* ---- write ---- */
/* Join form: one submission becomes one row per keyword. */
async function addApplicationKeywords(base, keywords){
  if(!sb) throw new Error('No connection');
  const list = (keywords && keywords.length) ? keywords.map(cleanKw) : [''];
  const rows = list.map(kw => Object.assign({}, base, {
    keyword: kw, keywords: kw ? [kw] : [], status: base.status || 'Pending'
  }));
  const { error } = await sb.from('applications').insert(rows);
  if(error){ console.error('addApplicationKeywords', error); throw error; }
  return rows;
}
async function updateAppStatus(id, status){
  if(!sb) return null;
  const { error } = await sb.from('applications').update({ status }).eq('id', id);
  if(error) console.error('updateAppStatus', error);
  return error || null;
}
/* Approve every keyword row for a company (Add Listing dropdown). */
async function approveCompany(company){
  if(!sb) return;
  const { error } = await sb.from('applications').update({ status:'Approved', paused:false }).eq('company', company);
  if(error) console.error('approveCompany', error);
}
async function setPaused(id, paused){
  if(!sb) return null;
  const { error } = await sb.from('applications').update({ paused }).eq('id', id);
  if(error) console.error('setPaused', error);
  return error || null;
}
async function updateApplication(id, fields){
  if(!sb) return null;
  if('keyword' in fields){ fields.keyword = cleanKw(fields.keyword); fields.keywords = fields.keyword ? [fields.keyword] : []; }
  const { error } = await sb.from('applications').update(fields).eq('id', id);
  if(error) console.error('updateApplication', error);
  return error || null;
}
async function deleteApplication(id){
  if(!sb) return;
  const { error } = await sb.from('applications').delete().eq('id', id);
  if(error) console.error('deleteApplication', error);
}

/* ---- auth (staff) ---- */
async function currentUser(){ if(!sb) return null; const { data } = await sb.auth.getUser(); return data ? data.user : null; }
async function checkStaff(){ if(!sb) return false; const { data, error } = await sb.rpc('is_staff'); if(error){ console.error('is_staff', error); return false; } return !!data; }
async function signIn(email, password){ return sb.auth.signInWithPassword({ email, password }); }
async function signUp(email, password){ return sb.auth.signUp({ email, password }); }
async function signOut(){ if(sb) await sb.auth.signOut(); } async function loadPrefs(page){ if(!sb) return null; const { data, error } = await sb.from('admin_prefs').select('prefs').eq('page', page).maybeSingle(); if(error){ console.error('loadPrefs', error); return null; } return data ? data.prefs : null; } async function savePrefs(page, prefs){ if(!sb) return; const { data } = await sb.auth.getUser(); if(!data || !data.user) return; const { error } = await sb.from('admin_prefs').upsert({ user_id: data.user.id, page, prefs, updated_at: new Date().toISOString() }, { onConflict: 'page' }); if(error) console.error('savePrefs', error); }

/* Redirect to login unless the visitor is a signed-in staff member. */
async function requireStaff(){
  const user = await currentUser();
  if(!user){ location.href = 'login.html'; return false; }
  const staff = await checkStaff();
  if(!staff){
    document.body.innerHTML = '<div style="max-width:520px;margin:80px auto;font-family:Arial,sans-serif;text-align:center;color:#1a1a1a">'
      + '<h2>Not authorized</h2><p style="color:#5f6368">This account isn’t on the Circuits.com staff list. '
      + 'Sign in with an approved staff email.</p><p><a href="login.html" style="color:#5f9b00;font-weight:600">Back to sign in</a></p></div>';
    return false;
  }
  return true;
}
