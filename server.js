// SOMPlanner — simple project management server for the SOMLITS work plan & risk register.
// Storage: SQLite database data/somplanner.db (see store.js) + data/uploads/ (attachments).
// Roles: "editor" (everything), "molfr" (MoLFR tasks, approvals, reviews) and "viewer" (read-only).

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { buildSeed, emptyTask, buildRules, RULE_MODULES, buildRtm } = require('./seed');
const { openStore } = require('./store');
const { buildRfpReqs, RFP_GAP_REQS } = require('./rfp_reqs');
const { BR_REGISTER } = require('./br_register');
// where each Inception Report rule appears in the Master Business Rules Register
const BR_XREF = {
  'Unique electronic ID per animal': 'RFP-BR-012, RFP-BR-013, BO-G01, BO-AN-04-SY02',
  'Only certified tags and readers': 'RFP-BR-015, BO-AN-01-SY02',
  'Animal linked to an owner': 'BO-AN-04-SY04',
  'Lost or damaged tag replacement': 'RFP-BR-074, BO-AN-10-AP01',
  'Stolen tag alert': 'BO-SP-04-SY03, BO-MK-01-EX03',
  'Premises Number Register (PNR)': 'RFP-BR-003, RFP-BR-004, BO-G01',
  'Permit required for every movement': 'RFP-BR-076, BO-MV-05-SY01',
  'Health check before permit approval': 'RFP-BR-039, BO-MV-03-SY02, BO-G18',
  'Alert on unpermitted movement': 'BO-MV-07-AP01, BO-MK-01-EX01',
  'Verify ownership at sale': 'RFP-BR-072, BO-MV-01-SY01, BO-MK-03-EX01',
  'Vaccinations linked to the tag': 'RFP-BR-021, RFP-BR-025',
  'Quarantine enforcement': 'BO-HE-07-EX01, BO-HE-07-EX02, BO-G18',
  'Export certificate linked to animals': 'RFP-BR-052, BO-EX-04-SY02, BO-G20',
  'Slaughter / export closes the record': 'RFP-BR-079, BO-G33, BO-SL-05-SY02',
  'Importer verification by QR': 'BO-G20',
  'Role-based access': 'RFP-BR-063, RFP-BR-064, BO-G32',
  'Tamper-proof audit trail': 'RFP-BR-066, BO-G04, BO-G13',
  'Offline capture and sync': 'RFP-BR-069, RFP-BR-075, BO-G07, BO-G15',
  'Data residency': 'BO-G21',
  'National ID for owner registration': 'BO-UR-01-SY04, BO-UR-01-EX01',
  'Ticket closed only after user confirms': 'BO-SP-07-SY01, BO-SP-07-EX01',
};
function addRegisterRules() {   // Master Business Rules Register (RFP + baseline rules), added once
  const have = new Set(db.rules.map((r) => r.code));
  let o = Math.max(0, ...db.rules.map((r) => Number(r.order) || 0));
  const day = new Date().toISOString().slice(0, 10);
  for (const x of BR_REGISTER) {
    if (have.has(x.code)) continue;
    db.rules.push({ id: crypto.randomUUID(), order: ++o, ...x, owner: 'MoLFR / Business Analyst', version: '1.0',
      approvedBy: '', approvalDate: '', updated: day });
  }
  for (const r of db.rules) {
    const ref = BR_XREF[r.name];
    if (ref && !String(r.linked || '').includes('Register:')) r.linked = [r.linked, 'Register: ' + ref].filter(Boolean).join('; ');
  }
  db.settings.brRegisterAdded = true;
}
function addRfpReqs() {   // requirements from the RFP (Section VII), added once
  const n = Math.max(0, ...db.rtm.map((r) => parseInt(String(r.code).replace(/\D/g, ''), 10) || 0));
  const o = Math.max(0, ...db.rtm.map((r) => Number(r.order) || 0));
  db.rtm.push(...buildRfpReqs(n + 1, o + 1));
  db.settings.rfpReqsAdded = true;
}
function addRfpGapReqs() {   // gaps found against the System, Cloud & Security requirements list, added once
  const n = Math.max(0, ...db.rtm.map((r) => parseInt(String(r.code).replace(/\D/g, ''), 10) || 0));
  const o = Math.max(0, ...db.rtm.map((r) => Number(r.order) || 0));
  db.rtm.push(...buildRfpReqs(n + 1, o + 1, RFP_GAP_REQS));
  db.settings.rfpGapReqsAdded = true;
}

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'somplanner.db');
const LEGACY_JSON = path.join(DATA_DIR, 'db.json');   // older versions stored everything here
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const LIB_DIR = path.join(UPLOAD_DIR, 'library');   // document library files
const MTG_DIR = path.join(UPLOAD_DIR, 'meetings');  // files attached to meetings / minutes
fs.mkdirSync(LIB_DIR, { recursive: true });
fs.mkdirSync(MTG_DIR, { recursive: true });

