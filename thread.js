/* ===== Circuits.com, the buyer's side of a quote request ==================
   A buyer has no account, deliberately: asking someone to register before they
   can ask a question loses the question. The link they were emailed carries a
   token, and that token is the credential. It reaches a database function that
   returns exactly one thread, the tables themselves stay closed to anonymous
   readers, so a wrong or expired token gets nothing rather than somebody
   else's conversation.

   Before this page existed the conversation was one-way: a supplier could
   reply in their portal, the reply saved to a thread only they could read, and
   the buyer never heard anything. The notification email told suppliers to
   reply there. This is the other end of that promise.
   ========================================================================= */
(function(){
  'use strict';

  const root = document.getElementById('th-root');
  const token = new URLSearchParams(location.search).get('t') || '';

  const esc = s => (typeof escapeHtml === 'function' ? escapeHtml(s)
    : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])));

  function when(iso){
    if(!iso) return '';
    const d = new Date(iso);
    if(isNaN(d)) return '';
    return d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' })
         + ' at ' + d.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' });
  }

  function shellError(title, detail){
    root.innerHTML = '<div class="empty"><div class="big">' + esc(title) + '</div>'
      + '<p>' + esc(detail) + '</p>'
      + '<p><a class="btn btn-primary" href="/">Search the directory</a></p></div>';
  }

  function render(t){
    const msgs = Array.isArray(t.messages) ? t.messages : [];
    const rows = msgs.map(m => {
      const mine = m.author === 'buyer';
      return '<div class="th-msg ' + (mine ? 'th-mine' : 'th-theirs') + '">'
        + '<div class="th-who">' + (mine ? 'You' : esc(t.company)) + '<span>' + esc(when(m.created_at)) + '</span></div>'
        + '<p>' + esc(m.body) + '</p></div>';
    }).join('');

    root.innerHTML =
      '<div class="th-head">'
      + '<h1>Your quote request</h1>'
      + '<p class="th-sub">Sent to '
      + (t.company_handle
          ? '<a href="/' + esc(t.company_handle) + '">' + esc(t.company) + '</a>'
          : esc(t.company))
      + ' on ' + esc(when(t.created_at)) + '</p>'
      + '</div>'

      + '<div class="th-card">'
      + '<div class="th-orig">'
      + '<div class="th-who">You<span>' + esc(when(t.created_at)) + '</span></div>'
      + ((t.part_number || t.quantity)
          ? '<p class="th-meta">'
            + (t.part_number ? 'Part ' + esc(t.part_number) : '')
            + (t.part_number && t.quantity ? ' · ' : '')
            + (t.quantity ? 'Qty ' + esc(t.quantity) : '')
            + '</p>'
          : '')
      + '<p>' + esc(t.body) + '</p>'
      + '</div>'
      + (rows || '<p class="th-waiting">No reply yet. We will email you the moment '
                 + esc(t.company) + ' answers.</p>')
      + '</div>'

      + (t.closed
          ? '<p class="th-waiting">This conversation is more than six months old and is now closed. '
            + 'Start a new request from ' + (t.company_handle
              ? '<a href="/' + esc(t.company_handle) + '">their profile</a>' : 'their profile') + '.</p>'
          : '<form class="th-form" id="th-form">'
            + '<label class="pt-lbl" for="th-body">Add to this conversation</label>'
            + '<textarea id="th-body" rows="4" maxlength="4000" placeholder="Answer '
            + esc(t.company) + '…"></textarea>'
            + '<div class="th-actions">'
            + '<button class="btn btn-primary" id="th-send" type="submit">Send</button>'
            + '<span class="field-hint" id="th-msg"></span>'
            + '</div></form>')

      + '<p class="field-hint th-foot">Anyone with this link can read and answer this conversation, '
      + 'so keep it to yourself. Circuits.com never charges buyers.</p>';

    const form = document.getElementById('th-form');
    if(form) form.addEventListener('submit', async e => {
      e.preventDefault();
      const box = document.getElementById('th-body');
      const note = document.getElementById('th-msg');
      const btn = document.getElementById('th-send');
      const body = (box.value || '').trim();
      if(!body){ note.style.color = '#b3261e'; note.textContent = 'Write something first.'; return; }

      btn.disabled = true; note.style.color = ''; note.textContent = 'Sending…';
      let res;
      try{ res = await postBuyerMessage(token, body); }
      catch(err){ res = 'failed'; }
      btn.disabled = false;

      if(res !== 'ok'){
        note.style.color = '#b3261e';
        note.textContent =
          res === 'rate-limited' ? 'That is a lot of messages at once. Try again shortly.'
        : res === 'closed'       ? 'This conversation is closed.'
        : res === 'empty'        ? 'Write something first.'
        : 'We could not send that just now. Please try again in a moment.';
        return;
      }
      box.value = '';
      note.style.color = '';
      note.textContent = 'Sent.';
      load();                       // redraw with the new message in place
    });
  }

  async function load(){
    if(!token){
      shellError('That link is not complete',
        'Open the link exactly as it appears in your email. It needs the code on the end.');
      return;
    }
    let t;
    try{
      t = await fetchThreadByToken(token);
    }catch(err){
      /* An outage must not read as "your request does not exist", the buyer
         would reasonably conclude it was never sent. */
      shellError('We could not load your request',
        'Something went wrong at our end. Your request is safe; please try this link again shortly.');
      return;
    }
    if(!t){
      shellError('We could not find that request',
        'This link may be old, or the company may no longer be listed. Check the link in your email.');
      return;
    }
    render(t);
  }

  load();
})();
