// =====================================================
// APP.JS — All the functionality of Shanju Media Ops
//
// HOW THIS FILE IS ORGANISED:
//   1. Setup & state
//   2. Sync / toast helpers
//   3. Database functions (load, insert, update, delete)
//   4. Navigation
//   5. Dashboard
//   6. My Tasks
//   7. All Tasks
//   8. Kanban Board
//   9. Team View
//  10. Shoot Calendar
//  11. Post Calendar
//  12. Pipeline
//  13. Payments
//  14. Invoices
//  15. Modal save functions
//  16. Realtime + init
// =====================================================


// ---- 1. SETUP & STATE ----
// SUPABASE_URL and SUPABASE_KEY come from config.js (loaded first)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let tasks = [], shoots = [], posts = [], pipeline = [], payments = [], invoices = [];
let currentUser = 'Shanju';
let currentProfile = null; // { id, name, role }  — set after login
let shootCalMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let postCalMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

// Team colours, roles, emojis — edit these to add/remove team members
const PAL     = { Shanju:'#f5f3ff', Bharath:'#dbeafe', Minhaaj:'#d1fae5', Gowtham:'#fef3c7', Bava:'#fce7f3' };
const PALTEXT = { Shanju:'#6d28d9', Bharath:'#1e40af', Minhaaj:'#065f46', Gowtham:'#92400e', Bava:'#9d174d' };
const ROLES   = { Shanju:'Founder & CEO', Bharath:'Chief Editor / QC', Minhaaj:'Editor', Gowtham:'Videographer & Editor', Bava:'Post Production Head' };
const EMOJIS  = { Shanju:'👑', Bharath:'🎬', Minhaaj:'✂️', Gowtham:'📸', Bava:'📦' };
const INITS   = { Shanju:'SJ', Bharath:'BH', Minhaaj:'MH', Gowtham:'GW', Bava:'BV' };


// ---- 2. SYNC STATUS & TOAST ----
function setSyncing() { document.getElementById('sync-dot').className = 'sync-dot syncing'; document.getElementById('sync-label').textContent = 'Saving...'; }
function setSynced()  { document.getElementById('sync-dot').className = 'sync-dot'; document.getElementById('sync-label').textContent = 'Synced'; }
function setSyncError(){ document.getElementById('sync-dot').className = 'sync-dot error'; document.getElementById('sync-label').textContent = 'Sync error'; }

function toast(msg, dur = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}


// ---- 3. DATABASE FUNCTIONS ----
async function loadAll() {
  try {
    const queries = [
      sb.from('tasks').select('*').order('created_at', { ascending: false }),
      sb.from('shoots').select('*').order('date'),
      sb.from('posts').select('*').order('date'),
      sb.from('pipeline').select('*'),
      sb.from('payments').select('*').order('created_at', { ascending: false }),
      sb.from('invoices').select('*').order('created_at', { ascending: false }),
    ];
    const [t, s, p, pl, pay, inv] = await Promise.all(queries);
    tasks = t.data || []; shoots = s.data || []; posts = p.data || [];
    pipeline = pl.data || []; payments = pay.data || []; invoices = inv.data || [];

    await loadPendingUsers(); // owner only — no-op for others

    setSynced();
    renderPage(document.querySelector('.page.active')?.id.replace('page-', ''));
    updatePayNotif();
  } catch (e) {
    setSyncError();
    console.error(e);
  }
}

async function dbInsert(table, row) {
  setSyncing();
  const { data, error } = await sb.from(table).insert([row]).select();
  if (error) { setSyncError(); toast('Save failed: ' + error.message); return null; }
  setSynced(); toast('Saved!');
  return data[0];
}

async function dbUpdate(table, id, row) {
  setSyncing();
  const { error } = await sb.from(table).update(row).eq('id', id);
  if (error) { setSyncError(); toast('Update failed: ' + error.message); return false; }
  setSynced(); return true;
}

async function dbDelete(table, id) {
  setSyncing();
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { setSyncError(); toast('Delete failed: ' + error.message); return false; }
  setSynced(); toast('Deleted.'); return true;
}


// ---- 4. NAVIGATION ----
function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (el) el.classList.add('active');
  renderPage(id);
}

function renderPage(id) {
  if (!id) return;
  if (id === 'dashboard') renderDash();
  else if (id === 'my-tasks')  renderMyTasks();
  else if (id === 'all-tasks') renderAllTasks();
  else if (id === 'kanban')    renderKanban();
  else if (id === 'team')      renderTeam();
  else if (id === 'shoot-cal') renderShootCal();
  else if (id === 'post-cal')  renderPostCal();
  else if (id === 'pipeline')  renderPipeline();
  else if (id === 'payments')  renderPayments();
  else if (id === 'invoices')  renderInvoices();
}

function switchUser() {
  currentUser = document.getElementById('current-user').value;
  renderPage(document.querySelector('.page.active')?.id.replace('page-', ''));
}


