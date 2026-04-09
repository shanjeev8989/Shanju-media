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
let clientFollowups = [], clientReviews = [];
let dailyUpdates = [];
let expenses = [];
let teamDailyViewDate   = new Date().toISOString().split('T')[0];
let dailyMonthView      = new Date().toISOString().slice(0, 7); // "YYYY-MM"
let teamProfiles = []; // all approved profiles — used for editor dropdown
let currentUser = 'Shanju';
let currentProfile = null; // { id, name, role }  — set after login
let shootCalMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let postCalMonth  = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

// Video task types — creating one of these auto-adds to the pipeline
const VIDEO_TYPES = ['Reel','Promo Video','Talking Head Video','Ad Video','Content Video','YouTube Video','Short Video'];

// Content pipeline status flow
const CONTENT_STATUSES = ['Planned','Script Ready','Shot Pending','Shot Done','Edit Pending','Edit Done','QC Pending','QC Done','Approval Pending','Approved','Caption Ready','Scheduled','Posted'];

// Team colours, roles, emojis — edit these to customise known members
const PAL     = { Shanju:'#f5f3ff', Bharath:'#dbeafe', Minhaaj:'#d1fae5', Gowtham:'#fef3c7', Bava:'#fce7f3' };
const PALTEXT = { Shanju:'#6d28d9', Bharath:'#1e40af', Minhaaj:'#065f46', Gowtham:'#92400e', Bava:'#9d174d' };
const ROLES   = { Shanju:'Founder & CEO', Bharath:'Chief Editor / QC', Minhaaj:'Editor', Gowtham:'Videographer & Editor', Bava:'Post Production Head' };
const EMOJIS  = { Shanju:'👑', Bharath:'🎬', Minhaaj:'✂️', Gowtham:'📸', Bava:'📦' };
const INITS   = { Shanju:'SJ', Bharath:'BH', Minhaaj:'MH', Gowtham:'GW', Bava:'BV' };

// Fallback palette for dynamic members not in the hardcoded lists above
const FALLBACK_BKGS  = ['#ede9fe','#dbeafe','#d1fae5','#fef3c7','#fce7f3','#ffedd5','#e0f2fe'];
const FALLBACK_FKGS  = ['#6d28d9','#1e40af','#065f46','#92400e','#9d174d','#c2410c','#0369a1'];

function memberBg(name)    { return PAL[name]     || FALLBACK_BKGS[name.charCodeAt(0) % FALLBACK_BKGS.length]; }
function memberFg(name)    { return PALTEXT[name] || FALLBACK_FKGS[name.charCodeAt(0) % FALLBACK_FKGS.length]; }
function memberEmoji(name) { return EMOJIS[name]  || '👤'; }
function memberInits(name) {
  if (INITS[name]) return INITS[name];
  const parts = name.trim().split(' ');
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}


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
let _loadLock = false;
async function loadAll(silent = false) {
  if (_loadLock) return;
  _loadLock = true;
  try {
    const queries = [
      sb.from('tasks').select('*').order('created_at', { ascending: false }),
      sb.from('shoots').select('*').order('date'),
      sb.from('posts').select('*').order('date'),
      sb.from('pipeline').select('*'),
      sb.from('payments').select('*').order('created_at', { ascending: false }),
      sb.from('invoices').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*').eq('status', 'approved'),
    ];
    const [t, s, p, pl, pay, inv, prof] = await Promise.all(queries);
    if (!t.error)    tasks        = t.data    || [];
    if (!s.error)    shoots       = s.data    || [];
    if (!p.error)    posts        = p.data    || [];
    if (!pl.error)   pipeline     = pl.data   || [];
    if (!pay.error)  payments     = pay.data  || [];
    if (!inv.error)  invoices     = inv.data  || [];
    if (!prof.error) teamProfiles = prof.data || [];

    // Follow-up tables may not exist yet — fail gracefully if SQL Step 8 not run
    try {
      const [cf, cr] = await Promise.all([
        sb.from('client_followups').select('*').order('shoot_date'),
        sb.from('client_reviews').select('*').order('review_date', { ascending: false }),
      ]);
      if (!cf.error) clientFollowups = cf.data || [];
      if (!cr.error) clientReviews   = cr.data || [];
    } catch (e2) {
      // tables not created yet — silently skip
    }

    // Daily updates — last 7 days
    try {
      const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const { data: du, error: duErr } = await sb.from('daily_updates').select('*').gte('update_date', sevenAgo);
      if (!duErr) dailyUpdates = du || [];
    } catch (e3) {
      dailyUpdates = [];
    }
    // Expenses — all records
    try {
      const { data: expData, error: expErr } = await sb.from('expenses').select('*').order('date', { ascending: false });
      if (!expErr) expenses = expData || [];
    } catch (e4) {
      expenses = [];
    }
    // Only rebuild dropdowns and check pending users on full loads (not silent background refreshes)
    if (!silent) {
      populateEditorDropdown();
      populateTeamDropdowns();
      await loadPendingUsers();
    }

    setSynced();
    if (!silent) {
      renderPage(document.querySelector('.page.active')?.id.replace('page-', ''));
      updatePayNotif();
    } else {
      // Silent background reload: refresh dashboard counts + active page if it needs live data
      renderDash();
      const silentActivePage = document.querySelector('.page.active')?.id.replace('page-', '');
      if (silentActivePage === 'expenses')  renderExpenses();
      if (silentActivePage === 'pipeline')  renderPipeline();
    }
  } catch (e) {
    setSyncError();
    console.error(e);
  } finally {
    _loadLock = false;
  }
}

function populateEditorDropdown() {
  const sel = document.getElementById('po-editor');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    teamProfiles.map(e => `<option value="${e.name}" ${e.name === current ? 'selected' : ''}>${e.name}</option>`).join('');
}

function populateTeamDropdowns() {
  const members = teamProfiles.map(p => p.name);

  // Task modal — owner dropdown, default to current user
  const tOwner = document.getElementById('t-owner');
  if (tOwner) {
    tOwner.innerHTML = members.map(n =>
      `<option value="${n}" ${n === currentUser ? 'selected' : ''}>${n}</option>`
    ).join('');
  }

  // All Tasks — owner filter dropdown
  const atOwner = document.getElementById('at-owner');
  if (atOwner) {
    const cur = atOwner.value;
    atOwner.innerHTML = '<option value="">All team</option>' +
      members.map(n => `<option value="${n}" ${n === cur ? 'selected' : ''}>${n}</option>`).join('');
  }
}

// Parse advance amount stored in notes field as [ADV:5000]
function parseAdvance(p) {
  const m = (p.notes || '').match(/^\[ADV:(\d+(?:\.\d+)?)\]/);
  return m ? Number(m[1]) : (Number(p.advance) || 0);
}
function parseNotes(p) {
  return (p.notes || '').replace(/^\[ADV:\d+(?:\.\d+)?\]\s*/, '');
}

// Set this flag before any local write — realtime will skip its reload for 4s
let _localWriteTs = 0;
function _markLocalWrite() { _localWriteTs = Date.now(); }
function _wasLocalWrite() { return (Date.now() - _localWriteTs) < 4000; }

async function dbInsert(table, row, silent = false) {
  _markLocalWrite();
  setSyncing();
  const { data, error } = await sb.from(table).insert([row]).select();
  if (error) { setSyncError(); toast('Save failed: ' + error.message); return null; }
  setSynced();
  if (!silent) toast('Saved!');
  return data[0];
}

async function dbUpdate(table, id, row) {
  _markLocalWrite();
  setSyncing();
  const { error } = await sb.from(table).update(row).eq('id', id);
  if (error) { setSyncError(); toast('Update failed: ' + error.message); return false; }
  setSynced(); return true;
}

async function dbDelete(table, id) {
  _markLocalWrite();
  setSyncing();
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { setSyncError(); toast('Delete failed: ' + error.message); return false; }
  setSynced(); toast('Deleted.'); return true;
}


// ---- 4. NAVIGATION ----
function nav(id, el) {
  const role = currentProfile?.role;
  // Finance + founder pages: owner only
  if ((id === 'payments' || id === 'invoices' || id === 'client-followup' || id === 'performance' || id === 'founder-panel') && role !== 'owner') {
    toast('Access restricted — visible to Owner only.');
    return;
  }
  // Work pages (All Tasks, Kanban, Team, Team Daily): owner and manager only
  const workPages = ['all-tasks','kanban','team','team-daily'];
  if (workPages.includes(id) && role === 'editor') {
    toast('Access restricted.');
    return;
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (el) el.classList.add('active');
  closeSidebar();
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
  else if (id === 'payments')        renderPayments();
  else if (id === 'invoices')        renderInvoices();
  else if (id === 'client-followup') renderClientFollowup();
  else if (id === 'daily-update')    renderDailyUpdate();
  else if (id === 'team-daily')      renderTeamDaily();
  else if (id === 'performance')     renderPerformance();
  else if (id === 'founder-panel')   renderFounderPanel();
  else if (id === 'expenses')        renderExpenses();
}

function switchUser() {
  currentUser = document.getElementById('current-user').value;
  renderPage(document.querySelector('.page.active')?.id.replace('page-', ''));
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-backdrop').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-backdrop').classList.remove('open');
}


// ---- HELPER FUNCTIONS ----
function daysDiff(d) { if (!d) return 9999; const t = new Date(d); t.setHours(0,0,0,0); return Math.round((t - TODAY) / 86400000); }
function fmt(d)      { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
function fmtMoney(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); }
function expDate(item) { return item.status_updated_at || item.created_at || ''; }
function arrAvg(arr)   { return arr.length ? arr.reduce((a,b) => a+b, 0) / arr.length : 0; }

function avBadge(n) {
  if (!n || n === '—') return '—';
  return `<span style="display:inline-flex;align-items:center;gap:5px;">
    <span style="width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;background:${memberBg(n)};color:${memberFg(n)};">${memberInits(n)}</span>${n}
  </span>`;
}

function statusPill(s) {
  const m = {
    'Active':            'pill-info',
    'Sent for Caption':  'pill-warning',
    'Exported':          'pill-success',
    // legacy mappings so old data still renders
    'Started':           'pill-info',
    'Currently Working': 'pill-info',
    'Not Started':       'pill-neutral',
    'On Progress':       'pill-info',
    'Not started':       'pill-neutral',
    'In progress':       'pill-info',
  };
  return `<span class="pill ${m[s] || 'pill-info'}">${s || 'Active'}</span>`;
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
//   owner   → everything including Finance
//   manager → everything EXCEPT Finance (no payments/invoices, no money metrics)
//   editor  → My Tasks only (+ limited Kanban)

let _appBooted = false;
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    _appBooted = true;
    await loadProfile(session.user);
  }
  // Listen for future sign-in / sign-out events
  // Supabase v2 fires SIGNED_IN immediately on registration if already logged in —
  // skip it if we already handled the session above (prevents double loadProfile call)
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      if (_appBooted) return;
      _appBooted = true;
      await loadProfile(session.user);
    }
    if (event === 'SIGNED_OUT') { _appBooted = false; showLoginScreen(); }
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
  // manager + editor: no finance, no founder section
  if (profile.role !== 'owner') {
    document.querySelectorAll('[data-section="finance"]').forEach(el => el.style.display = 'none');
    document.querySelectorAll('[data-section="founder"]').forEach(el => el.style.display = 'none');
  }
  // editor only: no work section (All Tasks, Kanban, Team)
  if (profile.role === 'editor') {
    document.querySelectorAll('[data-section="work"]').forEach(el => el.style.display = 'none');
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

  const role    = currentProfile?.role;
  const isOwner = role === 'owner';

  const todoCard = document.getElementById('founder-todo-card');
  if (todoCard) todoCard.style.display = isOwner ? 'block' : 'none';
  if (isOwner) renderTodos();

  const followupCard = document.getElementById('followup-dash-card');
  if (followupCard) followupCard.style.display = isOwner ? 'block' : 'none';
  if (isOwner) { try { renderFollowupDash(); } catch(e) { console.error('renderFollowupDash error:', e); } }

  document.getElementById('dash-title').textContent = isOwner ? 'Founder Dashboard' : `${currentUser}'s Dashboard`;
  document.getElementById('dash-sub').textContent   = isOwner ? 'Full company overview' : 'Your personal workspace';
  document.getElementById('focus-title').textContent = isOwner ? '🎯 Founder Focus Today' : '🎯 My Focus Today';

  // Active tasks for current user scope
  console.log('[DEBUG] renderDash — tasks.length:', tasks.length, 'role:', currentProfile?.role);
  const allActive = tasks.filter(t => t.status !== 'Exported' && !t.done);
  const cuLower   = currentUser.trim().toLowerCase();
  const myActive  = allActive.filter(t => t.owner && t.owner.trim().toLowerCase() === cuLower);
  const myPosts   = posts.filter(p => p.assigned_editor === currentUser);
  const overdue   = myActive.filter(t => daysDiff(t.deadline) < 0);
  const dueToday  = myActive.filter(t => daysDiff(t.deadline) === 0);
  const review    = myActive.filter(t => t.status === 'Sent for Caption');
  const pendingPay = payments.filter(p => p.status === 'Pending' || p.status === 'Partially Paid');
  const pendingAmt = pendingPay.reduce((s, p) => s + Math.max(0, Number(p.amount) - parseAdvance(p)), 0);

  let m = '';
  if (isOwner) {
    m = '';
  } else if (role === 'manager') {
    // For manager: Active Tasks excludes caption queue items (those are a separate workflow)
    const mgrActive   = allActive.filter(t => t.status !== 'Sent for Caption');
    const captionQueue = allActive.filter(t => t.status === 'Sent for Caption').length
                       + posts.filter(p => p.caption_status === 'Sent for Caption').length;
    m = `<div class="mcard purple"><div class="mcard-label">Active Tasks</div><div class="mcard-val">${mgrActive.length}</div><div class="mcard-sub">All clients</div></div>
    <div class="mcard danger"><div class="mcard-label">Overdue</div><div class="mcard-val">${mgrActive.filter(t => daysDiff(t.deadline) < 0).length}</div></div>
    <div class="mcard warning"><div class="mcard-label">Due Today</div><div class="mcard-val">${mgrActive.filter(t => daysDiff(t.deadline) === 0).length}</div></div>
    <div class="mcard info" style="${captionQueue ? 'border:2px solid var(--warning);' : ''}"><div class="mcard-label">Caption Queue</div><div class="mcard-val">${captionQueue}</div><div class="mcard-sub">awaiting captions</div></div>
    <div class="mcard success"><div class="mcard-label">Clients</div><div class="mcard-val">${[...new Set(tasks.map(t => t.client))].length}</div></div>`;
  } else {
    // Editor: my tasks + assigned posts combined
    const totalAssigned = myActive.length + myPosts.length;
    const postsOverdue  = myPosts.filter(p => daysDiff(p.date) < 0).length;
    m = `<div class="mcard purple"><div class="mcard-label">Assigned Tasks</div><div class="mcard-val">${totalAssigned}</div></div>
    <div class="mcard danger"><div class="mcard-label">Overdue</div><div class="mcard-val">${overdue.length + postsOverdue}</div></div>
    <div class="mcard warning"><div class="mcard-label">Due Today</div><div class="mcard-val">${dueToday.length}</div></div>
    <div class="mcard info"><div class="mcard-label">Sent for Caption</div><div class="mcard-val">${review.length}</div></div>`;
  }
  document.getElementById('dash-metrics').innerHTML = m;

  // Build combined items (tasks + posts) for urgent/focus sections
  const dashTaskSrc = isOwner ? allActive : myActive;
  const dashPostSrc = isOwner ? posts : myPosts;

  // Normalise posts into same shape as tasks for display
  const dashItems = [
    ...dashTaskSrc.map(t => ({
      _kind:    'task',
      _days:    daysDiff(t.deadline),
      client:   t.client,
      name:     t.name,
      meta:     `${t.owner} · ${t.status}`,
      next:     t.next_step || '',
    })),
    ...dashPostSrc
      .filter(p => p.assigned_editor)
      .map(p => ({
        _kind:  'post',
        _days:  daysDiff(p.date),
        client: p.client,
        name:   p.content_type || 'Post',
        meta:   `${p.assigned_editor} · ${p.platform || ''} · Caption: ${p.caption_status || '—'}`,
        next:   p.notes || '',
      })),
  ];

  // Immediate Action: overdue + due today + due tomorrow
  const urgent = dashItems
    .filter(i => i._days <= 1)
    .sort((a, b) => a._days - b._days)
    .slice(0, 8);
  document.getElementById('dash-urgent').innerHTML = urgent.length
    ? urgent.map(i => {
        const d = i._days;
        const label = d < 0 ? `Overdue ${Math.abs(d)}d` : d === 0 ? 'Due Today' : 'Due Tomorrow';
        const dot   = d < 0 ? 'adot-red' : d === 0 ? 'adot-yellow' : 'adot-blue';
        const tag   = i._kind === 'post' ? ' 📅' : '';
        return `<div class="alert-row"><div class="adot ${dot}"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${i.client} — ${i.name}${tag}</div>
            <div style="font-size:12px;color:var(--muted);">${i.meta} · <strong>${label}</strong></div>
            ${i.next ? `<div style="font-size:12px;color:#7c3aed;margin-top:2px;">→ ${i.next}</div>` : ''}
          </div></div>`;
      }).join('')
    : `<div class="empty-state">No urgent items 🎉</div>`;

  const bottleneckCard = document.getElementById('dash-bottlenecks').closest('.card');
  const workloadCard   = document.getElementById('dash-workload').closest('.card');

  if (isOwner) {
    bottleneckCard.style.display = 'block';
    const bn = [];
    const bQC = tasks.filter(t => t.owner === 'Bharath' && t.status === 'Sent for Caption');
    if (bQC.length) bn.push({ dot: 'adot-red',    text: `Bharath has ${bQC.length} tasks sent for caption.` });
    const bBava = tasks.filter(t => t.owner === 'Bava' && t.status === 'Not Started');
    if (bBava.length) bn.push({ dot: 'adot-yellow', text: `Bava has ${bBava.length} unstarted tasks.` });
    if (!bn.length) bn.push({ dot: 'adot-green', text: 'No major bottlenecks. Operations running smoothly.' });
    document.getElementById('dash-bottlenecks').innerHTML = bn.map(b =>
      `<div class="alert-row"><div class="adot ${b.dot}"></div><div style="font-size:13px;">${b.text}</div></div>`
    ).join('');
  } else {
    bottleneckCard.style.display = 'none';
  }

  // My Focus: due in 2–3 days
  const focus = dashItems
    .filter(i => i._days >= 2 && i._days < 4)
    .sort((a, b) => a._days - b._days)
    .slice(0, 5);
  document.getElementById('dash-focus').innerHTML = focus.length
    ? focus.map(i => {
        const tag = i._kind === 'post' ? ' 📅' : '';
        return `<div class="alert-row"><div class="adot adot-purple"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${i.client} — ${i.name}${tag}</div>
            <div style="font-size:12px;color:var(--muted);">${i.meta} · due in ${i._days} day${i._days !== 1 ? 's' : ''}</div>
          </div></div>`;
      }).join('')
    : `<div class="empty-state">Nothing coming up in the next 4 days.</div>`;

  if (isOwner) {
    workloadCard.style.display = 'block';
    const members = teamProfiles.map(p => p.name);
    document.getElementById('dash-workload').innerHTML = members.map(m => {
      const mt  = tasks.filter(t => t.owner === m && t.status !== 'Exported' && !t.done);
      const ov  = mt.filter(t => daysDiff(t.deadline) < 0).length;
      const pct = Math.min(100, mt.length * 20);
      return `<div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">${avBadge(m)}
        <span style="color:var(--muted);">${mt.length} tasks${ov ? ` · <span style="color:var(--danger);">${ov} overdue</span>` : ''}</span></div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div></div>`;
    }).join('');
  } else {
    workloadCard.style.display = 'none';
  }

  // ---- Caption Queue (manager + owner) ----
  const captionQueueCard = document.getElementById('caption-queue-card');
  const captionReadyCard = document.getElementById('caption-ready-card');
  if (role !== 'editor') {
    // Tasks sent for caption (not yet done)
    const inCaptionTasks = tasks.filter(t => t.status === 'Sent for Caption' && !t.caption_done);
    // Posts sent for caption
    const inCaptionPosts = posts.filter(p => p.caption_status === 'Sent for Caption');
    const total = inCaptionTasks.length + inCaptionPosts.length;
    if (total) {
      captionQueueCard.style.display = 'block';
      document.getElementById('caption-queue-count').textContent = total;
      document.getElementById('caption-queue-body').innerHTML = [
        ...inCaptionTasks.map(t => `
          <div class="alert-row">
            <div class="adot adot-yellow"></div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${t.client} — ${t.name}</div>
              <div style="font-size:12px;color:var(--muted);">Editor: <strong>${t.owner}</strong></div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="markCaptionDone('${t.id}')">✓ Caption Done</button>
          </div>`),
        ...inCaptionPosts.map(p => `
          <div class="alert-row">
            <div class="adot adot-yellow"></div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${p.client} — ${p.content_type || 'Post'} 📅</div>
              <div style="font-size:12px;color:var(--muted);">Editor: <strong>${p.assigned_editor}</strong> · ${p.platform || ''}</div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="markPostCaptionDone('${p.id}')">✓ Caption Done</button>
          </div>`),
      ].join('');
    } else {
      captionQueueCard.style.display = 'none';
    }
    captionReadyCard.style.display = 'none';
  } else {
    // ---- Caption Ready (editor) ----
    captionQueueCard.style.display = 'none';
    const meLow = currentUser.trim().toLowerCase();
    const readyTasks = tasks.filter(t => t.owner && t.owner.trim().toLowerCase() === meLow && t.caption_done && t.status !== 'Exported');
    const readyPosts = posts.filter(p => p.assigned_editor && p.assigned_editor.trim().toLowerCase() === meLow && p.caption_status === 'Caption Ready');
    const totalReady = readyTasks.length + readyPosts.length;
    if (totalReady) {
      captionReadyCard.style.display = 'block';
      document.getElementById('caption-ready-body').innerHTML = [
        ...readyTasks.map(t => `
          <div class="alert-row">
            <div class="adot adot-green"></div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${t.client} — ${t.name}</div>
              <div style="font-size:12px;color:var(--muted);">Caption is ready — add it and mark as Exported</div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="updateTaskStatus('${t.id}','Exported')">Mark Exported</button>
          </div>`),
        ...readyPosts.map(p => `
          <div class="alert-row">
            <div class="adot adot-green"></div>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${p.client} — ${p.content_type || 'Post'} 📅</div>
              <div style="font-size:12px;color:var(--muted);">Caption is ready — add it and mark as Exported</div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="updatePostStatus('${p.id}','Exported')">Mark Exported</button>
          </div>`),
      ].join('');
    } else {
      captionReadyCard.style.display = 'none';
    }
  }
}


