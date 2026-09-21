import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*  Circuits.com, outbound email.

    Deployed as the `notify` edge function (Supabase project circuits-com).
    The repo copy is tools/edge-notify.ts; deploy it with the Supabase MCP or
    CLI after editing.

    Why this exists: FormSubmit only delivers to addresses that have clicked a
    confirmation link, so it can never reach an arbitrary supplier.

    Why it is a server function rather than browser code: the sending key must
    never be in the page. It lives in Supabase secrets and is only readable here.

    verify_jwt is OFF deliberately: a company asking for a free listing has no
    token at the moment it asks. The protection is NOT authentication, it is
    that the caller can never choose the recipient. Every address below is
    looked up in the database from a slug, an id, a thread token or the row
    the caller just filed. Nothing in the request body is ever used as a
    destination on its own, or this would be an open spam relay.

    v15 (2026-09-21, audit item 7): 'contact' and 'claim' replace FormSubmit
    for the contact form and access requests. Both sit behind Cloudflare
    Turnstile: the page's token is verified here against TURNSTILE_SECRET
    (a function secret). Staff mail comes from the staff table, a claim's
    acknowledgement from the claims row, and the sender of a contact message
    only gets a copy when the check verifiably passed, so an address typed
    into the request is never mailed on the request's say-so alone.
    v14 (2026-09-16): the welcome mail carries three buttons.
    v13 (2026-09-15, site audit): the 'quote' kind is off. The in-page quote
    form has been off since 2026-08-21, but this kind still mailed whatever
    address and text the caller supplied, with a real company's name in the
    subject. When the form returns, the recipient must come from the
    inquiries row (looked up by its token), never from the request.

    The kinds that act on somebody else's behalf are authenticated properly:
    'reply' requires the signed-in supplier who owns the thread, 'job-apply'
    the signed-in applicant who holds the application row, and 'decision'
    and 'claim-invite' require staff. All are checked here against the
    database, not trusted.

    'claim-invite' is the one kind that does not use Resend: the invitation is
    sent by Supabase Auth itself, so it works before RESEND_API_KEY is set.
    That is why the not_configured check is per-kind rather than global.

    'inbox' (2026-09-03, Jacob: "any request or approval should give users an
    email") is called by the database itself (pg_net, after every insert into
    notifications) and mails that one row to its owner, once (emailed_at).

    House style for the mail itself (Jacob, 2026-09-01): no em dashes in
    anything a recipient reads, and none in this file either. */

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM = Deno.env.get("NOTIFY_FROM") ?? "Circuits.com <notifications@circuits.com>";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://circuits.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

/* One line of a stranger's typing, capped. Long values are cut rather than
   dropped, so the reader still sees something useful. */
function field(s: unknown, max = 200): string {
  const v = String(s ?? "").replace(/[\r\n]+/g, " ").trim();
  return v.length > max ? v.slice(0, max) + "…" : v;
}

/* The keyword the way the site shows it: first letter of each word up, the
   same as the results page's CSS capitalize. */
function titleCase(s: string): string {
  return s.replace(/(^|\s)(\S)/g, (_m, sp, ch) => sp + ch.toUpperCase());
}

/* Deliberately strict, and only used to decide whether we may promise that a
   reply will arrive. Anything odd simply loses that promise. */
function validEmail(s: unknown): string | null {
  const v = String(s ?? "").trim();
  if (v.length < 6 || v.length > 254) return null;
  if (!/^[^\s@<>,;"]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(v)) return null;
  return v;
}

function shell(inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#f7f8fa;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;padding:28px 20px">
    <div style="background:#fff;border:1px solid #e3e5e8;border-radius:14px;padding:26px">${inner}</div>
    <p style="text-align:center;font-size:.75rem;color:#5f6368;margin:18px 0 0">Sent by Circuits.com</p>
  </div></body></html>`;
}
const kicker = (t: string) => `<p style="margin:0 0 4px;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#5f9b00;font-weight:700">${esc(t)}</p>`;
const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#76c000;color:#0f0f0f;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:9px">${esc(label)}</a>`;
const quoteBlock = (s: string) =>
  `<div style="margin:18px 0;padding:16px;background:#f7f8fa;border-radius:10px;white-space:pre-wrap;font-size:.92rem;line-height:1.6">${esc(s)}</div>`;
const row = (label: string, value: unknown) =>
  value ? `<tr><td style="padding:6px 14px 6px 0;color:#5f6368;vertical-align:top">${esc(label)}</td><td style="padding:6px 0"><b>${esc(value)}</b></td></tr>` : "";
const note = (s: string) => `<p style="margin:18px 0 0;font-size:.82rem;color:#5f6368">${s}</p>`;

async function send(to: string, subject: string, html: string, replyTo?: string | null) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: replyTo ?? undefined, subject, html })
  });
  if (!res.ok) console.error("resend failed", res.status, await res.text());
  return res.ok;
}