// ---- HELPER FUNCTIONS ----
function daysDiff(d) { if (!d) return 9999; const t = new Date(d); t.setHours(0,0,0,0); return Math.round((t - TODAY) / 86400000); }
function fmt(d)      { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function fmtMoney(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }

function avBadge(n) {
  return `<span style="display:inline-flex;align-items:center;gap:5px;">
    <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:${PAL[n]||'#ede9fe'};color:${PALTEXT[n]||'#6d28d9'};">${INITS[n] || n[0]}</span>${n}
  </span>`;
}

function statusPill(s) {
  const m = { 'In progress':'pill-info', 'Not started':'pill-neutral', 'Waiting for review':'pill-warning', 'Waiting for input':'pill-warning', 'Changes needed':'pill-warning', 'Approved':'pill-success', 'Delayed':'pill-danger', 'Posted':'pill-success', 'Scheduled':'pill-success' };
  return `<span class="pill ${m[s] || 'pill-neutral'}">${s}</span>`;
}

function priPill(p) {
  const m = { High: 'pill-danger', Medium: 'pill-warning', Low: 'pill-success' };
  return `<span class="pill ${m[p] || 'pill-neutral'}">${p}</span>`;
}

function ddPill(d) {
  const diff = daysDiff(d);
  if (!d) return '—';
  if (diff < 0)  return `<span class="pill pill-danger">Overdue ${Math.abs(diff)}d</span>`;
  if (diff === 0) return `<span class="pill pill-warning">Today</span>`;
  if (diff === 1) return `<span class="pill pill-warning">Tomorrow</span>`;
  return `<span style="font-size:12px;color:var(--muted);">${fmt(d)}</span>`;
}


// ---- 5. AUTH ----

// Role permissions:
//   owner  (Shanju) → everything including Finance
//   admin  (Bava)   → everything EXCEPT Finance
//   editor (others) → Dashboard + My Tasks only

async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await loadProfile(session.user);
  }
  // Listen for future sign-in / sign-out events
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN')  await loadProfile(session.user);
    if (event === 'SIGNED_OUT') showLoginScreen();
  });
}

async function loadProfile(user) {
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (error || !profile) {
    showLoginError('Profile not found. Ask Shanju to create your account.');
    await sb.auth.signOut();
    return;
  }

  // Account not yet approved — show waiting screen
  if (profile.status === 'pending') {
    showPendingScreen();
    return;
  }

  currentProfile = profile;
  currentUser    = profile.name;

  // Update sidebar user info
  document.getElementById('auth-user-name').textContent = profile.name;
  document.getElementById('auth-user-role').textContent = profile.role;

  // Show view-as switcher only for owner
  if (profile.role === 'owner') {
    document.getElementById('user-switcher-wrap').style.display = 'block';
    document.getElementById('current-user').value = profile.name;
  }

  // Hide nav sections based on role
  if (profile.role !== 'owner') {
    document.querySelectorAll('[data-section="finance"]').forEach(el => el.style.display = 'none');
  }
  if (profile.role === 'editor') {
    document.querySelectorAll('[data-section="work"], [data-section="planning"]').forEach(el => el.style.display = 'none');
  }

  // Set today's date in all date fields
  const todayStr = new Date().toISOString().split('T')[0];
  ['t-deadline','sh-date','po-date','pay-due','inv-date','inv-due'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = todayStr;
  });

  showApp();
  loadAll();
  setupRealtime();
}

function showLoginScreen() {
  currentProfile = null;
  document.getElementById('login-screen').style.display   = 'flex';
  document.getElementById('pending-screen').style.display = 'none';
  document.getElementById('app-shell').style.display      = 'none';
}

function showPendingScreen() {
  document.getElementById('login-screen').style.display   = 'none';
  document.getElementById('pending-screen').style.display = 'flex';
  document.getElementById('app-shell').style.display      = 'none';
}

function showApp() {
  document.getElementById('login-screen').style.display   = 'none';
  document.getElementById('pending-screen').style.display = 'none';
  document.getElementById('app-shell').style.display      = 'flex';
}

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent    = msg;
  el.style.display  = 'block';
}

async function doLogin() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) { errEl.textContent = 'Email and password are required.'; errEl.style.display = 'block'; return; }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; }
}

async function doSignup() {
  const name     = document.getElementById('signup-name').value;
  const role     = document.getElementById('signup-role-select').value;
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl    = document.getElementById('signup-error');
  errEl.style.display = 'none';

  if (!name)            { errEl.textContent = 'Please enter your name.'; errEl.style.display = 'block'; return; }
  if (!email || !password) { errEl.textContent = 'All fields are required.'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }

  // Pass name + role as metadata — DB trigger creates the profile (status = pending)
  const { error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  });
  if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; return; }

  toast('Request sent! Waiting for Shanju to approve your account.');
  switchLoginTab('login');
}

// ---- APPROVAL FUNCTIONS (owner only) ----
let pendingUsers = [];

async function loadPendingUsers() {
  if (currentProfile?.role !== 'owner') return;
  const { data } = await sb.from('profiles').select('*').eq('status', 'pending');
  pendingUsers = data || [];
}