// ---------------------------------------------------------------- storage (SQLite)
const store = openStore(SQLITE_FILE);
let db;
function save() { store.save(db); }
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
function checkPassword(pw, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(pw), salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}
// starting folders for the document library (follow the project phases)
function defaultFolders() {
  const names = ['01 Contract & Inception', '02 Requirements & Design (BRS, UI/UX)', '03 Procurement & Hardware',
    '04 Development & Testing', '05 Training', '06 Pilot & Operational Acceptance', '07 National Rollout',
    '08 Final Documentation & Handover', '09 Support & Monthly Reports', 'MoLFR Correspondence'];
  const t = new Date().toISOString();
  return names.map((name, i) => ({ id: crypto.randomUUID(), order: i, parentId: '', name, by: 'System', at: t }));
}
// first entries for the meetings register (from the Inception Report)
function blankMeeting() {
  return { code: '', type: 'Weekly progress meeting', title: '', date: '', time: '', end: '', location: 'MS Teams', chair: '',
    attendees: '', apologies: '', agenda: '', status: 'Planned', discussion: '', decisions: '', actions: [],
    minutesStatus: 'Not started', minutesBy: '', circulatedDate: '', approvedBy: '', approvalDate: '', comments: '',
    nextMeeting: '', attachments: [] };
}
function defaultMeetings() {
  const t = new Date().toISOString();
  return [
    { ...blankMeeting(), id: crypto.randomUUID(), order: 0, code: 'MTG-001', type: 'Kickoff / inception meeting',
      title: 'Project kickoff and inception meeting', date: '2026-10-12', time: '10:00', end: '12:00', location: 'MoLFR HQ / MS Teams',
      chair: 'MoLFR', attendees: 'MoLFR leadership; DRIVE Project Coordinator; AHDAA Project Manager and team',
      agenda: '1. Introductions\n2. Project objectives and scope\n3. Governance and reporting approach\n4. Work plan and milestones\n5. Purchaser responsibilities\n6. AOB',
      status: 'Held', minutesStatus: 'Draft', decisions: 'Governance, scope and reporting approach agreed (see Inception Report).',
      by: 'System', at: t },
    { ...blankMeeting(), id: crypto.randomUUID(), order: 1, code: 'MTG-002', type: 'Steering Committee',
      title: 'Project Steering Committee — monthly progress meeting #1', date: '2026-12-10', time: '10:00', end: '11:30',
      location: 'In person / MS Teams', chair: 'Steering Committee Chair',
      attendees: 'MoLFR leadership; DRIVE; AHDAA leadership; AHDAA Project Manager',
      agenda: '1. Progress against the work plan (M1)\n2. Review status of PIP, BRS, Device Specification\n3. Risks and issues\n4. Decisions required (Inception Report §18)\n5. Next steps', status: 'Planned',
      by: 'System', at: t },
  ];
}
// bring older data up to the current shape (missing registers, new fields, the MoLFR login)
// Section passwords come from DOCS_PASSWORD / RULES_PASSWORD; without them a random one is generated and printed once.
function initSectionPasswords() {
  let changed = false;
  for (const [flag, key, env, label] of [['docsPwInit', 'docsPassword', 'DOCS_PASSWORD', 'Documents'], ['rulesPwInit', 'rulesPassword', 'RULES_PASSWORD', 'Business Rules']]) {
    if (db.settings[flag]) continue;
    const pw = process.env[env] || crypto.randomBytes(4).toString('hex');
    if (!process.env[env]) console.log(label + ' password (set ' + env + ' to choose it): ' + pw);
    db.settings[key] = hashPassword(pw); db.settings[flag] = true; changed = true;
  }
  return changed;
}
function upgrade() {
  let changed = false;
  if (!Array.isArray(db.lineWaits)) { db.lineWaits = []; changed = true; }
  if (!Array.isArray(db.rules)) { db.rules = buildRules(); changed = true; }
  if (!Array.isArray(db.rtm)) { db.rtm = buildRtm(); changed = true; }
  if (!Array.isArray(db.milestones) || !db.milestones.length) { db.milestones = buildSeed().milestones; changed = true; }
  if (!Array.isArray(db.docFolders) || (!db.docFolders.length && !db.settings.docFoldersSeeded)) {
    db.docFolders = defaultFolders(); db.docFiles = db.docFiles || []; db.settings.docFoldersSeeded = true; changed = true;
  }
  if (!Array.isArray(db.docFiles)) { db.docFiles = []; changed = true; }
  if (!Array.isArray(db.meetings) || (!db.meetings.length && !db.settings.meetingsSeeded)) {
    db.meetings = defaultMeetings(); db.settings.meetingsSeeded = true; changed = true;
  }
  for (const t of db.tasks) for (const k of ['submissions', 'feedback', 'reviews', 'attachments', 'waits', 'delays', 'log'])
    if (!Array.isArray(t[k])) { t[k] = []; changed = true; }
  if (!db.settings.rfpReqsAdded) { addRfpReqs(); changed = true; console.log('Added RFP Section VII requirements to Requirements.'); }
  if (!db.settings.actualStartBackfill) {   // actual start from the task log (first move away from "Not Started")
    for (const t of db.tasks) {
      if (t.actualStart || t.status === 'Not Started') continue;
      const hits = (t.log || []).filter((l) => /status: "Not Started" →/.test(l.text)).map((l) => l.at.slice(0, 10)).sort();
      if (hits.length) t.actualStart = hits[0];
      else if (t.actualCompletion && t.status === 'Completed' && t.plannedStart === t.plannedEnd) t.actualStart = t.actualCompletion;
    }
    for (const t of db.tasks) {   // completed tasks without a completion date: take it from the log
      if (t.status !== 'Completed' || t.actualCompletion) continue;
      const done = (t.log || []).filter((l) => /status: "[^"]*" → "Completed"/.test(l.text)).map((l) => l.at.slice(0, 10)).sort();
      if (done.length) t.actualCompletion = done[done.length - 1];
    }
    db.settings.actualStartBackfill = true; changed = true;
  }
  if (initSectionPasswords()) changed = true;
  if (!db.settings.brRegisterAdded) { addRegisterRules(); changed = true; console.log('Added Master Business Rules Register to Business Rules.'); }
  if (!db.settings.rfpGapReqsAdded) { addRfpGapReqs(); changed = true; console.log('Added missing System/Cloud/Security requirements.'); }
  if (!db.settings.molfrUserCreated) {
    if (!db.users.find((u) => u.username === 'molfr'))
      db.users.push({ username: 'molfr', name: 'MoLFR', role: 'molfr', password: hashPassword('molfr123') });
    db.settings.molfrUserCreated = true;
    changed = true;
    console.log('Added MoLFR login  ->  molfr / molfr123');
  }
  return changed;
}
function load() {
  if (!store.isEmpty()) {
    db = store.load();
    if (upgrade()) save();
    return;
  }
  if (fs.existsSync(LEGACY_JSON)) {
    // one-time move from the old JSON file into SQLite; the JSON file is kept as a backup
    db = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
    upgrade();
    save();
    const backup = LEGACY_JSON.replace(/\.json$/, '') + '.migrated-' + new Date().toISOString().slice(0, 10) + '.json';
    fs.renameSync(LEGACY_JSON, backup);
    console.log(`Moved your data into SQLite (${path.basename(SQLITE_FILE)}). Old file kept as ${path.basename(backup)}.`);
    return;
  }
  db = buildSeed();
  db.lineWaits = [];
  db.rules = buildRules();
  addRegisterRules();
  db.rtm = buildRtm();
  addRfpReqs();
  addRfpGapReqs();
  db.docFolders = defaultFolders();
  db.docFiles = [];
  db.meetings = defaultMeetings();
  db.settings.meetingsSeeded = true;
  db.settings.docFoldersSeeded = true;
  db.users = [
    { username: 'editor', name: 'AHDAA PMO', role: 'editor', password: hashPassword('editor123') },
    { username: 'viewer', name: 'Viewer', role: 'viewer', password: hashPassword('viewer123') },
    { username: 'molfr', name: 'MoLFR', role: 'molfr', password: hashPassword('molfr123') },
  ];
  db.settings.molfrUserCreated = true;
  initSectionPasswords();
  save();
  console.log('Created data/somplanner.db with the SOMLITS work plan and risk register.');
  console.log('Default logins  ->  editor / editor123   (can edit)');
  console.log('                ->  viewer / viewer123   (view only)');
  console.log('                ->  molfr  / molfr123    (MoLFR: MoLFR tasks, approvals, reviews)');
  console.log('Change these passwords from the "Users" button after logging in.');
}
load();

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const isDate = (s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(s));
const str = (v, max = 5000) => String(v ?? '').slice(0, max);

