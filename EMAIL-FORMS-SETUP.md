# Email Forms Setup, How to Turn On the Contact & Get Listed Forms

Both the **Contact** form (`contact.html`) and the **Get Listed** form (`join.html`)
send their submissions to the founders by email using [FormSubmit.co](https://formsubmit.co).
FormSubmit is free and needs **no API key**, but each recipient address must be
**activated once** before any email will actually be delivered. Until that one-time
activation is done, the form appears to work (it shows the success message) but **no
email arrives**. That is almost always why "the form still isn't working."

## The one thing that's probably wrong

Email goes to **both** of these addresses (set in `app.js`):

- `mike@circuits.com`
- `john@circuits.com`

**Each address must be activated separately.** If only one is activated, the other
silently drops every message. Do the steps below for **both** inboxes.

## Step-by-step: activate the forms (do this once)

1. **Submit a form to trigger the activation email.**
   Open the live site, go to **Contact**, fill it in, and hit *Send*. (The Get Listed
   form works too, either one triggers it.) FormSubmit sends an activation email the
   first time it sees a new recipient address.

2. **Open the `mike@circuits.com` inbox.** Look for an email from
   **FormSubmit** with a subject like *"Confirm your email"* / *"Activate Your Form"*.
   **Check the Spam/Junk folder**, it very often lands there.

3. **Click the button in that email** (labeled *"Activate Form"* / *"Confirm"*).
   A confirmation page opens saying the form is active. That's it for this address.

4. **Repeat steps 2–3 for `john@circuits.com`.** This is the step that's easy to
   miss. Both mailboxes get their own separate activation email and both must be
   confirmed.

5. **Test.** Submit the Contact form again and confirm the message lands in both
   inboxes. Do the same for the Get Listed form.

Once both addresses are confirmed, activation is permanent, you never repeat this
unless you change the recipient addresses.

## Troubleshooting

- **Success message shows but no email arrives** → the recipient address isn't
  activated yet. Re-do the steps above and check spam.
- **One founder gets email, the other doesn't** → only one address was activated.
  Activate the other one.
- **The activation email never showed up** → the mailbox may not exist or isn't
  being checked. The address must be a real, accessible inbox. Confirm you can log
  into `mike@circuits.com` and `john@circuits.com`.
- **Applicant confirmation ("thanks for your message") isn't sent** → that
  auto-reply only goes out from an *activated* endpoint, so it's the same fix:
  activate both addresses.
- **Still nothing after activation** → open the browser dev console (F12) on the
  form page, submit, and look for a line beginning `Email to … NOT delivered:`, the
  message after it is FormSubmit's own error and tells you exactly what it rejected.

## Where this lives in the code (for developers)

- File: **`app.js`**, function **`sendFounderEmail(...)`** (top of the file).
- Recipient list: the **`FOUNDER_EMAILS`** array. To change who receives form
  submissions, edit that array, then remember that **any new address must be
  activated once** using the same steps above.
- Endpoint used: `https://formsubmit.co/ajax/<recipient-email>` (AJAX/JSON mode).
- Contact form wiring: inline `<script>` at the bottom of `contact.html`.
- Get Listed form wiring: the join-form submit handler in `app.js`
  (search for `sendFounderEmail('New Listing Application`).

There is no separate "senders form" toggle to switch on, **FormSubmit activation
is the entire on/off mechanism.** Activate both addresses and the forms are live.
