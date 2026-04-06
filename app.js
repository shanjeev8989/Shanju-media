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
async function loadAll() {
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
    tasks = t.data || []; shoots = s.data || []; posts = p.data || [];
    pipeline = pl.data || []; payments = pay.data || []; invoices = inv.data || [];
    teamProfiles = prof.data || [];
    populateEditorDropdown();
    populateTeamDropdowns();

    await loadPendingUsers(); // owner only — no-op for others

    setSynced();
    renderPage(document.querySelector('.page.active')?.id.replace('page-', ''));
    updatePayNotif();
  } catch (e) {
    setSyncError();
    console.error(e);
  }
}

function populateEditorDropdown() {
  const sel = document.getElementById('po-editor');
  if (!sel) return;
  const editors = teamProfiles.filter(p => p.role === 'editor');
  const current = sel.value;
  sel.innerHTML = '<option value="">— Unassigned —</option>' +
    editors.map(e => `<option value="${e.name}" ${e.name === current ? 'selected' : ''}>${e.name}</option>`).join('');
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

async function dbInsert(table, row, silent = false) {
  setSyncing();
  const { data, error } = await sb.from(table).insert([row]).select();
  if (error) { setSyncError(); toast('Save failed: ' + error.message); return null; }
  setSynced();
  if (!silent) toast('Saved!');
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
  const role = currentProfile?.role;
  // Finance pages: owner only
  if ((id === 'payments' || id === 'invoices') && role !== 'owner') {
    toast('Access restricted — Finance is visible to Owner only.');
    return;
  }
  // Work pages (All Tasks, Kanban, Team): owner and manager only
  const workPages = ['all-tasks','kanban','team'];
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
  else if (id === 'payments')  renderPayments();
  else if (id === 'invoices')  renderInvoices();
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
  // manager + editor: no finance
  if (profile.role !== 'owner') {
    document.querySelectorAll('[data-section="finance"]').forEach(el => el.style.display = 'none');
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

  document.getElementById('dash-title').textContent = isOwner ? 'Founder Dashboard' : `${currentUser}'s Dashboard`;
  document.getElementById('dash-sub').textContent   = isOwner ? 'Full company overview' : 'Your personal workspace';
  document.getElementById('focus-title').textContent = isOwner ? '🎯 Founder Focus Today' : '🎯 My Focus Today';

  // Active tasks for current user scope
  const allActive = tasks.filter(t => t.status !== 'Exported' && !t.done);
  const cuLower   = currentUser.trim().toLowerCase();
  const myActive  = allActive.filter(t => t.owner && t.owner.trim().toLowerCase() === cuLower);
  const myPosts   = posts.filter(p => p.assigned_editor === currentUser);
  const overdue   = myActive.filter(t => daysDiff(t.deadline) < 0);
  const dueToday  = myActive.filter(t => daysDiff(t.deadline) === 0);
  const review    = myActive.filter(t => t.status === 'Sent for Caption');
  const pendingPay = payments.filter(p => p.status === 'Pending' || p.status === 'Partially Paid');
  const pendingAmt = pendingPay.reduce((s, p) => s + Math.max(0, Number(p.amount) - Number(p.advance || 0)), 0);

  let m = '';
  if (isOwner) {
    m = `<div class="mcard purple"><div class="mcard-label">Active Tasks</div><div class="mcard-val">${allActive.length}</div><div class="mcard-sub">All clients</div></div>
    <div class="mcard danger"><div class="mcard-label">Overdue</div><div class="mcard-val">${allActive.filter(t => daysDiff(t.deadline) < 0).length}</div></div>
    <div class="mcard warning"><div class="mcard-label">Due Today</div><div class="mcard-val">${allActive.filter(t => daysDiff(t.deadline) === 0).length}</div></div>
    <div class="mcard info"><div class="mcard-label">Sent for Caption</div><div class="mcard-val">${allActive.filter(t => t.status === 'Sent for Caption').length}</div></div>
    <div class="mcard danger"><div class="mcard-label">Pending Payments</div><div class="mcard-val">${pendingPay.length}</div><div class="mcard-sub">${fmtMoney(pendingAmt)}</div></div>
    <div class="mcard success"><div class="mcard-label">Clients</div><div class="mcard-val">${[...new Set(tasks.map(t => t.client))].length}</div></div>`;
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
  else renderMyTasks();
  renderDash();
}

async function updatePostStatus(id, status) {
  const now = new Date().toISOString();
  await dbUpdate('posts', id, { caption_status: status, status_updated_at: now });
  posts = posts.map(p => p.id === id ? { ...p, caption_status: status, status_updated_at: now } : p);
  const activePage = document.querySelector('.page.active')?.id.replace('page-', '');
  if (activePage === 'all-tasks') renderAllTasks();
  else renderMyTasks();
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

  const teamMonthExp = tasks.filter(t => t.status === 'Exported' && t.status_updated_at?.startsWith(monthPfx)).length
    + posts.filter(p => p.caption_status === 'Exported' && p.status_updated_at?.startsWith(monthPfx)).length;
  const teamMonthCap = tasks.filter(t => (t.status === 'Sent for Caption' || t.status === 'Exported') && t.status_updated_at?.startsWith(monthPfx)).length;

  document.getElementById('team-monthly-summary').innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:stretch;">
      <div class="mcard success" style="min-width:130px;">
        <div class="mcard-label">Team Exported (${monthLabel})</div>
        <div class="mcard-val">${teamMonthExp}</div>
        <div class="mcard-sub">${teamMonthCap} sent for caption</div>
      </div>
      ${members.map(m => {
        const mLow = m.trim().toLowerCase();
        const exp  = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && t.status_updated_at?.startsWith(monthPfx)).length
                   + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && p.status_updated_at?.startsWith(monthPfx)).length;
        const cap  = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && (t.status === 'Sent for Caption' || t.status === 'Exported') && t.status_updated_at?.startsWith(monthPfx)).length;
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
              const expToday = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Exported' && t.status_updated_at?.startsWith(todayStr)).length
                             + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Exported' && p.status_updated_at?.startsWith(todayStr)).length;
              const capToday = tasks.filter(t => t.owner?.trim().toLowerCase() === mLow && t.status === 'Sent for Caption' && t.status_updated_at?.startsWith(todayStr)).length
                             + posts.filter(p => p.assigned_editor?.trim().toLowerCase() === mLow && p.caption_status === 'Sent for Caption' && p.status_updated_at?.startsWith(todayStr)).length;
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
  // Populate client filter
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
  // Pending = total amount minus any advance already received
  const totalPending   = pending.reduce((s, p) => s + Math.max(0, Number(p.amount) - Number(p.advance || 0)), 0);
  const totalAdvances  = payments.reduce((s, p) => s + Number(p.advance || 0), 0);
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
        const adv = Number(p.advance || 0);
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
    const adv       = Number(p.advance) || 0;
    const remaining = Number(p.amount) - adv;
    return `<tr>
    <td style="font-weight:600;">${p.client}</td>
    <td style="font-weight:700;color:var(--p700);">${fmtMoney(p.amount)}</td>
    <td style="color:var(--success);font-weight:600;">${adv ? fmtMoney(adv) : '—'}</td>
    <td style="color:${remaining > 0 ? 'var(--danger)' : 'var(--muted)'};font-weight:${remaining > 0 ? '600' : '400'};">${adv ? fmtMoney(remaining) : '—'}</td>
    <td><span style="font-size:11px;color:var(--muted);">${p.type || ''}</span></td>
    <td>${payBadge(p.status)}</td>
    <td>${fmt(p.due_date)}</td>
    <td style="font-size:12px;color:var(--muted);">${p.notes || ''}</td>
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
      const plSaved = await dbInsert('pipeline', plRow, true); // silent = no extra toast
      if (plSaved) { pipeline.push(plSaved); toast('Task saved & added to pipeline!'); }
    }

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
    platform:         document.getElementById('po-platform').value,
    content_type:     document.getElementById('po-ctype').value,
    caption_status:   document.getElementById('po-cap').value,
    assigned_editor:  document.getElementById('po-editor').value || null,
    notes:            document.getElementById('po-notes').value,
  };
  const saved = await dbInsert('posts', row);
  if (saved) { posts.push(saved); closeModal('modal-post'); renderPostCal(); }
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
  const client = document.getElementById('pay-client').value.trim();
  const amount = document.getElementById('pay-amount').value;
  if (!client || !amount) { toast('Client and amount required.'); return; }
  const row = {
    client,
    amount:   Number(amount),
    advance:  Number(document.getElementById('pay-advance').value) || 0,
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
let _realtimeTimer = null;
function setupRealtime() {
  sb.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      // Debounce: only reload once, 2s after the last remote change
      // This prevents stacking reloads when you make multiple saves quickly
      clearTimeout(_realtimeTimer);
      _realtimeTimer = setTimeout(() => { loadAll(); }, 2000);
    })
    .subscribe();
}

// Start by checking if the user is already logged in
initAuth();