/* Who is calling, according to the database rather than the request body. */
async function caller(db: any, req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!jwt) return null;
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

async function isStaff(db: any, user: any) {
  if (!user?.email) return false;
  const { data } = await db.from("staff").select("email").ilike("email", user.email).maybeSingle();
  return !!data;
}

/* Is there a Circuits.com login behind this address? Decides whether a mail
   says "open your dashboard" or "create your free account". */
async function hasAccount(db: any, email: string): Promise<boolean> {
  const { data } = await db.rpc("user_id_by_email", { p_email: email });
  return !!data;
}

/* ---------- Cloudflare Turnstile: is the caller a person? ----------
   The widget runs in the page with the public site key; this is the server
   half. It needs TURNSTILE_SECRET in the function's secrets. Without it
   nothing can be verified: the mail still reaches staff, marked unverified,
   and nothing goes to an address the request supplied. */
const TURNSTILE_SECRET = Deno.env.get("TURNSTILE_SECRET") ?? "";
type Human = "ok" | "failed" | "unverified";
async function humanCheck(token: unknown, req: Request): Promise<Human> {
  if (!TURNSTILE_SECRET) return "unverified";
  const t = String(token ?? "").trim();
  if (!t || t.length > 2048) return "failed";
  const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: t, ...(ip ? { remoteip: ip } : {}) })
    });
    const out = await r.json().catch(() => null);
    return out?.success ? "ok" : "failed";
  } catch { return "failed"; }
}
const UNVERIFIED_NOTE = "Not verified as a person: TURNSTILE_SECRET is not set on the notify function. Set it in the function's secrets and this line goes away.";

