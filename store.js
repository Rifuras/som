// SQLite storage for SOMPlanner (data/somplanner.db).
//
// The app keeps working on one in-memory object (`db`) with the same shape as before.
// save(db) writes only the records that changed since the last save, inside one transaction.
// Tasks are split into a `tasks` table (main fields as columns + the full record as JSON) and a
// `task_items` table that holds each submission, feedback entry, MoLFR review, attachment,
// waiting period, delay record and activity-log line as its own row.

const Database = require('better-sqlite3');

const ITEM_KINDS = ['submissions', 'feedback', 'reviews', 'attachments', 'waits', 'delays', 'log'];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  role     TEXT NOT NULL CHECK (role IN ('editor','viewer','molfr')),
  password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  ord           INTEGER NOT NULL,
  no            TEXT,
  ms            TEXT,
  type          TEXT,
  task          TEXT,
  responsible   TEXT,
  status        TEXT,
  planned_start TEXT,
  planned_end   TEXT,
  approval      TEXT,
  delay_days    INTEGER,
  data          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_ms ON tasks(ms);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status);
CREATE TABLE IF NOT EXISTS task_items (
  rowid    INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  ord      INTEGER NOT NULL,
  item_id  TEXT,
  date     TEXT,
  by_name  TEXT,
  data     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS task_items_task ON task_items(task_id, kind, ord);
CREATE TABLE IF NOT EXISTS risks (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  code TEXT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rules (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  code TEXT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS requirements (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  code TEXT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_waits (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS doc_folders (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS doc_files (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
  id   TEXT PRIMARY KEY,
  ord  INTEGER NOT NULL,
  code TEXT,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token    TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  expires  INTEGER NOT NULL
);
`;

function openStore(file) {
  const sql = new Database(file);
  sql.pragma('journal_mode = WAL');
  sql.pragma('foreign_keys = ON');
  sql.pragma('synchronous = NORMAL');
  sql.exec(SCHEMA);

  const cache = { meta: new Map(), users: new Map(), tasks: new Map(), risks: new Map(), rules: new Map(), requirements: new Map(), line_waits: new Map(), doc_folders: new Map(), doc_files: new Map(), meetings: new Map() };

  const st = {
    metaUp: sql.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
    userUp: sql.prepare(`INSERT INTO users(username, name, role, password) VALUES (@username, @name, @role, @password)
      ON CONFLICT(username) DO UPDATE SET name = excluded.name, role = excluded.role, password = excluded.password`),
    userDel: sql.prepare('DELETE FROM users WHERE username = ?'),
    taskUp: sql.prepare(`INSERT INTO tasks(id, ord, no, ms, type, task, responsible, status, planned_start, planned_end, approval, delay_days, data)
      VALUES (@id, @ord, @no, @ms, @type, @task, @responsible, @status, @planned_start, @planned_end, @approval, @delay_days, @data)
      ON CONFLICT(id) DO UPDATE SET ord = excluded.ord, no = excluded.no, ms = excluded.ms, type = excluded.type, task = excluded.task,
        responsible = excluded.responsible, status = excluded.status, planned_start = excluded.planned_start,
        planned_end = excluded.planned_end, approval = excluded.approval, delay_days = excluded.delay_days, data = excluded.data`),
    taskDel: sql.prepare('DELETE FROM tasks WHERE id = ?'),
    itemsDel: sql.prepare('DELETE FROM task_items WHERE task_id = ?'),
    itemIns: sql.prepare('INSERT INTO task_items(task_id, kind, ord, item_id, date, by_name, data) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    sessGet: sql.prepare('SELECT username, expires FROM sessions WHERE token = ?'),
    sessSet: sql.prepare('INSERT INTO sessions(token, username, expires) VALUES (?, ?, ?) ON CONFLICT(token) DO UPDATE SET expires = excluded.expires'),
    sessDel: sql.prepare('DELETE FROM sessions WHERE token = ?'),
    sessDelUser: sql.prepare('DELETE FROM sessions WHERE username = ?'),
    sessPrune: sql.prepare('DELETE FROM sessions WHERE expires < ?'),
  };
  const simple = {};
  for (const t of ['risks', 'rules', 'requirements', 'line_waits', 'doc_folders', 'doc_files', 'meetings']) {
    const hasCode = ['risks', 'rules', 'requirements', 'meetings'].includes(t);
    simple[t] = {
      up: sql.prepare(hasCode
        ? `INSERT INTO ${t}(id, ord, code, data) VALUES (@id, @ord, @code, @data) ON CONFLICT(id) DO UPDATE SET ord = excluded.ord, code = excluded.code, data = excluded.data`
        : `INSERT INTO ${t}(id, ord, data) VALUES (@id, @ord, @data) ON CONFLICT(id) DO UPDATE SET ord = excluded.ord, data = excluded.data`),
      del: sql.prepare(`DELETE FROM ${t} WHERE id = ?`),
      all: sql.prepare(`SELECT data FROM ${t} ORDER BY ord`),
    };
  }

  function isEmpty() {
    return sql.prepare('SELECT COUNT(*) AS n FROM tasks').get().n === 0 && sql.prepare('SELECT COUNT(*) AS n FROM meta').get().n === 0;
  }

  // ---------- load everything into one object (same shape the app always used)
  function load() {
    const db = {};
    for (const { key, value } of sql.prepare('SELECT key, value FROM meta').all()) {
      db[key] = JSON.parse(value);
      cache.meta.set(key, value);
    }
    db.users = sql.prepare('SELECT username, name, role, password FROM users ORDER BY rowid').all();
    db.users.forEach((u) => cache.users.set(u.username, JSON.stringify(u)));

    const items = new Map();
    for (const r of sql.prepare('SELECT task_id, kind, data FROM task_items ORDER BY task_id, kind, ord').all()) {
      if (!items.has(r.task_id)) items.set(r.task_id, {});
      const bucket = items.get(r.task_id);
      (bucket[r.kind] = bucket[r.kind] || []).push(JSON.parse(r.data));
    }
    db.tasks = sql.prepare('SELECT data FROM tasks ORDER BY ord').all().map((r) => {
      const t = JSON.parse(r.data);
      const bucket = items.get(t.id) || {};
      for (const k of ITEM_KINDS) t[k] = bucket[k] || [];
      cache.tasks.set(t.id, JSON.stringify(t));
      return t;
    });
    const loadSimple = (table) => simple[table].all.all().map((r) => {
      const o = JSON.parse(r.data);
      cache[table].set(o.id, r.data);
      return o;
    });
    db.risks = loadSimple('risks');
    db.rules = loadSimple('rules');
    db.rtm = loadSimple('requirements');
    db.lineWaits = loadSimple('line_waits');
    db.docFolders = loadSimple('doc_folders');
    db.docFiles = loadSimple('doc_files');
    db.meetings = loadSimple('meetings');
    return db;
  }

  // ---------- write only what changed since the last save
  const saveTx = sql.transaction((db) => {
    for (const key of ['settings', 'milestones']) {
      const v = JSON.stringify(db[key] ?? null);
      if (cache.meta.get(key) !== v) { st.metaUp.run(key, v); cache.meta.set(key, v); }
    }

    const seenU = new Set();
    for (const u of db.users) {
      seenU.add(u.username);
      const v = JSON.stringify(u);
      if (cache.users.get(u.username) !== v) { st.userUp.run(u); cache.users.set(u.username, v); }
    }
    for (const name of [...cache.users.keys()]) if (!seenU.has(name)) { st.userDel.run(name); cache.users.delete(name); }

    const seenT = new Set();
    for (const t of db.tasks) {
      seenT.add(t.id);
      const full = JSON.stringify(t);
      if (cache.tasks.get(t.id) === full) continue;
      const core = { ...t };
      for (const k of ITEM_KINDS) delete core[k];
      st.taskUp.run({
        id: t.id, ord: Number(t.order) || 0, no: t.no ?? '', ms: t.ms ?? '', type: t.type ?? '', task: t.task ?? '',
        responsible: t.responsible ?? '', status: t.status ?? '', planned_start: t.plannedStart ?? '', planned_end: t.plannedEnd ?? '',
        approval: t.approval ?? '', delay_days: Number(t.delayDays) || 0, data: JSON.stringify(core),
      });
      st.itemsDel.run(t.id);
      for (const kind of ITEM_KINDS) {
        (t[kind] || []).forEach((it, i) => {
          st.itemIns.run(t.id, kind, i, it.id ?? null, it.date ?? it.from ?? (it.at ? String(it.at).slice(0, 10) : null),
            it.by ?? it.recordedBy ?? null, JSON.stringify(it));
        });
      }
      cache.tasks.set(t.id, full);
    }
    for (const id of [...cache.tasks.keys()]) if (!seenT.has(id)) { st.taskDel.run(id); cache.tasks.delete(id); }

    const saveSimple = (table, list) => {
      const seen = new Set();
      (list || []).forEach((o, i) => {
        seen.add(o.id);
        const v = JSON.stringify(o);
        if (cache[table].get(o.id) === v) return;
        simple[table].up.run({ id: o.id, ord: Number(o.order ?? i) || 0, code: o.code ?? null, data: v });
        cache[table].set(o.id, v);
      });
      for (const id of [...cache[table].keys()]) if (!seen.has(id)) { simple[table].del.run(id); cache[table].delete(id); }
    };
    saveSimple('risks', db.risks);
    saveSimple('rules', db.rules);
    saveSimple('requirements', db.rtm);
    saveSimple('line_waits', db.lineWaits);
    saveSimple('doc_folders', db.docFolders);
    saveSimple('doc_files', db.docFiles);
    saveSimple('meetings', db.meetings);
  });

  // ---------- login sessions (survive server restarts)
  const sessions = {
    get(token) {
      const s = st.sessGet.get(token);
      return s && s.expires >= Date.now() ? s : null;
    },
    set(token, username, expires) { st.sessSet.run(token, username, expires); },
    delete(token) { st.sessDel.run(token); },
    deleteUser(username) { st.sessDelUser.run(username); },
    prune() { st.sessPrune.run(Date.now()); },
  };

  return { sql, isEmpty, load, save: (db) => saveTx(db), sessions, close: () => sql.close() };
}

module.exports = { openStore, ITEM_KINDS };