// ---------------------------------------------------------------- sessions
const sessions = store.sessions; // stored in SQLite, so logins survive a restart
const SESSION_MS = 1000 * 60 * 60 * 12;
sessions.prune();
setInterval(() => sessions.prune(), 60 * 60 * 1000).unref();

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const tok = parseCookies(req).sid;
  const s = tok && sessions.get(tok);
  if (!s) return null;
  // sliding expiry; only write when it has moved on by more than 5 minutes
  if (s.expires - Date.now() < SESSION_MS - 5 * 60 * 1000) sessions.set(tok, s.username, Date.now() + SESSION_MS);
  return db.users.find((u) => u.username === s.username) || null;
}
function auth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: 'Please log in' });
  req.user = u;
  next();
}
function editor(req, res, next) {
  if (req.user.role !== 'editor') return res.status(403).json({ error: 'View-only account' });
  next();
}
// MoLFR role: may act on MoLFR rows and give MoLFR approvals / reviews
const isMolfrTask = (t) => String(t.type).startsWith('MoLFR');
function editorOrMolfr(req, res, next) {
  if (req.user.role === 'editor' || req.user.role === 'molfr') return next();
  return res.status(403).json({ error: 'View-only account' });
}
function denyMolfrNonMolfrTask(req, res, t) {
  if (req.user.role === 'molfr' && !isMolfrTask(t)) {
    res.status(403).json({ error: 'MoLFR accounts can only change MoLFR tasks (reviews and inputs)' });
    return true;
  }
  return false;
}
// ---- section passwords: the data is only sent to a login that has entered the password
function makeLock(key, label) {
  const unlocked = new Set();             // session tokens (cleared on restart / logout / password change)
  const fails = new Map();                // token -> { n, until } to slow down guessing
  const L = { key, label, unlocked };
  L.locked = () => !!db.settings[key];
  L.open = (req) => !L.locked() || unlocked.has(parseCookies(req).sid);
  L.gate = (req, res, next) => L.open(req) ? next()
    : res.status(423).json({ error: label + ' are locked. Enter the ' + label + ' password first.' });
  L.unlock = (req, res, payload) => {
    const tok = parseCookies(req).sid;
    if (!L.locked()) return res.json(payload());
    const f = fails.get(tok) || { n: 0, until: 0 };
    if (f.until > Date.now()) return res.status(429).json({ error: 'Too many wrong tries. Wait a minute and try again.' });
    if (!checkPassword(String((req.body || {}).password || ''), db.settings[key])) {
      f.n += 1; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60 * 1000; }
      fails.set(tok, f);
      return res.status(403).json({ error: 'Wrong ' + label + ' password' });
    }
    fails.delete(tok); unlocked.add(tok);
    res.json(payload());
  };
  L.setPassword = (req, res) => {
    const { current = '', password = '' } = req.body || {};
    if (L.locked() && !checkPassword(String(current), db.settings[key]))
      return res.status(403).json({ error: 'The current ' + label + ' password is wrong' });
    const pw = String(password);
    if (!pw) { delete db.settings[key]; unlocked.clear(); save(); return res.json({ locked: false }); }
    if (pw.length < 4 || pw.length > 200) return res.status(400).json({ error: 'Use at least 4 characters' });
    db.settings[key] = hashPassword(pw);
    unlocked.clear(); unlocked.add(parseCookies(req).sid);   // everyone else must enter the new password
    save();
    res.json({ locked: true });
  };
  return L;
}
const rulesLock = makeLock('rulesPassword', 'Business Rules');
const docsLock = makeLock('docsPassword', 'Documents');
const rulesOpen = rulesLock.open, rulesGate = rulesLock.gate, docsGate = docsLock.gate;
const publicSettings = () => {
  const { rulesPassword, docsPassword, ...s } = db.settings;
  return { ...s, rulesLocked: rulesLock.locked(), docsLocked: docsLock.locked() };
};
const ownEntry = (req, e) => req.user.role === 'editor' || (e.user && e.user === req.user.username);
const publicUser = (u) => ({ username: u.username, name: u.name, role: u.role });