// ---- FOUNDER TO-DO LIST ----
function getTodos() {
  try { return JSON.parse(localStorage.getItem('founder_todos') || '[]'); } catch { return []; }
}
function saveTodos(todos) {
  localStorage.setItem('founder_todos', JSON.stringify(todos));
}
function renderTodos() {
  const todos = getTodos();
  const pending = todos.filter(t => !t.done);
  document.getElementById('todo-count').textContent = pending.length || '';
  document.getElementById('todo-list').innerHTML = todos.length
    ? todos.map((t, i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);">
        <input type="checkbox" ${t.done ? 'checked' : ''} onchange="toggleTodo(${i})"
          style="width:16px;height:16px;cursor:pointer;accent-color:#7c3aed;">
        <span style="flex:1;font-size:13px;${t.done ? 'text-decoration:line-through;color:var(--muted);' : ''}">${t.text}</span>
        <button onclick="deleteTodo(${i})" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:0 4px;">✕</button>
      </div>`).join('')
    : `<div style="font-size:13px;color:var(--muted);padding:4px 0;">No to-dos yet — add one below.</div>`;
}
function addTodo() {
  const input = document.getElementById('todo-input');
  const text = input.value.trim();
  if (!text) return;
  const todos = getTodos();
  todos.unshift({ text, done: false });
  saveTodos(todos);
  input.value = '';
  renderTodos();
}
function toggleTodo(i) {
  const todos = getTodos();
  todos[i].done = !todos[i].done;
  saveTodos(todos);
  renderTodos();
}
function deleteTodo(i) {
  const todos = getTodos();
  todos.splice(i, 1);
  saveTodos(todos);
  renderTodos();
}


// ---- 6. MY TASKS ----
function renderMyTasks() {
  const me = currentUser;
  document.getElementById('my-tasks-title').textContent = `${me}'s Tasks`;

  const filter = document.getElementById('my-tasks-filter')?.value || 'active';

  const meLower = me.trim().toLowerCase();
  const myTasks = tasks.filter(t => t.owner && t.owner.trim().toLowerCase() === meLower);
  const myPosts = posts.filter(p => p.assigned_editor && p.assigned_editor.trim().toLowerCase() === meLower);

  const titleEl = document.getElementById('my-tasks-card-title');
  const countEl = document.getElementById('my-assigned-count');

  // ---- DONE view ----
  if (filter === 'done') {
    if (titleEl) titleEl.textContent = 'Completed Tasks';
    const done = myTasks.filter(t => t.done || t.status === 'Exported');
    if (countEl) countEl.textContent = done.length || '';
    document.getElementById('my-task-body').innerHTML = done.length
      ? done.map(t => `<tr>
          <td style="font-weight:600;">${t.client}</td>
          <td>${t.name}</td>
          <td><span style="font-size:11px;color:var(--muted);">${t.type || '—'}</span></td>
          <td>${fmt(t.deadline)}</td>
          <td><span class="pill pill-success">Exported</span></td>
          <td><span style="font-size:11px;color:var(--muted);">${t.next_step || ''}</span></td>
          <td></td>
        </tr>`).join('')
      : `<tr><td colspan="7" class="empty-state">Nothing completed yet.</td></tr>`;
    return;
  }

  // ---- Build active + post rows ----
  const TASK_STATUSES = ['Active', 'Sent for Caption', 'Exported'];

  const activeTasks = myTasks.filter(t => t.status !== 'Exported' && !t.done);
  const taskRows = activeTasks.map(t => ({
    _isHigh: t.priority === 'High',
    _date:   t.deadline ? new Date(t.deadline) : new Date('9999-12-31'),
    client:  t.client,
    name:    t.name,
    type:    t.type || '—',
    date:    ddPill(t.deadline),
    status:  `<select onchange="updateTaskStatus('${t.id}',this.value)"
        style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--w);cursor:pointer;font-weight:500;">
        ${TASK_STATUSES.map(s => `<option value="${s}" ${s === (t.status || 'Active') ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`,
    note:    t.blocker && t.blocker !== 'None'
               ? `<span style="color:var(--warning);font-size:11px;">⚠ ${t.blocker}</span>`
               : `<span style="font-size:11px;color:var(--muted);">${t.next_step || ''}</span>`,
    actions: currentProfile?.role === 'owner'
      ? `<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">✕</button>`
      : '',
  }));

  const postRows = myPosts.map(p => ({
    _isHigh: false,
    _date:   p.date ? new Date(p.date) : new Date('9999-12-31'),
    client:  p.client,
    name:    (p.content_type || 'Post') + ' 📅',
    type:    p.platform || '—',
    date:    ddPill(p.date),
    status:  `<select onchange="updatePostStatus('${p.id}',this.value)"
        style="font-size:12px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--w);cursor:pointer;font-weight:500;">
        ${TASK_STATUSES.map(s => `<option value="${s}" ${s === (p.caption_status || 'Active') ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`,
    note:    `<span style="font-size:11px;color:var(--muted);">${p.notes || ''}</span>`,
    actions: '',
  }));

  let combined = [...taskRows, ...postRows].sort((a, b) => a._date - b._date);

  // ---- HIGH PRIORITY view ----
  if (filter === 'high') {
    if (titleEl) titleEl.textContent = 'High Priority Tasks';
    combined = combined.filter(r => r._isHigh);
  } else {
    if (titleEl) titleEl.textContent = 'Assigned Tasks';
  }

  if (countEl) countEl.textContent = combined.length || '';

  document.getElementById('my-task-body').innerHTML = combined.length
    ? combined.map(r => `<tr>
        <td style="font-weight:600;">${r.client}</td>
        <td>${r.name}</td>
        <td><span style="font-size:11px;color:var(--muted);">${r.type}</span></td>
        <td>${r.date}</td>
        <td>${r.status}</td>
        <td>${r.note}</td>
        <td style="display:flex;gap:4px;">${r.actions}</td>
      </tr>`).join('')
    : `<tr><td colspan="7" class="empty-state">${filter === 'high' ? 'No high priority tasks.' : `No tasks assigned to ${me}. Add one from the Dashboard.`}</td></tr>`;

  // ---- Daily Done section (always shown, regardless of filter) ----
  const todayStr = new Date().toISOString().split('T')[0];
  const doneToday = [
    ...myTasks
      .filter(t => t.status === 'Exported' && t.status_updated_at?.startsWith(todayStr))
      .map(t => ({ client: t.client, name: t.name, type: t.type || '—', at: t.status_updated_at })),
    ...myPosts
      .filter(p => p.caption_status === 'Exported' && p.status_updated_at?.startsWith(todayStr))
      .map(p => ({ client: p.client, name: (p.content_type || 'Post') + ' 📅', type: p.platform || '—', at: p.status_updated_at })),
  ];
  const dailyDoneCard = document.getElementById('daily-done-card');
  if (doneToday.length) {
    dailyDoneCard.style.display = 'block';
    document.getElementById('daily-done-count').textContent = doneToday.length;
    document.getElementById('daily-done-body').innerHTML = doneToday.map(d => `<tr>
      <td style="font-weight:600;">${d.client}</td>
      <td>${d.name}</td>
      <td><span style="font-size:11px;color:var(--muted);">${d.type}</span></td>
      <td style="font-size:12px;color:var(--success);font-weight:600;">${new Date(d.at).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</td>
    </tr>`).join('');
  } else {
    dailyDoneCard.style.display = 'none';
  }
}

async function updateTaskStatus(id, status) {
  const now = new Date().toISOString();
  await dbUpdate('tasks', id, { status, status_updated_at: now });
  tasks = tasks.map(t => t.id === id ? { ...t, status, status_updated_at: now } : t);
  const activePage = document.querySelector('.page.active')?.id.replace('page-', '');
  if (activePage === 'all-tasks') renderAllTasks();
  else if (activePage === 'team') renderTeam();
  else renderMyTasks();
  renderDash();
}

async function updatePostStatus(id, status) {
  const now = new Date().toISOString();
  await dbUpdate('posts', id, { caption_status: status, status_updated_at: now });
  posts = posts.map(p => p.id === id ? { ...p, caption_status: status, status_updated_at: now } : p);
  const activePage = document.querySelector('.page.active')?.id.replace('page-', '');
  if (activePage === 'all-tasks') renderAllTasks();
  else if (activePage === 'team') renderTeam();
  else renderMyTasks();
  renderDash();
}

async function markDone(id) {
  const now = new Date().toISOString();
  await dbUpdate('tasks', id, { done: true, status: 'Exported', status_updated_at: now });
  tasks = tasks.map(t => t.id === id ? { ...t, done: true, status: 'Exported', status_updated_at: now } : t);
  renderMyTasks(); renderDash();
}

async function markCaptionDone(id) {
  await dbUpdate('tasks', id, { caption_done: true });
  tasks = tasks.map(t => t.id === id ? { ...t, caption_done: true } : t);
  toast('Caption marked as done — editor will be notified.');
  renderDash();
}

async function markPostCaptionDone(id) {
  await dbUpdate('posts', id, { caption_status: 'Caption Ready' });
  posts = posts.map(p => p.id === id ? { ...p, caption_status: 'Caption Ready' } : p);
  toast('Caption marked as done — editor will be notified.');
  renderDash();
}


// ---- 7. ALL TASKS ----

// Map post caption status → task-style status for display
function captionToStatus(cs) {
  // Pass through new workflow statuses directly
  if (cs === 'Active' || cs === 'Sent for Caption' || cs === 'Exported') return cs;
  // Caption Ready = manager done, waiting for editor to export
  if (cs === 'Caption Ready') return 'Sent for Caption';
  // Map legacy caption_status values
  if (cs === 'Approved') return 'Exported';
  return 'Active';
}

// Normalise a post into a task-shaped row for All Tasks / Kanban
function postAsTask(p) {
  return {
    _isPost:   true,
    id:        p.id,
    client:    p.client,
    name:      (p.content_type || 'Post') + ' 📅',
    type:      p.platform || '—',
    owner:     p.assigned_editor || '—',
    deadline:  p.date,
    status:    captionToStatus(p.caption_status),
    priority:  '—',
    blocker:   '—',
    next_step: p.notes || '',
    done:      false,
  };
}

function renderAllTasks() {
  const of = document.getElementById('at-owner').value;
  const sf = document.getElementById('at-status').value;

  const allItems = [
    ...tasks,
    ...posts.filter(p => p.assigned_editor).map(postAsTask),
  ];
  const f = allItems.filter(t => (!of || t.owner === of) && (!sf || t.status === sf));

  const STATUS_OPTS = ['Active','Sent for Caption','Exported'];
  const isOwner   = currentProfile?.role === 'owner';
  const cuLower   = currentUser.trim().toLowerCase();

  function statusCell(t) {
    const isMine = t.owner && t.owner.trim().toLowerCase() === cuLower;
    if (!isOwner && !isMine) return statusPill(t.status || 'Active');
    const fn = t._isPost ? `updatePostStatus` : `updateTaskStatus`;
    return `<select onchange="${fn}('${t.id}',this.value)"
        style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--w);cursor:pointer;font-weight:500;">
        ${STATUS_OPTS.map(s => `<option value="${s}" ${s === (t.status||'Active') ? 'selected' : ''}>${s}</option>`).join('')}
      </select>`;
  }

  document.getElementById('all-task-body').innerHTML = f.length
    ? f.map(t => `<tr>
        <td style="font-weight:600;">${t.client}</td><td>${t.name}</td>
        <td><span style="font-size:11px;color:var(--muted);">${t.type || ''}</span></td>
        <td>${avBadge(t.owner)}</td><td>${ddPill(t.deadline)}</td>
        <td>${statusCell(t)}</td>
        <td>${t._isPost ? '<span style="font-size:11px;color:var(--muted);">—</span>' : priPill(t.priority)}</td>
        <td style="font-size:11px;color:${t.blocker && t.blocker !== 'None' ? 'var(--warning)' : 'var(--muted)'};">${t.blocker || '—'}</td>
        <td style="font-size:11px;color:var(--muted);">${t.next_step || ''}</td>
        <td>${isOwner && !t._isPost ? `<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">✕</button>` : ''}</td>
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
  const cols = ['Active', 'Sent for Caption', 'Exported'];

  const allItems = [
    ...tasks,
    ...posts.filter(p => p.assigned_editor).map(postAsTask),
  ];

  document.getElementById('kanban-board').innerHTML = cols.map(col => {
    const cards = allItems.filter(t => t.status === col);
    return `<div class="kanban-col">
      <div class="kanban-col-title">${col}<span class="kanban-count">${cards.length}</span></div>
      ${cards.map(t => `
        <div class="kanban-card">
          <div class="kanban-card-title">${t.name}</div>
          <div class="kanban-card-client">${t.client}</div>
          <div class="kanban-card-meta">${avBadge(t.owner)}${t._isPost ? '' : priPill(t.priority)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:4px;">${fmt(t.deadline)}</div>
        </div>`).join('') || '<div style="font-size:11px;color:var(--muted);text-align:center;padding:12px 0;">Empty</div>'}
    </div>`;
  }).join('');
}


// ---- 9. TEAM ----
function renderTeam() {
  const members = teamProfiles.filter(p => p.role !== 'owner').map(p => p.name);
  if (!members.length) {
    document.getElementById('person-grid').innerHTML = '<div class="empty-state">No team members yet.</div>';
    document.getElementById('team-monthly-summary').innerHTML = '';
    document.getElementById('team-daily-output').innerHTML = '';
    return;
  }

  // ---- Monthly Summary ----
  const now      = new Date();
  const monthPfx = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const todayStr = now.toISOString().split('T')[0];
  const monthLabel = now.toLocaleDateString('en-IN', { month: 'long' });

  const teamMonthExp = tasks.filter(t => t.status === 'Exported' && expDate(t).startsWith(monthPfx)).length
    + posts.filter(p => p.caption_status === 'Exported' && expDate(p).startsWith(monthPfx)).length;
  const teamMonthCap = tasks.filter(t => (t.status === 'Sent for Caption' || t.status === 'Exported') && expDate(t).startsWith(monthPfx)).length;

  document.getElementById('team-monthly-summary').innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:stretch;">
      <div class="mcard success" style="min-width:130px;">
        <div class="mcard-label">Team Exported (${monthLabel})</div>
        <div class="mcard-val">${teamMonthExp}</div>
        <div class="mcard-sub">${teamMonthCap} sent for caption</div>
      </div>
      ${members.map(m => {
        const mLow = m.trim().toLowerCase();
        const exp  = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && expDate(t).startsWith(monthPfx)).length
                   + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && expDate(p).startsWith(monthPfx)).length;
        const cap  = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && (t.status === 'Sent for Caption' || t.status === 'Exported') && expDate(t).startsWith(monthPfx)).length;
        return `<div class="mcard info" style="min-width:130px;">
          <div class="mcard-label">${memberEmoji(m)} ${m}</div>
          <div class="mcard-val">${exp}</div>
          <div class="mcard-sub">${cap ? `${cap} for caption` : 'exported this month'}</div>
        </div>`;
      }).join('')}
    </div>`;

  // ---- Daily Output ----
  document.getElementById('team-daily-output').innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><span class="card-title">📊 Daily Output — Today</span></div>
      <div class="card-body" style="padding:0;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="text-align:left;padding:10px 14px;font-size:12px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);">Editor</th>
            <th style="text-align:center;padding:10px 14px;font-size:12px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);">Exported Today</th>
            <th style="text-align:center;padding:10px 14px;font-size:12px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);">Sent for Caption</th>
            <th style="text-align:center;padding:10px 14px;font-size:12px;color:var(--muted);font-weight:600;border-bottom:1px solid var(--border);">Active</th>
          </tr></thead>
          <tbody>
            ${members.map(m => {
              const mLow     = m.trim().toLowerCase();
              const expToday = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && expDate(t).startsWith(todayStr)).length
                             + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && expDate(p).startsWith(todayStr)).length;
              const capToday = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Sent for Caption' && expDate(t).startsWith(todayStr)).length
                             + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Sent for Caption' && expDate(p).startsWith(todayStr)).length;
              const active   = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status !== 'Exported' && !t.done).length
                             + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && captionToStatus(p.caption_status) !== 'Exported').length;
              return `<tr style="border-top:1px solid var(--border);">
                <td style="padding:10px 14px;">${avBadge(m)}</td>
                <td style="text-align:center;padding:10px 14px;font-size:16px;font-weight:700;color:${expToday ? '#10b981' : 'var(--muted)'};">${expToday}</td>
                <td style="text-align:center;padding:10px 14px;font-size:16px;font-weight:700;color:${capToday ? 'var(--warning)' : 'var(--muted)'};">${capToday}</td>
                <td style="text-align:center;padding:10px 14px;font-size:16px;font-weight:700;">${active}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('person-grid').innerHTML = members.map(m => {
    const mLow     = m.trim().toLowerCase();
    const mt       = tasks.filter(t => t.owner && t.owner.trim().toLowerCase() === mLow && t.status !== 'Exported' && !t.done);
    const mp       = posts.filter(p => p.assigned_editor && p.assigned_editor.trim().toLowerCase() === mLow && captionToStatus(p.caption_status) !== 'Exported');
    const active   = mt.length + mp.length;
    const ov       = mt.filter(t => daysDiff(t.deadline) < 0).length
                   + mp.filter(p => daysDiff(p.date) < 0).length;
    const done     = tasks.filter(t => t.owner && t.owner.trim().toLowerCase() === mLow && (t.done || t.status === 'Exported')).length
                   + posts.filter(p => p.assigned_editor && p.assigned_editor.trim().toLowerCase() === mLow && captionToStatus(p.caption_status) === 'Exported').length;
    const caption  = mt.filter(t => t.status === 'Sent for Caption').length
                   + mp.filter(p => captionToStatus(p.caption_status) === 'Sent for Caption').length;
    return `<div class="person-card" onclick="showTeamDetail('${m}')">
      <div class="person-header">
        <div class="person-avatar" style="background:${memberBg(m)};color:${memberFg(m)};">${memberEmoji(m)}</div>
        <div><div class="person-name">${m}</div><div class="person-role">${ROLES[m] || (teamProfiles.find(p => p.name === m)?.role || '')}</div></div>
      </div>
      <div class="person-stats">
        <div class="pstat"><div class="pstat-val">${active}</div><div class="pstat-label">Active</div></div>
        <div class="pstat"><div class="pstat-val" style="${ov ? 'color:var(--danger)' : ''}">${ov}</div><div class="pstat-label">Overdue</div></div>
        <div class="pstat"><div class="pstat-val" style="color:var(--success);">${done}</div><div class="pstat-label">Exported</div></div>
        <div class="pstat"><div class="pstat-val" style="${caption ? 'color:var(--warning)' : ''}">${caption}</div><div class="pstat-label">For Caption</div></div>
      </div></div>`;
  }).join('');
}

function showTeamDetail(m) {
  const card = document.getElementById('team-detail-card');
  card.style.display = 'block';
  document.getElementById('team-detail-name').textContent = `${memberEmoji(m)} ${m} — All Tasks`;

  const mLow = m.trim().toLowerCase();
  const taskRows = tasks.filter(t => t.owner && t.owner.trim().toLowerCase() === mLow).map(t =>
    `<tr>
      <td style="font-weight:600;">${t.client}</td>
      <td>${t.name}</td>
      <td>${statusPill(t.status || 'Active')}</td>
      <td>${ddPill(t.deadline)}</td>
      <td style="font-size:11px;color:var(--muted);">${t.next_step || ''}</td>
    </tr>`
  );
  const postRows = posts.filter(p => p.assigned_editor && p.assigned_editor.trim().toLowerCase() === mLow).map(p =>
    `<tr>
      <td style="font-weight:600;">${p.client}</td>
      <td>${(p.content_type || 'Post') + ' 📅'}</td>
      <td>${statusPill(captionToStatus(p.caption_status))}</td>
      <td>${ddPill(p.date)}</td>
      <td style="font-size:11px;color:var(--muted);">${p.platform || ''}</td>
    </tr>`
  );
  const allRows = [...taskRows, ...postRows];

  document.getElementById('team-detail-body').innerHTML = allRows.join('') ||
    `<tr><td colspan="5" class="empty-state">No tasks.</td></tr>`;
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
          <button class="btn btn-sm btn-primary" style="font-size:11px;" onclick="openEditShoot('${s.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteShoot('${s.id}')">✕</button>
        </div>`).join('')
    : '<div class="empty-state">No shoots scheduled.</div>';
}

function renderPostCal() {
  // Populate client filter dropdown
  const clientFilter = document.getElementById('post-cal-client-filter');
  if (clientFilter) {
    const clients = [...new Set(posts.map(p => p.client))].sort();
    const current = clientFilter.value;
    clientFilter.innerHTML = '<option value="">All Clients</option>' +
      clients.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('');
  }

  const filterClient = clientFilter ? clientFilter.value : '';
  const filtered = filterClient ? posts.filter(p => p.client === filterClient) : posts;

  buildCal('post', postCalMonth, filtered, () => 'post');
  document.getElementById('post-list').innerHTML = filtered.length
    ? filtered.sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => `
        <div class="alert-row">
          <div class="adot adot-green"></div>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">${p.client} — ${p.content_type || ''}</div>
            <div style="font-size:12px;color:var(--muted);">${fmt(p.date)} · ${p.platform || ''} · Caption:
              <span style="color:${p.caption_status === 'Approved' ? 'var(--success)' : p.caption_status === 'Pending' ? 'var(--danger)' : 'var(--warning)'};">${p.caption_status || ''}</span>
              · <span style="background:var(--p100);color:var(--p900);font-size:11px;padding:1px 7px;border-radius:20px;font-weight:600;">${p.assigned_editor || 'Unassigned'}</span>
            </div>
          </div>
          <button class="btn btn-sm btn-primary" style="font-size:11px;" onclick="openEditPost('${p.id}')">Edit</button>
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

// Derive status from old boolean columns if content_status isn't set
function getContentStatus(p) {
  if (p.content_status) return p.content_status;
  if (p.scheduled) return 'Scheduled';
  if (p.caption)   return 'Caption Ready';
  if (p.approved)  return 'Approved';
  if (p.qc)        return 'QC Done';
  if (p.edit)      return 'Edit Done';
  if (p.shot)      return 'Shot Done';
  return 'Planned';
}

function contentStatusPill(s) {
  const map = {
    'Planned':          'pill-neutral',
    'Script Ready':     'pill-info',
    'Shot Pending':     'pill-warning',
    'Shot Done':        'pill-info',
    'Edit Pending':     'pill-warning',
    'Edit Done':        'pill-info',
    'QC Pending':       'pill-warning',
    'QC Done':          'pill-info',
    'Approval Pending': 'pill-warning',
    'Approved':         'pill-success',
    'Caption Ready':    'pill-info',
    'Scheduled':        'pill-success',
    'Posted':           'pill-success',
  };
  return `<span class="pill ${map[s] || 'pill-neutral'}">${s || 'Planned'}</span>`;
}

async function updateContentStatus(id, status) {
  const updates = { content_status: status };
  if (status === 'Posted') updates.posted_date = new Date().toISOString().split('T')[0];
  await dbUpdate('pipeline', id, updates);
  pipeline = pipeline.map(p => p.id === id ? { ...p, ...updates } : p);
  renderPipeline();
}

function showClientPipeline(client) {
  const items = pipeline.filter(p => p.client === client);
  document.getElementById('client-pipeline-name').textContent = client + ' — Content Pipeline';
  const rows = items.map(p => {
    const status = getContentStatus(p);
    return `<tr>
      <td style="font-weight:600;">${p.content_title || '—'}</td>
      <td>${contentStatusPill(status)}</td>
      <td>${p.platform || '—'}</td>
      <td>${fmt(p.planned_date)}</td>
      <td>${fmt(p.posted_date)}</td>
      <td>
        <select onchange="updateContentStatus('${p.id}', this.value)" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);">
          ${CONTENT_STATUSES.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><button class="btn btn-sm btn-danger" onclick="deletePL('${p.id}')">✕</button></td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" class="empty-state">No items for this client.</td></tr>`;
  document.getElementById('client-pipeline-body').innerHTML = `
    <div style="overflow-x:auto;">
      <table>
        <thead><tr><th>Content</th><th>Status</th><th>Platform</th><th>Planned</th><th>Posted</th><th>Update</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  document.getElementById('pipeline-client-detail').style.display = 'block';
  document.getElementById('pipeline-client-detail').scrollIntoView({ behavior: 'smooth' });
}

function renderPipeline() {
  // --- Today & Tomorrow posts from Post Calendar ---
  const todayStr    = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const captionPill = s => {
    if (!s || s === 'Not Started') return '<span class="pill pill-neutral">Not Started</span>';
    if (s === 'In Progress')       return '<span class="pill pill-warning">In Progress</span>';
    if (s === 'Sent for Caption')  return '<span class="pill pill-warning">Sent for Caption</span>';
    if (s === 'Caption Ready')     return '<span class="pill pill-success">Caption Ready</span>';
    if (s === 'Exported')          return '<span class="pill pill-success">Exported ✓</span>';
    return `<span class="pill pill-neutral">${s}</span>`;
  };

  const postRow = p => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;">
        <div style="font-size:13px;font-weight:600;">${p.client}</div>
        <div style="font-size:11px;color:var(--muted);">${p.platform || '—'} · ${p.content_type || '—'}</div>
        ${p.assigned_editor ? `<div style="font-size:11px;color:var(--p600);margin-top:2px;">✏ ${p.assigned_editor}</div>` : ''}
      </div>
      <div style="text-align:right;">${captionPill(p.caption_status)}</div>
    </div>`;

  const todayPosts    = posts.filter(p => p.date === todayStr);
  const tomorrowPosts = posts.filter(p => p.date === tomorrowStr);

  const todayBody    = document.getElementById('pl-today-body');
  const tomorrowBody = document.getElementById('pl-tomorrow-body');
  const todayCount   = document.getElementById('pl-today-count');
  const tomorrowCount= document.getElementById('pl-tomorrow-count');

  if (todayBody) todayBody.innerHTML = todayPosts.length
    ? todayPosts.map(postRow).join('')
    : '<div class="empty-state" style="padding:14px;">No posts scheduled today.</div>';
  if (tomorrowBody) tomorrowBody.innerHTML = tomorrowPosts.length
    ? tomorrowPosts.map(postRow).join('')
    : '<div class="empty-state" style="padding:14px;">No posts scheduled tomorrow.</div>';
  if (todayCount)    todayCount.textContent    = todayPosts.length ? `${todayPosts.length} posts` : '';
  if (tomorrowCount) tomorrowCount.textContent = tomorrowPosts.length ? `${tomorrowPosts.length} posts` : '';

  // --- Populate client filter ---
  const clientFilter = document.getElementById('pl-filter-client');
  if (clientFilter) {
    const clients = [...new Set(pipeline.map(p => p.client))].sort();
    const current = clientFilter.value;
    clientFilter.innerHTML = '<option value="">All Clients</option>' +
      clients.map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('');
  }

  const filterClient = clientFilter ? clientFilter.value : '';
  const filtered = filterClient ? pipeline.filter(p => p.client === filterClient) : pipeline;

  document.getElementById('pipeline-body').innerHTML = filtered.length
    ? filtered.map(p => {
        const status = getContentStatus(p);
        const plannedD = p.planned_date ? fmt(p.planned_date) : '—';
        const postedD  = p.posted_date  ? fmt(p.posted_date)  : '—';
        const gap = (p.planned_date && p.posted_date)
          ? Math.round((new Date(p.posted_date) - new Date(p.planned_date)) / 86400000) + 'd'
          : status === 'Posted' ? '—' : (p.planned_date ? `${daysDiff(p.planned_date)}d` : '—');
        return `<tr>
          <td style="font-weight:700;cursor:pointer;color:var(--p600);" onclick="showClientPipeline('${p.client}')">${p.client}</td>
          <td>${p.content_title || '—'}</td>
          <td>${contentStatusPill(status)}</td>
          <td style="font-size:12px;color:var(--muted);">${p.platform || '—'}</td>
          <td style="font-size:12px;">${plannedD}</td>
          <td style="font-size:12px;">${postedD}</td>
          <td style="font-size:12px;color:var(--muted);">${gap}</td>
          <td>
            <select onchange="updateContentStatus('${p.id}', this.value)" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid var(--border);">
              ${CONTENT_STATUSES.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><button class="btn btn-sm btn-danger" onclick="deletePL('${p.id}')">✕</button></td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="9" class="empty-state">No content in pipeline.</td></tr>`;
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
  const totalPending   = pending.reduce((s, p) => s + Math.max(0, Number(p.amount) - parseAdvance(p)), 0);
  const totalAdvances  = payments.reduce((s, p) => s + parseAdvance(p), 0);
  const totalCollected = payments.filter(p => p.status === 'Paid').reduce((s, p) => s + Number(p.amount), 0);

  document.getElementById('pay-metrics').innerHTML = `
    <div class="mcard danger"><div class="mcard-label">Pending (Balance Due)</div><div class="mcard-val">${fmtMoney(totalPending)}</div><div class="mcard-sub">${pending.length} clients</div></div>
    <div class="mcard info"><div class="mcard-label">Advances Received</div><div class="mcard-val">${fmtMoney(totalAdvances)}</div><div class="mcard-sub">${advances.length + pending.filter(p => p.advance > 0).length} payments</div></div>
    <div class="mcard success"><div class="mcard-label">Total Collected</div><div class="mcard-val">${fmtMoney(totalCollected)}</div></div>
    <div class="mcard purple"><div class="mcard-label">Total Invoiced</div><div class="mcard-val">${fmtMoney(payments.reduce((s, p) => s + Number(p.amount), 0))}</div></div>`;

  const payBadge = s => {
    const m = { 'Paid':'pay-paid', 'Partially Paid':'pay-partial', 'Pending':'pay-pending', 'Advance Received':'pay-advance' };
    return `<span class="pay-badge ${m[s] || 'pay-pending'}">${s}</span>`;
  };

  document.getElementById('pay-pending-list').innerHTML = pending.length
    ? pending.map(p => {
        const adv = parseAdvance(p);
        const bal = Math.max(0, Number(p.amount) - adv);
        return `
        <div class="alert-row"><div class="adot adot-red"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${p.client}</div>
        <div style="font-size:12px;color:var(--muted);">${p.project || ''} · Due ${fmt(p.due_date)}</div>
        <div style="font-size:12px;margin-top:2px;">
          Total: ${fmtMoney(p.amount)}${adv ? ` · Advance: <span style="color:var(--success);">${fmtMoney(adv)}</span> · Balance: <span style="color:var(--danger);font-weight:600;">${fmtMoney(bal)}</span>` : ''}
          · ${payBadge(p.status)}
        </div></div></div>`;
      }).join('')
    : '<div class="empty-state">No pending payments 🎉</div>';

  document.getElementById('pay-advance-list').innerHTML = advances.length
    ? advances.map(p => `
        <div class="alert-row"><div class="adot adot-blue"></div>
        <div style="flex:1;"><div style="font-size:13px;font-weight:600;">${p.client}</div>
        <div style="font-size:12px;color:var(--muted);">${p.project || ''}</div>
        <div style="font-size:12px;">${fmtMoney(p.amount)} advance received</div></div></div>`).join('')
    : '<div class="empty-state">No advance records.</div>';

  document.getElementById('pay-body').innerHTML = payments.map(p => {
    const adv       = parseAdvance(p);
    const remaining = Math.max(0, Number(p.amount) - adv);
    return `<tr>
    <td style="font-weight:600;">${p.client}</td>
    <td style="font-weight:700;color:var(--p700);">${fmtMoney(p.amount)}</td>
    <td style="color:var(--success);font-weight:600;">${adv ? fmtMoney(adv) : '—'}</td>
    <td style="color:${adv && remaining > 0 ? 'var(--danger)' : 'var(--muted)'};font-weight:${adv && remaining > 0 ? '600' : '400'};">${adv ? fmtMoney(remaining) : '—'}</td>
    <td><span style="font-size:11px;color:var(--muted);">${p.type || ''}</span></td>
    <td>${payBadge(p.status)}</td>
    <td>${fmt(p.due_date)}</td>
    <td style="font-size:12px;color:var(--muted);">${parseNotes(p)}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')">✕</button></td>
  </tr>`;
  }).join('');
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

  // Immediate feedback — disable button to prevent double-clicks
  const btn = document.querySelector('#modal-task .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

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

  if (btn) { btn.disabled = false; btn.textContent = 'Save Task'; }

  if (saved) {
    tasks.unshift(saved);

    // Auto-link video tasks to the pipeline
    if (VIDEO_TYPES.includes(row.type)) {
      const plRow = {
        client:         row.client,
        content_title:  row.name,
        content_status: 'Planned',
        platform:       null,
        planned_date:   row.deadline || null,
        task_id:        saved.id,
      };
      const plSaved = await dbInsert('pipeline', plRow, true);
      if (plSaved) { pipeline.push(plSaved); toast('Task saved & added to pipeline!'); }
    }

    closeModal('modal-task');
    ['t-client','t-name','t-blocker','t-next','t-deadline'].forEach(i => document.getElementById(i).value = '');
    // Use setTimeout to let modal close animation finish before re-rendering
    setTimeout(() => renderPage(document.querySelector('.page.active')?.id.replace('page-', '')), 50);
  }
}

function openEditShoot(id) {
  const s = shoots.find(s => s.id === id);
  if (!s) return;
  document.getElementById('modal-shoot-title').textContent = '✏️ Edit Shoot Day';
  document.getElementById('sh-edit-id').value  = id;
  document.getElementById('sh-client').value   = s.client || '';
  document.getElementById('sh-date').value     = s.date || '';
  document.getElementById('sh-type').value     = s.type || 'shoot';
  document.getElementById('sh-owner').value    = s.owner || '';
  document.getElementById('sh-notes').value    = s.notes || '';
  openModal('modal-shoot');
}

async function saveShoot() {
  const editId = document.getElementById('sh-edit-id').value;
  const client = document.getElementById('sh-client').value.trim();
  const date   = document.getElementById('sh-date').value;
  if (!client || !date) { toast('Client and date required.'); return; }
  const row = {
    client, date,
    type:  document.getElementById('sh-type').value,
    owner: document.getElementById('sh-owner').value,
    notes: document.getElementById('sh-notes').value,
  };
  if (editId) {
    await dbUpdate('shoots', editId, row);
    shoots = shoots.map(s => s.id === editId ? { ...s, ...row } : s);
    closeModal('modal-shoot');
    renderShootCal();
  } else {
    const saved = await dbInsert('shoots', row);
    if (saved) { shoots.push(saved); closeModal('modal-shoot'); renderShootCal(); }
  }
}

function openEditPost(id) {
  const p = posts.find(p => p.id === id);
  if (!p) return;
  populateEditorDropdown();
  document.getElementById('modal-post-title').textContent = '✏️ Edit Post Day';
  document.getElementById('po-edit-id').value   = id;
  document.getElementById('po-client').value    = p.client || '';
  document.getElementById('po-date').value      = p.date || '';
  document.getElementById('po-platform').value  = p.platform || 'Instagram';
  document.getElementById('po-ctype').value     = p.content_type || 'Storytelling Reel';
  document.getElementById('po-cap').value       = p.caption_status || 'Pending';
  document.getElementById('po-editor').value    = p.assigned_editor || '';
  document.getElementById('po-notes').value     = p.notes || '';
  openModal('modal-post');
}

async function savePost() {
  const editId = document.getElementById('po-edit-id').value;
  const client = document.getElementById('po-client').value.trim();
  const date   = document.getElementById('po-date').value;
  if (!client || !date) { toast('Client and date required.'); return; }
  const btn = document.querySelector('#modal-post .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const row = {
    client, date,
    platform:         document.getElementById('po-platform').value,
    content_type:     document.getElementById('po-ctype').value,
    caption_status:   document.getElementById('po-cap').value,
    assigned_editor:  document.getElementById('po-editor').value || null,
    notes:            document.getElementById('po-notes').value,
  };
  if (editId) {
    // Edit mode
    await dbUpdate('posts', editId, row);
    posts = posts.map(p => p.id === editId ? { ...p, ...row } : p);
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    closeModal('modal-post');
    renderPostCal();
  } else {
    // Add mode
    const saved = await dbInsert('posts', row);
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    if (saved) { posts.push(saved); closeModal('modal-post'); renderPostCal(); }
  }
}

async function savePipeline() {
  const client       = document.getElementById('pl-client').value.trim();
  const contentTitle = document.getElementById('pl-content-title').value.trim();
  if (!client || !contentTitle) { toast('Client and content title required.'); return; }
  const row = {
    client,
    content_title:  contentTitle,
    platform:       document.getElementById('pl-platform').value,
    planned_date:   document.getElementById('pl-planned-date').value || null,
    content_status: document.getElementById('pl-content-status').value || 'Planned',
  };
  const saved = await dbInsert('pipeline', row);
  if (saved) { pipeline.push(saved); closeModal('modal-pipeline'); renderPipeline(); }
}

async function savePayment() {
  const client  = document.getElementById('pay-client').value.trim();
  const amount  = document.getElementById('pay-amount').value;
  const advance = Number(document.getElementById('pay-advance').value) || 0;
  if (!client || !amount) { toast('Client and amount required.'); return; }
  // Encode advance in notes so it works without a DB column change
  // Format: [ADV:5000] rest of notes
  const rawNotes = document.getElementById('pay-notes').value;
  const notes    = advance > 0 ? `[ADV:${advance}] ${rawNotes}`.trim() : rawNotes;
  const row = {
    client,
    amount:   Number(amount),
    type:     document.getElementById('pay-type').value,
    status:   document.getElementById('pay-status').value,
    due_date: document.getElementById('pay-due').value || null,
    project:  document.getElementById('pay-project').value,
    notes,
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


// ---- CLIENT FOLLOW-UP ----

function getNextReminder(shootDate) {
  if (!shootDate) return null;
  const shoot = new Date(shootDate + 'T00:00:00');
  if (isNaN(shoot.getTime())) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  // O(1): calculate the smallest n≥1 where shoot+6n ≥ today
  const daysSince = Math.ceil((today - shoot) / 86400000);
  const n = Math.max(1, Math.ceil(daysSince / 6));
  const result = new Date(shoot);
  result.setDate(result.getDate() + 6 * n);
  return result;
}

function sentimentPill(s) {
  const m = { positive:'pill-success', neutral:'pill-info', negative:'pill-danger' };
  return `<span class="pill ${m[s] || 'pill-neutral'}">${s || 'positive'}</span>`;
}

function renderClientFollowup() {
  const today = new Date(); today.setHours(0,0,0,0);

  // ---- Reminders table ----
  const rows = clientFollowups
    .map(f => ({ ...f, next: f.shoot_date ? getNextReminder(f.shoot_date) : null }))
    .sort((a, b) => (a.next || new Date('9999-12-31')) - (b.next || new Date('9999-12-31')));

  document.getElementById('fu-reminders-body').innerHTML = rows.length
    ? rows.map(f => {
        let autoCell = '<span style="color:var(--muted);">—</span>';
        let dueCell  = '<span style="color:var(--muted);">—</span>';
        if (f.next) {
          const days = Math.round((f.next - today) / 86400000);
          const col  = days < 0 ? 'var(--danger)' : days === 0 ? 'var(--warning)' : days <= 3 ? '#f59e0b' : 'var(--muted)';
          autoCell   = fmt(f.next.toISOString().split('T')[0]);
          dueCell    = `<span style="color:${col};font-weight:600;">${days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `in ${days}d`}</span>`;
        }
        const manualStr = f.manual_date
          ? `<span style="font-weight:600;">${fmt(f.manual_date)}</span>${f.manual_note ? `<br><span style="font-size:11px;color:var(--muted);">${f.manual_note}</span>` : ''}`
          : `<span style="color:var(--muted);">—</span>`;
        return `<tr>
          <td style="font-weight:600;">${f.client_name}</td>
          <td>${f.shoot_date ? fmt(f.shoot_date) : '<span style="color:var(--muted);">—</span>'}</td>
          <td>${autoCell}</td>
          <td>${dueCell}</td>
          <td style="font-size:12px;">${manualStr}</td>
          <td style="font-size:11px;color:var(--muted);">${f.notes || ''}</td>
          <td style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-primary" onclick="openReviewModal('${f.id}','${f.client_name}')">+ Review</button>
            <button class="btn btn-sm btn-danger"  onclick="deleteFollowup('${f.id}')">✕</button>
          </td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="7" class="empty-state">No clients added yet. Click "+ Add Client" to start.</td></tr>`;

  // ---- Populate filter dropdowns ----
  const clients = [...new Set(clientFollowups.map(f => f.client_name))];
  const rvCl = document.getElementById('rv-filter-client');
  if (rvCl) {
    const cur = rvCl.value;
    rvCl.innerHTML = '<option value="">All clients</option>' +
      clients.map(c => `<option${c === cur ? ' selected' : ''}>${c}</option>`).join('');
  }
  const months = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const rvMo = document.getElementById('rv-filter-month');
  if (rvMo) {
    const cur = rvMo.value;
    rvMo.innerHTML = '<option value="">All months</option>' +
      months.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${new Date(m+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</option>`).join('');
  }

  // ---- Reviews table ----
  const filterClient    = rvCl?.value || '';
  const filterMonth     = rvMo?.value || '';
  const filterSentiment = document.getElementById('rv-filter-sentiment')?.value || '';

  let filtered = clientReviews;
  if (filterClient)    filtered = filtered.filter(r => r.client_name === filterClient);
  if (filterMonth)     filtered = filtered.filter(r => (r.review_date || '').startsWith(filterMonth));
  if (filterSentiment) filtered = filtered.filter(r => r.sentiment === filterSentiment);

  document.getElementById('rv-body').innerHTML = filtered.length
    ? filtered.map(r => `<tr>
        <td style="font-weight:600;">${r.client_name}</td>
        <td style="font-size:12px;max-width:260px;">${r.review_text || '—'}</td>
        <td>${sentimentPill(r.sentiment)}</td>
        <td>${fmt(r.review_date)}</td>
        <td><button class="btn btn-sm btn-danger" onclick="deleteReview('${r.id}')">✕</button></td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="empty-state">No reviews yet.</td></tr>`;
}

function renderFollowupDash() {
  const today    = new Date(); today.setHours(0,0,0,0);
  const todayStr = today.toISOString().split('T')[0];

  if (!clientFollowups.length) {
    document.getElementById('followup-dash-body').innerHTML =
      `<div class="empty-state">No clients yet. <span style="color:var(--p700);cursor:pointer;" onclick="nav('client-followup',null)">Add clients →</span></div>`;
    return;
  }

  // Build a map of latest review per followup
  const lastReview = {};
  clientReviews.forEach(r => {
    if (r.followup_id && !lastReview[r.followup_id]) lastReview[r.followup_id] = r;
  });

  // Annotate each client with their next due date
  const clients = clientFollowups.map(f => {
    let nextDate = null, nextLabel = '', isManual = false;
    if (f.manual_date) {
      nextDate  = new Date(f.manual_date + 'T00:00:00');
      nextLabel = f.manual_note || 'Manual follow-up';
      isManual  = true;
    } else {
      nextDate  = getNextReminder(f.shoot_date);
      nextLabel = nextDate ? 'Auto checkup' : '—';
    }
    const daysUntil = nextDate ? Math.round((nextDate - today) / 86400000) : null;
    return { ...f, nextDate, nextLabel, isManual, daysUntil };
  }).sort((a, b) => {
    // Sort: overdue/today first, then by days ascending, then no-date last
    if (a.daysUntil === null && b.daysUntil === null) return 0;
    if (a.daysUntil === null) return 1;
    if (b.daysUntil === null) return -1;
    return a.daysUntil - b.daysUntil;
  });

  const sentColor = s => s === 'positive' ? 'var(--success)' : s === 'negative' ? 'var(--danger)' : 'var(--muted)';

  const html = clients.map(f => {
    const isOverdue = f.daysUntil !== null && f.daysUntil < 0;
    const isToday   = f.daysUntil === 0;
    const isSoon    = f.daysUntil !== null && f.daysUntil <= 3 && f.daysUntil > 0;

    let dotClass = 'adot-blue';
    if (isOverdue || isToday) dotClass = 'adot-yellow';
    if (f.isManual && (isOverdue || isToday)) dotClass = 'adot-yellow';

    let dueLine = '';
    if (f.daysUntil === null)   dueLine = '<span style="color:var(--muted);">No date set</span>';
    else if (isOverdue)         dueLine = `<span style="color:var(--danger);font-weight:600;">${Math.abs(f.daysUntil)}d overdue</span>`;
    else if (isToday)           dueLine = `<span style="color:var(--warning);font-weight:600;">Due today</span>`;
    else if (isSoon)            dueLine = `<span style="color:var(--p700);font-weight:600;">in ${f.daysUntil}d</span>`;
    else                        dueLine = `<span style="color:var(--muted);">in ${f.daysUntil}d</span>`;

    const rev = lastReview[f.id];
    const revLine = rev
      ? `<span style="color:${sentColor(rev.sentiment)};font-size:11px;font-weight:600;">${rev.sentiment || 'positive'} · ${fmt(rev.review_date)}</span>`
      : `<span style="color:var(--muted);font-size:11px;">No review yet</span>`;

    const border = (isOverdue || isToday) ? 'border-left:3px solid var(--warning);padding-left:10px;' : '';

    return `<div class="alert-row" style="${border}">
      <div class="adot ${dotClass}"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;">${f.client_name} ${f.isManual ? '📌' : ''}</div>
        <div style="font-size:12px;color:var(--muted);">${f.nextLabel} · ${dueLine} · ${revLine}</div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="openReviewModal('${f.id}','${f.client_name}')">+ Review</button>
    </div>`;
  }).join('');

  document.getElementById('followup-dash-body').innerHTML = html;
}

function openReviewModal(followupId, clientName) {
  document.getElementById('rv-followup-id').value = followupId || '';
  document.getElementById('rv-client').value      = clientName || '';
  document.getElementById('rv-date').value        = new Date().toISOString().split('T')[0];
  document.getElementById('rv-text').value        = '';
  document.getElementById('rv-sentiment').value   = 'positive';
  openModal('modal-review');
}

async function saveFollowup() {
  const name = document.getElementById('fu-client-name').value.trim();
  const date = document.getElementById('fu-shoot-date').value;
  if (!name) { toast('Client name is required.'); return; }
  const row = {
    client_name:  name,
    shoot_date:   date || null,
    notes:        document.getElementById('fu-notes').value,
    manual_date:  document.getElementById('fu-manual-date').value || null,
    manual_note:  document.getElementById('fu-manual-note').value.trim() || null,
  };
  const saved = await dbInsert('client_followups', row);
  if (saved) {
    clientFollowups.push(saved);
    clientFollowups.sort((a, b) => new Date(a.shoot_date) - new Date(b.shoot_date));
    // clear fields
    ['fu-client-name','fu-shoot-date','fu-manual-date','fu-manual-note','fu-notes'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    closeModal('modal-followup');
    renderClientFollowup();
    renderDash();
  }
}

async function saveReview() {
  const client    = document.getElementById('rv-client').value.trim();
  const text      = document.getElementById('rv-text').value.trim();
  const sentiment = document.getElementById('rv-sentiment').value;
  const date      = document.getElementById('rv-date').value;
  const fid       = document.getElementById('rv-followup-id').value || null;
  if (!client) { toast('Client name is required.'); return; }
  const row = { client_name: client, review_text: text, sentiment, review_date: date, followup_id: fid };
  const saved = await dbInsert('client_reviews', row);
  if (saved) {
    clientReviews.unshift(saved);
    closeModal('modal-review');
    const activePage = document.querySelector('.page.active')?.id.replace('page-', '');
    if (activePage === 'client-followup') renderClientFollowup();
    renderDash();
  }
}

async function deleteFollowup(id) {
  if (!confirm('Delete this client follow-up and all its reminders?')) return;
  await dbDelete('client_followups', id);
  clientFollowups = clientFollowups.filter(f => f.id !== id);
  renderClientFollowup();
  renderDash();
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  await dbDelete('client_reviews', id);
  clientReviews = clientReviews.filter(r => r.id !== id);
  renderClientFollowup();
  renderDash();
}


// ---- 17. FOUNDER COMMAND PANEL ----

// localStorage helpers
const FP = {
  today:    () => new Date().toISOString().split('T')[0],
  monthKey: () => new Date().toISOString().slice(0,7),
  uid:      () => Date.now().toString(36) + Math.random().toString(36).slice(2,6),
  get:      k  => JSON.parse(localStorage.getItem('fp_'+k) || '[]'),
  set:      (k,v) => localStorage.setItem('fp_'+k, JSON.stringify(v)),
  getObj:   k  => JSON.parse(localStorage.getItem('fp_'+k) || 'null'),
  setObj:   (k,v) => localStorage.setItem('fp_'+k, JSON.stringify(v)),
};

function renderFounderPanel() {
  const today     = FP.today();
  const monthKey  = FP.monthKey();
  const dateLabel = new Date(today+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const el = document.getElementById('fp-date-sub');
  if (el) el.textContent = dateLabel;

  // ── Auto carry-forward: yesterday's unfinished daily todos
  const yest = new Date(Date.now()-86400000).toISOString().split('T')[0];
  const yesterTodos = FP.get('daily_'+yest).filter(t => t.status !== 'done');
  const existCarry  = FP.get('carry');
  yesterTodos.forEach(t => {
    if (!existCarry.find(c => c.ref === t.id)) {
      existCarry.push({ id: FP.uid(), text: t.text, from: yest, done: false, ref: t.id });
    }
  });
  FP.set('carry', existCarry);

  document.getElementById('fp-body').innerHTML =
    fpCalls() + fpMessages() + fpDailyTodo() + fpCarryForward() + fpMonthlyTodo() + fpGoals() + fpDeals();
}

// ── CALLS ──────────────────────────────────────────
function fpCalls() {
  const calls = FP.get('calls_' + FP.today());
  const rows = calls.map((c,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <button onclick="fpCallToggle(${i})" style="flex-shrink:0;width:24px;height:24px;border-radius:50%;border:2px solid ${c.done?'var(--success)':'var(--border)'};background:${c.done?'var(--success)':'transparent'};color:white;font-size:11px;cursor:pointer;">${c.done?'✓':''}</button>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;${c.done?'text-decoration:line-through;color:var(--muted);':''}">${c.name}</div>
        ${c.note?`<div style="font-size:11px;color:var(--muted);">${c.note}</div>`:''}
      </div>
      <button onclick="fpCallDel(${i})" style="color:var(--muted);background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;">×</button>
    </div>`).join('');
  return `<div class="card" style="margin-bottom:14px;">
    <div class="card-header"><span class="card-title">📞 Calls Today</span><span class="pill pill-neutral">${calls.filter(c=>c.done).length}/${calls.length}</span></div>
    <div class="card-body" style="padding-bottom:10px;">
      ${rows||'<div class="empty-state" style="padding:8px 0;">No calls added yet.</div>'}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <input id="fp-call-name" placeholder="Person / Company" style="flex:1;min-width:100px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <input id="fp-call-note" placeholder="What to discuss (optional)" style="flex:2;min-width:140px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <button class="btn btn-primary btn-sm" onclick="fpCallAdd()">+ Add</button>
      </div>
    </div>
  </div>`;
}
function fpCallAdd() {
  const name = document.getElementById('fp-call-name')?.value.trim();
  if (!name) return;
  const calls = FP.get('calls_'+FP.today());
  calls.push({ id: FP.uid(), name, note: document.getElementById('fp-call-note')?.value.trim()||'', done: false });
  FP.set('calls_'+FP.today(), calls);
  renderFounderPanel();
}
function fpCallToggle(i) { const k='calls_'+FP.today(); const a=FP.get(k); a[i].done=!a[i].done; FP.set(k,a); renderFounderPanel(); }
function fpCallDel(i)    { const k='calls_'+FP.today(); const a=FP.get(k); a.splice(i,1); FP.set(k,a); renderFounderPanel(); }

// ── MESSAGES ───────────────────────────────────────
function fpMessages() {
  const msgs = FP.get('msgs_' + FP.today());
  const rows = msgs.map((m,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <button onclick="fpMsgToggle(${i})" style="flex-shrink:0;width:24px;height:24px;border-radius:50%;border:2px solid ${m.done?'var(--success)':'var(--border)'};background:${m.done?'var(--success)':'transparent'};color:white;font-size:11px;cursor:pointer;">${m.done?'✓':''}</button>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;${m.done?'text-decoration:line-through;color:var(--muted);':''}">${m.person}</div>
        ${m.note?`<div style="font-size:11px;color:var(--muted);">${m.note}</div>`:''}
      </div>
      <button onclick="fpMsgDel(${i})" style="color:var(--muted);background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;">×</button>
    </div>`).join('');
  return `<div class="card" style="margin-bottom:14px;">
    <div class="card-header"><span class="card-title">💬 Messages / Follow-Ups</span><span class="pill pill-neutral">${msgs.filter(m=>m.done).length}/${msgs.length}</span></div>
    <div class="card-body" style="padding-bottom:10px;">
      ${rows||'<div class="empty-state" style="padding:8px 0;">No messages added yet.</div>'}
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">
        <input id="fp-msg-person" placeholder="Person / Platform" style="flex:1;min-width:100px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <input id="fp-msg-note" placeholder="What to send / follow up on" style="flex:2;min-width:140px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <button class="btn btn-primary btn-sm" onclick="fpMsgAdd()">+ Add</button>
      </div>
    </div>
  </div>`;
}
function fpMsgAdd() {
  const person = document.getElementById('fp-msg-person')?.value.trim();
  if (!person) return;
  const msgs = FP.get('msgs_'+FP.today());
  msgs.push({ id: FP.uid(), person, note: document.getElementById('fp-msg-note')?.value.trim()||'', done: false });
  FP.set('msgs_'+FP.today(), msgs);
  renderFounderPanel();
}
function fpMsgToggle(i) { const k='msgs_'+FP.today(); const a=FP.get(k); a[i].done=!a[i].done; FP.set(k,a); renderFounderPanel(); }
function fpMsgDel(i)    { const k='msgs_'+FP.today(); const a=FP.get(k); a.splice(i,1); FP.set(k,a); renderFounderPanel(); }

// ── DAILY TO-DO ────────────────────────────────────
function fpDailyTodo() {
  const todos = FP.get('daily_'+FP.today());
  const statusIcon = s => s==='done'?'✅':s==='skip'?'⏭':'⏳';
  const statusColor = s => s==='done'?'var(--success)':s==='skip'?'var(--muted)':'var(--warning)';
  const rows = todos.map((t,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:16px;cursor:pointer;" onclick="fpTodoCycle(${i})" title="Click to change status">${statusIcon(t.status)}</span>
      <div style="flex:1;font-size:13px;${t.status==='done'?'text-decoration:line-through;color:var(--muted);':t.status==='skip'?'color:var(--muted);':''}">${t.text}</div>
      <span style="font-size:10px;font-weight:700;color:${statusColor(t.status)};">${t.status||'todo'}</span>
      <button onclick="fpTodoDel(${i})" style="color:var(--muted);background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;">×</button>
    </div>`).join('');
  const done = todos.filter(t=>t.status==='done').length;
  return `<div class="card" style="margin-bottom:14px;">
    <div class="card-header"><span class="card-title">✅ Daily To-Do</span><span class="pill ${done===todos.length&&todos.length?'pill-success':'pill-neutral'}">${done}/${todos.length} done</span></div>
    <div class="card-body" style="padding-bottom:10px;">
      ${rows||'<div class="empty-state" style="padding:8px 0;">Add your tasks for today.</div>'}
      <div style="display:flex;gap:6px;margin-top:10px;">
        <input id="fp-todo-text" placeholder="Task for today..." style="flex:1;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;"
          onkeydown="if(event.key==='Enter') fpTodoAdd()">
        <button class="btn btn-primary btn-sm" onclick="fpTodoAdd()">+ Add</button>
      </div>
    </div>
  </div>`;
}
function fpTodoAdd() {
  const text = document.getElementById('fp-todo-text')?.value.trim();
  if (!text) return;
  const todos = FP.get('daily_'+FP.today());
  todos.push({ id: FP.uid(), text, status: 'todo' });
  FP.set('daily_'+FP.today(), todos);
  renderFounderPanel();
}
function fpTodoCycle(i) {
  const k='daily_'+FP.today(); const a=FP.get(k);
  const cycle = {todo:'done', done:'skip', skip:'todo'};
  a[i].status = cycle[a[i].status||'todo'];
  FP.set(k,a); renderFounderPanel();
}
function fpTodoDel(i) { const k='daily_'+FP.today(); const a=FP.get(k); a.splice(i,1); FP.set(k,a); renderFounderPanel(); }

// ── CARRY FORWARD ──────────────────────────────────
function fpCarryForward() {
  const items = FP.get('carry');
  const rows = items.map((c,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <button onclick="fpCarryToggle(${i})" style="flex-shrink:0;width:24px;height:24px;border-radius:50%;border:2px solid ${c.done?'var(--success)':'var(--warning)'};background:${c.done?'var(--success)':'transparent'};color:white;font-size:11px;cursor:pointer;">${c.done?'✓':''}</button>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;${c.done?'text-decoration:line-through;color:var(--muted);':''}">${c.text}</div>
        <div style="font-size:10px;color:var(--muted);">From ${c.from||'previous day'}</div>
      </div>
      <button onclick="fpCarryTodo(${i})" class="btn btn-sm" style="font-size:11px;" title="Move to today's to-do">→ Today</button>
      <button onclick="fpCarryDel(${i})" style="color:var(--muted);background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;">×</button>
    </div>`).join('');
  return `<div class="card" style="margin-bottom:14px;${items.filter(c=>!c.done).length?'border-left:3px solid var(--warning);':''}">
    <div class="card-header"><span class="card-title">🔁 Carry Forward</span><span class="pill pill-warning">${items.filter(c=>!c.done).length} pending</span></div>
    <div class="card-body" style="padding-bottom:10px;">
      ${rows||'<div class="empty-state" style="padding:8px 0;">No carry-forward tasks. Good job! 🎉</div>'}
      <div style="display:flex;gap:6px;margin-top:10px;">
        <input id="fp-carry-text" placeholder="Add manually..." style="flex:1;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;"
          onkeydown="if(event.key==='Enter') fpCarryAdd()">
        <button class="btn btn-sm" onclick="fpCarryAdd()">+ Add</button>
      </div>
    </div>
  </div>`;
}
function fpCarryAdd() {
  const text = document.getElementById('fp-carry-text')?.value.trim();
  if (!text) return;
  const items = FP.get('carry');
  items.push({ id: FP.uid(), text, from: 'manual', done: false, ref: null });
  FP.set('carry', items); renderFounderPanel();
}
function fpCarryToggle(i) { const a=FP.get('carry'); a[i].done=!a[i].done; FP.set('carry',a); renderFounderPanel(); }
function fpCarryDel(i)    { const a=FP.get('carry'); a.splice(i,1); FP.set('carry',a); renderFounderPanel(); }
function fpCarryTodo(i) {
  const items = FP.get('carry');
  const todos  = FP.get('daily_'+FP.today());
  todos.push({ id: FP.uid(), text: items[i].text, status: 'todo' });
  items.splice(i,1);
  FP.set('carry', items); FP.set('daily_'+FP.today(), todos);
  renderFounderPanel();
}

// ── MONTHLY TO-DO ──────────────────────────────────
function fpMonthlyTodo() {
  const mk    = FP.monthKey();
  const todos = FP.get('mtodo_'+mk);
  const rows  = todos.map((t,i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);">
      <button onclick="fpMTodoToggle(${i})" style="flex-shrink:0;width:24px;height:24px;border-radius:50%;border:2px solid ${t.done?'var(--success)':'var(--border)'};background:${t.done?'var(--success)':'transparent'};color:white;font-size:11px;cursor:pointer;">${t.done?'✓':''}</button>
      <div style="flex:1;font-size:13px;${t.done?'text-decoration:line-through;color:var(--muted);':''}">${t.text}</div>
      <button onclick="fpMTodoDel(${i})" style="color:var(--muted);background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;">×</button>
    </div>`).join('');
  const done = todos.filter(t=>t.done).length;
  const pct  = todos.length ? Math.round(done/todos.length*100) : 0;
  return `<div class="card" style="margin-bottom:14px;">
    <div class="card-header">
      <span class="card-title">📅 Monthly To-Do</span>
      <span style="font-size:12px;color:var(--muted);">${done}/${todos.length} · ${pct}%</span>
    </div>
    <div class="card-body" style="padding-bottom:10px;">
      ${todos.length?`<div style="height:5px;background:var(--border);border-radius:3px;margin-bottom:12px;"><div style="width:${pct}%;height:5px;background:var(--success);border-radius:3px;"></div></div>`:''}
      ${rows||'<div class="empty-state" style="padding:8px 0;">Add strategic tasks for this month.</div>'}
      <div style="display:flex;gap:6px;margin-top:10px;">
        <input id="fp-mtodo-text" placeholder="Strategic task for this month..." style="flex:1;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;"
          onkeydown="if(event.key==='Enter') fpMTodoAdd()">
        <button class="btn btn-primary btn-sm" onclick="fpMTodoAdd()">+ Add</button>
      </div>
    </div>
  </div>`;
}
function fpMTodoAdd() {
  const text = document.getElementById('fp-mtodo-text')?.value.trim();
  if (!text) return;
  const k = 'mtodo_'+FP.monthKey();
  const todos = FP.get(k);
  todos.push({ id: FP.uid(), text, done: false });
  FP.set(k, todos); renderFounderPanel();
}
function fpMTodoToggle(i) { const k='mtodo_'+FP.monthKey(); const a=FP.get(k); a[i].done=!a[i].done; FP.set(k,a); renderFounderPanel(); }
function fpMTodoDel(i)    { const k='mtodo_'+FP.monthKey(); const a=FP.get(k); a.splice(i,1); FP.set(k,a); renderFounderPanel(); }

// ── MONTHLY GOALS ──────────────────────────────────
function fpGoals() {
  const mk = FP.monthKey();
  const g  = FP.getObj('goals_'+mk) || { revenue_t:0, revenue_a:0, clients_t:0, clients_a:0, content_t:0, content_a:0 };
  const monthLabel = new Date(mk+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'});

  function goalRow(label, icon, tKey, aKey) {
    const t = g[tKey]||0, a = g[aKey]||0;
    const pct = t ? Math.min(100, Math.round(a/t*100)) : 0;
    const col = pct>=100?'var(--success)':pct>=60?'var(--warning)':'var(--danger)';
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:13px;font-weight:600;">${icon} ${label}</span>
        <span style="font-size:12px;color:${col};font-weight:700;">${a} / ${t||'—'} ${pct?'('+pct+'%)':''}</span>
      </div>
      <div style="height:7px;background:var(--border);border-radius:4px;margin-bottom:6px;">
        <div style="width:${pct}%;height:7px;background:${col};border-radius:4px;"></div>
      </div>
      <div style="display:flex;gap:8px;">
        <div style="flex:1;"><label style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;">Target</label>
          <input type="number" value="${t}" onchange="fpGoalSet('${tKey}',this.value)"
            style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);font-size:13px;margin-top:2px;"></div>
        <div style="flex:1;"><label style="font-size:10px;color:var(--muted);font-weight:700;text-transform:uppercase;">Actual</label>
          <input type="number" value="${a}" onchange="fpGoalSet('${aKey}',this.value)"
            style="width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);font-size:13px;margin-top:2px;"></div>
      </div>
    </div>`;
  }

  return `<div class="card" style="margin-bottom:14px;">
    <div class="card-header"><span class="card-title">🎯 Monthly Goals</span><span style="font-size:12px;color:var(--muted);">${monthLabel}</span></div>
    <div class="card-body">
      ${goalRow('Revenue (₹)', '💰', 'revenue_t', 'revenue_a')}
      ${goalRow('Clients', '🤝', 'clients_t', 'clients_a')}
      ${goalRow('Content Pieces', '🎬', 'content_t', 'content_a')}
    </div>
  </div>`;
}
function fpGoalSet(key, val) {
  const mk = FP.monthKey();
  const g  = FP.getObj('goals_'+mk) || {};
  g[key] = Number(val)||0;
  FP.setObj('goals_'+mk, g);
  // No full re-render to avoid losing focus — just update progress bars
  renderFounderPanel();
}

// ── EXPECTED BUSINESS (DEALS) ──────────────────────
const FP_STAGES = ['Prospect','Contacted','Proposal Sent','Negotiation','Closed Won','Closed Lost'];
function fpDeals() {
  const deals = FP.get('deals');
  const stageColor = s => s==='Closed Won'?'var(--success)':s==='Closed Lost'?'var(--danger)':s==='Negotiation'?'var(--warning)':'var(--p700)';
  const totalPotential = deals.filter(d=>d.stage!=='Closed Lost').reduce((s,d)=>s+Number(d.value||0),0);
  const totalWon       = deals.filter(d=>d.stage==='Closed Won').reduce((s,d)=>s+Number(d.value||0),0);

  const rows = deals.map((d,i) => `
    <tr>
      <td style="font-weight:600;font-size:13px;">${d.name}</td>
      <td style="font-size:13px;">₹${Number(d.value||0).toLocaleString('en-IN')}</td>
      <td>
        <select onchange="fpDealStage(${i},this.value)" style="font-size:11px;padding:3px 6px;border-radius:5px;border:1px solid var(--border);color:${stageColor(d.stage)};">
          ${FP_STAGES.map(s=>`<option value="${s}" ${s===d.stage?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:11px;color:var(--muted);max-width:140px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.notes||'—'}</td>
      <td><button onclick="fpDealDel(${i})" style="color:var(--muted);background:none;border:none;cursor:pointer;font-size:16px;">×</button></td>
    </tr>`).join('');

  return `<div class="card" style="margin-bottom:14px;">
    <div class="card-header">
      <span class="card-title">💼 Expected Business</span>
      <span style="font-size:12px;color:var(--muted);">Won: <strong style="color:var(--success);">₹${totalWon.toLocaleString('en-IN')}</strong> &nbsp;|&nbsp; Pipeline: <strong>₹${totalPotential.toLocaleString('en-IN')}</strong></span>
    </div>
    <div class="card-body" style="padding:0;">
      ${deals.length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:var(--muted);">Client / Deal</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:var(--muted);">Value</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:var(--muted);">Stage</th>
          <th style="text-align:left;padding:8px 14px;font-size:11px;color:var(--muted);">Notes</th>
          <th style="padding:8px 14px;"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>` : '<div class="empty-state" style="padding:16px;">No deals yet. Add your first prospect.</div>'}
      <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:6px;flex-wrap:wrap;">
        <input id="fp-deal-name"  placeholder="Client / Deal name" style="flex:2;min-width:120px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <input id="fp-deal-value" placeholder="₹ Value" type="number" style="flex:1;min-width:80px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <select id="fp-deal-stage" style="flex:1;min-width:110px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
          ${FP_STAGES.map(s=>`<option>${s}</option>`).join('')}
        </select>
        <input id="fp-deal-notes" placeholder="Notes (optional)" style="flex:2;min-width:120px;padding:7px 10px;border-radius:7px;border:1px solid var(--border);font-size:13px;">
        <button class="btn btn-primary btn-sm" onclick="fpDealAdd()">+ Add</button>
      </div>
    </div>
  </div>`;
}
function fpDealAdd() {
  const name = document.getElementById('fp-deal-name')?.value.trim();
  if (!name) return;
  const deals = FP.get('deals');
  deals.push({ id: FP.uid(), name, value: document.getElementById('fp-deal-value')?.value||0, stage: document.getElementById('fp-deal-stage')?.value||'Prospect', notes: document.getElementById('fp-deal-notes')?.value.trim()||'' });
  FP.set('deals', deals); renderFounderPanel();
}
function fpDealStage(i, stage) { const a=FP.get('deals'); a[i].stage=stage; FP.set('deals',a); renderFounderPanel(); }
function fpDealDel(i)          { const a=FP.get('deals'); a.splice(i,1); FP.set('deals',a); renderFounderPanel(); }


// ---- 18. PERFORMANCE TRACKING (owner only) ----

// Scoring: each reel = 30pts total (15 sent for caption + 15 exported)
// Max 3 reels = 90pts + 10pts daily update = 100 max
function calcDayScore(name, dayStr) {
  // Shoot day = automatic 100 points
  if (dailyUpdates.some(d => d.member_name === name && d.update_date === dayStr && d.is_shoot_day)) return 100;
  const mLow    = name.trim().toLowerCase();
  const exported = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && expDate(t).startsWith(dayStr)).length
                 + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && expDate(p).startsWith(dayStr)).length;
  const caption  = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Sent for Caption' && expDate(t).startsWith(dayStr)).length
                 + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Sent for Caption' && expDate(p).startsWith(dayStr)).length;
  const duDone   = dailyUpdates.some(d => d.member_name === name && d.update_date === dayStr && d.morning_done);
  return Math.min(100, (caption * 15) + (exported * 15) + (duDone ? 10 : 0));
}

function getMemberStats(name) {
  const now       = new Date();
  const todayStr  = now.toISOString().split('T')[0];
  const monthPfx  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lmDate    = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMPfx  = `${lmDate.getFullYear()}-${String(lmDate.getMonth()+1).padStart(2,'0')}`;
  const mLow      = name.trim().toLowerCase();

  // Build 30-day score array
  const days = Array.from({length:30}, (_,i) => {
    const d = new Date(Date.now() - i * 86400000);
    return d.toISOString().split('T')[0];
  });
  const scores = days.map(d => ({ date: d, score: calcDayScore(name, d) }));

  const todayScore   = scores[0].score;
  const weekScore    = Math.round(arrAvg(scores.slice(0,7).map(s=>s.score)));
  const lastWeekScore= Math.round(arrAvg(scores.slice(7,14).map(s=>s.score)));
  const monthScores  = scores.filter(s => s.date.startsWith(monthPfx));
  const lastMScores  = scores.filter(s => s.date.startsWith(lastMPfx));
  const monthScore   = Math.round(arrAvg(monthScores.map(s=>s.score)));
  const lastMScore   = Math.round(arrAvg(lastMScores.map(s=>s.score)));

  const weekImprove  = lastWeekScore ? Math.round(((weekScore - lastWeekScore) / lastWeekScore) * 100) : null;
  const monthImprove = lastMScore    ? Math.round(((monthScore - lastMScore)   / lastMScore)    * 100) : null;

  const todayExported = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && expDate(t).startsWith(todayStr)).length
                      + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && expDate(p).startsWith(todayStr)).length;
  const monthExported = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && expDate(t).startsWith(monthPfx)).length
                      + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && expDate(p).startsWith(monthPfx)).length;
  const overdue  = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status !== 'Exported' && !t.done && t.deadline && t.deadline < todayStr).length;
  const active   = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status !== 'Exported' && !t.done).length;
  const duToday  = dailyUpdates.some(d => d.member_name === name && d.update_date === todayStr && d.morning_done);

  // Flags
  const flags = [];
  if (!duToday) flags.push({ label:'No Update', type:'warning' });
  const noExpLast2 = [0,1].every(i => {
    const d = days[i];
    return tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && expDate(t).startsWith(d)).length
         + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && expDate(p).startsWith(d)).length === 0;
  });
  if (noExpLast2) flags.push({ label:'Low Output', type:'danger' });
  if (overdue > 2) flags.push({ label:'At Risk', type:'danger' });
  if (weekImprove !== null && weekImprove < 0) flags.push({ label:'Declining', type:'warning' });

  const label      = todayScore >= 90 ? 'Elite' : todayScore >= 75 ? 'Good' : todayScore >= 60 ? 'Average' : 'Poor';
  const labelColor = todayScore >= 90 ? 'var(--success)' : todayScore >= 75 ? 'var(--p700)' : todayScore >= 60 ? 'var(--warning)' : 'var(--danger)';
  const scoreColor = s => s >= 90 ? 'var(--success)' : s >= 75 ? 'var(--p700)' : s >= 60 ? 'var(--warning)' : 'var(--danger)';

  return { name, todayScore, weekScore, lastWeekScore, monthScore, weekImprove, monthImprove,
    todayExported, monthExported, overdue, active, duToday, flags, label, labelColor, scoreColor,
    last7: scores.slice(0,7).reverse() };
}

function renderPerformance() {
  const members = teamProfiles.filter(p => p.role === 'editor').map(p => p.name);
  if (!members.length) {
    document.getElementById('performance-body').innerHTML = '<div class="empty-state">No team members yet.</div>';
    return;
  }

  const all = members.map(getMemberStats);

  function impBadge(pct) {
    if (pct === null) return '<span style="color:var(--muted);">—</span>';
    const col = pct >= 0 ? 'var(--success)' : 'var(--danger)';
    return `<span style="color:${col};font-weight:700;">${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
  }
  function flagBadges(flags) {
    return flags.map(f => `<span class="pill ${f.type==='danger'?'pill-danger':'pill-warning'}" style="font-size:10px;">${f.label}</span>`).join(' ');
  }
  function scoreBar(score, sc) {
    return `<div style="display:flex;align-items:center;gap:6px;">
      <div style="flex:1;height:6px;background:var(--border);border-radius:3px;">
        <div style="width:${score}%;height:6px;background:${sc(score)};border-radius:3px;"></div>
      </div>
      <span style="font-size:12px;font-weight:700;color:${sc(score)};min-width:24px;">${score}</span>
    </div>`;
  }

  // Score cards
  const cards = all.map(s => `
    <div class="card" style="flex:1;min-width:190px;cursor:pointer;" onclick="showPerfDetail('${s.name}')">
      <div class="card-body" style="padding:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
          <div style="width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;background:${memberBg(s.name)};color:${memberFg(s.name)};">${memberEmoji(s.name)}</div>
          <div>
            <div style="font-weight:700;font-size:14px;">${s.name}</div>
            <div style="font-size:11px;color:${s.labelColor};font-weight:700;">${s.label}</div>
          </div>
          ${s.flags.length ? `<div style="margin-left:auto;">${flagBadges(s.flags)}</div>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
          <div style="text-align:center;background:var(--bg);border-radius:6px;padding:8px 4px;">
            <div style="font-size:20px;font-weight:800;color:${s.scoreColor(s.todayScore)};">${s.todayScore}</div>
            <div style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;">Today</div>
          </div>
          <div style="text-align:center;background:var(--bg);border-radius:6px;padding:8px 4px;">
            <div style="font-size:20px;font-weight:800;color:${s.scoreColor(s.weekScore)};">${s.weekScore}</div>
            <div style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;">Week</div>
          </div>
          <div style="text-align:center;background:var(--bg);border-radius:6px;padding:8px 4px;">
            <div style="font-size:20px;font-weight:800;color:${s.scoreColor(s.monthScore)};">${s.monthScore}</div>
            <div style="font-size:9px;color:var(--muted);font-weight:700;text-transform:uppercase;">Month</div>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);">
          <span>Week ${impBadge(s.weekImprove)}</span>
          <span>${s.todayExported} exported today</span>
        </div>
      </div>
    </div>`).join('');

  // Table
  const tableRows = all.map(s => `<tr onclick="showPerfDetail('${s.name}')" style="cursor:pointer;">
    <td style="font-weight:600;">${memberEmoji(s.name)} ${s.name}</td>
    <td><span style="font-size:18px;font-weight:800;color:${s.scoreColor(s.todayScore)};">${s.todayScore}</span></td>
    <td><span style="font-size:18px;font-weight:800;color:${s.scoreColor(s.weekScore)};">${s.weekScore}</span></td>
    <td><span style="font-size:18px;font-weight:800;color:${s.scoreColor(s.monthScore)};">${s.monthScore}</span></td>
    <td>${impBadge(s.weekImprove)}</td>
    <td style="font-weight:700;font-size:15px;">${s.monthExported}</td>
    <td><span style="color:${s.labelColor};font-weight:700;">${s.label}</span>${s.flags.length ? ' ' + flagBadges(s.flags) : ''}</td>
  </tr>`).join('');

  const howPoints = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><span class="card-title">💡 How Points Work</span></div>
      <div class="card-body" style="padding:14px 16px;">
        <div style="display:flex;flex-wrap:wrap;gap:24px;">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Per Reel (30 pts total)</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="display:inline-block;width:36px;text-align:right;font-weight:800;color:var(--warning);">+15</span> Sent for Caption <span style="font-size:11px;color:var(--muted);">(half)</span></div>
              <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="display:inline-block;width:36px;text-align:right;font-weight:800;color:var(--success);">+15</span> Exported <span style="font-size:11px;color:var(--muted);">(remaining half)</span></div>
              <div style="margin-top:4px;padding:8px 10px;background:var(--bg);border-radius:6px;font-size:12px;color:var(--muted);">
                3 reels × 30 pts = <strong style="color:var(--p700);">90 pts</strong>
              </div>
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Daily Update</div>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <div style="display:flex;align-items:center;gap:10px;font-size:13px;"><span style="display:inline-block;width:36px;text-align:right;font-weight:800;color:var(--p700);">+10</span> Morning plan submitted</div>
              <div style="margin-top:4px;padding:8px 10px;background:var(--bg);border-radius:6px;font-size:12px;color:var(--muted);">
                90 + 10 = <strong style="color:var(--success);">100 pts max</strong>
              </div>
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Labels</div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              <div style="font-size:13px;"><span style="color:var(--success);font-weight:700;">Elite</span> &nbsp;— 90–100</div>
              <div style="font-size:13px;"><span style="color:var(--p700);font-weight:700;">Good</span> &nbsp;&nbsp;— 75–89</div>
              <div style="font-size:13px;"><span style="color:var(--warning);font-weight:700;">Average</span> — 60–74</div>
              <div style="font-size:13px;"><span style="color:var(--danger);font-weight:700;">Poor</span> &nbsp;&nbsp;— below 60</div>
            </div>
          </div>
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Auto Flags</div>
            <div style="display:flex;flex-direction:column;gap:5px;">
              <div style="font-size:13px;"><span class="pill pill-warning" style="font-size:10px;">No Update</span> &nbsp;daily plan not submitted</div>
              <div style="font-size:13px;"><span class="pill pill-danger"  style="font-size:10px;">Low Output</span> &nbsp;0 exports for 2 days</div>
              <div style="font-size:13px;"><span class="pill pill-danger"  style="font-size:10px;">At Risk</span> &nbsp;&nbsp;&nbsp;more than 2 overdue</div>
              <div style="font-size:13px;"><span class="pill pill-warning" style="font-size:10px;">Declining</span> &nbsp;week score below last week</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('performance-body').innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-bottom:20px;">${cards}</div>
    ${howPoints}
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><span class="card-title">📊 Performance Table</span></div>
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table class="tbl">
          <thead><tr>
            <th>Member</th><th>Today</th><th>Week Avg</th><th>Month Avg</th><th>Improvement</th><th>Exported (Month)</th><th>Status</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
    <div id="perf-detail-card" style="display:none;"></div>`;
}

function showPerfDetail(name) {
  const s = getMemberStats(name);

  function scoreBar(score) {
    return `<div style="display:flex;align-items:center;gap:8px;">
      <div style="flex:1;height:8px;background:var(--border);border-radius:4px;">
        <div style="width:${score}%;height:8px;background:${s.scoreColor(score)};border-radius:4px;"></div>
      </div>
      <span style="font-size:13px;font-weight:800;color:${s.scoreColor(score)};min-width:28px;">${score}</span>
    </div>`;
  }

  const barH = 56;
  const miniChart = `<div style="display:flex;align-items:flex-end;gap:3px;height:${barH}px;">
    ${s.last7.map(d => {
      const h = Math.max(3, Math.round((d.score / 100) * barH));
      const dayName = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short' });
      const isToday = d.date === new Date().toISOString().split('T')[0];
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">
        <div style="font-size:9px;font-weight:${isToday?'700':'400'};color:${isToday?'var(--p700)':'var(--muted)'};">${d.score}</div>
        <div style="width:100%;height:${h}px;background:${s.scoreColor(d.score)};border-radius:3px 3px 0 0;" title="${d.score}"></div>
        <div style="font-size:9px;color:var(--muted);">${dayName}</div>
      </div>`;
    }).join('')}
  </div>`;

  const card = document.getElementById('perf-detail-card');
  card.style.display = 'block';
  card.innerHTML = `<div class="card">
    <div class="card-header">
      <span class="card-title">${memberEmoji(name)} ${name} — Detail</span>
      <button class="btn btn-sm" onclick="document.getElementById('perf-detail-card').style.display='none'">✕</button>
    </div>
    <div class="card-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;flex-wrap:wrap;">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:10px;">Score Breakdown</div>
          <div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Today</div>${scoreBar(s.todayScore)}</div>
          <div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--muted);margin-bottom:4px;">This Week (avg)</div>${scoreBar(s.weekScore)}</div>
          <div style="margin-bottom:10px;"><div style="font-size:11px;color:var(--muted);margin-bottom:4px;">This Month (avg)</div>${scoreBar(s.monthScore)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px;">
            <div style="text-align:center;background:var(--bg);border-radius:8px;padding:10px;">
              <div style="font-size:18px;font-weight:800;">${s.active}</div>
              <div style="font-size:10px;color:var(--muted);">Active</div>
            </div>
            <div style="text-align:center;background:var(--bg);border-radius:8px;padding:10px;">
              <div style="font-size:18px;font-weight:800;color:var(--success);">${s.monthExported}</div>
              <div style="font-size:10px;color:var(--muted);">Exported</div>
            </div>
            <div style="text-align:center;background:var(--bg);border-radius:8px;padding:10px;">
              <div style="font-size:18px;font-weight:800;${s.overdue?'color:var(--danger)':''}">${s.overdue}</div>
              <div style="font-size:10px;color:var(--muted);">Overdue</div>
            </div>
          </div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:10px;">Last 7 Days</div>
          ${miniChart}
          <div style="margin-top:14px;">
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Daily update today: <strong>${s.duToday?'✅ Submitted':'❌ Not submitted'}</strong></div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Week vs last week: <strong>${s.weekImprove!==null?(s.weekImprove>=0?'+':'')+s.weekImprove+'%':'—'}</strong></div>
            <div style="font-size:12px;color:var(--muted);">Month improvement: <strong>${s.monthImprove!==null?(s.monthImprove>=0?'+':'')+s.monthImprove+'%':'—'}</strong></div>
          </div>
          ${s.flags.length ? `<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Flags</div><div style="display:flex;flex-wrap:wrap;gap:6px;">${s.flags.map(f=>`<span class="pill ${f.type==='danger'?'pill-danger':'pill-warning'}">${f.label}</span>`).join('')}</div></div>` : `<div style="margin-top:14px;"><span class="pill pill-success">No issues ✓</span></div>`}
        </div>
      </div>
    </div>
  </div>`;
  card.scrollIntoView({ behavior:'smooth', block:'nearest' });
}


// ---- 18. DAILY UPDATE ----

let _duEditMode = false;

function renderDailyUpdate() {
  const todayStr  = new Date().toISOString().split('T')[0];
  const yesterStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const todayRec  = dailyUpdates.find(d => d.member_name === currentUser && d.update_date === todayStr);
  const yesterRec = dailyUpdates.find(d => d.member_name === currentUser && d.update_date === yesterStr);

  const dateLabel = new Date(todayStr + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  document.getElementById('daily-sub').textContent = dateLabel;

  // Carry-overs: tasks from yesterday that weren't completed
  const carryovers = [];
  if (yesterRec) {
    [...(yesterRec.before_lunch||[]), ...(yesterRec.after_lunch||[])].forEach(t => {
      if (t.status !== 'completed') carryovers.push(t.task);
    });
  }

  let html = '';

  if (!todayRec || !todayRec.morning_done || _duEditMode) {
    // Morning plan form
    const carryHtml = carryovers.length ? `
      <div style="margin-bottom:16px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:12px;">
        <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:8px;">⚠ Carry-Over from Yesterday — Include if still pending</div>
        ${carryovers.map(t => `<div style="font-size:13px;padding:3px 0;color:#78350f;">• ${t}</div>`).join('')}
      </div>` : '';

    // Pre-fill from existing submitted record (edit mode), draft in DB, or localStorage
    const draftBefore = todayRec?.before_lunch?.map(t=>t.task).join('\n') || localStorage.getItem(`du-draft-before-${currentUser}-${todayStr}`) || '';
    const draftAfter  = todayRec?.after_lunch?.map(t=>t.task).join('\n')  || localStorage.getItem(`du-draft-after-${currentUser}-${todayStr}`)  || '';
    const hasDraft    = !!(draftBefore || draftAfter);

    html = `
      <div class="card" style="border:2px solid var(--p400);">
        <div class="card-header">
          <span class="card-title">🌅 ${_duEditMode ? 'Edit Morning Plan' : 'Morning Plan'} <span style="font-size:12px;color:var(--muted);font-weight:400;">${_duEditMode ? '' : '(fill within 5 minutes of starting work)'}</span></span>
          ${_duEditMode ? '<span class="pill pill-warning">Editing</span>' : hasDraft ? '<span class="pill pill-neutral">Draft saved</span>' : '<span class="pill pill-warning">Not submitted</span>'}
        </div>
        <div class="card-body">
          ${carryHtml}
          <div class="fg" style="margin-bottom:14px;">
            <label>Day Type</label>
            <select id="du-day-type" onchange="toggleShootDay()" style="font-size:13px;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface);width:100%;max-width:260px;">
              <option value="regular">Regular Day</option>
              <option value="shoot">🎬 Shoot Day</option>
            </select>
          </div>
          <div id="du-task-section">
            <div class="form-grid">
              <div class="fg">
                <label>Before Lunch — Tasks</label>
                <textarea id="du-before" rows="5" placeholder="One task per line&#10;e.g. Edit Ramraj reel&#10;QC Gowtham footage&#10;Upload YouTube Short" style="font-size:13px;">${draftBefore}</textarea>
              </div>
              <div class="fg">
                <label>After Lunch — Tasks</label>
                <textarea id="du-after" rows="5" placeholder="One task per line&#10;e.g. Caption 3 posts&#10;Export final video&#10;Send for QC" style="font-size:13px;">${draftAfter}</textarea>
              </div>
            </div>
          </div>
          <div id="du-shoot-notice" style="display:none;background:#ecfdf5;border:1px solid #6ee7b7;border-radius:8px;padding:14px;margin-bottom:8px;">
            <div style="font-size:14px;font-weight:600;color:#065f46;">🎬 Shoot Day — 100 points will be awarded automatically</div>
            <div style="font-size:12px;color:#047857;margin-top:4px;">No tasks needed. Just submit to mark your attendance.</div>
          </div>
          <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="saveMorningPlan()">${_duEditMode ? 'Save Changes' : 'Submit Morning Plan'}</button>
            ${_duEditMode ? '<button class="btn" onclick="_duEditMode=false;renderDailyUpdate()">Cancel</button>' : '<button class="btn" onclick="saveMorningDraft()">Save for Now</button>'}
          </div>
        </div>
      </div>`;
  } else if (todayRec.is_shoot_day) {
    // Shoot day — no task list needed
    html = `
      <div class="card" style="border:2px solid #6ee7b7;">
        <div class="card-header">
          <span class="card-title">🎬 Shoot Day</span>
          <span class="pill pill-success">Morning submitted ✓</span>
        </div>
        <div class="card-body">
          <div style="background:#ecfdf5;border-radius:8px;padding:16px;text-align:center;">
            <div style="font-size:24px;margin-bottom:6px;">🎬</div>
            <div style="font-size:15px;font-weight:700;color:#065f46;">Shoot Day — 100 Points</div>
            <div style="font-size:13px;color:#047857;margin-top:4px;">Great work on the shoot! No EOD tasks required.</div>
          </div>
        </div>
      </div>`;
  } else {
    // Plan submitted — show tasks with EOD dropdowns
    const before = todayRec.before_lunch || [];
    const after  = todayRec.after_lunch  || [];

    const eodDoneComp  = [...before,...after].filter(t => t.status === 'completed').length;
    const eodDoneTotal = before.length + after.length;

    const taskRow = (t, section, idx) => {
      const showReason = t.status === 'not_done' || t.status === 'in_progress';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;font-size:13px;font-weight:500;min-width:120px;">${t.task}</div>
          <select id="eod-status-${section}-${idx}" onchange="onEodStatusChange('${section}',${idx})"
            style="font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid var(--border);">
            <option value="">— Status —</option>
            <option value="completed"  ${t.status==='completed' ?'selected':''}>✅ Completed</option>
            <option value="in_progress"${t.status==='in_progress'?'selected':''}>🔄 In Progress</option>
            <option value="not_done"   ${t.status==='not_done'  ?'selected':''}>❌ Not Done</option>
          </select>
        </div>
        <div id="eod-reason-wrap-${section}-${idx}" style="display:${showReason?'block':'none'};margin-top:6px;">
          <input type="text" id="eod-reason-${section}-${idx}" value="${t.reason||''}"
            placeholder="Reason (required if not done / in progress)"
            style="width:100%;font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--border);box-sizing:border-box;">
        </div>
      </div>`;
    };

    html = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">🌅 Today's Plan</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="pill pill-success">Morning plan submitted ✓</span>
            <button class="btn btn-sm" onclick="_duEditMode=true;renderDailyUpdate()" style="font-size:11px;">Edit Plan</button>
          </div>
        </div>
        <div class="card-body">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Before Lunch</div>
          ${before.length ? before.map((t,i) => taskRow(t,'before',i)).join('') : '<div class="empty-state" style="margin:8px 0;">No tasks added</div>'}
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:16px 0 4px;">After Lunch</div>
          ${after.length ? after.map((t,i) => taskRow(t,'after',i)).join('') : '<div class="empty-state" style="margin:8px 0;">No tasks added</div>'}
          <div style="margin-top:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="saveEodUpdate()">Submit EOD Update</button>
            <button class="btn" onclick="saveEodProgress()">Save for Now</button>
            ${todayRec.eod_done ? `<span class="pill pill-success">EOD submitted — ${eodDoneComp}/${eodDoneTotal} completed</span>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Monthly history section (always shown below the daily form)
  html += `
    <div class="card" style="margin-top:16px;">
      <div class="card-header">
        <span class="card-title">📅 Monthly History</span>
        <div style="display:flex;align-items:center;gap:6px;">
          <button class="btn btn-sm" onclick="dailyMonthPrev()">&#9664;</button>
          <span id="daily-month-label" style="font-size:13px;font-weight:600;min-width:100px;text-align:center;">${fmtMonth(dailyMonthView)}</span>
          <button class="btn btn-sm" onclick="dailyMonthNext()">&#9654;</button>
        </div>
      </div>
      <div class="card-body" style="padding:0;overflow-x:auto;" id="daily-month-body">
        <div class="loading"><div class="spinner"></div>Loading...</div>
      </div>
    </div>`;

  document.getElementById('daily-update-body').innerHTML = html;
  loadDailyMonthData();
}

function fmtMonth(ym) {
  const [y, m] = ym.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-IN', { month:'long', year:'numeric' });
}

function dailyMonthPrev() {
  const [y, m] = dailyMonthView.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  dailyMonthView = d.toISOString().slice(0, 7);
  document.getElementById('daily-month-label').textContent = fmtMonth(dailyMonthView);
  loadDailyMonthData();
}
function dailyMonthNext() {
  const [y, m] = dailyMonthView.split('-').map(Number);
  const d = new Date(y, m, 1);
  dailyMonthView = d.toISOString().slice(0, 7);
  document.getElementById('daily-month-label').textContent = fmtMonth(dailyMonthView);
  loadDailyMonthData();
}

async function loadDailyMonthData() {
  const [y, m] = dailyMonthView.split('-').map(Number);
  const from = `${dailyMonthView}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to   = `${dailyMonthView}-${String(lastDay).padStart(2,'0')}`;

  const { data } = await sb.from('daily_updates').select('*')
    .eq('member_name', currentUser).gte('update_date', from).lte('update_date', to)
    .order('update_date', { ascending: false });

  const records = data || [];
  const body = document.getElementById('daily-month-body');
  if (!body) return;

  if (!records.length) {
    body.innerHTML = `<div class="empty-state" style="padding:20px;">No entries for ${fmtMonth(dailyMonthView)}.</div>`;
    return;
  }

  const rows = records.map(rec => {
    const isShoot = !!rec.is_shoot_day;
    const before = rec.before_lunch || [];
    const after  = rec.after_lunch  || [];
    const all    = [...before, ...after];
    const comp   = all.filter(t => t.status === 'completed').length;
    const inprog = all.filter(t => t.status === 'in_progress').length;
    const notdone= all.filter(t => t.status === 'not_done').length;
    const total  = all.length;
    const pct    = total ? Math.round(comp / total * 100) : 0;

    const dayLabel = new Date(rec.update_date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' });
    const safeId   = rec.update_date.replace(/-/g,'');

    if (isShoot) {
      return `<tr style="background:#f0fdf4;">
        <td style="font-weight:600;">${dayLabel}</td>
        <td colspan="6"><span style="background:#6ee7b7;color:#065f46;font-size:11px;padding:2px 10px;border-radius:20px;font-weight:700;">🎬 Shoot Day</span></td>
        <td><span class="pill pill-success">100 pts</span></td>
      </tr>`;
    }

    const detailHtml = `<tr id="mdetail-${safeId}" style="display:none;background:var(--bg);">
      <td colspan="8" style="padding:12px 16px;">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Before Lunch</div>
        ${before.map(t => `<div style="display:flex;gap:8px;padding:3px 0;font-size:13px;">
          <span>${t.status==='completed'?'✅':t.status==='in_progress'?'🔄':t.status==='not_done'?'❌':'⏳'}</span>
          <span style="flex:1;">${t.task}</span>
          ${t.reason?`<span style="font-size:11px;color:var(--muted);font-style:italic;">← ${t.reason}</span>`:''}
        </div>`).join('') || '<div style="color:var(--muted);font-size:12px;">None</div>'}
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:10px 0 6px;">After Lunch</div>
        ${after.map(t => `<div style="display:flex;gap:8px;padding:3px 0;font-size:13px;">
          <span>${t.status==='completed'?'✅':t.status==='in_progress'?'🔄':t.status==='not_done'?'❌':'⏳'}</span>
          <span style="flex:1;">${t.task}</span>
          ${t.reason?`<span style="font-size:11px;color:var(--muted);font-style:italic;">← ${t.reason}</span>`:''}
        </div>`).join('') || '<div style="color:var(--muted);font-size:12px;">None</div>'}
      </td>
    </tr>`;

    return `<tr onclick="toggleMDetail('${safeId}')" style="cursor:pointer;">
      <td style="font-weight:600;">${dayLabel}</td>
      <td>${before.length}</td>
      <td>${after.length}</td>
      <td style="color:var(--success);font-weight:700;">${comp}</td>
      <td style="color:var(--warning);font-weight:700;">${inprog}</td>
      <td style="color:var(--danger);font-weight:700;">${notdone}</td>
      <td>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;height:6px;background:var(--border);border-radius:3px;min-width:60px;">
            <div style="width:${pct}%;height:6px;background:var(--success);border-radius:3px;"></div>
          </div>
          <span style="font-size:12px;color:var(--muted);">${pct}%</span>
        </div>
      </td>
      <td>${rec.eod_done?'<span class="pill pill-success">Done</span>':'<span class="pill pill-neutral">Pending</span>'}</td>
    </tr>${detailHtml}`;
  }).join('');

  body.innerHTML = `<table class="tbl">
    <thead><tr>
      <th>Day</th><th>Before Lunch</th><th>After Lunch</th>
      <th>✅ Done</th><th>🔄 Progress</th><th>❌ Not Done</th><th>Completion</th><th>EOD</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function toggleMDetail(safeId) {
  const row = document.getElementById('mdetail-' + safeId);
  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

function onEodStatusChange(section, idx) {
  const val  = document.getElementById(`eod-status-${section}-${idx}`)?.value;
  const wrap = document.getElementById(`eod-reason-wrap-${section}-${idx}`);
  if (wrap) wrap.style.display = (val === 'not_done' || val === 'in_progress') ? 'block' : 'none';
}

function toggleShootDay() {
  const isShoot = document.getElementById('du-day-type')?.value === 'shoot';
  const taskSec = document.getElementById('du-task-section');
  const notice  = document.getElementById('du-shoot-notice');
  if (taskSec) taskSec.style.display = isShoot ? 'none' : 'block';
  if (notice)  notice.style.display  = isShoot ? 'block' : 'none';
}

async function saveMorningDraft() {
  const todayStr = new Date().toISOString().split('T')[0];
  const beforeVal = document.getElementById('du-before')?.value || '';
  const afterVal  = document.getElementById('du-after')?.value  || '';

  // Save to localStorage as immediate backup
  localStorage.setItem(`du-draft-before-${currentUser}-${todayStr}`, beforeVal);
  localStorage.setItem(`du-draft-after-${currentUser}-${todayStr}`,  afterVal);

  // Also persist to DB so it syncs across devices
  const before = beforeVal.split('\n').map(s=>s.trim()).filter(Boolean).map(task=>({task,status:'',reason:''}));
  const after  = afterVal.split('\n').map(s=>s.trim()).filter(Boolean).map(task=>({task,status:'',reason:''}));
  if (before.length || after.length) {
    setSyncing(); _markLocalWrite();
    const { data, error } = await sb.from('daily_updates')
      .upsert([{ member_name: currentUser, update_date: todayStr, before_lunch: before, after_lunch: after, morning_done: false, eod_done: false }],
        { onConflict: 'member_name,update_date' }).select();
    if (!error && data) {
      const idx = dailyUpdates.findIndex(d => d.member_name === currentUser && d.update_date === todayStr);
      if (idx >= 0) dailyUpdates[idx] = data[0]; else dailyUpdates.push(data[0]);
      setSynced();
    }
  }
  toast('Draft saved — come back anytime to submit.');
  // Refresh pill to show "Draft saved"
  renderDailyUpdate();
}

async function saveMorningPlan() {
  const isShoot = document.getElementById('du-day-type')?.value === 'shoot';
  const before = isShoot ? [] : (document.getElementById('du-before')?.value || '')
    .split('\n').map(s => s.trim()).filter(Boolean).map(task => ({ task, status:'', reason:'' }));
  const after  = isShoot ? [] : (document.getElementById('du-after')?.value || '')
    .split('\n').map(s => s.trim()).filter(Boolean).map(task => ({ task, status:'', reason:'' }));

  if (!isShoot && !before.length && !after.length) { toast('Add at least one task.'); return; }

  const todayStr = new Date().toISOString().split('T')[0];
  const row = { member_name: currentUser, update_date: todayStr, before_lunch: before, after_lunch: after, morning_done: true, eod_done: isShoot, is_shoot_day: isShoot };

  setSyncing(); _markLocalWrite();
  const { data, error } = await sb.from('daily_updates').upsert([row], { onConflict: 'member_name,update_date' }).select();
  if (error) { setSyncError(); toast('Save failed: ' + error.message); return; }
  setSynced(); toast(_duEditMode ? 'Plan updated!' : 'Morning plan submitted!');
  _duEditMode = false;

  // Clear localStorage draft once officially submitted
  localStorage.removeItem(`du-draft-before-${currentUser}-${todayStr}`);
  localStorage.removeItem(`du-draft-after-${currentUser}-${todayStr}`);

  const idx = dailyUpdates.findIndex(d => d.member_name === currentUser && d.update_date === todayStr);
  if (idx >= 0) dailyUpdates[idx] = data[0]; else dailyUpdates.push(data[0]);
  renderDailyUpdate();
}

async function saveEodProgress() {
  const todayStr = new Date().toISOString().split('T')[0];
  const rec = dailyUpdates.find(d => d.member_name === currentUser && d.update_date === todayStr);
  if (!rec) return;

  const collect = (tasks, section) => tasks.map((t, i) => ({
    task:   t.task,
    status: document.getElementById(`eod-status-${section}-${i}`)?.value || t.status || '',
    reason: document.getElementById(`eod-reason-${section}-${i}`)?.value || t.reason || '',
  }));
  const before = collect(rec.before_lunch || [], 'before');
  const after  = collect(rec.after_lunch  || [], 'after');

  const ok = await dbUpdate('daily_updates', rec.id, { before_lunch: before, after_lunch: after });
  if (ok) {
    const idx = dailyUpdates.findIndex(d => d.id === rec.id);
    dailyUpdates[idx] = { ...rec, before_lunch: before, after_lunch: after };
    toast('Progress saved — submit when all done.');
  }
}

async function saveEodUpdate() {
  const todayStr = new Date().toISOString().split('T')[0];
  const rec = dailyUpdates.find(d => d.member_name === currentUser && d.update_date === todayStr);
  if (!rec) return;

  const collect = (tasks, section) => tasks.map((t, i) => ({
    task:   t.task,
    status: document.getElementById(`eod-status-${section}-${i}`)?.value || t.status || '',
    reason: document.getElementById(`eod-reason-${section}-${i}`)?.value || t.reason || '',
  }));

  const before = collect(rec.before_lunch || [], 'before');
  const after  = collect(rec.after_lunch  || [], 'after');

  const ok = await dbUpdate('daily_updates', rec.id, { before_lunch: before, after_lunch: after, eod_done: true });
  if (ok) {
    const idx = dailyUpdates.findIndex(d => d.id === rec.id);
    dailyUpdates[idx] = { ...rec, before_lunch: before, after_lunch: after, eod_done: true };
    toast('EOD update saved!');
    renderDailyUpdate();
  }
}

// ---- TEAM DAILY ----

function teamDailyPrev() {
  const d = new Date(teamDailyViewDate + 'T00:00:00'); d.setDate(d.getDate() - 1);
  teamDailyViewDate = d.toISOString().split('T')[0]; renderTeamDaily();
}
function teamDailyNext() {
  const d = new Date(teamDailyViewDate + 'T00:00:00'); d.setDate(d.getDate() + 1);
  teamDailyViewDate = d.toISOString().split('T')[0]; renderTeamDaily();
}

async function renderTeamDaily() {
  const label = new Date(teamDailyViewDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  document.getElementById('team-daily-label').textContent = label;

  // Fetch records for this date fresh from DB
  const { data } = await sb.from('daily_updates').select('*').eq('update_date', teamDailyViewDate);
  const records = data || [];

  const members = teamProfiles.filter(p => p.role !== 'owner').map(p => p.name);
  if (!members.length) {
    document.getElementById('team-daily-body').innerHTML = '<div class="empty-state">No team members yet.</div>';
    return;
  }

  function statusIcon(s) {
    if (s === 'completed')  return '✅';
    if (s === 'in_progress') return '🔄';
    if (s === 'not_done')   return '❌';
    return '<span style="color:var(--muted);">⏳</span>';
  }

  const rows = members.map(name => {
    const rec = records.find(r => r.member_name === name);
    const safeId = name.replace(/\s+/g,'_');

    if (!rec || !rec.morning_done) {
      return `<tr>
        <td style="font-weight:600;">${name}</td>
        <td><span class="pill pill-danger">Not filed</span></td>
        <td colspan="6" style="color:var(--muted);font-size:12px;">No morning plan submitted</td>
      </tr>`;
    }

    const before = rec.before_lunch || [];
    const after  = rec.after_lunch  || [];
    const all    = [...before, ...after];
    const comp   = all.filter(t => t.status === 'completed').length;
    const inprog = all.filter(t => t.status === 'in_progress').length;
    const notdone= all.filter(t => t.status === 'not_done').length;

    const detailHtml = `
      <tr id="detail-${safeId}" style="display:none;background:var(--bg);">
        <td colspan="8" style="padding:12px 16px;">
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Before Lunch</div>
          ${before.map(t => `<div style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;font-size:13px;">
            <span>${statusIcon(t.status)}</span>
            <span style="flex:1;">${t.task}</span>
            ${t.reason ? `<span style="font-size:11px;color:var(--muted);font-style:italic;">← ${t.reason}</span>` : ''}
          </div>`).join('') || '<div style="color:var(--muted);font-size:12px;">None</div>'}
          <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:12px 0 6px;">After Lunch</div>
          ${after.map(t => `<div style="display:flex;gap:8px;align-items:flex-start;padding:4px 0;font-size:13px;">
            <span>${statusIcon(t.status)}</span>
            <span style="flex:1;">${t.task}</span>
            ${t.reason ? `<span style="font-size:11px;color:var(--muted);font-style:italic;">← ${t.reason}</span>` : ''}
          </div>`).join('') || '<div style="color:var(--muted);font-size:12px;">None</div>'}
        </td>
      </tr>`;

    return `<tr onclick="toggleDailyDetail('${safeId}')" style="cursor:pointer;">
      <td style="font-weight:600;">${name}</td>
      <td><span class="pill pill-success">Filed ✓</span></td>
      <td>${before.length}</td>
      <td>${after.length}</td>
      <td style="color:var(--success);font-weight:700;">${comp}</td>
      <td style="color:var(--warning);font-weight:700;">${inprog}</td>
      <td style="color:var(--danger);font-weight:700;">${notdone}</td>
      <td>${rec.eod_done ? '<span class="pill pill-success">Done</span>' : '<span class="pill pill-neutral">Pending</span>'}</td>
    </tr>${detailHtml}`;
  }).join('');

  document.getElementById('team-daily-body').innerHTML = `
    <div class="card">
      <div class="card-body" style="padding:0;overflow-x:auto;">
        <table class="tbl">
          <thead><tr>
            <th>Member</th><th>Filed?</th><th>Before Lunch</th><th>After Lunch</th>
            <th>✅ Done</th><th>🔄 In Progress</th><th>❌ Not Done</th><th>EOD</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:10px 16px;font-size:12px;color:var(--muted);">Click a row to see task details.</div>
    </div>`;
}

function toggleDailyDetail(safeId) {
  const row = document.getElementById('detail-' + safeId);
  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}


// ---- 18. EXPENSES ----

function toggleShootFields() {
  const isShoot = document.getElementById('exp-is-shoot').value === 'yes';
  document.getElementById('exp-shoot-section').style.display = isShoot ? 'block' : 'none';
  if (isShoot) calcShootTotal();
}

function calcShootTotal() {
  const t = Number(document.getElementById('exp-transport').value) || 0;
  const f = Number(document.getElementById('exp-food').value)      || 0;
  const s = Number(document.getElementById('exp-stay').value)      || 0;
  const o = Number(document.getElementById('exp-other').value)     || 0;
  const total = t + f + s + o;
  document.getElementById('exp-shoot-auto-total').textContent = '₹' + total.toLocaleString('en-IN');
  document.getElementById('exp-amount').value = total || '';
}

function _expPopulateMember(selectedName) {
  const sel = document.getElementById('exp-member');
  sel.innerHTML = '<option value="">— Select member —</option>' +
    teamProfiles.map(p => `<option value="${p.name}" ${p.name === selectedName ? 'selected' : ''}>${p.name}</option>`).join('');
}

function openAddExpense() {
  document.getElementById('modal-expense-title').textContent = '💸 Add Expense';
  document.getElementById('exp-edit-id').value   = '';
  document.getElementById('exp-date').value      = new Date().toISOString().split('T')[0];
  document.getElementById('exp-client').value    = '';
  document.getElementById('exp-category').value  = 'Food & Beverage';
  document.getElementById('exp-amount').value    = '';
  document.getElementById('exp-payment').value   = 'Cash';
  document.getElementById('exp-desc').value      = '';
  document.getElementById('exp-is-shoot').value  = 'no';
  document.getElementById('exp-shoot-name').value = '';
  document.getElementById('exp-location').value  = '';
  document.getElementById('exp-transport').value = '';
  document.getElementById('exp-food').value      = '';
  document.getElementById('exp-stay').value      = '';
  document.getElementById('exp-other').value     = '';
  document.getElementById('exp-shoot-section').style.display = 'none';
  _expPopulateMember(currentUser);
  openModal('modal-expense');
}

function openEditExpense(id) {
  const e = expenses.find(e => e.id === id);
  if (!e) return;
  document.getElementById('modal-expense-title').textContent  = '✏️ Edit Expense';
  document.getElementById('exp-edit-id').value    = id;
  document.getElementById('exp-date').value       = e.date || '';
  document.getElementById('exp-client').value     = e.client_name || '';
  document.getElementById('exp-category').value   = e.category || 'Food & Beverage';
  document.getElementById('exp-amount').value     = e.amount || '';
  document.getElementById('exp-payment').value    = e.payment_method || 'Cash';
  document.getElementById('exp-desc').value       = e.description || '';
  document.getElementById('exp-is-shoot').value   = e.is_shoot ? 'yes' : 'no';
  document.getElementById('exp-shoot-name').value = e.shoot_name || '';
  document.getElementById('exp-location').value   = e.location || '';
  document.getElementById('exp-transport').value  = e.transport_expense || '';
  document.getElementById('exp-food').value       = e.food_expense || '';
  document.getElementById('exp-stay').value       = e.stay_expense || '';
  document.getElementById('exp-other').value      = e.other_expense || '';
  document.getElementById('exp-shoot-section').style.display = e.is_shoot ? 'block' : 'none';
  if (e.is_shoot) calcShootTotal();
  _expPopulateMember(e.member_name);
  openModal('modal-expense');
}

async function saveExpense() {
  const editId  = document.getElementById('exp-edit-id').value;
  const isShoot = document.getElementById('exp-is-shoot').value === 'yes';
  const amount  = isShoot
    ? (Number(document.getElementById('exp-transport').value) || 0)
    + (Number(document.getElementById('exp-food').value)      || 0)
    + (Number(document.getElementById('exp-stay').value)      || 0)
    + (Number(document.getElementById('exp-other').value)     || 0)
    : Number(document.getElementById('exp-amount').value) || 0;

  const date = document.getElementById('exp-date').value;
  if (!date) { toast('Date is required.'); return; }

  const row = {
    date,
    member_name:       document.getElementById('exp-member').value   || null,
    client_name:       document.getElementById('exp-client').value   || null,
    category:          document.getElementById('exp-category').value,
    amount,
    description:       document.getElementById('exp-desc').value     || null,
    payment_method:    document.getElementById('exp-payment').value,
    is_shoot:          isShoot,
    shoot_name:        isShoot ? (document.getElementById('exp-shoot-name').value || null) : null,
    location:          isShoot ? (document.getElementById('exp-location').value   || null) : null,
    transport_expense: isShoot ? (Number(document.getElementById('exp-transport').value) || 0) : 0,
    food_expense:      isShoot ? (Number(document.getElementById('exp-food').value)      || 0) : 0,
    stay_expense:      isShoot ? (Number(document.getElementById('exp-stay').value)      || 0) : 0,
    other_expense:     isShoot ? (Number(document.getElementById('exp-other').value)     || 0) : 0,
  };

  const btn = document.getElementById('exp-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  if (editId) {
    await dbUpdate('expenses', editId, row);
    expenses = expenses.map(e => e.id === editId ? { ...e, ...row } : e);
  } else {
    const saved = await dbInsert('expenses', row);
    if (saved) expenses.unshift(saved);
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Save Expense'; }
  closeModal('modal-expense');
  renderExpenses();
}

async function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  await dbDelete('expenses', id);
  expenses = expenses.filter(e => e.id !== id);
  renderExpenses();
}

function clearExpFilters() {
  document.getElementById('exp-filter-date').value     = '';
  document.getElementById('exp-filter-month').value    = new Date().toISOString().slice(0, 7);
  document.getElementById('exp-filter-member').value   = '';
  document.getElementById('exp-filter-client').value   = '';
  document.getElementById('exp-filter-category').value = '';
  document.getElementById('exp-filter-type').value     = '';
  renderExpenses();
}

function renderExpenses() {
  const today     = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7);
  // Default month filter to current month on first render
  const mfEl = document.getElementById('exp-filter-month');
  if (mfEl && !mfEl.value) mfEl.value = thisMonth;

  // Summary (always full data, ignores filters)
  const todayExp    = expenses.filter(e => e.date === today);
  const monthExp    = expenses.filter(e => e.date?.startsWith(thisMonth));
  const todayTotal  = todayExp.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthTotal  = monthExp.reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthShoot  = monthExp.filter(e => e.is_shoot).reduce((s, e) => s + Number(e.amount || 0), 0);
  const monthOffice = monthExp.filter(e => !e.is_shoot).reduce((s, e) => s + Number(e.amount || 0), 0);

  document.getElementById('exp-summary').innerHTML = `
    <div class="mcard warning"><div class="mcard-label">Today's Expenses</div><div class="mcard-val">₹${todayTotal.toLocaleString('en-IN')}</div><div class="mcard-sub">${todayExp.length} entr${todayExp.length === 1 ? 'y' : 'ies'}</div></div>
    <div class="mcard danger"><div class="mcard-label">This Month Total</div><div class="mcard-val">₹${monthTotal.toLocaleString('en-IN')}</div><div class="mcard-sub">${monthExp.length} entries</div></div>
    <div class="mcard purple"><div class="mcard-label">Shoot Expenses</div><div class="mcard-val">₹${monthShoot.toLocaleString('en-IN')}</div><div class="mcard-sub">this month</div></div>
    <div class="mcard info"><div class="mcard-label">Office / General</div><div class="mcard-val">₹${monthOffice.toLocaleString('en-IN')}</div><div class="mcard-sub">this month</div></div>`;

  // Update filter dropdowns
  const members    = [...new Set(expenses.map(e => e.member_name).filter(Boolean))].sort();
  const clients    = [...new Set(expenses.map(e => e.client_name).filter(Boolean))].sort();
  const mSel = document.getElementById('exp-filter-member');
  const cSel = document.getElementById('exp-filter-client');
  if (mSel) { const cv = mSel.value; mSel.innerHTML = '<option value="">All Members</option>' + members.map(m => `<option value="${m}" ${m===cv?'selected':''}>${m}</option>`).join(''); }
  if (cSel) { const cv = cSel.value; cSel.innerHTML = '<option value="">All Clients</option>'  + clients.map(c => `<option value="${c}" ${c===cv?'selected':''}>${c}</option>`).join(''); }

  // Apply filters
  const dateFilter   = document.getElementById('exp-filter-date')?.value;
  const monthFilter  = document.getElementById('exp-filter-month')?.value;
  const memberFilter = document.getElementById('exp-filter-member')?.value;
  const clientFilter = document.getElementById('exp-filter-client')?.value;
  const catFilter    = document.getElementById('exp-filter-category')?.value;
  const typeFilter   = document.getElementById('exp-filter-type')?.value;

  let filtered = [...expenses];
  if (dateFilter)             filtered = filtered.filter(e => e.date === dateFilter);
  else if (monthFilter)       filtered = filtered.filter(e => e.date?.startsWith(monthFilter));
  if (memberFilter)           filtered = filtered.filter(e => e.member_name === memberFilter);
  if (clientFilter)           filtered = filtered.filter(e => e.client_name === clientFilter);
  if (catFilter)              filtered = filtered.filter(e => e.category === catFilter);
  if (typeFilter === 'shoot')  filtered = filtered.filter(e => e.is_shoot);
  if (typeFilter === 'office') filtered = filtered.filter(e => !e.is_shoot);

  const filteredTotal = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totEl = document.getElementById('exp-filtered-total');
  if (totEl) totEl.textContent = filtered.length ? `Total: ₹${filteredTotal.toLocaleString('en-IN')}` : '';

  document.getElementById('exp-list').innerHTML = filtered.length
    ? filtered.map(e => {
        const amt = Number(e.amount || 0);
        return `<div class="alert-row">
          <div class="adot ${e.is_shoot ? 'adot-purple' : 'adot-blue'}"></div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;">${e.member_name || '—'} · ${e.client_name || 'No client'} · ${e.category || '—'}
              ${e.is_shoot ? '<span class="pill pill-info" style="font-size:10px;margin-left:4px;">🎬 Shoot</span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--muted);">${fmt(e.date)} · ${e.payment_method || ''} · ${e.description || '—'}</div>
            ${e.is_shoot && e.shoot_name ? `<div style="font-size:11px;color:var(--p700);margin-top:2px;">📍 ${e.shoot_name}${e.location ? ' · '+e.location : ''}${e.transport_expense ? ' · 🚗 ₹'+e.transport_expense : ''}${e.food_expense ? ' · 🍱 ₹'+e.food_expense : ''}${e.stay_expense ? ' · 🏨 ₹'+e.stay_expense : ''}${e.other_expense ? ' · Other ₹'+e.other_expense : ''}</div>` : ''}
          </div>
          <div style="font-size:15px;font-weight:700;color:var(--danger);white-space:nowrap;margin-right:8px;">₹${amt.toLocaleString('en-IN')}</div>
          <button class="btn btn-sm btn-primary" style="font-size:11px;" onclick="openEditExpense('${e.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteExpense('${e.id}')">✕</button>
        </div>`;
      }).join('')
    : '<div class="empty-state">No expenses found.</div>';
}


// ---- 19. REALTIME + INIT ----
let _realtimeTimer  = null;
let _tabWasHidden   = false;
let _realtimeSetup  = false;

function setupRealtime() {
  if (_realtimeSetup) return;   // prevent duplicate listeners on re-login
  _realtimeSetup = true;
  sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      // Own writes: skip entirely — local state already updated
      if (_wasLocalWrite()) return;
      // Tab hidden: just flag, don't queue work
      if (document.hidden) { _tabWasHidden = true; return; }
      // Someone else changed data: debounce, reload silently (no re-render freeze)
      clearTimeout(_realtimeTimer);
      _realtimeTimer = setTimeout(() => { if (!_loadLock) loadAll(true); }, 3000);
    })
    .subscribe();

  // Tab becomes visible: close sidebar (defensive), then silently reload if data changed
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentProfile) {
      closeSidebar();
      if (_tabWasHidden) {
        _tabWasHidden = false;
        clearTimeout(_realtimeTimer);
        // 400ms delay — lets the browser fully restore the tab before we hit the network
        setTimeout(() => { if (!_loadLock) loadAll(true); }, 400);
      }
    }
  });
}

// Start by checking if the user is already logged in
initAuth();
