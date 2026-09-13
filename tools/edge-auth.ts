import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/*  Circuits.com — sign-in / reset by username, WITHOUT exposing the email.

    Deployed as the `auth` edge function (Supabase project circuits-com). This
    copy is the record; deploy it with the Supabase MCP or CLI after editing.

    Replaces the public email_for_login RPC, which returned an account's email
    to anyone who knew a handle (a harvesting oracle). Here the handle->email
    resolution happens server-side with the service role and the address is
    never returned to the browser: for sign-in we perform the password grant
    here and hand back only the session tokens; for reset we trigger the
    recovery email here and always answer generically.

    verify_jwt is OFF on purpose: someone signing in has no token yet. The
    address is never taken from the request body as a destination, so this is
    not a relay. Failures are deliberately indistinguishable from a wrong
    password so the endpoint cannot be used to discover which usernames exist.

    v3 (2026-09-14): the page's Turnstile token (captchaToken) is forwarded
    to GoTrue as gotrue_meta_security.captcha_token, so username sign-in and
    username reset keep working once CAPTCHA is switched on in the Auth
    dashboard. Without a token the body is exactly what it was. */

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

const INVALID = { error: { message: "Invalid login credentials" } };

/* handle -> account email, service role. A person's handle resolves through
   profiles; a company's handle through the durable company_users link first
   (v2, 2026-09-02: it used to depend on a keyword listing still existing, so
   removing a company's last listing locked its owner out), then the listing. */
async function resolveEmail(db: any, identifier: string): Promise<string | null> {
  const id = (identifier ?? "").trim();
  if (!id) return null;
  if (id.includes("@")) return id.toLowerCase();
  const { data: p } = await db.from("profiles").select("email").ilike("handle", id).limit(1).maybeSingle();
  if (p?.email) return String(p.email).toLowerCase();
  const { data: owner } = await db.rpc("company_owner_email", { p_handle: id });
  if (owner) return String(owner).toLowerCase();
  const { data: c } = await db.from("companies").select("slug").ilike("handle", id).maybeSingle();
  if (c?.slug) {
    const { data: a } = await db.from("applications")
      .select("owner_email").eq("company_slug", c.slug).not("owner_email", "is", null).limit(1).maybeSingle();
    if (a?.owner_email) return String(a.owner_email).toLowerCase();
  }
  return null;
}

/* the CAPTCHA token, in the shape GoTrue reads it; nothing when the page sent none */
function security(payload: Record<string, unknown>): Record<string, unknown> {
  const t = typeof payload.captchaToken === "string" ? payload.captchaToken.trim() : "";
  return t ? { gotrue_meta_security: { captcha_token: t } } : {};
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }

  const action = String(payload.action ?? "");
  const identifier = String(payload.identifier ?? "");
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const email = await resolveEmail(db, identifier);

  /* ---------- sign in ---------- */
  if (action === "signin") {
    const password = String(payload.password ?? "");
    if (!email || !password) return json(INVALID, 400);
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY },
      body: JSON.stringify({ email, password, ...security(payload) })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.access_token) {
      return json({ session: { access_token: data.access_token, refresh_token: data.refresh_token } });
    }
    /* Pass through only the shape the client branches on (unconfirmed vs bad
       credentials vs a missing CAPTCHA); never the email or anything that
       confirms the account. */
    const code = String(data?.error_code ?? data?.error ?? "");
    const text = String(data?.msg ?? data?.error_description ?? "");
    const msg = /not.?confirm/i.test(code) || /not confirmed/i.test(text) ? "Email not confirmed"
      : /captcha/i.test(code + " " + text) ? "captcha verification process failed"
      : "Invalid login credentials";
    return json({ error: { message: msg } }, 200);
  }

  /* ---------- password reset ---------- */
  if (action === "reset") {
    if (email) {
      await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(SITE + "/reset")}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SERVICE_KEY },
        body: JSON.stringify({ email, ...security(payload) })
      }).catch(() => {});
    }
    /* Always the same answer — existence of the account stays hidden. */
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
