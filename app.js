'use strict';
const SUPABASE_URL = 'https://pxyopsongbyumjqmgkfo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_G-ILu1bWvsPRKZVCri4p1w_ndUTdhSB'; // browser-safe publishable key only
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const TYPES = { mobile_money_fraud: 'Mobile Money fraud', bank_card_fraud: 'Bank/Card fraud', crypto_payment_scam: 'Crypto/Payment scam', fake_online_merchant: 'Fake online merchant', account_payment_fraud: 'Account/Payment fraud', recovery_scam: 'Recovery scam', other: 'Other' };
const STATUS = { submitted: 'Submitted', triage: 'Triage', evidence: 'Evidence needed', guidance_ready: 'Guidance ready', reported: 'Reported', monitoring: 'Monitoring', resolved: 'Resolved', closed: 'Closed' };
const URG = { low: '○ Low', normal: '◐ Normal', high: '▲ High', critical: '⚠ Critical' };
const OKMIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv'];
const MAXB = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, c) => { if (n == null) return 'Not stated'; try { return new Intl.NumberFormat('en-GH', { style: 'currency', currency: c }).format(n); } catch { return `${n} ${c}`; } };
const dt = (s) => s ? new Date(s).toLocaleString('en-GH', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const dOnly = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-GH', { dateStyle: 'medium' }) : 'Not stated';
const app = $('app');
let session = null, flash = null, pendingRid = null, busy = false;

const say = (type, text) => `<div class="msg ${type}" role="${type === 'err' ? 'alert' : 'status'}">${esc(text)}</div>`;
function friendly(e) {
  const m = String((e && e.message) || e || '');
  if (/not_authenticated|JWT|expired/i.test(m)) return 'Your session has expired. Please sign in again.';
  if (/invalid_description/.test(m)) return 'Please describe what happened in at least 20 characters.';
  if (/invalid_amount/.test(m)) return 'Please enter a valid loss amount (zero or more).';
  if (/invalid_date/.test(m)) return 'Please enter a valid incident date that is not in the future.';
  if (/invalid_reference/.test(m)) return 'The transaction reference has unsupported characters. Use letters, numbers and . _ : / # @ - only.';
  if (/invalid_incident_type|invalid_currency|invalid_platform|invalid_payment/.test(m)) return 'Please check the incident details and try again.';
  if (/fetch|network/i.test(m)) return 'Network problem. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}
function logErr(ctx, e) { console.error(ctx, e && e.message ? e.message : e); }

/* ---------- navigation / session ---------- */
function renderNav() {
  $('nav').innerHTML = session
    ? '<a class="btn sec" href="#/report">Report a loss</a><a class="btn sec" href="#/cases">My cases</a><button class="sec" data-act="signout">Sign out</button>'
    : '<a class="btn sec" href="#/privacy">Privacy</a><button data-act="signin">Sign in</button>';
}
sb.auth.onAuthStateChange((event, s) => {
  session = s;
  setTimeout(() => {
    renderNav();
    if (event === 'PASSWORD_RECOVERY') { location.hash = '#/reset'; return; }
    if (event === 'SIGNED_OUT') { pendingRid = null; if (/^#\/(report|cases|case\/)/.test(location.hash)) location.hash = '#/'; }
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') route();
  }, 0);
});

/* ---------- auth dialog ---------- */
let mode = 'signin';
const dlg = $('authDlg');
function setMode(m) {
  mode = m;
  document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === m)));
  $('nameWrap').hidden = m !== 'signup';
  $('pwWrap').hidden = m === 'forgot';
  $('password').autocomplete = m === 'signup' ? 'new-password' : 'current-password';
  $('authSubmit').textContent = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link' }[m];
  $('forgotBtn').hidden = m !== 'signin';
  $('authMsg').innerHTML = '';
}
function openAuth(m) { setMode(m || 'signin'); if (!dlg.open) dlg.showModal(); $('email').focus(); }
$('authClose').onclick = () => dlg.close();
$('forgotBtn').onclick = () => setMode('forgot');
document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => setMode(b.dataset.tab)));
$('authForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (busy) return;
  const email = $('email').value.trim(), password = $('password').value, name = $('fullName').value.trim();
  const out = $('authMsg');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.innerHTML = say('err', 'Please enter a valid email address.'); return; }
  if (mode !== 'forgot' && password.length < 8) { out.innerHTML = say('err', 'Password must be at least 8 characters.'); return; }
  if (mode === 'signup' && name.length < 2) { out.innerHTML = say('err', 'Please enter your full name.'); return; }
  busy = true; $('authSubmit').disabled = true; out.innerHTML = say('ok', 'Please wait…');
  try {
    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { out.innerHTML = say('err', /not confirmed/i.test(error.message) ? 'Please confirm your email address first. Check your inbox.' : 'Incorrect email or password.'); }
      else { dlg.close(); $('authForm').reset(); }
    } else if (mode === 'signup') {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin + '/' } });
      if (error) out.innerHTML = say('err', /password/i.test(error.message) ? 'That password is too weak. Try a longer one.' : 'We could not create the account. Please try again.');
      else if (!data.session) { out.innerHTML = say('ok', 'Account created. Check your email to confirm your address.'); $('authForm').reset(); }
      else { dlg.close(); $('authForm').reset(); }
    } else {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/' });
      out.innerHTML = say('ok', 'If an account exists for that email, a reset link has been sent.');
    }
  } catch (e) { logErr('auth', e); out.innerHTML = say('err', friendly(e)); }
  finally { busy = false; $('authSubmit').disabled = false; }
});