async function approveUser(id) {
  await dbUpdate('profiles', id, { status: 'approved' });
  pendingUsers = pendingUsers.filter(u => u.id !== id);
  toast('User approved!');
  renderDash();
}

async function rejectUser(id) {
  if (!confirm('Remove this access request?')) return;
  await dbDelete('profiles', id);
  pendingUsers = pendingUsers.filter(u => u.id !== id);
  renderDash();
}

function switchLoginTab(tab) {
  document.getElementById('login-form').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
  document.querySelectorAll('.login-tab').forEach((t, i) =>
    t.classList.toggle('active', i === (tab === 'login' ? 0 : 1))
  );
}

async function doLogout() {
  await sb.auth.signOut();
}


// ---- 6. DASHBOARD ----
function renderDash() {
  // Pending approvals card (owner only)
  const approvalCard = document.getElementById('pending-approvals-card');
  if (currentProfile?.role === 'owner' && pendingUsers.length > 0) {
    approvalCard.style.display = 'block';
    document.getElementById('pending-count').textContent = `${pendingUsers.length} pending`;
    document.getElementById('pending-approvals-list').innerHTML = pendingUsers.map(u => `
      <div class="alert-row">
        <div class="adot adot-yellow"></div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;">${u.name}</div>
          <div style="font-size:12px;color:var(--muted);">Requested role: <strong>${u.role}</strong></div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm btn-primary" onclick="approveUser('${u.id}')">✓ Approve</button>
          <button class="btn btn-sm btn-danger"  onclick="rejectUser('${u.id}')">✕ Reject</button>
        </div>
      </div>`).join('');
  } else {
    approvalCard.style.display = 'none';
  }

  document.getElementById('dash-title').textContent = currentUser === 'Shanju' ? 'Founder Dashboard' : `${currentUser}'s Dashboard`;
  document.getElementById('dash-sub').textContent   = currentUser === 'Shanju' ? 'Full company overview' : 'Your personal workspace';
  document.getElementById('focus-title').textContent = currentUser === 'Shanju' ? '🎯 Founder Focus Today' : '🎯 My Focus Today';

  const src    = currentUser === 'Shanju' ? tasks : tasks.filter(t => t.owner === currentUser);
  const active = src.filter(t => t.status !== 'Posted' && !t.done);
  const overdue   = active.filter(t => daysDiff(t.deadline) < 0);
  const dueToday  = active.filter(t => daysDiff(t.deadline) === 0);
  const review    = active.filter(t => t.status === 'Waiting for review');
  const pendingPay = payments.filter(p => p.status === 'Pending' || p.status === 'Partially Paid');

  let m = '';
  if (currentUser === 'Shanju') {
    const allA = tasks.filter(t => t.status !== 'Posted');
    m = `<div class="mcard purple"><div class="mcard-label">Active Tasks</div><div class="mcard-val">${allA.length}</div><div class="mcard-sub">All clients</div></div>
    <div class="mcard danger"><div class="mcard-label">Overdue</div><div class="mcard-val">${allA.filter(t => daysDiff(t.deadline) < 0).length}</div></div>
    <div class="mcard warning"><div class="mcard-label">Due Today</div><div class="mcard-val">${allA.filter(t => daysDiff(t.deadline) === 0).length}</div></div>
    <div class="mcard info"><div class="mcard-label">In Review</div><div class="mcard-val">${allA.filter(t => t.status === 'Waiting for review').length}</div></div>
    <div class="mcard danger"><div class="mcard-label">Pending Payments</div><div class="mcard-val">${pendingPay.length}</div><div class="mcard-sub">${fmtMoney(pendingPay.reduce((s, p) => s + Number(p.amount), 0))}</div></div>
    <div class="mcard success"><div class="mcard-label">Clients</div><div class="mcard-val">${[...new Set(tasks.map(t => t.client))].length}</div></div>`;
  } else {
    m = `<div class="mcard purple"><div class="mcard-label">My Tasks</div><div class="mcard-val">${active.length}</div></div>
    <div class="mcard danger"><div class="mcard-label">Overdue</div><div class="mcard-val">${overdue.length}</div></div>
    <div class="mcard warning"><div class="mcard-label">Due Today</div><div class="mcard-val">${dueToday.length}</div></div>
    <div class="mcard info"><div class="mcard-label">In Review</div><div class="mcard-val">${review.length}</div></div>`;
  }
  document.getElementById('dash-metrics').innerHTML = m;

  const urgent = (currentUser === 'Shanju' ? tasks : tasks.filter(t => t.owner === currentUser))
    .filter(t => daysDiff(t.deadline) <= 1 && t.status !== 'Posted').slice(0, 5);
  document.getElementById('dash-urgent').innerHTML = urgent.length
    ? urgent.map(t => {
        const d = daysDiff(t.deadline);
        return `<div class="alert-row"><div class="adot ${d < 0 ? 'adot-red' : d === 0 ? 'adot-yellow' : 'adot-blue'}"></div>
          <div><div style="font-size:13px;font-weight:600;">${t.client} — ${t.name}</div>
          <div style="font-size:12px;color:var(--muted);">Owner: ${t.owner} · ${t.status}</div>
          <div style="font-size:12px;color:#7c3aed;margin-top:2px;">→ ${t.next_step || ''}</div></div></div>`;
      }).join('')
    : `<div class="empty-state">No urgent items 🎉</div>`;

  const bn = [];
  const bQC = tasks.filter(t => t.owner === 'Bharath' && t.status === 'Waiting for review');
  if (bQC.length) bn.push({ dot: 'adot-red',    text: `Bharath QC backlog — ${bQC.length} tasks waiting.` });
  const bBava = tasks.filter(t => t.owner === 'Bava' && t.status === 'Not started');
  if (bBava.length) bn.push({ dot: 'adot-yellow', text: `Bava has ${bBava.length} unstarted tasks.` });
  if (!bn.length) bn.push({ dot: 'adot-green', text: 'No major bottlenecks. Operations running smoothly.' });
  document.getElementById('dash-bottlenecks').innerHTML = bn.map(b =>
    `<div class="alert-row"><div class="adot ${b.dot}"></div><div style="font-size:13px;">${b.text}</div></div>`
  ).join('');

  const focus = currentUser === 'Shanju'
    ? ['Approve storytelling direction for pending clients.', 'Review completed edits awaiting QC.', 'Chase any pending payments due this week.']
    : active.filter(t => t.priority === 'High').slice(0, 3).map(t => `Complete: ${t.client} — ${t.name}`);
  document.getElementById('dash-focus').innerHTML = focus.map(f =>
    `<div class="alert-row"><div class="adot adot-purple"></div><div style="font-size:13px;">${f}</div></div>`
  ).join('') || `<div class="empty-state">Nothing specific today.</div>`;

  if (currentUser === 'Shanju') {
    const members = ['Shanju', 'Bharath', 'Minhaaj', 'Gowtham', 'Bava'];
    document.getElementById('dash-workload').innerHTML = members.map(m => {
      const mt  = tasks.filter(t => t.owner === m && t.status !== 'Posted');
      const ov  = mt.filter(t => daysDiff(t.deadline) < 0).length;
      const pct = Math.min(100, mt.length * 20);
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">${avBadge(m)}
        <span style="color:var(--muted);">${mt.length} tasks${ov ? ` · <span style="color:var(--danger);">${ov} overdue</span>` : ''}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');
  } else {
    document.getElementById('dash-workload').innerHTML = '<div style="font-size:13px;color:var(--muted);">Switch to Shanju view for full team workload.</div>';
  }
}


// ---- 6. MY TASKS ----
function renderMyTasks() {
  document.getElementById('my-tasks-title').textContent = `${currentUser}'s Tasks`;
  const mine = tasks.filter(t => t.owner === currentUser && t.status !== 'Posted' && !t.done);
  const done  = tasks.filter(t => t.owner === currentUser && (t.done || t.status === 'Posted'));

  document.getElementById('my-task-body').innerHTML = mine.length
    ? mine.map(t => `<tr>
        <td style="font-weight:600;">${t.client}</td><td>${t.name}</td>
        <td><span style="font-size:11px;color:var(--muted);">${t.type || ''}</span></td>
        <td>${ddPill(t.deadline)}</td><td>${statusPill(t.status)}</td>
        <td style="font-size:11px;color:${t.blocker && t.blocker !== 'None' ? 'var(--warning)' : 'var(--muted)'};">${t.blocker || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${t.next_step || ''}</td>
        <td style="display:flex;gap:4px;">
          <button class="btn btn-sm" onclick="markDone('${t.id}')">✓ Done</button>
          ${currentProfile?.role === 'owner' ? `<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">✕</button>` : ''}
        </td>
      </tr>`).join('')
    : `<tr><td colspan="8" class="empty-state">No active tasks 🎉</td></tr>`;

  document.getElementById('my-done-body').innerHTML = done.map(t =>
    `<tr><td>${t.client}</td><td>${t.name}</td><td><span class="pill pill-success">Done</span></td></tr>`
  ).join('') || `<tr><td colspan="3" class="empty-state">None yet.</td></tr>`;
}

async function markDone(id) {
  await dbUpdate('tasks', id, { done: true, status: 'Posted' });
  tasks = tasks.map(t => t.id === id ? { ...t, done: true, status: 'Posted' } : t);
  renderMyTasks(); renderDash();
}


// ---- 7. ALL TASKS ----
function renderAllTasks() {
  const of = document.getElementById('at-owner').value;
  const sf = document.getElementById('at-status').value;
  const f  = tasks.filter(t => (!of || t.owner === of) && (!sf || t.status === sf));

  document.getElementById('all-task-body').innerHTML = f.length
    ? f.map(t => `<tr>
        <td style="font-weight:600;">${t.client}</td><td>${t.name}</td>
        <td><span style="font-size:11px;color:var(--muted);">${t.type || ''}</span></td>
        <td>${avBadge(t.owner)}</td><td>${ddPill(t.deadline)}</td>
        <td>${statusPill(t.status)}</td><td>${priPill(t.priority)}</td>
        <td style="font-size:11px;color:${t.blocker && t.blocker !== 'None' ? 'var(--warning)' : 'var(--muted)'};">${t.blocker || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${t.next_step || ''}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">✕</button></td>
      </tr>`).join('')
    : `<tr><td colspan="10" class="empty-state">No tasks match filters.</td></tr>`;
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await dbDelete('tasks', id);
  tasks = tasks.filter(t => t.id !== id);
  renderAllTasks();
}


// ---- 8. KANBAN ----
function renderKanban() {
  const cols = ['Not started', 'In progress', 'Waiting for review', 'Changes needed', 'Approved', 'Posted'];
  document.getElementById('kanban-board').innerHTML = cols.map(col => {
    const cards = tasks.filter(t => t.status === col);
    return `<div class="kanban-col">
      <div class="kanban-col-title">${col}<span class="kanban-count">${cards.length}</span></div>
      ${cards.map(t => `
        <div class="kanban-card">
          <div class="kanban-card-title">${t.name}</div>
          <div class="kanban-card-client">${t.client}</div>
          <div class="kanban-card-meta">${avBadge(t.owner)}${priPill(t.priority)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">${fmt(t.deadline)}</div>
        </div>`).join('') || '<div style="font-size:11px;color:var(--muted);text-align:center;padding:12px 0;">Empty</div>'}
    </div>`;
  }).join('');
}


// ---- 9. TEAM ----
function renderTeam() {
  const members = ['Shanju', 'Bharath', 'Minhaaj', 'Gowtham', 'Bava'];
  document.getElementById('person-grid').innerHTML = members.map(m => {
    const mt   = tasks.filter(t => t.owner === m && !t.done);
    const ov   = mt.filter(t => daysDiff(t.deadline) < 0).length;
    const done = tasks.filter(t => t.owner === m && (t.done || t.status === 'Posted')).length;
    return `<div class="person-card" onclick="showTeamDetail('${m}')">
      <div class="person-header">
        <div class="person-avatar" style="background:${PAL[m]};color:${PALTEXT[m]};">${EMOJIS[m]}</div>
        <div><div class="person-name">${m}</div><div class="person-role">${ROLES[m]}</div></div>
      </div>
      <div class="person-stats">
        <div class="pstat"><div class="pstat-val">${mt.length}</div><div class="pstat-label">Active</div></div>
        <div class="pstat"><div class="pstat-val" style="${ov ? 'color:var(--danger)' : ''}">${ov}</div><div class="pstat-label">Overdue</div></div>
        <div class="pstat"><div class="pstat-val" style="color:var(--success);">${done}</div><div class="pstat-label">Done</div></div>
        <div class="pstat"><div class="pstat-val">${mt.filter(t => t.priority === 'High').length}</div><div class="pstat-label">High Pri</div></div>
      </div></div>`;
  }).join('');
}

function showTeamDetail(m) {
  const card = document.getElementById('team-detail-card');
  card.style.display = 'block';
  document.getElementById('team-detail-name').textContent = `${EMOJIS[m]} ${m} — All Tasks`;
  const mt = tasks.filter(t => t.owner === m);
  document.getElementById('team-detail-body').innerHTML = mt.map(t =>
    `<tr><td style="font-weight:600;">${t.client}</td><td>${t.name}</td><td>${statusPill(t.status)}</td><td>${ddPill(t.deadline)}</td><td style="font-size:11px;color:var(--muted);">${t.next_step || ''}</td></tr>`
  ).join('') || `<tr><td colspan="5" class="empty-state">No tasks.</td></tr>`;
  card.scrollIntoView({ behavior: 'smooth' });
}


// ---- 10. SHOOT CALENDAR ----
function buildCal(calType, month, events, dotKeyFn) {
  const yr = month.getFullYear(), mo = month.getMonth();
  document.getElementById(calType + '-cal-title').textContent = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const firstDay    = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  let html = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr   = `${yr}-${String(mo + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvents = events.filter(e => (e.date || '').startsWith(dateStr));
    const isToday   = new Date(yr, mo, d).toDateString() === TODAY.toDateString();
    html += `<div class="cal-day${isToday ? ' today' : ''}">
      <div class="cal-day-num">${d}</div>
      <div class="cal-dots">${dayEvents.map(e => `<span class="cal-dot ${dotKeyFn(e)}"></span>`).join('')}</div>
      ${dayEvents.map(e => `<div class="cal-events">${e.client}</div>`).join('')}
    </div>`;
  }
  document.getElementById(calType + '-cal-grid').innerHTML = html;
}

function renderShootCal() {
  buildCal('shoot', shootCalMonth, shoots, e => e.type === 'meeting' ? 'meeting' : 'shoot');
  document.getElementById('shoot-list').innerHTML = shoots.length
    ? shoots.sort((a, b) => new Date(a.date) - new Date(b.date)).map(s => `
        <div class="alert-row">
          <div class="adot ${s.type === 'shoot' ? 'adot-purple' : 'adot-blue'}"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${s.client} — ${s.type === 'shoot' ? 'Shoot' : 'Meeting'}</div>
            <div style="font-size:12px;color:var(--muted);">${fmt(s.date)} · ${s.owner || ''} · ${s.notes || ''}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deleteShoot('${s.id}')">✕</button>
        </div>`).join('')
    : '<div class="empty-state">No shoots scheduled.</div>';
}

function renderPostCal() {
  buildCal('post', postCalMonth, posts, () => 'post');
  document.getElementById('post-list').innerHTML = posts.length
    ? posts.sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => `
        <div class="alert-row">
          <div class="adot adot-green"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${p.client} — ${p.content_type || ''}</div>
            <div style="font-size:12px;color:var(--muted);">${fmt(p.date)} · ${p.platform || ''} · Caption:
              <span style="color:${p.caption_status === 'Approved' ? 'var(--success)' : p.caption_status === 'Pending' ? 'var(--danger)' : 'var(--warning)'};">${p.caption_status || ''}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deletePost('${p.id}')">✕</button>
        </div>`).join('')
    : '<div class="empty-state">No posts scheduled.</div>';
}

function prevMonth(t) {
  if (t === 'shoot') { shootCalMonth = new Date(shootCalMonth.getFullYear(), shootCalMonth.getMonth() - 1, 1); renderShootCal(); }
  else               { postCalMonth  = new Date(postCalMonth.getFullYear(),  postCalMonth.getMonth()  - 1, 1); renderPostCal(); }
}
function nextMonth(t) {
  if (t === 'shoot') { shootCalMonth = new Date(shootCalMonth.getFullYear(), shootCalMonth.getMonth() + 1, 1); renderShootCal(); }
  else               { postCalMonth  = new Date(postCalMonth.getFullYear(),  postCalMonth.getMonth()  + 1, 1); renderPostCal(); }
}

async function deleteShoot(id) { await dbDelete('shoots', id); shoots = shoots.filter(s => s.id !== id); renderShootCal(); }
async function deletePost(id)  { await dbDelete('posts',  id); posts  = posts.filter(p  => p.id !== id); renderPostCal(); }


// ---- 12. PIPELINE ----
function renderPipeline() {
  document.getElementById('pipeline-body').innerHTML = pipeline.length
    ? pipeline.map(p => {
        const gaps = [];
        if (!p.shot) gaps.push('Shoot');
        else if (!p.edit)      gaps.push('Edit');
        else if (!p.qc)        gaps.push('QC');
        else if (!p.approved)  gaps.push('Approval');
        else if (!p.caption)   gaps.push('Caption');
        else if (!p.scheduled) gaps.push('Schedule');
        return `<tr>
          <td style="font-weight:700;">${p.client}</td><td>${p.planned || 0}</td>
          <td><input type="checkbox" ${p.shot      ? 'checked' : ''} onchange="togglePL('${p.id}','shot',this.checked)"></td>
          <td><input type="checkbox" ${p.edit      ? 'checked' : ''} onchange="togglePL('${p.id}','edit',this.checked)"></td>
          <td><input type="checkbox" ${p.qc        ? 'checked' : ''} onchange="togglePL('${p.id}','qc',this.checked)"></td>
          <td><input type="checkbox" ${p.approved  ? 'checked' : ''} onchange="togglePL('${p.id}','approved',this.checked)"></td>
          <td><input type="checkbox" ${p.caption   ? 'checked' : ''} onchange="togglePL('${p.id}','caption',this.checked)"></td>
          <td><input type="checkbox" ${p.scheduled ? 'checked' : ''} onchange="togglePL('${p.id}','scheduled',this.checked)"></td>
          <td>${p.posted || 0}</td>
          <td>${gaps.length ? `<span class="pill pill-danger">${gaps[0]}</span>` : `<span class="pill pill-success">Ready</span>`}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deletePL('${p.id}')">✕</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="11" class="empty-state">No clients in pipeline.</td></tr>`;
}

async function togglePL(id, key, val) {
  await dbUpdate('pipeline', id, { [key]: val });
  pipeline = pipeline.map(p => p.id === id ? { ...p, [key]: val } : p);
  renderPipeline();
}
async function deletePL(id) { await dbDelete('pipeline', id); pipeline = pipeline.filter(p => p.id !== id); renderPipeline(); }


// ---- 13. PAYMENTS ----
function updatePayNotif() {
  const n = payments.filter(p => p.status === 'Pending' || p.status === 'Partially Paid').length;
  document.getElementById('pay-notif').style.display = n ? 'inline-block' : 'none';
}

function renderPayments() {
  const pending  = payments.filter(p => p.status === 'Pending' || p.status === 'Partially Paid');
  const advances = payments.filter(p => p.status === 'Advance Received');
  const totalPending   = pending.reduce((s, p) => s + Number(p.amount), 0);
  const totalCollected = payments.filter(p => p.status === 'Paid').reduce((s, p) => s + Number(p.amount), 0);

  document.getElementById('pay-metrics').innerHTML = `
    <div class="mcard danger"><div class="mcard-label">Pending Amount</div><div class="mcard-val">${fmtMoney(totalPending)}</div><div class="mcard-sub">${pending.length} clients</div></div>
    <div class="mcard info"><div class="mcard-label">Advances Received</div><div class="mcard-val">${advances.length}</div><div class="mcard-sub">${fmtMoney(advances.reduce((s, p) => s + Number(p.amount), 0))}</div></div>
    <div class="mcard success"><div class="mcard-label">Total Collected</div><div class="mcard-val">${fmtMoney(totalCollected)}</div></div>
    <div class="mcard purple"><div class="mcard-label">Total Invoiced</div><div class="mcard-val">${fmtMoney(payments.reduce((s, p) => s + Number(p.amount), 0))}</div></div>`;

  const payBadge = s => {
    const m = { 'Paid':'pay-paid', 'Partially Paid':'pay-partial', 'Pending':'pay-pending', 'Advance Received':'pay-advance' };
    return `<span class="pay-badge ${m[s] || 'pay-pending'}">${s}</span>`;
  };

  document.getElementById('pay-pending-list').innerHTML = pending.length
    ? pending.map(p => `
        <div class="alert-row"><div class="adot adot-red"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${p.client}</div>
        <div style="font-size:12px;color:var(--muted);">${p.project || ''} · Due ${fmt(p.due_date)}</div>
        <div style="font-size:12px;margin-top:2px;">${fmtMoney(p.amount)} · ${payBadge(p.status)}</div></div></div>`).join('')
    : '<div class="empty-state">No pending payments 🎉</div>';

  document.getElementById('pay-advance-list').innerHTML = advances.length
    ? advances.map(p => `
        <div class="alert-row"><div class="adot adot-blue"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${p.client}</div>
        <div style="font-size:12px;color:var(--muted);">${p.project || ''}</div>
        <div style="font-size:12px;">${fmtMoney(p.amount)} advance received</div></div></div>`).join('')
    : '<div class="empty-state">No advance records.</div>';

  document.getElementById('pay-body').innerHTML = payments.map(p => `<tr>
    <td style="font-weight:600;">${p.client}</td>
    <td style="font-weight:700;color:var(--p700);">${fmtMoney(p.amount)}</td>
    <td><span style="font-size:11px;color:var(--muted);">${p.type || ''}</span></td>
    <td>${payBadge(p.status)}</td>
    <td>${fmt(p.due_date)}</td>
    <td style="font-size:12px;color:var(--muted);">${p.notes || ''}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">✕</button></td>
  </tr>`).join('');
  updatePayNotif();
}

async function deletePayment(id) {
  if (!confirm('Delete this payment?')) return;
  await dbDelete('payments', id);
  payments = payments.filter(p => p.id !== id);
  renderPayments();
}


// ---- 14. INVOICES ----
function renderInvoices() {
  document.getElementById('invoice-list').innerHTML = invoices.length
    ? invoices.map(inv => {
        const balance = (inv.total || 0) - (inv.advance || 0);
        const sc = { Paid: 'var(--success)', Unpaid: 'var(--danger)', 'Partially Paid': 'var(--warning)' };
        return `<div class="invoice-card">
          <div class="invoice-top">
            <div>
              <div class="invoice-id">${inv.invoice_num || ''}</div>
              <div class="invoice-client">${inv.client}</div>
              <div style="font-size:12px;color:var(--muted);">Issued: ${fmt(inv.invoice_date)} · Due: ${fmt(inv.due_date)}</div>
            </div>
            <div style="text-align:right;">
              <div class="invoice-amount">${fmtMoney(inv.total)}</div>
              <div style="margin-top:4px;"><span class="pill" style="background:${sc[inv.status]}22;color:${sc[inv.status]};">${inv.status}</span></div>
            </div>
          </div>
          <div class="invoice-row"><span style="color:var(--muted);">Services</span><span style="font-size:12px;">${inv.services || ''}</span></div>
          <div class="invoice-row"><span style="color:var(--muted);">Total</span><span style="font-weight:700;">${fmtMoney(inv.total)}</span></div>
          <div class="invoice-row"><span style="color:var(--muted);">Advance Paid</span><span style="color:var(--success);font-weight:600;">${fmtMoney(inv.advance)}</span></div>
          <div class="invoice-row"><span style="color:var(--muted);">Balance Due</span><span style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'};font-weight:700;">${fmtMoney(balance)}</span></div>
          <div style="margin-top:12px;display:flex;gap:8px;">
            <button class="btn btn-sm" onclick="markInvPaid('${inv.id}')">✓ Mark Paid</button>
            <button class="btn btn-sm btn-danger" onclick="deleteInv('${inv.id}')">Delete</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-state" style="padding:40px;">No invoices yet. Click + New Invoice.</div>';
}

async function markInvPaid(id) {
  const inv = invoices.find(i => i.id === id); if (!inv) return;
  await dbUpdate('invoices', id, { status: 'Paid', advance: inv.total });
  invoices = invoices.map(i => i.id === id ? { ...i, status: 'Paid', advance: i.total } : i);
  renderInvoices();
}

async function deleteInv(id) {
  if (!confirm('Delete this invoice?')) return;
  await dbDelete('invoices', id);
  invoices = invoices.filter(i => i.id !== id);
  renderInvoices();
}


// ---- 15. MODAL SAVE FUNCTIONS ----
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close modal when clicking outside it
document.querySelectorAll('.modal-overlay').forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); })
);

async function saveTask() {
  const client = document.getElementById('t-client').value.trim();
  const name   = document.getElementById('t-name').value.trim();
  if (!client || !name) { toast('Client and task name required.'); return; }
  const row = {
    client, name,
    type:      document.getElementById('t-type').value,
    owner:     document.getElementById('t-owner').value,
    deadline:  document.getElementById('t-deadline').value || null,
    status:    document.getElementById('t-status').value,
    priority:  document.getElementById('t-priority').value,
    blocker:   document.getElementById('t-blocker').value || 'None',
    next_step: document.getElementById('t-next').value,
    done: false,
  };
  const saved = await dbInsert('tasks', row);
  if (saved) {
    tasks.unshift(saved);
    closeModal('modal-task');
    ['t-client','t-name','t-blocker','t-next','t-deadline'].forEach(i => document.getElementById(i).value = '');
    renderPage(document.querySelector('.page.active')?.id.replace('page-', ''));
  }
}

async function saveShoot() {
  const client = document.getElementById('sh-client').value.trim();
  const date   = document.getElementById('sh-date').value;
  if (!client || !date) { toast('Client and date required.'); return; }
  const row = {
    client, date,
    type:  document.getElementById('sh-type').value,
    owner: document.getElementById('sh-owner').value,
    notes: document.getElementById('sh-notes').value,
  };
  const saved = await dbInsert('shoots', row);
  if (saved) { shoots.push(saved); closeModal('modal-shoot'); renderShootCal(); }
}

async function savePost() {
  const client = document.getElementById('po-client').value.trim();
  const date   = document.getElementById('po-date').value;
  if (!client || !date) { toast('Client and date required.'); return; }
  const row = {
    client, date,
    platform:       document.getElementById('po-platform').value,
    content_type:   document.getElementById('po-ctype').value,
    caption_status: document.getElementById('po-cap').value,
    notes:          document.getElementById('po-notes').value,
  };
  const saved = await dbInsert('posts', row);
  if (saved) { posts.push(saved); closeModal('modal-post'); renderPostCal(); }
}

async function savePipeline() {
  const client = document.getElementById('pl-client').value.trim();
  if (!client) { toast('Client name required.'); return; }
  const row = {
    client,
    planned:   parseInt(document.getElementById('pl-planned').value) || 2,
    shot:      document.getElementById('pl-shot').checked,
    edit:      document.getElementById('pl-edit').checked,
    qc:        document.getElementById('pl-qc').checked,
    approved:  document.getElementById('pl-approved').checked,
    caption:   document.getElementById('pl-caption').checked,
    scheduled: document.getElementById('pl-scheduled').checked,
    posted:    parseInt(document.getElementById('pl-posted').value) || 0,
  };
  const saved = await dbInsert('pipeline', row);
  if (saved) { pipeline.push(saved); closeModal('modal-pipeline'); renderPipeline(); }
}

async function savePayment() {
  const client = document.getElementById('pay-client').value.trim();
  const amount = document.getElementById('pay-amount').value;
  if (!client || !amount) { toast('Client and amount required.'); return; }
  const row = {
    client,
    amount:   Number(amount),
    type:     document.getElementById('pay-type').value,
    status:   document.getElementById('pay-status').value,
    due_date: document.getElementById('pay-due').value || null,
    project:  document.getElementById('pay-project').value,
    notes:    document.getElementById('pay-notes').value,
  };
  const saved = await dbInsert('payments', row);
  if (saved) { payments.unshift(saved); closeModal('modal-payment'); renderPayments(); }
}

async function saveInvoice() {
  const client = document.getElementById('inv-client').value.trim();
  const total  = document.getElementById('inv-total').value;
  if (!client || !total) { toast('Client and total required.'); return; }
  const row = {
    client,
    invoice_num:  document.getElementById('inv-num').value,
    total:        Number(total),
    advance:      Number(document.getElementById('inv-advance').value) || 0,
    invoice_date: document.getElementById('inv-date').value || null,
    due_date:     document.getElementById('inv-due').value || null,
    services:     document.getElementById('inv-services').value,
    status:       document.getElementById('inv-status').value,
  };
  const saved = await dbInsert('invoices', row);
  if (saved) { invoices.unshift(saved); closeModal('modal-invoice'); renderInvoices(); }
}


// ---- 17. REALTIME + INIT ----
function setupRealtime() {
  sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => { loadAll(); })
    .subscribe();
}

// Start by checking if the user is already logged in
initAuth();