// ---------------------------------------------------------------- app
const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = db.users.find((x) => x.username === String(username || '').trim().toLowerCase());
  if (!u || !checkPassword(password, u.password)) return res.status(401).json({ error: 'Wrong username or password' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, u.username, Date.now() + SESSION_MS);
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`);
  res.json(publicUser(u));
});
app.post('/api/logout', (req, res) => {
  const tok = parseCookies(req).sid;
  if (tok) { sessions.delete(tok); rulesLock.unlocked.delete(tok); docsLock.unlocked.delete(tok); }
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

app.get('/api/data', auth, (req, res) => {
  const open = rulesOpen(req);
  res.json({ settings: publicSettings(), rulesLocked: !open, milestones: db.milestones, tasks: db.tasks, risks: db.risks, lineWaits: db.lineWaits, rules: open ? db.rules : [], ruleModules: RULE_MODULES, rtm: db.rtm,
    docsLocked: !docsLock.open(req), ...(docsLock.open(req) ? publicDocs() : { docFolders: [], docFiles: [] }),
    meetings: db.meetings.map(publicMeeting) });
});

// ---------------------------------------------------------------- project start date
// Changing the start (contract effective) date shifts every planned start/end date
// by the same number of days. Pre-contract rows (already done) are left as they are.
app.put('/api/settings/start-date', auth, editor, (req, res) => {
  const next = String(req.body?.contractDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return res.status(400).json({ error: 'Choose a valid date' });
  const old = db.settings.contractDate;
  const shift = Math.round((Date.parse(next + 'T00:00:00Z') - Date.parse(old + 'T00:00:00Z')) / 86400000);
  if (!shift) return res.json({ settings: publicSettings(), tasks: db.tasks, shift: 0 });
  const move = (d) => {
    if (!d) return d;
    const x = new Date(d + 'T00:00:00Z');
    x.setUTCDate(x.getUTCDate() + shift);
    return x.toISOString().slice(0, 10);
  };
  for (const t of db.tasks) {
    if (t.ms === 'PRE') continue;
    t.plannedStart = move(t.plannedStart);
    t.plannedEnd = move(t.plannedEnd);
    log(t, req.user, `Project start date changed ${old} → ${next}: planned dates moved ${shift > 0 ? '+' : ''}${shift} days`);
  }
  db.settings.contractDate = next;
  save();
  res.json({ settings: publicSettings(), tasks: db.tasks, shift });
});

// ---------------------------------------------------------------- tasks
const TASK_FIELDS = {
  no: 20, ms: 10, type: 40, task: 500, description: 5000, deliverable: 1000, responsible: 200,
  dependency: 500, plannedStart: 10, plannedEnd: 10, status: 40, actualStart: 10, actualCompletion: 10, submittedBy: 200,
  approval: 40, approvedBy: 200, approvalDate: 10, comments: 5000, delayDays: 10, delayBy: 40, delayReason: 1000,
};
const DATE_FIELDS = ['plannedStart', 'plannedEnd', 'actualStart', 'actualCompletion', 'approvalDate'];

function findTask(req, res) {
  const t = db.tasks.find((x) => x.id === req.params.id);
  if (!t) res.status(404).json({ error: 'Task not found' });
  return t;
}
function log(t, user, text) {
  t.log.unshift({ at: now(), by: user.name, text });
  if (t.log.length > 200) t.log.length = 200;
}
function applyFields(t, body, user) {
  const changes = [];
  for (const [k, max] of Object.entries(TASK_FIELDS)) {
    if (!(k in body)) continue;
    let v = k === 'delayDays' ? Math.max(0, Number(body[k]) || 0) : str(body[k], max).trim();
    if (DATE_FIELDS.includes(k) && !isDate(v)) continue;
    if (t[k] !== v) {
      changes.push(`${k}: "${t[k] ?? ''}" → "${v}"`);
      t[k] = v;
    }
  }
  if ('gate' in body) t.gate = !!body.gate;
  autoActuals(t, changes);
  if (changes.length) log(t, user, 'Edited ' + changes.join('; '));
}
// actual start is set the first time work begins; actual completion when the task is completed
function autoActuals(t, changes = []) {
  const day = now().slice(0, 10);
  if (t.status && t.status !== 'Not Started' && !t.actualStart) { t.actualStart = day; changes.push(`actualStart: "" → "${day}" (auto)`); }
  if (t.status === 'Completed' && !t.actualCompletion) { t.actualCompletion = day; changes.push(`actualCompletion: "" → "${day}" (auto)`); }
}

app.post('/api/tasks', auth, editor, (req, res) => {
  const b = req.body || {};
  const t = { ...emptyTask(), id: uid(), no: '', ms: 'M1', type: 'Management', task: 'New task', description: '',
    deliverable: '', responsible: '', dependency: '', plannedStart: '', plannedEnd: '' };
  applyFields(t, b, req.user);
  if (String(t.type).startsWith('MoLFR')) t.approval = '';
  // place after the last task of the same milestone
  const sameMs = db.tasks.filter((x) => x.ms === t.ms);
  const after = sameMs.length ? Math.max(...sameMs.map((x) => x.order)) : Math.max(0, ...db.tasks.map((x) => x.order));
  db.tasks.forEach((x) => { if (x.order > after) x.order += 1; });
  t.order = after + 1;
  t.log = [];
  log(t, req.user, 'Task created');
  db.tasks.push(t);
  save();
  res.json(t);
});

app.put('/api/tasks/:id', auth, editorOrMolfr, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  let body = req.body || {};
  if (req.user.role === 'molfr') {
    if (denyMolfrNonMolfrTask(req, res, t)) return;
    body = Object.fromEntries(Object.entries(body).filter(([k]) => ['status', 'actualStart', 'actualCompletion', 'comments'].includes(k)));
  }
  applyFields(t, body, req.user);
  save();
  res.json(t);
});

app.delete('/api/tasks/:id', auth, editor, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  for (const a of t.attachments) fs.rm(path.join(UPLOAD_DIR, a.stored), () => {});
  db.tasks = db.tasks.filter((x) => x !== t);
  save();
  res.json({ ok: true });
});

// Submission / result
app.post('/api/tasks/:id/submit', auth, editorOrMolfr, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  if (denyMolfrNonMolfrTask(req, res, t)) return;
  const text = str(req.body?.text, 10000).trim();
  const by = str(req.body?.by, 200).trim() || req.user.name;
  const date = isDate(req.body?.date) && req.body.date ? req.body.date : now().slice(0, 10);
  if (!text) return res.status(400).json({ error: 'Enter the result / submission text' });
  t.submissions.unshift({ id: uid(), text, by, date, at: now(), user: req.user.username });
  t.submittedBy = by;
  if (!t.actualCompletion) t.actualCompletion = date;
  if (!t.actualStart) t.actualStart = date;
  const old = t.status;
  t.status = String(t.type).startsWith('MoLFR') ? 'Completed' : 'Submitted';
  if (t.approval === 'Rework Required') t.approval = 'Pending';
  log(t, req.user, `Result submitted by ${by} (status ${old} → ${t.status})`);
  save();
  res.json(t);
});
app.delete('/api/tasks/:id/submissions/:sid', auth, editorOrMolfr, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const e = t.submissions.find((x) => x.id === req.params.sid);
  if (e && !ownEntry(req, e)) return res.status(403).json({ error: 'You can only delete your own entries' });
  t.submissions = t.submissions.filter((s) => s.id !== req.params.sid);
  log(t, req.user, 'Deleted a submission entry');
  save();
  res.json(t);
});

// Feedback (team) and MoLFR review comments
function threadRoutes(kind, label, allow) {
  app.post(`/api/tasks/:id/${kind}`, auth, allow, (req, res) => {
    const t = findTask(req, res); if (!t) return;
    const text = str(req.body?.text, 10000).trim();
    if (!text) return res.status(400).json({ error: 'Enter some text' });
    const by = str(req.body?.by, 200).trim() || req.user.name;
    const date = isDate(req.body?.date) && req.body.date ? req.body.date : now().slice(0, 10);
    t[kind].unshift({ id: uid(), text, by, date, at: now(), user: req.user.username });
    log(t, req.user, `Added ${label} from ${by}`);
    save();
    res.json(t);
  });
  app.delete(`/api/tasks/:id/${kind}/:eid`, auth, allow, (req, res) => {
    const t = findTask(req, res); if (!t) return;
    const e = t[kind].find((x) => x.id === req.params.eid);
    if (e && !ownEntry(req, e)) return res.status(403).json({ error: 'You can only delete your own entries' });
    t[kind] = t[kind].filter((e) => e.id !== req.params.eid);
    log(t, req.user, `Deleted a ${label} entry`);
    save();
    res.json(t);
  });
}
threadRoutes('feedback', 'feedback', editor);
threadRoutes('reviews', 'MoLFR review', editorOrMolfr);

// Delay records: each delay is kept as a dated entry (who caused it, how many days, new expected date, reason)
function syncDelay(t) {
  const list = t.delays || [];
  t.delayDays = list.reduce((s, d) => s + (Number(d.days) || 0), 0);
  t.delayBy = [...new Set(list.map((d) => d.by).filter(Boolean))].join(' / ');
  t.delayReason = list.length ? list[0].reason : '';
  t.expectedDate = list.length ? list[0].expected : '';
}
app.post('/api/tasks/:id/delays', auth, editor, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const b = req.body || {};
  const days = Math.round(Number(b.days));
  if (!days || days < 0 || days > 3650) return res.status(400).json({ error: 'Enter the number of days delayed' });
  const by = str(b.by, 40) || 'AHDAA';
  const expected = isDate(b.expected) ? b.expected : '';
  const reason = str(b.reason, 1000).trim();
  if (!Array.isArray(t.delays)) t.delays = [];
  t.delays.unshift({ id: uid(), days, by, expected, reason, date: now().slice(0, 10), recordedBy: req.user.name, at: now() });
  syncDelay(t);
  log(t, req.user, `Delay recorded: ${days} days by ${by}${expected ? ', expected ' + expected : ''}${reason ? ' — ' + reason : ''}`);
  save();
  res.json(t);
});
app.delete('/api/tasks/:id/delays/:did', auth, editor, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  t.delays = (t.delays || []).filter((d) => d.id !== req.params.did);
  syncDelay(t);
  log(t, req.user, 'Deleted a delay record');
  save();
  res.json(t);
});

// MoLFR approval
app.put('/api/tasks/:id/approval', auth, editorOrMolfr, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const b = req.body || {};
  const approval = str(b.approval, 40);
  if (!['Pending', 'Approved', 'Approved with comments', 'Rework Required', ''].includes(approval))
    return res.status(400).json({ error: 'Unknown approval value' });
  const approvedBy = str(b.approvedBy, 200).trim();
  let approvalDate = isDate(b.approvalDate) ? b.approvalDate : '';
  if (approval.startsWith('Approved') && !approvalDate) approvalDate = now().slice(0, 10);
  const old = t.approval;
  t.approval = approval;
  t.approvedBy = approvedBy;
  t.approvalDate = approvalDate;
  if (approval.startsWith('Approved')) t.status = 'Completed';
  if (approval === 'Rework Required') t.status = 'Rework Required';
  const note = str(b.note, 10000).trim();
  if (note) t.reviews.unshift({ id: uid(), text: note, by: approvedBy || 'MoLFR', date: approvalDate || now().slice(0, 10), at: now() });
  log(t, req.user, `MoLFR approval: ${old || '—'} → ${approval || '—'}${approvedBy ? ' (by ' + approvedBy + ')' : ''}`);
  save();
  res.json(t);
});

// Waiting periods
function readWait(b) {
  const from = String(b.from || ''), to = String(b.to || '');
  if (!from || !to || !isDate(from) || !isDate(to)) return { error: 'From and To dates are required' };
  return {
    from: from <= to ? from : to, to: from <= to ? to : from,
    party: str(b.party, 40) || 'MoLFR', reason: str(b.reason, 500).trim() || 'Waiting',
  };
}
app.post('/api/tasks/:id/waits', auth, editor, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const w = readWait(req.body || {});
  if (w.error) return res.status(400).json(w);
  t.waits.push({ id: uid(), ...w, by: req.user.name, at: now() });
  log(t, req.user, `Waiting period ${w.from} → ${w.to} (${w.party}: ${w.reason})`);
  save();
  res.json(t);
});
app.put('/api/tasks/:id/waits/:wid', auth, editor, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const e = t.waits.find((x) => x.id === req.params.wid);
  if (!e) return res.status(404).json({ error: 'Waiting period not found' });
  const w = readWait(req.body || {});
  if (w.error) return res.status(400).json(w);
  Object.assign(e, w);
  log(t, req.user, `Changed waiting period to ${w.from} → ${w.to} (${w.party}: ${w.reason})`);
  save();
  res.json(t);
});
app.delete('/api/tasks/:id/waits/:wid', auth, editor, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  t.waits = t.waits.filter((x) => x.id !== req.params.wid);
  log(t, req.user, 'Deleted a waiting period');
  save();
  res.json(t);
});

// Project-level waiting periods drawn on the Process Line (optionally linked to a task)
app.post('/api/line-waits', auth, editor, (req, res) => {
  const w = readWait(req.body || {});
  if (w.error) return res.status(400).json(w);
  db.lineWaits.push({ id: uid(), ...w, taskId: str(req.body?.taskId, 60), by: req.user.name, at: now() });
  save();
  res.json(db.lineWaits);
});
app.put('/api/line-waits/:wid', auth, editor, (req, res) => {
  const e = db.lineWaits.find((x) => x.id === req.params.wid);
  if (!e) return res.status(404).json({ error: 'Waiting period not found' });
  const w = readWait(req.body || {});
  if (w.error) return res.status(400).json(w);
  Object.assign(e, w, { taskId: str(req.body?.taskId, 60) });
  save();
  res.json(db.lineWaits);
});
app.delete('/api/line-waits/:wid', auth, editor, (req, res) => {
  db.lineWaits = db.lineWaits.filter((x) => x.id !== req.params.wid);
  save();
  res.json(db.lineWaits);
});

// Attachments
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, uid() + path.extname(file.originalname).slice(0, 12)),
  }),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
});
app.post('/api/tasks/:id/attachments', auth, editorOrMolfr, upload.array('files', 10), (req, res) => {
  const t = db.tasks.find((x) => x.id === req.params.id);
  if (!t) {
    (req.files || []).forEach((f) => fs.rm(f.path, () => {}));
    return res.status(404).json({ error: 'Task not found' });
  }
  const kind = str(req.body?.kind, 40) || 'Other';
  for (const f of req.files || []) {
    // multer gives latin1-decoded names; restore UTF-8
    const name = Buffer.from(f.originalname, 'latin1').toString('utf8');
    t.attachments.push({ id: uid(), name, stored: f.filename, size: f.size, mime: f.mimetype, kind, by: req.user.name, user: req.user.username, at: now() });
    log(t, req.user, `Attached "${name}" (${kind})`);
  }
  save();
  res.json(t);
});
app.get('/api/tasks/:id/attachments/:aid', auth, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const a = t.attachments.find((x) => x.id === req.params.aid);
  if (!a) return res.status(404).json({ error: 'Attachment not found' });
  res.download(path.join(UPLOAD_DIR, a.stored), a.name);
});
app.delete('/api/tasks/:id/attachments/:aid', auth, editorOrMolfr, (req, res) => {
  const t = findTask(req, res); if (!t) return;
  const a = t.attachments.find((x) => x.id === req.params.aid);
  if (a && !ownEntry(req, a)) return res.status(403).json({ error: 'You can only remove files you uploaded' });
  if (a) {
    fs.rm(path.join(UPLOAD_DIR, a.stored), () => {});
    t.attachments = t.attachments.filter((x) => x !== a);
    log(t, req.user, `Removed attachment "${a.name}"`);
    save();
  }
  res.json(t);
});

// ---------------------------------------------------------------- risks
const RISK_FIELDS = {
  code: 20, category: 60, risk: 500, mitigation: 2000, trigger: 1000, contingency: 1000, owner: 200,
  linkedTasks: 200, milestone: 20, status: 40, lastReviewed: 10, source: 200,
};
function applyRisk(r, b) {
  for (const [k, max] of Object.entries(RISK_FIELDS)) {
    if (!(k in b)) continue;
    const v = str(b[k], max).trim();
    if (k === 'lastReviewed' && !isDate(v)) continue;
    r[k] = v;
  }
  for (const k of ['severity', 'probability']) {
    if (k in b) r[k] = Math.min(5, Math.max(1, Math.round(Number(b[k]) || 1)));
  }
}
app.post('/api/risks', auth, editor, (req, res) => {
  const n = db.risks.length + 1;
  const r = { id: uid(), order: Math.max(0, ...db.risks.map((x) => x.order)) + 1, code: 'R' + String(n).padStart(2, '0'),
    category: '', risk: 'New risk', severity: 3, probability: 3, mitigation: '', trigger: '', contingency: '',
    owner: '', linkedTasks: '', milestone: '', status: 'Open', lastReviewed: '', source: '' };
  applyRisk(r, req.body || {});
  db.risks.push(r);
  save();
  res.json(r);
});
app.put('/api/risks/:id', auth, editor, (req, res) => {
  const r = db.risks.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Risk not found' });
  applyRisk(r, req.body || {});
  save();
  res.json(r);
});
app.delete('/api/risks/:id', auth, editor, (req, res) => {
  db.risks = db.risks.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- business rules
const RULE_FIELDS = {
  code: 20, module: 100, name: 300, statement: 5000, source: 1000, priority: 20, owner: 200, linked: 300,
  status: 40, version: 20, approvedBy: 200, approvalDate: 10, comments: 5000,
};
function applyRule(r, b) {
  for (const [k, max] of Object.entries(RULE_FIELDS)) {
    if (!(k in b)) continue;
    const v = str(b[k], max).trim();
    if (k === 'approvalDate' && !isDate(v)) continue;
    r[k] = v;
  }
  r.updated = now().slice(0, 10);
}
app.post('/api/rules/unlock', auth, (req, res) => rulesLock.unlock(req, res, () => ({ rules: db.rules })));
app.post('/api/rules/lock', auth, (req, res) => { rulesLock.unlocked.delete(parseCookies(req).sid); res.json({ ok: true }); });
app.put('/api/rules/password', auth, editor, rulesLock.setPassword);
const publicDocs = () => ({ docFolders: db.docFolders, docFiles: db.docFiles.map(({ stored, ...f }) => f) });
app.post('/api/docs/unlock', auth, (req, res) => docsLock.unlock(req, res, publicDocs));
app.post('/api/docs/lock', auth, (req, res) => { docsLock.unlocked.delete(parseCookies(req).sid); res.json({ ok: true }); });
app.put('/api/docs/password', auth, editor, docsLock.setPassword);
app.post('/api/rules', auth, editor, rulesGate, (req, res) => {
  const n = Math.max(0, ...db.rules.map((r) => (/^BR-(\d+)$/.exec(r.code) || [])[1] || 0).map(Number)) + 1;
  const r = { id: uid(), order: Math.max(0, ...db.rules.map((x) => x.order)) + 1, code: 'BR-' + String(n).padStart(3, '0'),
    module: 'General', name: 'New rule', statement: '', source: '', priority: 'Must', owner: '', linked: '',
    status: 'Draft', version: '1.0', approvedBy: '', approvalDate: '', comments: '', updated: '' };
  applyRule(r, req.body || {});
  db.rules.push(r);
  save();
  res.json(r);
});
app.put('/api/rules/:id', auth, editorOrMolfr, rulesGate, (req, res) => {
  const r = db.rules.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Rule not found' });
  let body = req.body || {};
  if (req.user.role === 'molfr')
    body = Object.fromEntries(Object.entries(body).filter(([k]) => ['status', 'approvedBy', 'approvalDate', 'comments'].includes(k)));
  applyRule(r, body);
  save();
  res.json(r);
});
app.delete('/api/rules/:id', auth, editor, rulesGate, (req, res) => {
  db.rules = db.rules.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- requirements traceability matrix
const RTM_FIELDS = {
  code: 20, module: 100, requirement: 5000, source: 1000, priority: 20, rules: 300, tasks: 300, design: 500,
  testCases: 500, testResult: 40, acceptance: 1000, status: 40, approval: 40, approvedBy: 200, approvalDate: 10, comments: 5000,
};
function applyRtm(r, b) {
  for (const [k, max] of Object.entries(RTM_FIELDS)) {
    if (!(k in b)) continue;
    const v = str(b[k], max).trim();
    if (k === 'approvalDate' && !isDate(v)) continue;
    r[k] = v;
  }
  if (String(r.approval).startsWith('Approved') && !r.approvalDate) r.approvalDate = now().slice(0, 10);
  r.updated = now().slice(0, 10);
}
app.post('/api/rtm', auth, editor, (req, res) => {
  const n = Math.max(0, ...db.rtm.map((r) => parseInt(String(r.code).replace(/\D/g, ''), 10) || 0)) + 1;
  const r = { id: uid(), order: Math.max(0, ...db.rtm.map((x) => x.order)) + 1, code: 'REQ-' + String(n).padStart(3, '0'),
    module: 'General', requirement: 'New requirement', source: '', priority: 'Must', rules: '', tasks: '', design: '',
    testCases: '', testResult: 'Not tested', acceptance: '', status: 'Draft', approval: 'Pending', approvedBy: '',
    approvalDate: '', comments: '', updated: '' };
  applyRtm(r, req.body || {});
  db.rtm.push(r);
  save();
  res.json(r);
});
app.put('/api/rtm/:id', auth, editorOrMolfr, (req, res) => {
  const r = db.rtm.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Requirement not found' });
  let body = req.body || {};
  if (req.user.role === 'molfr')
    body = Object.fromEntries(Object.entries(body).filter(([k]) => ['approval', 'approvedBy', 'approvalDate', 'comments'].includes(k)));
  applyRtm(r, body);
  save();
  res.json(r);
});
app.delete('/api/rtm/:id', auth, editor, (req, res) => {
  db.rtm = db.rtm.filter((x) => x.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- document library
const folderById = (id) => db.docFolders.find((f) => f.id === id);
const cleanName = (s) => str(s, 200).replace(/[\\/:*?"<>|]+/g, ' ').trim();
const publicFile = ({ stored, ...f }) => f;
function descendants(id) {             // the folder itself plus everything inside it
  const out = new Set([id]);
  let grew = true;
  while (grew) { grew = false; for (const f of db.docFolders) if (out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); grew = true; } }
  return out;
}
app.post('/api/folders', auth, editorOrMolfr, docsGate, (req, res) => {
  const name = cleanName(req.body?.name);
  const parentId = str(req.body?.parentId, 60);
  if (!name) return res.status(400).json({ error: 'Enter a folder name' });
  if (parentId && !folderById(parentId)) return res.status(404).json({ error: 'Parent folder not found' });
  if (db.docFolders.some((f) => f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()))
    return res.status(400).json({ error: 'A folder with this name already exists here' });
  const f = { id: uid(), order: Math.max(0, ...db.docFolders.map((x) => x.order || 0)) + 1, parentId, name, by: req.user.name, user: req.user.username, at: now() };
  db.docFolders.push(f);
  save();
  res.json(f);
});
app.put('/api/folders/:id', auth, editor, docsGate, (req, res) => {
  const f = folderById(req.params.id);
  if (!f) return res.status(404).json({ error: 'Folder not found' });
  if ('name' in (req.body || {})) {
    const name = cleanName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Enter a folder name' });
    f.name = name;
  }
  if ('parentId' in (req.body || {})) {
    const p = str(req.body.parentId, 60);
    if (p && !folderById(p)) return res.status(404).json({ error: 'Target folder not found' });
    if (p && descendants(f.id).has(p)) return res.status(400).json({ error: 'A folder cannot be moved inside itself' });
    f.parentId = p;
  }
  save();
  res.json(f);
});
app.delete('/api/folders/:id', auth, editor, docsGate, (req, res) => {
  const f = folderById(req.params.id);
  if (!f) return res.status(404).json({ error: 'Folder not found' });
  const ids = descendants(f.id);
  for (const file of db.docFiles.filter((x) => ids.has(x.folderId))) fs.rm(path.join(LIB_DIR, file.stored), () => {});
  db.docFiles = db.docFiles.filter((x) => !ids.has(x.folderId));
  db.docFolders = db.docFolders.filter((x) => !ids.has(x.id));
  save();
  res.json({ ok: true });
});

const libUpload = multer({
  storage: multer.diskStorage({
    destination: LIB_DIR,
    filename: (req, file, cb) => cb(null, uid() + path.extname(file.originalname).slice(0, 12)),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
});
app.post('/api/folders/:id/files', auth, editorOrMolfr, docsGate, libUpload.array('files', 20), (req, res) => {
  const folderId = req.params.id === 'root' ? '' : req.params.id;
  if (folderId && !folderById(folderId)) {
    (req.files || []).forEach((f) => fs.rm(f.path, () => {}));
    return res.status(404).json({ error: 'Folder not found' });
  }
  const added = [];
  for (const f of req.files || []) {
    const name = cleanName(Buffer.from(f.originalname, 'latin1').toString('utf8')) || 'file';
    const rec = { id: uid(), order: Math.max(0, ...db.docFiles.map((x) => x.order || 0)) + 1, folderId, name, stored: f.filename,
      size: f.size, mime: f.mimetype, note: str(req.body?.note, 500), by: req.user.name, user: req.user.username, at: now() };
    db.docFiles.push(rec);
    added.push(publicFile(rec));
  }
  save();
  res.json(added);
});
app.get('/api/files/:id', auth, docsGate, (req, res) => {
  const f = db.docFiles.find((x) => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  if (req.query.view === '1') {   // open in the browser (PDF, images) instead of downloading
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    return res.sendFile(path.join(LIB_DIR, f.stored), { headers: { 'Content-Type': f.mime || 'application/octet-stream' } });
  }
  res.download(path.join(LIB_DIR, f.stored), f.name);
});
app.put('/api/files/:id', auth, editorOrMolfr, docsGate, (req, res) => {
  const f = db.docFiles.find((x) => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  if (!ownEntry(req, f)) return res.status(403).json({ error: 'You can only change files you uploaded' });
  const b = req.body || {};
  if ('name' in b) { const n = cleanName(b.name); if (!n) return res.status(400).json({ error: 'Enter a file name' }); f.name = n; }
  if ('folderId' in b) {
    const id = str(b.folderId, 60);
    if (id && !folderById(id)) return res.status(404).json({ error: 'Target folder not found' });
    f.folderId = id;
  }
  if ('note' in b) f.note = str(b.note, 500);
  save();
  res.json(publicFile(f));
});
app.delete('/api/files/:id', auth, editorOrMolfr, docsGate, (req, res) => {
  const f = db.docFiles.find((x) => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  if (!ownEntry(req, f)) return res.status(403).json({ error: 'You can only delete files you uploaded' });
  fs.rm(path.join(LIB_DIR, f.stored), () => {});
  db.docFiles = db.docFiles.filter((x) => x !== f);
  save();
  res.json({ ok: true });
});

// ---------------------------------------------------------------- meetings register & minutes
const MTG_FIELDS = { code: 20, type: 80, title: 300, date: 10, time: 5, end: 5, location: 200, chair: 200, attendees: 3000,
  apologies: 1000, agenda: 5000, status: 20, discussion: 20000, decisions: 10000, minutesStatus: 30, minutesBy: 200,
  circulatedDate: 10, approvedBy: 200, approvalDate: 10, comments: 5000, nextMeeting: 10 };
const MTG_DATES = ['date', 'circulatedDate', 'approvalDate', 'nextMeeting'];
const MTG_MOLFR = ['minutesStatus', 'approvedBy', 'approvalDate', 'comments'];   // what a MoLFR login may change
function publicMeeting(m) { return { ...m, attachments: (m.attachments || []).map(({ stored, ...a }) => a) }; }
function applyMeeting(m, b, user) {
  for (const [k, max] of Object.entries(MTG_FIELDS)) {
    if (!(k in b)) continue;
    const v = str(b[k], max).trim();
    if (MTG_DATES.includes(k) && !isDate(v)) continue;
    if ((k === 'time' || k === 'end') && v && !/^\d{2}:\d{2}$/.test(v)) continue;
    m[k] = v;
  }
  if (Array.isArray(b.actions)) {
    m.actions = b.actions.slice(0, 200).map((a) => ({
      id: str(a.id, 60) || uid(), text: str(a.text, 1000).trim(), owner: str(a.owner, 200).trim(),
      due: isDate(a.due) ? str(a.due, 10) : '', task: str(a.task, 20).trim(),
      status: a.status === 'Done' ? 'Done' : 'Open', doneDate: isDate(a.doneDate) ? str(a.doneDate, 10) : '',
    })).filter((a) => a.text);
    for (const a of m.actions) if (a.status === 'Done' && !a.doneDate) a.doneDate = now().slice(0, 10);
  }
  if (m.minutesStatus === 'Approved' && !m.approvalDate) m.approvalDate = now().slice(0, 10);
  if (m.minutesStatus === 'Circulated' && !m.circulatedDate) m.circulatedDate = now().slice(0, 10);
  m.updated = now(); m.updatedBy = user.name;
}
const mtgById = (id) => db.meetings.find((x) => x.id === id);
app.post('/api/meetings', auth, editor, (req, res) => {
  const n = Math.max(0, ...db.meetings.map((r) => parseInt(String(r.code).replace(/\D/g, ''), 10) || 0)) + 1;
  const m = { ...blankMeeting(), id: uid(), order: Math.max(0, ...db.meetings.map((x) => x.order || 0)) + 1,
    code: 'MTG-' + String(n).padStart(3, '0'), by: req.user.name, at: now() };
  applyMeeting(m, req.body || {}, req.user);
  if (!m.title) m.title = m.type;
  db.meetings.push(m);
  save();
  res.json(publicMeeting(m));
});
app.put('/api/meetings/:id', auth, editorOrMolfr, (req, res) => {
  const m = mtgById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Meeting not found' });
  let body = req.body || {};
  if (req.user.role === 'molfr') body = Object.fromEntries(Object.entries(body).filter(([k]) => MTG_MOLFR.includes(k)));
  applyMeeting(m, body, req.user);
  save();
  res.json(publicMeeting(m));
});
app.delete('/api/meetings/:id', auth, editor, (req, res) => {
  const m = mtgById(req.params.id);
  if (!m) return res.status(404).json({ error: 'Meeting not found' });
  for (const a of m.attachments || []) fs.rm(path.join(MTG_DIR, a.stored), () => {});
  db.meetings = db.meetings.filter((x) => x !== m);
  save();
  res.json({ ok: true });
});
const mtgUpload = multer({
  storage: multer.diskStorage({ destination: MTG_DIR, filename: (req, file, cb) => cb(null, uid() + path.extname(file.originalname).slice(0, 12)) }),
  limits: { fileSize: 100 * 1024 * 1024, files: 20 },
});
app.post('/api/meetings/:id/files', auth, editorOrMolfr, mtgUpload.array('files', 20), (req, res) => {
  const m = mtgById(req.params.id);
  if (!m) { (req.files || []).forEach((f) => fs.rm(f.path, () => {})); return res.status(404).json({ error: 'Meeting not found' }); }
  m.attachments = m.attachments || [];
  for (const f of req.files || []) {
    m.attachments.push({ id: uid(), name: Buffer.from(f.originalname, 'latin1').toString('utf8'), stored: f.filename, size: f.size,
      mime: f.mimetype, kind: str(req.body?.kind, 40) || 'Minutes', by: req.user.name, user: req.user.username, at: now() });
  }
  save();
  res.json(publicMeeting(m));
});
app.get('/api/meetings/:id/files/:fid', auth, (req, res) => {
  const m = mtgById(req.params.id);
  const a = m && (m.attachments || []).find((x) => x.id === req.params.fid);
  if (!a) return res.status(404).json({ error: 'File not found' });
  res.download(path.join(MTG_DIR, a.stored), a.name);
});
app.delete('/api/meetings/:id/files/:fid', auth, editorOrMolfr, (req, res) => {
  const m = mtgById(req.params.id);
  const a = m && (m.attachments || []).find((x) => x.id === req.params.fid);
  if (!a) return res.status(404).json({ error: 'File not found' });
  if (!ownEntry(req, a)) return res.status(403).json({ error: 'You can only remove files you uploaded' });
  fs.rm(path.join(MTG_DIR, a.stored), () => {});
  m.attachments = m.attachments.filter((x) => x !== a);
  save();
  res.json(publicMeeting(m));
});

// ---------------------------------------------------------------- users
app.get('/api/users', auth, editor, (req, res) => res.json(db.users.map(publicUser)));
app.post('/api/users', auth, editor, (req, res) => {
  const b = req.body || {};
  const username = str(b.username, 40).trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(username)) return res.status(400).json({ error: 'Username: 2–40 letters, digits, . _ -' });
  if (!b.password || String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const role = ['editor', 'molfr'].includes(b.role) ? b.role : 'viewer';
  const existing = db.users.find((u) => u.username === username);
  if (existing) {
    // update password / role / name of an existing user
    if (existing.role === 'editor' && role === 'viewer' && db.users.filter((u) => u.role === 'editor').length === 1)
      return res.status(400).json({ error: 'At least one editor must remain' });
    existing.password = hashPassword(b.password);
    existing.role = role;
    if (b.name) existing.name = str(b.name, 100).trim();
  } else {
    db.users.push({ username, name: str(b.name, 100).trim() || username, role, password: hashPassword(b.password) });
  }
  save();
  res.json(db.users.map(publicUser));
});
app.delete('/api/users/:username', auth, editor, (req, res) => {
  const u = db.users.find((x) => x.username === req.params.username);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (u.username === req.user.username) return res.status(400).json({ error: 'You cannot delete yourself' });
  if (u.role === 'editor' && db.users.filter((x) => x.role === 'editor').length === 1)
    return res.status(400).json({ error: 'At least one editor must remain' });
  db.users = db.users.filter((x) => x !== u);
  sessions.deleteUser(u.username);
  save();
  res.json(db.users.map(publicUser));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => console.log(`SOMPlanner running at http://localhost:${PORT}  (database: ${SQLITE_FILE})`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { store.close(); } catch { /* ignore */ } process.exit(0); });
