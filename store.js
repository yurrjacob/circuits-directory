/* ===== Circuits.com — shared application store =====
   Persists Join-form applications in the browser (localStorage) so the
   Join form, admin console, and applications spreadsheet stay in sync.
   Front-end only: data is shared across pages/tabs in the same browser. */

const APP_KEY = 'circuits_applications_v1';

/* Pricing — what we charge per listing, per month. */
const BASE_FEE = 49;    // standard listing
const BANNER_FEE = 99;  // premium sponsored banner
const BADGE_FEE = 29;   // sponsor trust badge

function appPrice(a){
  let p = BASE_FEE;
  if(a && a.banner) p += BANNER_FEE;
  if(a && a.badge)  p += BADGE_FEE;
  return p;
}
function appPriceLabel(a){ return '$' + appPrice(a) + '/mo'; }

/* Seed demo applications (used the first time, before any real submissions). */
const SEED_APPS = [
  {id:'seed-1', date:'2026-06-28', company:'Northbridge Components', contact:'Maria Vance', email:'sales@northbridge.com', phone:'(415) 555-0142', website:'https://www.northbridgecomponents.com', logo:'northbridge-logo.png', keywords:['circuits','analog ics'], banner:true, badge:{text:'Verified', color:'#1f9d55'}, message:'2M+ parts in stock, same-day shipping. Want the circuits banner.', terms:true, status:'Approved'},
  {id:'seed-2', date:'2026-06-27', company:'Apex Semiconductor Supply', contact:'David Cho', email:'orders@apexsemi.com', phone:'(408) 555-0178', website:'https://www.apexsemi.com', logo:'apex-logo.png', keywords:['semiconductors'], banner:false, badge:{text:'Top Rated', color:'#f59e0b'}, message:'Authorized distributor, lifetime buy support.', terms:true, status:'Approved'},
  {id:'seed-3', date:'2026-06-27', company:'VoltWise Power', contact:'Greg Salinas', email:'power@voltwise.com', phone:'(480) 555-0301', website:'https://www.voltwisepower.com', logo:'', keywords:['pmic','power management'], banner:true, badge:null, message:'PMICs and battery management. Reference designs included.', terms:true, status:'Approved'},
  {id:'seed-4', date:'2026-06-26', company:'Brightline Parts', contact:'Owen Patel', email:'owen@brightlineparts.com', phone:'(919) 555-0144', website:'https://www.brightlineparts.com', logo:'', keywords:['interface ics','logic ics'], banner:true, badge:{text:'Featured', color:'#2563eb'}, message:'Looking to feature interface ICs and logic ICs.', terms:true, status:'Pending'},
  {id:'seed-5', date:'2026-06-26', company:'Lumen Circuit Co.', contact:'Priya Nair', email:'sales@lumencircuit.com', phone:'(512) 555-0193', website:'https://www.lumencircuit.com', logo:'lumen-logo.png', keywords:['analog ics'], banner:false, badge:{text:'Preferred', color:'#6d28d9'}, message:'', terms:true, status:'Pending'},
  {id:'seed-6', date:'2026-06-25', company:'ShadyParts LLC', contact:'John Doe', email:'john@shadyparts.biz', phone:'(000) 000-0000', website:'', logo:'', keywords:['counterfeit chips'], banner:false, badge:null, message:'Bulk ICs, no questions asked.', terms:false, status:'Denied'},
  {id:'seed-7', date:'2026-06-24', company:'Granite State Semi', contact:'Karen Doyle', email:'sales@gssemi.com', phone:'(603) 555-0171', website:'https://www.granitestatesemi.com', logo:'', keywords:['memory ics'], banner:false, badge:null, message:'Could not verify business registration.', terms:true, status:'Denied'}
];

function getApplications(){
  let raw = null;
  try { raw = localStorage.getItem(APP_KEY); } catch(e){ raw = null; }
  if(raw === null){
    try { localStorage.setItem(APP_KEY, JSON.stringify(SEED_APPS)); } catch(e){}
    return SEED_APPS.slice();
  }
  try { return JSON.parse(raw) || []; } catch(e){ return SEED_APPS.slice(); }
}

function saveApplications(arr){
  try { localStorage.setItem(APP_KEY, JSON.stringify(arr)); } catch(e){}
}

function addApplication(app){
  const arr = getApplications();
  app.id = 'app-' + Date.now();
  if(!app.status) app.status = 'Pending';
  arr.unshift(app);
  saveApplications(arr);
  return app;
}

function updateAppStatus(id, status){
  const arr = getApplications();
  const i = arr.findIndex(a => a.id === id);
  if(i > -1){ arr[i].status = status; saveApplications(arr); }
  return arr;
}