/* Every staff address, for the alerts that used to go through FormSubmit. */
async function staffEmails(db: any): Promise<string[]> {
  const { data } = await db.from("staff").select("email");
  return (data ?? []).map((r: any) => validEmail(r.email)).filter(Boolean) as string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const kind = String(payload.kind ?? "");
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  /* Everything below except claim-invite goes out through Resend. */
  if (kind !== "claim-invite" && !RESEND_KEY) return json({ ok: false, error: "not_configured" }, 503);

  /* ---------- one inbox notice, by email ----------
     Fired by the database after every insert into notifications. The row
     decides the recipient; the caller only names the row, and a row is
     mailed at most once. The few notices that already have a richer
     dedicated mail (listing request, listing decision) are skipped here so
     nobody gets the same news twice. */
  if (kind === "inbox") {
    const id = String(payload.id ?? "");
    if (!id) return json({ error: "id required" }, 400);
    const { data: rows } = await db.from("notifications")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", id).is("emailed_at", null)
      .select("id, user_id, sender_name, subject, body, link");
    const n = rows?.[0];
    if (!n) return json({ ok: false, error: "nothing_to_send" }, 200);
    const subject = String(n.subject ?? "");
    if (/^(Listing request received:|New listing request:)/.test(subject) || /^Your .* listing (is live|was not approved)$/.test(subject)) {
      return json({ ok: false, error: "covered_by_dedicated_mail" }, 200);
    }
    const { data: u } = await db.auth.admin.getUserById(n.user_id);
    const to = validEmail(u?.user?.email);
    if (!to) return json({ ok: false, error: "no_email" }, 200);
    const link = String(n.link ?? "");
    const href = !link ? `${SITE}/portal` : /^https?:\/\//.test(link) ? link : SITE + link;
    const paras = String(n.body ?? "").split(/\n{2,}/).map(p => `<p style="margin:0 0 12px;font-size:.95rem;line-height:1.55">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    /* the welcome is the on-boarding page (Jacob, 2026-09-16): three green
       buttons, one per thing a new account can do, each straight into the
       right dashboard tab */
    const welcome = subject === "Welcome to Circuits.com";
    const buttons = welcome
      ? `<p style="margin:14px 0 0">${button(`${SITE}/portal#listings`, "Free Directory Listing")}</p>` +
        `<p style="margin:10px 0 0">${button(`${SITE}/portal#hiring`, "Post Free Job")}</p>` +
        `<p style="margin:10px 0 0">${button(`${SITE}/portal#seeking`, "Post Free Resume")}</p>`
      : `<p style="margin:14px 0 0">${button(href, "Open on Circuits.com")}</p>`;
    const sent = await send(to, subject, shell(
      kicker(field(n.sender_name, 60) || "Circuits.com") +
      `<h1 style="margin:0 0 12px;font-size:1.25rem">${esc(subject)}</h1>` +
      paras + buttons +
      note(welcome ? "Sign in at circuits.com/portal any time; each button above opens the tab it names." : "This is a copy of a notice in your Circuits.com inbox (the bell at the top of every page).")
    ));
    return json({ ok: sent });
  }

  /* ---------- a company asked for a free listing (Get Listed, or "Get
     another listing" on the dashboard) ----------
     The rows are already in the database. This acknowledges them once: the
     recipient is the address ON THOSE ROWS, found by email + company among
     Pending rows filed in the last 15 minutes that have not been acknowledged
     yet. A row is acknowledged at most once (ack_sent_at), so re-posting the
     same request cannot turn this into a mailer, and the staff copy goes to
     the staff table, never to anything in the request. */
  if (kind === "listing-request") {
    const email = validEmail(payload.email);
    const company = field(payload.company, 120);
    if (!email || !company) return json({ error: "email and company required" }, 400);

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: rows, error } = await db.from("applications")
      .update({ ack_sent_at: new Date().toISOString() })
      .eq("owner_email", email.toLowerCase()).eq("company", company).eq("status", "Pending")
      .is("ack_sent_at", null).gte("created_at", since)
      .select("id, keyword, contact, phone, website, message, docs, logo, company_slug");
    if (error) return json({ ok: false, error: "lookup_failed" }, 502);
    if (!rows?.length) return json({ ok: false, error: "nothing_to_acknowledge" }, 200);

    const first = rows[0];
    const kws = rows.map((r: any) => titleCase(field(r.keyword, 80))).filter(Boolean);
    const kwText = kws.join(", ") || "(none)";
    const docs = rows.flatMap((r: any) => Array.isArray(r.docs) ? r.docs.map((d: any) => field(d?.name, 80)) : []).filter(Boolean);
    const account = await hasAccount(db, email);
    const details =
      `<table style="width:100%;border-collapse:collapse;font-size:.92rem">` +
      row("Company", company) + row("Contact", field(first.contact, 120)) + row("Email", email) +
      row("Phone", field(first.phone, 40)) + row("Website", field(first.website, 120)) +
      row(kws.length === 1 ? "Keyword" : "Keywords", kwText) +
      `</table>`;

    /* the company */
    const applicantSent = await send(email, `We have your request to list ${company} on Circuits.com`, shell(
      kicker("Request received") +
      `<h1 style="margin:0 0 10px;font-size:1.25rem">We have your request to list ${esc(company)}</h1>` +
      `<p style="margin:0 0 14px;font-size:.92rem">A person at Circuits.com reviews every keyword request, usually within one business day. You will hear from us by email either way. A free listing costs nothing.</p>` +
      details +
      (account
        ? `<p style="margin:16px 0 0;font-size:.92rem">You can follow it under Listings on your dashboard.</p><p style="margin:14px 0 0">${button(`${SITE}/portal#listings`, "Open Your Listings")}</p>`
        : `<p style="margin:16px 0 0;font-size:.92rem">No account is needed. Once the listing is live, you can create a free account with this same email address (${esc(email)}) to add a description and documents, and to request upgrades. The listing attaches to it automatically.</p>`) +
      note("Sent because this address was entered on a Circuits.com listing request. If that was not you, ignore this email and nothing else happens.")
    ));

    /* the staff, one mail each, reply goes to the applicant */
    const staff = await staffEmails(db);
    const staffHtml = shell(
      kicker("New listing request") +
      `<h1 style="margin:0 0 14px;font-size:1.25rem">${esc(company)} asked for ${kws.length} keyword${kws.length === 1 ? "" : "s"}</h1>` +
      details +
      `<table style="width:100%;border-collapse:collapse;font-size:.92rem">` +
      row("Documents", docs.length ? docs.join(", ") : "") + row("Logo", first.logo ? "yes" : "") +
      row("Account", account ? "has a Circuits.com login" : "no account yet") +
      `</table>` +
      (first.message ? `<p style="margin:14px 0 0;font-size:.85rem;color:#5f6368">Ideas / message:</p>` + quoteBlock(String(first.message).slice(0, 2000)) : "") +
      `<p style="margin:18px 0 0">${button(`${SITE}/portal`, "Review in Admin")}</p>` +
      note("Admin, then Listings, then Pending Applications. Approve or deny each keyword there. Replying to this email goes to the applicant.")
    );
    let staffSent = 0;
    for (const to of staff) if (await send(to, `New listing request: ${company} (${kwText})`, staffHtml, email)) staffSent++;
    return json({ ok: applicantSent || staffSent > 0, applicant: applicantSent, staff: staffSent, keywords: kws.length });
  }

  /* ---------- the contact form ----------
     Replaces FormSubmit (audit item 7, 2026-09-21). Staff addresses come from
     the staff table. The sender gets a copy only when Turnstile verifiably
     passed: with the secret unset or the check failed, the address typed
     into the form is never mailed, because that would be a relay. */
  if (kind === "contact") {
    const human = await humanCheck(payload.captchaToken, req);
    if (human === "failed") return json({ ok: false, error: "captcha" }, 403);
    const name = field(payload.name, 80), company = field(payload.company, 120), phone = field(payload.phone, 40);
    const email = validEmail(payload.email);
    const message = String(payload.message ?? "").trim().slice(0, 4000);
    if (!name || !email || !message) return json({ error: "name, email and message required" }, 400);

    const staff = await staffEmails(db);
    if (!staff.length) return json({ ok: false, error: "no_staff" }, 200);
    const details =
      `<table style="width:100%;border-collapse:collapse;font-size:.92rem">` +
      row("From", name) + row("Company", company) + row("Email", email) + row("Phone", phone) +
      `</table>`;
    const staffHtml = shell(
      kicker("Contact form") +
      `<h1 style="margin:0 0 14px;font-size:1.25rem">${esc(name)}${company ? ", " + esc(company) : ""} wrote</h1>` +
      details + quoteBlock(message) +
      note(human === "ok" ? "Replying to this email goes to the sender." : UNVERIFIED_NOTE)
    );
    const flag = human === "ok" ? "" : " [unverified]";
    let staffSent = 0;
    for (const to of staff) if (await send(to, `Contact: ${name}${company ? " (" + company + ")" : ""}${flag}`, staffHtml, email)) staffSent++;

    let copy = false;
    if (human === "ok" && staffSent > 0) {
      copy = await send(email, "We have your message", shell(
        kicker("Message received") +
        `<h1 style="margin:0 0 10px;font-size:1.25rem">Thanks, ${esc(name)}</h1>` +
        `<p style="margin:0 0 14px;font-size:.92rem">Your message reached Circuits.com. A person reads every one and we reply within one business day. Here is what you sent:</p>` +
        quoteBlock(message) +
        note("Sent because this address was entered on the Circuits.com contact form. If that was not you, ignore this email and nothing else happens.")
      ));
    }
    return json({ ok: staffSent > 0, staff: staffSent, copy, verified: human === "ok" });
  }

  /* ---------- someone asked for access to a listing ----------
     The claims row is already in the database (rate limited there). This
     acknowledges it once: the row is found by the email and company the
     claimant just typed among recent Pending rows, marked ack_sent_at, and
     both mails are built from the row. The claimant's copy goes out only
     when Turnstile verifiably passed, for the same reason as above. */
  if (kind === "claim") {
    const human = await humanCheck(payload.captchaToken, req);
    if (human === "failed") return json({ ok: false, error: "captcha" }, 403);
    const email = validEmail(payload.email);
    const slug = field(payload.company_slug, 120);
    if (!email || !slug) return json({ error: "email and company_slug required" }, 400);

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: rows, error } = await db.from("claims")
      .update({ ack_sent_at: new Date().toISOString() })
      .eq("email", email).eq("company_slug", slug).eq("status", "Pending")
      .is("ack_sent_at", null).gte("created_at", since)
      .select("id, name, role_title, evidence, email");
    if (error) return json({ ok: false, error: "lookup_failed" }, 502);
    const c = rows?.[0];
    if (!c) return json({ ok: false, error: "nothing_to_acknowledge" }, 200);

    const { data: co } = await db.from("companies").select("name, handle").eq("slug", slug).maybeSingle();
    const coName = field(co?.name, 120) || slug;
    const name = field(c.name, 80) || "Someone";
    const details =
      `<table style="width:100%;border-collapse:collapse;font-size:.92rem">` +
      row("Company", coName) + row("Address", co?.handle ? `circuits.com/${co.handle}` : "") +
      row("Claimant", name) + row("Role", field(c.role_title, 80)) + row("Email", c.email) +
      `</table>`;
    const staff = await staffEmails(db);
    const staffHtml = shell(
      kicker("Access request") +
      `<h1 style="margin:0 0 14px;font-size:1.25rem">${esc(name)} asks for ${esc(coName)}</h1>` +
      details +
      (c.evidence ? `<p style="margin:14px 0 0;font-size:.85rem;color:#5f6368">How to verify them:</p>` + quoteBlock(String(c.evidence).slice(0, 2000)) : "") +
      `<p style="margin:18px 0 0">${button(`${SITE}/portal`, "Review in Admin")}</p>` +
      note((human === "ok" ? "" : UNVERIFIED_NOTE + " ") + "Admin, then Claims. Replying to this email goes to the claimant.")
    );
    const flag = human === "ok" ? "" : " [unverified]";
    let staffSent = 0;
    for (const to of staff) if (await send(to, `Access request: ${coName} (${name})${flag}`, staffHtml, c.email)) staffSent++;

    let claimantSent = false;
    if (human === "ok") {
      claimantSent = await send(c.email, `We have your request for ${coName} on Circuits.com`, shell(
        kicker("Request received") +
        `<h1 style="margin:0 0 10px;font-size:1.25rem">We have your request for ${esc(coName)}</h1>` +
        `<p style="margin:0 0 14px;font-size:.92rem">A person checks every request. We will verify you work there and email you your sign-in details, usually within one business day.</p>` +
        note("Sent because this address was entered on a Circuits.com access request. If that was not you, ignore this email and nothing else happens.")
      ));
    }
    return json({ ok: staffSent > 0, staff: staffSent, claimant: claimantSent, verified: human === "ok" });
  }

  /* ---------- quote requests: OFF (site audit, 2026-09-15) ----------
     The in-page quote form has been off since 2026-08-21, but this kind
     still mailed whatever address and text the caller supplied, with a real
     company's name in the subject: an open relay. It stays off until the
     form returns, and when it does the recipient must come from the
     inquiries row (looked up by its token), never from the request. */
  if (kind === "quote") return json({ ok: false, error: "quote_disabled" }, 410);

  /* ---------- a supplier has answered, tell the buyer ---------- */
  if (kind === "reply") {
    const inquiryId = String(payload.inquiry_id ?? "");
    if (!inquiryId) return json({ error: "inquiry_id required" }, 400);

    const user = await caller(db, req);
    if (!user) return json({ ok: false, error: "sign_in_required" }, 401);

    const { data: inq } = await db.from("inquiries")
      .select("id, from_email, from_name, company_slug, access_token").eq("id", inquiryId).maybeSingle();
    if (!inq) return json({ ok: false, error: "no_such_inquiry" }, 404);

    /* the caller must actually own the company this thread belongs to */
    const { data: owns } = await db.from("company_users")
      .select("company_slug").eq("user_id", user.id).eq("company_slug", inq.company_slug).maybeSingle();
    if (!owns) return json({ ok: false, error: "not_your_thread" }, 403);

    const to = validEmail(inq.from_email);
    if (!to) return json({ ok: false, error: "buyer_has_no_email" }, 200);

    const { data: co } = await db.from("companies").select("name").eq("slug", inq.company_slug).maybeSingle();
    const link = `${SITE}/thread?t=${encodeURIComponent(inq.access_token)}`;
    const body = String(payload.body ?? "").slice(0, 4000);

    const sent = await send(to, `${co?.name ?? "A supplier"} replied to your quote request`, shell(
      kicker("New reply") +
      `<h1 style="margin:0 0 14px;font-size:1.25rem">${esc(co?.name ?? "A supplier")} has replied</h1>` +
      quoteBlock(body) + button(link, "Read and reply") +
      note("Answer from that page and it goes straight back to them.")
    ));
    return json({ ok: sent });
  }

  /* ---------- staff have approved or denied a listing ----------
     The approval mail (reworded 2026-09-01 at Jacob's direction) sends the
     supplier to the keyword's results page rather than their profile, with
     ?hl=<slug> so app.js scrolls to their row and flashes it. Since 2026-09-02
     it also says how to manage the listing: the dashboard if a login exists
     behind the address, otherwise "create a free account with this email"
     (ownership is keyed on the confirmed email, so it attaches by itself). */
  if (kind === "decision") {
    const appId = String(payload.application_id ?? "");
    if (!appId) return json({ error: "application_id required" }, 400);

    const user = await caller(db, req);
    if (!user) return json({ ok: false, error: "sign_in_required" }, 401);
    if (!(await isStaff(db, user))) return json({ ok: false, error: "staff_only" }, 403);

    const { data: app } = await db.from("applications")
      .select("id, keyword, status, company, company_slug, owner_email, email").eq("id", appId).maybeSingle();
    if (!app) return json({ ok: false, error: "no_such_application" }, 404);

    const to = validEmail(app.owner_email) ?? validEmail(app.email);
    if (!to) return json({ ok: false, error: "no_supplier_email" }, 200);

    const approved = app.status === "Approved";
    const reason = field(payload.reason, 400);
    const kw = field(app.keyword, 80);
    const kwShown = titleCase(kw);
    const listingUrl = `${SITE}/results?q=${encodeURIComponent(kw)}`
      + (app.company_slug ? `&hl=${encodeURIComponent(app.company_slug)}` : "");
    /* every listing belongs to an account now (2026-09-03), so the next step
       is always the dashboard: the upgrades pitch Jacob wrote, and a button */
    const manage =
      `<p style="margin:22px 0 10px;font-size:.95rem;font-weight:600">Add Upgrade With A Trust Badge, Lock Your Position, or Dominate With A Banner.</p>` +
      `<p style="margin:0">${button(`${SITE}/portal#listings`, "Add Upgrades")}</p>`;

    const inner = approved
      ? kicker("Listing approved") +
        `<h1 style="margin:0 0 12px;font-size:1.25rem">You Are Live For “${esc(kwShown)}”</h1>` +
        `<p style="margin:0 0 16px;font-size:.92rem">People searching for this Circuits-Keyword™ can now find ${esc(app.company)} and send you messages.</p>` +
        `<p style="margin:0">${button(listingUrl, "See Your Listing")}</p>` + manage
      : kicker("Listing not approved") +
        `<h1 style="margin:0 0 12px;font-size:1.25rem">We could not approve “${esc(kwShown)}”</h1>` +
        (reason ? quoteBlock(reason)
                : `<p style="margin:0 0 16px;font-size:.92rem">Your request for this Circuits-Keyword™ was not approved.</p>`) +
        button(`${SITE}/contact`, "Talk to us") +
        note("Reply to this email if you think this is a mistake. We would rather fix it than lose you.");

    const sent = await send(to, approved
      ? `Your Circuits.com listing for “${kwShown}” is live`
      : `About your Circuits.com listing for “${kwShown}”`, shell(inner));
    return json({ ok: sent });
  }

  /* ---------- staff approved a claim, but no login exists yet ----------
     Ends the dead-end where a claimant with no account left staff hand-creating
     users in the Supabase dashboard. Supabase Auth sends the invitation itself
     (its built-in mailer, not Resend), the person sets a password at /reset via
     the link, and the listing is attached to the new login here, immediately,
     so by the time they finish, the portal is already theirs. */
  if (kind === "claim-invite") {
    const claimId = String(payload.claim_id ?? "");
    if (!claimId) return json({ error: "claim_id required" }, 400);

    const user = await caller(db, req);
    if (!user) return json({ ok: false, error: "sign_in_required" }, 401);
    if (!(await isStaff(db, user))) return json({ ok: false, error: "staff_only" }, 403);

    const { data: claim } = await db.from("claims")
      .select("id, company_slug, email, status").eq("id", claimId).maybeSingle();
    if (!claim) return json({ ok: false, error: "no_such_claim" }, 404);

    const to = validEmail(claim.email);
    if (!to) return json({ ok: false, error: "bad_email" }, 200);

    /* Attach if the login appeared in the meantime; otherwise invite, then
       attach the fresh user. attach_user_by_email is service-role only. */
    let { data: attached } = await db.rpc("attach_user_by_email",
      { p_slug: claim.company_slug, p_email: to });

    let invited = false;
    if (attached === "no-account") {
      const { error: invErr } = await db.auth.admin.inviteUserByEmail(to, {
        redirectTo: `${SITE}/reset`
      });
      if (invErr && !/already/i.test(invErr.message ?? "")) {
        console.error("invite failed", invErr.message);
        return json({ ok: false, error: "invite_failed" }, 502);
      }
      invited = !invErr;
      const again = await db.rpc("attach_user_by_email",
        { p_slug: claim.company_slug, p_email: to });
      attached = again.data;
    }

    if (attached !== "attached") return json({ ok: false, error: "attach_failed" }, 502);
    return json({ ok: true, invited });
  }

  /* ---------- someone applied to a job (MVP2) ----------
     The application row already exists (the database only lets the applicant
     insert it, and only on a live job); this just tells the employer, with a
     link to the applicant's public profile. Contact details come from the
     portal's Applicants list, not from this mail. */
  if (kind === "job-apply") {
    const jobId = String(payload.job_id ?? "");
    if (!jobId) return json({ error: "job_id required" }, 400);

    const user = await caller(db, req);
    if (!user) return json({ ok: false, error: "sign_in_required" }, 401);

    const { data: app } = await db.from("job_applications")
      .select("id, note").eq("job_id", jobId).eq("user_id", user.id).maybeSingle();
    if (!app) return json({ ok: false, error: "not_applied" }, 403);

    const { data: job } = await db.from("jobs")
      .select("title, apply_email, company_slug").eq("id", jobId).maybeSingle();
    if (!job) return json({ ok: false, error: "no_such_job" }, 404);
    const { data: co } = await db.from("companies").select("name, email").eq("slug", job.company_slug).maybeSingle();
    const to = validEmail(job.apply_email) || validEmail(co?.email);
    if (!to) return json({ ok: false, error: "employer_has_no_email" }, 200);

    const { data: me } = await db.from("profiles")
      .select("handle, display_name, title, years").eq("user_id", user.id).maybeSingle();
    const who = esc(me?.display_name || me?.handle || "Someone");
    const line = [me?.title, me?.years != null ? `${me.years} years of experience` : ""].filter(Boolean).map(esc).join(", ");
    const noteText = String(app.note ?? "").slice(0, 2000);

    const sent = await send(to, `New applicant for ${job.title} via Circuits.com`, shell(
      kicker("New applicant") +
      `<h1 style="margin:0 0 10px;font-size:1.25rem">${who} applied for ${esc(job.title)}</h1>` +
      (line ? `<p style="margin:0 0 14px;font-size:.92rem;color:#5f6368">${line}</p>` : "") +
      (noteText ? quoteBlock(noteText) : "") +
      (me?.handle ? button(`${SITE}/${encodeURIComponent(me.handle)}`, "See their profile") : "") +
      note(`Their contact details and resume are under New Applicants on that post, under Your Listings on your <a href="${SITE}/portal" style="color:#3f6300">dashboard</a>.`)
    ));
    return json({ ok: sent });
  }

  return json({ error: "unknown kind" }, 400);
});