/* ---------- views ---------- */
const Views = {
  home() {
    app.innerHTML = `<div class="card"><p class="muted"><strong>ONLINE LOSS &amp; RECOVERY GUIDANCE</strong></p><h1>Lost money or digital assets online? Start with the facts.</h1>
<p>Document what happened. Understand your legitimate recovery and reporting options. Avoid recovery scams and preserve the evidence that may matter.</p>
<p><a class="btn" href="#/report">Report a loss →</a> <a class="btn sec" href="#/cases">Track my case</a></p></div>
<div class="warn"><strong>Recovery scam warning:</strong> never pay anyone who says they can recover your money, and never share passwords, OTPs, seed phrases, private keys or remote-access credentials with anyone, including us.</div>
<div class="card"><h2>What we do and do not do</h2><ul><li>We help you record the incident, store evidence privately and see recommended next steps.</li><li>We do not guarantee recovery, give legal or financial advice, or access anyone's accounts or systems.</li></ul></div>`;
  },
  privacy() {
    app.innerHTML = `<div class="card"><h1>Privacy notice</h1>
<p><strong>What we collect:</strong> your name and email for your account, and the incident details and files you choose to submit.</p>
<p><strong>Why:</strong> to build your case, produce guidance and let you track it. Only you can see your cases and evidence.</p>
<p><strong>Evidence:</strong> files are stored privately and are opened only through short-lived links after we confirm you own the case.</p>
<p><strong>Never submit</strong> passwords, OTPs, recovery codes, seed phrases, private keys or remote-access credentials.</p>
<p><strong>Your data:</strong> to ask about or request changes to your data, email RecoveryPointe support at <a href="mailto:Godrarriyhwh@gmail.com">Godrarriyhwh@gmail.com</a>.</p></div>`;
  },
  reset() {
    app.innerHTML = `<div class="card"><h1>Set a new password</h1><div id="rmsg"></div><form id="rform" novalidate><label for="np">New password</label><input id="np" type="password" minlength="8" autocomplete="new-password"><p><button type="submit">Update password</button></p></form></div>`;
    $('rform').onsubmit = async (e) => {
      e.preventDefault();
      if (!session) { $('rmsg').innerHTML = say('err', 'This reset link has expired. Request a new one.'); return; }
      const pw = $('np').value;
      if (pw.length < 8) { $('rmsg').innerHTML = say('err', 'Password must be at least 8 characters.'); return; }
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) $('rmsg').innerHTML = say('err', 'We could not update your password. Please request a new link.');
      else { flash = ['ok', 'Password updated.']; location.hash = '#/cases'; }
    };
  },
  report() {
    if (!session) return needSignIn();
    if (!pendingRid) pendingRid = crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    app.innerHTML = `<div class="card"><h1>Report a loss</h1>
<div class="warn"><strong>NEVER upload or type</strong> passwords, OTPs, recovery codes, seed phrases, private keys or remote-access credentials.</div>
<div id="fmsg"></div>
<form id="rf" novalidate>
<label for="it">What happened?</label><select id="it" required><option value="">Select…</option>${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
<label for="ds">Describe the incident (min 20 characters)</label><textarea id="ds" rows="5" maxlength="5000" required></textarea>
<div class="row"><div><label for="am">Amount lost (optional)</label><input id="am" type="number" min="0" step="0.01" inputmode="decimal"></div>
<div><label for="cu">Currency</label><select id="cu"><option>GHS</option><option>USD</option><option>EUR</option><option>GBP</option></select></div></div>
<div class="row"><div><label for="dd">Date of incident (optional)</label><input id="dd" type="date" max="${today}"></div>
<div><label for="pm">Payment method (optional)</label><input id="pm" maxlength="100" placeholder="e.g. Mobile Money, card, bank transfer"></div></div>
<div class="row"><div><label for="pe">Platform / provider / person involved (optional)</label><input id="pe" maxlength="200"></div>
<div><label for="tr">Transaction reference (optional)</label><input id="tr" maxlength="200"></div></div>
<label for="ev">Evidence (optional) — PDF, PNG, JPEG, WebP, TXT or CSV, up to 10 MB each</label><input id="ev" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv">
<p><button type="submit" id="sbtn">Submit report</button></p></form></div>`;
    $('rf').onsubmit = submitCase;
  },
  async cases() {
    if (!session) return needSignIn();
    app.innerHTML = '<h1>My cases</h1><p>Loading your cases…</p>';
    const { data, error } = await sb.from('cases').select('id,case_number,incident_type,incident_date,created_at,status,urgency,loss_amount,currency,assessment_summary').order('created_at', { ascending: false });
    const f = flash ? say(flash[0], flash[1]) : ''; flash = null;
    if (error) { logErr('cases', error); app.innerHTML = `<h1>My cases</h1>${f}${say('err', 'We could not load your cases. Please try again.')}<button data-act="reload">Retry</button>`; return; }
    if (!data.length) { app.innerHTML = `<h1>My cases</h1>${f}<div class="card"><p>You have no cases yet.</p><a class="btn" href="#/report">Report a loss</a></div>`; return; }
    app.innerHTML = `<h1>My cases</h1>${f}` + data.map((c) => `<a class="card case" href="#/case/${esc(c.id)}"><strong>${esc(c.case_number)}</strong> <span class="badge">${esc(STATUS[c.status] || c.status)}</span><span class="badge u-${esc(c.urgency)}">${esc(URG[c.urgency] || c.urgency)}</span>
<div>${esc(TYPES[c.incident_type] || c.incident_type)} · ${esc(c.incident_date ? dOnly(c.incident_date) : dt(c.created_at))} · ${esc(money(c.loss_amount, c.currency))}</div><div class="muted">${esc(c.assessment_summary)}</div></a>`).join('');
  },
  async case(id) {
    if (!session) return needSignIn();
    if (!UUID.test(id)) { app.innerHTML = `<div class="card">${say('err', 'We could not find that case.')}<a class="btn" href="#/cases">Back to My cases</a></div>`; return; }
    app.innerHTML = '<p>Loading case…</p>';
    const [c, ev, fl] = await Promise.all([
      sb.from('cases').select('*').eq('id', id).maybeSingle(),
      sb.from('case_events').select('id,event_type,title,description,created_at').eq('case_id', id).order('created_at', { ascending: true }),
      sb.from('case_evidence').select('id,storage_path,file_name,content_type,size_bytes,created_at').eq('case_id', id).order('created_at', { ascending: false })]);
    if (c.error || ev.error || fl.error) { logErr('case', c.error || ev.error || fl.error); app.innerHTML = `<div class="card">${say('err', 'We could not load this case. Please try again.')}<button data-act="reload">Retry</button></div>`; return; }
    if (!c.data) { app.innerHTML = `<div class="card">${say('err', 'We could not find that case.')}<a class="btn" href="#/cases">Back to My cases</a></div>`; return; }
    const k = c.data, plan = Array.isArray(k.recommended_action_plan) ? k.recommended_action_plan : [];
    app.innerHTML = `<p><a href="#/cases">← My cases</a></p><div id="cmsg"></div>
<div class="card"><h1>${esc(k.case_number)}</h1><span class="badge">${esc(STATUS[k.status] || k.status)}</span><span class="badge u-${esc(k.urgency)}">${esc(URG[k.urgency] || k.urgency)}</span>
<p>${esc(TYPES[k.incident_type] || k.incident_type)} · Submitted ${esc(dt(k.created_at))}</p>
<p class="muted">Incident date: ${esc(dOnly(k.incident_date))} · Provider/entity: ${esc(k.platform_entity || 'Not stated')} · Payment method: ${esc(k.payment_method || 'Not stated')} · Reference: ${esc(k.transaction_reference || 'Not stated')} · Amount: ${esc(money(k.loss_amount, k.currency))}</p>
<p>${esc(k.incident_description)}</p></div>
<div class="card"><h2>Recovery guidance</h2><p>${esc(k.assessment_summary)}</p><ol class="plan">${plan.map((p) => `<li><strong>${esc(p.title)}</strong><br>${esc(p.detail)}</li>`).join('')}</ol>
<p class="muted">Guidance only. Recovery is not guaranteed and depends on the circumstances. Confirm contact details through each organisation's official channels.</p></div>
<div class="card"><h2>Evidence</h2><div class="warn">Never upload passwords, OTPs, recovery codes, seed phrases, private keys or remote-access credentials.</div>
${fl.data.length ? '<ul>' + fl.data.map((f) => `<li>${esc(f.file_name)} <span class="muted">(${esc(Math.ceil((f.size_bytes || 0) / 1024))} KB · ${esc(dt(f.created_at))})</span> <button class="sec" data-act="view" data-path="${esc(f.storage_path)}">View</button> <button class="sec" data-act="del" data-id="${esc(f.id)}" data-path="${esc(f.storage_path)}" aria-label="Remove ${esc(f.file_name)}">Remove</button></li>`).join('') + '</ul>' : '<p>No evidence uploaded yet.</p>'}
<label for="more">Add evidence</label><input id="more" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"><p><button data-act="upload" data-case="${esc(k.id)}">Upload</button></p></div>
<div class="card"><h2>Add a report reference</h2><p class="muted">For example a reference number given to you by a provider.</p><label for="refn">Reference note</label><input id="refn" maxlength="500"><p><button data-act="ref" data-case="${esc(k.id)}">Add reference</button></p></div>
<div class="card"><h2>Activity</h2><ul class="tl">${ev.data.map((e) => `<li><strong>${esc(e.title)}</strong> <span class="muted">${esc(dt(e.created_at))}</span>${e.description ? '<br>' + esc(e.description) : ''}</li>`).join('')}</ul></div>`;
  }
};
function needSignIn() { app.innerHTML = `<div class="card"><h1>Please sign in</h1><p>Sign in to report a loss or view your cases.</p><button data-act="signin">Sign in or create account</button></div>`; }

