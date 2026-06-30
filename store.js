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
function appPrice(a){ let p = BASE_FEE; if(a && a.banner) p += BANNER_FEE; if(a && a.badge) p += BADGE_FEE; return p; }
function appPriceLabel(a){ return (a && a.fee) ? a.fee : ('$' + appPrice(a) + '/mo'); }

/* ---- read ---- */
async function fetchApplications(){
  if(!sb) return [];
  const { data, error } = await sb.from('applications').select('*').order('created_at', { ascending:false });
  if(error){ console.error('fetchApplications', error); return []; }
  return data || [];
}
async function fetchApproved(){
  if(!sb) return [];
  const { data, error } = await sb.from('applications').select('*').eq('status','Approved').order('created_at', { ascending:false });
  if(error){ console.error('fetchApproved', error); return []; }
  return data || [];
}
function normKw(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }
async function fetchApprovedByKeyword(keyword){
  const all = await fetchApproved();
  const k = normKw(keyword);
  if(!k) return all;
  return all.filter(a => (a.keywords||[]).some(kw => {
    const n = normKw(kw);
    return n === k || n.includes(k) || k.includes(n);
  }));
}

/* ---- write ---- */
async function addApplication(app){
  if(!sb) throw new Error('No connection');
  app.status = app.status || 'Pending';
  const { data, error } = await sb.from('applications').insert(app).select().single();
  if(error){ console.error('addApplication', error); throw error; }
  return data;
}
async function updateAppStatus(id, status){
  if(!sb) return;
  const { error } = await sb.from('applications').update({ status }).eq('id', id);
  if(error) console.error('updateAppStatus', error);
}
async function updateApplication(id, fields){
  if(!sb) return;
  const { error } = await sb.from('applications').update(fields).eq('id', id);
  if(error) console.error('updateApplication', error);
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
async function signOut(){ if(sb) await sb.auth.signOut(); }

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