/* ---------- evidence ---------- */
function checkFile(f) {
  if (!OKMIME.includes(f.type)) return `${f.name}: unsupported file type.`;
  if (f.size > MAXB) return `${f.name}: larger than 10 MB.`;
  if (f.size === 0) return `${f.name}: file is empty.`;
  return null;
}
async function uploadFiles(caseId, files) {
  const errs = []; let ok = 0;
  for (const f of files) {
    const bad = checkFile(f); if (bad) { errs.push(bad); continue; }
    const safe = f.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-100);
    const path = `${session.user.id}/${caseId}/${crypto.randomUUID()}-${safe}`;
    const up = await sb.storage.from('case-evidence').upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) { logErr('upload', up.error); errs.push(`${f.name}: upload failed.`); continue; }
    const row = await sb.from('case_evidence').insert({ case_id: caseId, user_id: session.user.id, storage_path: path, file_name: f.name.slice(0, 200), content_type: f.type, size_bytes: f.size });
    if (row.error) { logErr('evidence row', row.error); await sb.storage.from('case-evidence').remove([path]); errs.push(`${f.name}: could not be saved.`); continue; }
    ok++;
  }
  return { ok, errs };
}

/* ---------- submit case ---------- */
async function submitCase(ev) {
  ev.preventDefault();
  if (busy) return;
  const out = $('fmsg'), btn = $('sbtn');
  const type = $('it').value, desc = $('ds').value.trim(), amt = $('am').value, cur = $('cu').value, d = $('dd').value;
  const ref = $('tr').value.trim(), files = [...$('ev').files];
  const errs = [];
  if (!TYPES[type]) errs.push('Please choose what happened.');
  if (desc.length < 20) errs.push('Please describe the incident in at least 20 characters.');
  if (amt !== '' && !(Number(amt) >= 0)) errs.push('Amount must be zero or more.');
  if (d && d > new Date().toISOString().slice(0, 10)) errs.push('Incident date cannot be in the future.');
  if (ref && !/^[A-Za-z0-9._:/#@ -]{3,200}$/.test(ref)) errs.push('Transaction reference has unsupported characters.');
  files.forEach((f) => { const b = checkFile(f); if (b) errs.push(b); });
  if (errs.length) { out.innerHTML = say('err', errs.join(' ')); out.scrollIntoView(); return; }
  busy = true; btn.disabled = true; out.innerHTML = say('ok', 'Submitting your report…');
  try {
    const { data, error } = await sb.rpc('create_case', { p_incident_type: type, p_description: desc, p_loss_amount: amt === '' ? null : Number(amt), p_currency: cur, p_incident_date: d || null, p_platform_entity: $('pe').value.trim() || null, p_payment_method: $('pm').value.trim() || null, p_transaction_reference: ref || null, p_client_request_id: pendingRid });
    if (error) throw error;
    pendingRid = null;
    let note = `Your case has been created. Case number: ${data.case_number}.`;
    if (files.length) {
      out.innerHTML = say('ok', 'Uploading your evidence…');
      const r = await uploadFiles(data.id, files);
      note += r.ok ? ` ${r.ok} file(s) uploaded.` : '';
      if (r.errs.length) note += ' Some files were not uploaded: ' + r.errs.join(' ') + ' You can add them from the case page.';
    }
    flash = ['ok', note]; location.hash = '#/cases'; route();
  } catch (e) { logErr('submit', e); out.innerHTML = say('err', friendly(e)); out.scrollIntoView(); }
  finally { busy = false; if (btn.isConnected) btn.disabled = false; }
}

/* ---------- delegated actions ---------- */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const act = t.dataset.act, msg = () => $('cmsg') || { set innerHTML(v) { alert(v.replace(/<[^>]+>/g, '')); } };
  if (act === 'signin') openAuth('signin');
  else if (act === 'reload') route();
  else if (act === 'signout') { const { error } = await sb.auth.signOut(); if (error) logErr('signout', error); }
  else if (act === 'view') {
    const w = window.open('', '_blank'); // open inside the tap so iOS does not block it
    const { data, error } = await sb.storage.from('case-evidence').createSignedUrl(t.dataset.path, 60);
    if (error || !data) { if (w) w.close(); msg().innerHTML = say('err', 'We could not open that file. It may have been removed.'); return; }
    if (w) { w.opener = null; w.location.href = data.signedUrl; } else { location.href = data.signedUrl; }
  } else if (act === 'del') {
    if (!confirm('Remove this file from your case?')) return;
    t.disabled = true;
    const r = await sb.from('case_evidence').delete().eq('id', t.dataset.id);
    if (r.error) { t.disabled = false; msg().innerHTML = say('err', 'We could not remove the file. Please try again.'); return; }
    await sb.storage.from('case-evidence').remove([t.dataset.path]);
    route();
  } else if (act === 'upload') {
    const files = [...$('more').files]; if (!files.length) { msg().innerHTML = say('err', 'Choose at least one file.'); return; }
    t.disabled = true; msg().innerHTML = say('ok', 'Uploading your evidence…');
    const r = await uploadFiles(t.dataset.case, files);
    t.disabled = false;
    if (r.ok) { flash = null; await Views.case(t.dataset.case); $('cmsg').innerHTML = say(r.errs.length ? 'err' : 'ok', (r.ok ? `Your evidence was uploaded (${r.ok}). ` : '') + r.errs.join(' ')); }
    else msg().innerHTML = say('err', r.errs.join(' ') || 'Upload failed.');
  } else if (act === 'ref') {
    const note = $('refn').value.trim(); if (note.length < 3) { msg().innerHTML = say('err', 'Please enter a reference note.'); return; }
    t.disabled = true;
    const { error } = await sb.rpc('add_case_reference', { p_case_id: t.dataset.case, p_note: note });
    t.disabled = false;
    if (error) { logErr('ref', error); msg().innerHTML = say('err', friendly(error)); return; }
    await Views.case(t.dataset.case); $('cmsg').innerHTML = say('ok', 'Reference added.');
  }
});

/* ---------- router ---------- */
async function route() {
  const h = location.hash || '#/';
  try {
    if (h === '#/' || h === '') Views.home();
    else if (h === '#/privacy') Views.privacy();
    else if (h === '#/reset') Views.reset();
    else if (h === '#/report') Views.report();
    else if (h === '#/cases') await Views.cases();
    else if (h.startsWith('#/case/')) await Views.case(h.slice(7));
    else Views.home();
  } catch (e) { logErr('route', e); app.innerHTML = say('err', 'Something went wrong. Please try again.'); }
  app.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
(async () => {
  const { data } = await sb.auth.getSession();
  session = data.session; renderNav(); route();
})();
