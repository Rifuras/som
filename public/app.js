/* SOMPlanner front end — plain JavaScript, no build step. */
'use strict';

// ------------------------------------------------------------------ state & helpers
const S = { me: null, data: null, tab: 'home', openTask: null, tl: null, waitCtx: null, riskId: null };
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isEditor = () => S.me && S.me.role === 'editor';
const isMolfrUser = () => S.me && S.me.role === 'molfr';
const canAct = () => isEditor() || isMolfrUser();                      // approvals, MoLFR reviews, uploads
const canTask = (t) => isEditor() || (isMolfrUser() && String(t.type).startsWith('MoLFR')); // MoLFR rows
const ownOrEditor = (e) => isEditor() || (isMolfrUser() && e.user === S.me.username);
const ROLE_LABEL = { editor: 'Editor', viewer: 'Viewer', molfr: 'MoLFR' };

const DAY = 86400000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const toD = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const addD = (s, n) => iso(new Date(toD(s).getTime() + n * DAY));
const diffD = (a, b) => Math.round((toD(b) - toD(a)) / DAY); // b − a, in days
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmt = (s) => { if (!s) return ''; const d = toD(s); return `${pad(d.getUTCDate())} ${MON[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; };
const fmtTime = (s) => { if (!s) return ''; const d = new Date(s); return `${pad(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const contract = () => S.data.settings.contractDate;
const wk = (s) => { if (!s) return ''; const w = Math.floor(diffD(contract(), s) / 7) + 1; return w >= 1 ? w : ''; };
const weeksOf = (t) => (t.plannedStart && t.plannedEnd ? Math.ceil((diffD(t.plannedStart, t.plannedEnd) + 1) / 7) : '');
const fileSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

const STATUSES = ['Not Started', 'In Progress', 'Submitted', 'Under Review', 'Rework Required', 'Completed'];
const APPROVALS = ['Pending', 'Approved', 'Approved with comments', 'Rework Required'];
const TYPES = ['Management', 'Documentation', 'Software', 'Hardware Supply', 'Installation', 'Testing', 'Training', 'Support', 'MoLFR Review', 'MoLFR Input'];
const PARTIES = ['', 'AHDAA', 'MoLFR', 'Third party'];
const ATT_KINDS = ['Submission', 'MoLFR feedback', 'Approval evidence', 'Other'];

const isMolfr = (t) => String(t.type).startsWith('MoLFR');
const isApproved = (t) => String(t.approval || '').startsWith('Approved');
const isDone = (t) => t.status === 'Completed' || isApproved(t);
const isLate = (t) => !!t.plannedEnd && t.plannedEnd < todayISO() && !isDone(t);
const needsMolfr = (t) => (isMolfr(t) ? !isDone(t) && !!t.plannedStart && t.plannedStart <= todayISO()
  : ['Submitted', 'Under Review'].includes(t.status) && !isApproved(t));
const delayList = (t) => t.delays || [];
const totalDelay = (t) => (delayList(t).length ? delayList(t).reduce((s, d) => s + (Number(d.days) || 0), 0) : Number(t.delayDays) || 0);
const delayParties = (t) => (delayList(t).length ? [...new Set(delayList(t).map((d) => d.by))].join(' / ') : t.delayBy || '');
const expectedOf = (t) => t.expectedDate || (totalDelay(t) && t.plannedEnd ? addD(t.plannedEnd, totalDelay(t)) : '');
const delayText = (t) => (totalDelay(t) ? `Delayed ${totalDelay(t)} days${delayParties(t) ? ' by ' + delayParties(t) : ''}${expectedOf(t) ? ', expected ' + fmt(expectedOf(t)) : ''}${t.delayReason ? ' — ' + t.delayReason : ''}` : '');
function delayHTML(t) {
  const n = totalDelay(t);
  if (!n) return '';
  return `<div class="delay-cell"><div class="delay-badge">⚠ Delayed ${n} day${n === 1 ? '' : 's'}</div>
    <div class="delay-meta">${delayParties(t) ? `by <b>${esc(delayParties(t))}</b>` : ''}${expectedOf(t) ? ` · expected <b>${fmt(expectedOf(t))}</b>` : ''}</div>
    ${t.delayReason ? `<div class="delay-why">${esc(t.delayReason)}</div>` : ''}</div>`;
}
const isNow = (t) => !!t.plannedStart && !!t.plannedEnd && t.plannedStart <= todayISO() && t.plannedEnd >= todayISO();
const waitDays = (t) => (t.waits || []).reduce((s, w) => s + diffD(w.from, w.to) + 1, 0);
const taskById = (id) => S.data.tasks.find((t) => t.id === id);
const sortedTasks = () => [...S.data.tasks].sort((a, b) => a.order - b.order);

function statusCls(s) {
  return { 'Not Started': 'ns', 'In Progress': 'ip', Submitted: 'sub', 'Under Review': 'ur', 'Rework Required': 'rw', Completed: 'done' }[s] || 'ns';
}
const statusPill = (t) => `<span class="pill ${statusCls(t.status)}">${esc(t.status || 'Not Started')}</span>`;
function approvalPill(t) {
  if (!t.approval) return '';
  const c = isApproved(t) ? 'done' : t.approval === 'Rework Required' ? 'rw' : 'ns';
  return `<span class="pill ${c}">${esc(t.approval)}</span>`;
}
function noTag(t) {
  const c = t.ms === 'PRE' ? 'pre' : isMolfr(t) ? 'molfr' : '';
  return `<span class="no-tag ${c}">${esc(t.no || '—')}</span>`;
}

let toastTimer;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), isErr ? 4000 : 1800);
}

async function api(method, url, body, isForm) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opt.body = body;
    else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  }
  const r = await fetch(url, opt);
  let data = null;
  try { data = await r.json(); } catch { /* not json */ }
  if (r.status === 401 && url !== '/api/login') { showLogin(); throw new Error('Please log in again'); }
  if (!r.ok) throw new Error((data && data.error) || `Error ${r.status}`);
  return data;
}
function replaceTask(t) {
  const i = S.data.tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) S.data.tasks[i] = t; else S.data.tasks.push(t);
}

// ------------------------------------------------------------------ login / boot
function showLogin() {
  $('#app').classList.add('hidden');
  $('#login').classList.remove('hidden');
}
async function loadData() { S.data = await api('GET', '/api/data'); }
function showApp() {
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  document.body.className = S.me.role;
  $('#roleBadge').textContent = ROLE_LABEL[S.me.role] || S.me.role;
  $('#roleBadge').className = 'badge ' + S.me.role;
  $('#userName').textContent = S.me.name;
  $('#projTitle').textContent = S.data.settings.project;
  renderHeaderDates();
  $('#usersBtn').classList.toggle('hidden', !isEditor());
  $('#wpMs').innerHTML = '<option value="">All milestones</option>' +
    S.data.milestones.map((m) => `<option value="${esc(m.id)}">${esc(m.id === 'PRE' ? 'Pre-contract' : m.id)} — ${esc(m.name)}</option>`).join('');
  $('#wpStatus').innerHTML = '<option value="">All statuses</option>' + STATUSES.map((s) => `<option>${s}</option>`).join('');
  render();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  $('#loginErr').textContent = '';
  try {
    S.me = await api('POST', '/api/login', { username: f.elements.username.value, password: f.elements.password.value });
    f.elements.password.value = '';
    await loadData();
    showApp();
  } catch (err) { $('#loginErr').textContent = err.message; }
});
(async function boot() {
  try { S.me = await api('GET', '/api/me'); await loadData(); showApp(); } catch { showLogin(); }
})();

// ------------------------------------------------------------------ render dispatch
function render() {
  renderKPIs();
  $('#kpis').classList.toggle('hidden', S.tab !== 'home');   // summary cards only on Home
  const activeTab = $(`.tab[data-tab="${S.tab}"] span`);
  if (activeTab) $('#pageTitle').textContent = activeTab.textContent;
  $('#userAvatar').textContent = (S.me && S.me.name ? S.me.name.trim()[0] : '?').toUpperCase();
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  $$('.tabpane').forEach((p) => p.classList.toggle('hidden', p.id !== 'tab-' + S.tab));
  if (S.tab === 'home' || S.tab === 'process') {   // one Process Line, shown on Home (under the cards) or on its own tab
    const host = S.tab === 'home' ? $('#homePl') : $('#tab-process');
    if ($('#plBox').parentElement !== host) host.appendChild($('#plBox'));
  }
  if (S.tab === 'home') { renderHome(); renderProcess(); }
  else if (S.tab === 'workplan') renderWorkplan();
  else if (S.tab === 'timeline') renderTimeline();
  else if (S.tab === 'process') renderProcess();
  else if (S.tab === 'rules') renderRules();
  else if (S.tab === 'rtm') renderRtm();
  else if (S.tab === 'docs') renderDocs();
  else if (S.tab === 'meetings') renderMeetings();
  else renderRisks();
  if (S.openTask && $('#taskDlg').open) renderTaskDlg();
}
function switchTab(tab) { S.tab = tab; render(); }

const KPI_ICONS = {'Status week': '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', 'Total tasks': '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.5M4 12h.5M4 18h.5"/>', 'Completed': '<circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.7 2.7L16 10"/>', 'Approved by MoLFR': '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>', 'In review': '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', 'Late tasks': '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2.5M9 2.5h6"/>', 'Waiting days': '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9"/>', 'Total delay': '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17v.5"/>'};
function renderKPIs() {
  const tasks = S.data.tasks;
  const numbered = tasks.filter((t) => t.ms !== 'PRE' && !isMolfr(t));
  const molfr = tasks.filter(isMolfr);
  const done = numbered.filter(isDone).length;
  const approved = numbered.filter(isApproved).length;
  const inReview = tasks.filter((t) => ['Submitted', 'Under Review'].includes(t.status)).length;
  const rework = tasks.filter((t) => t.status === 'Rework Required').length;
  const late = tasks.filter(isLate).length;
  const wait = { MoLFR: 0, AHDAA: 0, other: 0 };
  tasks.forEach((t) => (t.waits || []).forEach((w) => {
    const d = diffD(w.from, w.to) + 1;
    if (w.party === 'MoLFR') wait.MoLFR += d; else if (w.party === 'AHDAA') wait.AHDAA += d; else wait.other += d;
  }));
  (S.data.lineWaits || []).forEach((w) => {
    const d = diffD(w.from, w.to) + 1;
    if (w.party === 'MoLFR') wait.MoLFR += d; else if (w.party === 'AHDAA') wait.AHDAA += d; else wait.other += d;
  });
  const delay = { AHDAA: 0, MoLFR: 0, total: 0 };
  tasks.forEach((t) => {
    if (delayList(t).length) delayList(t).forEach((d) => { const n = Number(d.days) || 0; delay.total += n; if (delay[d.by] !== undefined) delay[d.by] += n; });
    else { const n = Number(t.delayDays) || 0; delay.total += n; if (delay[t.delayBy] !== undefined) delay[t.delayBy] += n; }
  });
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0) + '%';
  const sw = wk(todayISO());
  const k = (label, value, sub, cls = '') => `<div class="kpi ${cls}"><div class="kpi-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${KPI_ICONS[label] || ''}</svg></div><div class="k">${label}</div><div class="v">${value}</div><div class="s">${sub}</div></div>`;
  $('#kpis').innerHTML = [
    k('Status week', sw || '—', fmt(todayISO())),
    k('Total tasks', numbered.length, `+ ${molfr.length} MoLFR reviews / inputs`),
    k('Completed', done, pct(done, numbered.length) + ' of tasks'),
    k('Approved by MoLFR', approved, pct(approved, numbered.length) + ' of tasks'),
    k('In review', inReview, `Rework required: ${rework}`),
    k('Late tasks', late, 'past planned end, not done', late ? 'warn' : ''),
    k('Waiting days', wait.MoLFR + wait.AHDAA + wait.other, `MoLFR ${wait.MoLFR} · AHDAA ${wait.AHDAA} · Other ${wait.other}`, 'wait'),
    k('Total delay', delay.total + ' d', `AHDAA ${delay.AHDAA} · MoLFR ${delay.MoLFR}`, delay.total ? 'warn' : ''),
  ].join('');
}

// ------------------------------------------------------------------ work plan
const clamp = (s) => `<div class="clamp">${esc(s)}</div>`;
const COLS = [
  { k: 'status', h: 'Status', cls: 'c-st nowrap', html: statusPill },
  { k: 'plannedStart', h: 'Planned start', cls: 'nowrap', v: (t) => fmt(t.plannedStart) },
  { k: 'plannedEnd', h: 'Planned end', cls: 'nowrap', v: (t) => fmt(t.plannedEnd) },
  { k: 'actualStart', h: 'Actual start', cls: 'nowrap', v: (t) => fmt(t.actualStart) },
  { k: 'actualCompletion', h: 'Actual completion', cls: 'nowrap', v: (t) => fmt(t.actualCompletion) },
  { k: 'ms', h: 'MS' },
  { k: 'type', h: 'Type' },
  { k: 'description', h: 'Description', cls: 'wrap w-desc', html: (t) => clamp(t.description) },
  { k: 'delay', h: 'Delay', cls: 'wrap w-delay', v: delayText, html: delayHTML },
  { k: 'deliverable', h: 'Deliverable / evidence', cls: 'wrap w-deliv', html: (t) => clamp(t.deliverable) },
  { k: 'responsible', h: 'Responsible', cls: 'wrap w-resp' },
  { k: 'dependency', h: 'Dependency', cls: 'wrap w-dep' },
  { k: 'startWk', h: 'Start wk', v: (t) => wk(t.plannedStart) },
  { k: 'endWk', h: 'End wk', v: (t) => wk(t.plannedEnd) },
  { k: 'weeks', h: 'Weeks', v: weeksOf },
  { k: 'submittedBy', h: 'Submitted by' },
  { k: 'approval', h: 'Approval', html: approvalPill },
  { k: 'approvedBy', h: 'Approved by' },
  { k: 'approvalDate', h: 'Approval date', v: (t) => fmt(t.approvalDate) },
  { k: 'late', h: 'Late', v: (t) => (isLate(t) ? 'Late' : ''), html: (t) => (isLate(t) ? '<span class="pill late">Late</span>' : '') },
  { k: 'comments', h: 'Comments', cls: 'wrap w-comm', html: (t) => clamp(t.comments) },
  { k: 'waiting', h: 'Waiting (days)', v: waitDays, html: (t) => { const d = waitDays(t); return d ? `<span class="ind"><span class="w">⏳ ${d}</span></span>` : ''; } },
];
const colVal = (c, t) => (c.v ? c.v(t) : t[c.k] ?? '');
const colHTML = (c, t) => (c.html ? c.html(t) : esc(colVal(c, t)));
const NCOLS = 3 + COLS.length;

function filteredTasks() {
  const q = $('#wpSearch').value.trim().toLowerCase();
  const ms = $('#wpMs').value, st = $('#wpStatus').value, ty = $('#wpType').value;
  return sortedTasks().filter((t) => {
    if (ms && t.ms !== ms) return false;
    if (st && t.status !== st) return false;
    if (ty === 'ahdaa' && isMolfr(t)) return false;
    if (ty === 'molfr' && !isMolfr(t)) return false;
    if (ty === 'late' && !isLate(t)) return false;
    if (ty === 'now' && !isNow(t)) return false;
    if (ty === 'delayed' && !totalDelay(t)) return false;
    if (ty === 'action' && !needsMolfr(t)) return false;
    if (ty === 'waiting' && !waitDays(t)) return false;
    if (q) {
      const hay = [t.no, t.task, t.description, t.deliverable, t.responsible, t.dependency, t.comments, t.type].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function msSummary(msId) {
  const ts = S.data.tasks.filter((t) => t.ms === msId);
  const starts = ts.map((t) => t.plannedStart).filter(Boolean).sort();
  const ends = ts.map((t) => t.plannedEnd).filter(Boolean).sort();
  const approvable = ts.filter((t) => !isMolfr(t));
  return {
    tasks: ts, start: starts[0] || '', end: ends[ends.length - 1] || '',
    done: ts.filter(isDone).length, approved: approvable.filter(isApproved).length, approvable: approvable.length,
    late: ts.filter(isLate).length, wait: ts.reduce((s, t) => s + waitDays(t), 0),
  };
}

function renderWorkplan() {
  const wrap = $('#wpWrap');
  const st = wrap.scrollTop, sl = wrap.scrollLeft;
  const tasks = filteredTasks();
  const head = `<thead><tr><th class="c-exp"></th><th class="c-no">Task No</th><th class="c-task">Task</th>${COLS.map((c) => `<th class="${c.k === 'status' ? 'c-st' : ''}">${c.h}</th>`).join('')}</tr></thead>`;
  let body = '';
  for (const m of S.data.milestones) {
    const rows = tasks.filter((t) => t.ms === m.id);
    if (!rows.length) continue;
    const s = msSummary(m.id);
    const pseudo = { plannedStart: s.start, plannedEnd: s.end };
    const msCells = COLS.map((c) => {
      let v = '';
      if (c.k === 'ms') v = m.id === 'PRE' ? '' : m.id;
      else if (['startWk', 'endWk', 'weeks', 'plannedStart', 'plannedEnd'].includes(c.k)) v = colVal(c, pseudo);
      else if (c.k === 'status') v = `${s.done} / ${s.tasks.length} completed`;
      else if (c.k === 'approval') v = s.approvable ? `${s.approved} / ${s.approvable} approved` : '';
      else if (c.k === 'late') v = s.late ? `${s.late} late` : '–';
      else if (c.k === 'waiting') v = s.wait || '';
      return `<td class="${c.k === 'status' ? 'c-st ' : ''}nowrap">${esc(v)}</td>`;
    }).join('');
    body += `<tr class="ms-row"><td class="c-exp"></td><td class="c-no">${esc(m.id === 'PRE' ? '' : m.id)}</td><td class="c-task">${esc(m.id === 'PRE' ? m.name : `${m.id} — ${m.name}`)}</td>${msCells}</tr>`;
    for (const t of rows) {
      const open = S.openTask === t.id;
      const ind = [];
      if (t.gate) ind.push('<span class="gate" title="Approval gate">◆ gate</span>');
      if (t.attachments.length) ind.push(`<span title="Attachments">📎 ${t.attachments.length}</span>`);
      if (t.submissions.length) ind.push(`<span title="Submissions">📤 ${t.submissions.length}</span>`);
      if (t.reviews.length) ind.push(`<span title="MoLFR reviews">🏛 ${t.reviews.length}</span>`);
      if (t.feedback.length) ind.push(`<span title="Feedback">💬 ${t.feedback.length}</span>`);
      const wd = waitDays(t);
      if (wd) ind.push(`<span class="w" title="Days waiting">⏳ ${wd}d</span>`);
      if (totalDelay(t)) ind.push(`<span class="dl" title="${esc(delayText(t))}">⚠ +${totalDelay(t)}d</span>`);
      body += `<tr class="task-row ${open ? 'open' : ''} ${isNow(t) ? 'now' : ''}" data-action="toggle" data-id="${t.id}">
        <td class="c-exp"><button class="exp-btn" tabindex="-1">${open ? '▾' : '▸'}</button></td>
        <td class="c-no">${noTag(t)}</td>
        <td class="c-task"><div>${isNow(t) ? `<span class="now-badge" title="${esc(`Per the plan, this task should be under way now (planned ${fmt(t.plannedStart)} → ${fmt(t.plannedEnd)}). This is the schedule, not the status — see the Status column for the actual progress.`)}">📅 PLANNED NOW</span> ` : ''}${esc(t.task)}</div>${ind.length ? `<div class="ind">${ind.join('')}</div>` : ''}</td>
        ${COLS.map((c) => `<td class="${c.cls || 'nowrap'}">${colHTML(c, t)}</td>`).join('')}
      </tr>`;
    }
  }
  if (!body) body = `<tr><td colspan="${NCOLS}" class="empty" style="padding:20px">No tasks match the filters.</td></tr>`;
  wrap.innerHTML = `<table class="grid">${head}<tbody>${body}</tbody></table>`;
  wrap.scrollTop = st; wrap.scrollLeft = sl;
}

// ------------------------------------------------------------------ task update pop-up
function renderTaskDlg() {
  const t = S.openTask && taskById(S.openTask);
  if (!t) return closeTaskDlg();
  const body = $('#taskDlgBody');
  const st = body.scrollTop;
  body.innerHTML = detailHTML(t);
  body.scrollTop = st;
}
function openTaskDlg(id) {
  S.openTask = id;
  renderTaskDlg();
  $('#taskDlgBody').scrollTop = 0;
  if (!$('#taskDlg').open) $('#taskDlg').showModal();
  if (S.tab === 'workplan') renderWorkplan();
}
function closeTaskDlg() {
  S.openTask = null;
  if ($('#taskDlg').open) $('#taskDlg').close();
}
function stepTask(dir) {
  const list = S.tab === 'workplan' ? filteredTasks() : sortedTasks();
  const i = list.findIndex((t) => t.id === S.openTask);
  const next = list[i + dir];
  if (next) openTaskDlg(next.id);
}
$('#taskDlg').addEventListener('close', () => {
  S.openTask = null;
  if (S.tab === 'workplan') renderWorkplan();
});

const opt = (vals, cur) => vals.map((v) => `<option ${v === cur ? 'selected' : ''} value="${esc(v)}">${esc(v || '—')}</option>`).join('');

function entriesHTML(list, kind, t, cls) {
  if (!list.length) return '<div class="empty">Nothing yet.</div>';
  return list.map((e) => `<div class="entry ${cls}">
      <div class="meta"><b>${esc(e.by)}</b><span>${fmt(e.date)}</span><span class="spacer"></span>
        ${ownOrEditor(e) ? `<button class="link danger" data-action="del-entry" data-kind="${kind}" data-id="${t.id}" data-eid="${e.id}">delete</button>` : ''}</div>
      <div class="txt">${esc(e.text)}</div></div>`).join('');
}

function detailHTML(t) {
  const ed = isEditor();
  const dis = ed ? '' : 'disabled';
  const today = todayISO();
  const molfr = isMolfr(t);
  const msOpts = S.data.milestones.map((m) => `<option value="${esc(m.id)}" ${m.id === t.ms ? 'selected' : ''}>${esc(m.id === 'PRE' ? 'Pre-contract' : m.id)}</option>`).join('');
  const wd = waitDays(t);

  const details = `<section class="card wide">
    <h4>Task details</h4>
    <form data-form="details" data-id="${t.id}"><fieldset ${dis}>
      <div class="details-grid">
        <label>Task No <input name="no" value="${esc(t.no)}"></label>
        <label>Milestone <select name="ms">${msOpts}</select></label>
        <label>Type <select name="type">${opt(TYPES.includes(t.type) ? TYPES : [t.type, ...TYPES], t.type)}</select></label>
        <label>Status <select name="status">${opt(STATUSES, t.status)}</select></label>
        <label class="span2">Task <input name="task" value="${esc(t.task)}" required></label>
        <label>Responsible <input name="responsible" value="${esc(t.responsible)}"></label>
        <label>Dependency <input name="dependency" value="${esc(t.dependency)}"></label>
        <label>Planned start <input type="date" name="plannedStart" value="${esc(t.plannedStart)}"></label>
        <label>Planned end <input type="date" name="plannedEnd" value="${esc(t.plannedEnd)}"></label>
        <label>Actual start <input type="date" name="actualStart" value="${esc(t.actualStart || '')}"></label>
        <label>Actual completion <input type="date" name="actualCompletion" value="${esc(t.actualCompletion)}"></label>
        <label>Weeks (auto) <input value="${esc(`${weeksOf(t)}  (W${wk(t.plannedStart) || '–'} → W${wk(t.plannedEnd) || '–'})`)}" disabled></label>
        <label class="span4">Description <textarea name="description" rows="2">${esc(t.description)}</textarea></label>
        <label class="span2">Deliverable / evidence <input name="deliverable" value="${esc(t.deliverable)}"></label>
        <label class="span2">Comments <input name="comments" value="${esc(t.comments)}"></label>
        <label class="inline"><input type="checkbox" name="gate" ${t.gate ? 'checked' : ''}> Approval gate (◆)</label>
      </div>
    </fieldset>
    <div class="row-actions edit-only">
      <button type="button" class="btn danger small" data-action="del-task" data-id="${t.id}">Delete task</button>
      <span class="spacer"></span>
      <button class="btn primary" type="submit">Save changes</button>
    </div></form>
  </section>`;

  const submit = `<section class="card">
    <h4>${molfr ? 'Result (MoLFR action)' : 'Result / submission'} <span class="count">${t.submissions.length}</span></h4>
    <div>Status: ${statusPill(t)} ${t.submittedBy ? `<span class="muted">· submitted by ${esc(t.submittedBy)}</span>` : ''}</div>
    <form data-form="submit" data-id="${t.id}" class="${canTask(t) ? '' : 'hidden'}">
      <textarea name="text" rows="3" placeholder="${molfr ? 'Record what MoLFR provided / decided…' : 'Describe the result: what was completed and submitted…'}" required></textarea>
      <div class="grid2">
        <label>Submitted by <input name="by" value="${esc(S.me.name)}"></label>
        <label>Date <input type="date" name="date" value="${today}"></label>
      </div>
      <div class="row-actions"><button class="btn primary" type="submit">${molfr ? 'Record result' : 'Submit result'}</button></div>
    </form>
    <div class="entries">${entriesHTML(t.submissions, 'submissions', t, 'sub')}</div>
  </section>`;

  const approval = molfr
    ? `<section class="card"><h4>MoLFR approval</h4>
        <div class="empty">This row is MoLFR's own review / input. Record the outcome in the Result card and any comments in "MoLFR review / feedback".</div></section>`
    : `<section class="card">
    <h4>MoLFR approval</h4>
    <div>${approvalPill(t) || '<span class="pill ns">Pending</span>'} ${t.approvedBy ? `<span class="muted">by ${esc(t.approvedBy)}</span>` : ''} ${t.approvalDate ? `<span class="muted">on ${fmt(t.approvalDate)}</span>` : ''}</div>
    <form data-form="approval" data-id="${t.id}"><fieldset ${canAct() ? '' : 'disabled'}>
      <div class="grid3">
        <label>Approval <select name="approval">${opt(APPROVALS, t.approval || 'Pending')}</select></label>
        <label>Approved by <input name="approvedBy" value="${esc(t.approvedBy)}" placeholder="MoLFR officer"></label>
        <label>Approval date <input type="date" name="approvalDate" value="${esc(t.approvalDate)}"></label>
      </div>
      <label class="${canAct() ? '' : 'hidden'}">Approval comments (added to MoLFR review) <textarea name="note" rows="2"></textarea></label>
    </fieldset>
    <div class="row-actions ${canAct() ? '' : 'hidden'}"><button class="btn primary" type="submit">Save approval</button></div></form>
  </section>`;

  const reviews = `<section class="card">
    <h4>MoLFR review / feedback <span class="count">${t.reviews.length}</span></h4>
    <form data-form="reviews" data-id="${t.id}" class="${canAct() ? '' : 'hidden'}">
      <textarea name="text" rows="2" placeholder="Comments received from MoLFR…" required></textarea>
      <div class="grid2">
        <label>Reviewer <input name="by" placeholder="MoLFR reviewer" value="${esc(isMolfrUser() ? S.me.name : 'MoLFR')}"></label>
        <label>Date received <input type="date" name="date" value="${today}"></label>
      </div>
      <div class="row-actions"><button class="btn primary" type="submit">Add MoLFR feedback</button></div>
    </form>
    <div class="entries">${entriesHTML(t.reviews, 'reviews', t, 'molfr')}</div>
  </section>`;

  const feedback = `<section class="card">
    <h4>Feedback / notes <span class="count">${t.feedback.length}</span></h4>
    <form data-form="feedback" data-id="${t.id}" class="edit-only">
      <textarea name="text" rows="2" placeholder="Team feedback, notes, follow-ups…" required></textarea>
      <div class="grid2">
        <label>From <input name="by" value="${esc(S.me.name)}"></label>
        <label>Date <input type="date" name="date" value="${today}"></label>
      </div>
      <div class="row-actions"><button class="btn primary" type="submit">Add feedback</button></div>
    </form>
    <div class="entries">${entriesHTML(t.feedback, 'feedback', t, '')}</div>
  </section>`;

  const atts = `<section class="card">
    <h4>Attachments <span class="count">${t.attachments.length}</span></h4>
    <form data-form="attach" data-id="${t.id}" class="${canAct() ? '' : 'hidden'}">
      <input type="file" name="files" multiple>
      <div class="grid2">
        <label>Type <select name="kind">${opt(ATT_KINDS, isMolfrUser() ? 'MoLFR feedback' : 'Submission')}</select></label>
        <div class="row-actions" style="align-self:end"><button class="btn primary" type="submit">Upload</button></div>
      </div>
    </form>
    <div class="entries">${t.attachments.length ? t.attachments.map((a) => `<div class="att">
        <span class="kind">${esc(a.kind)}</span>
        <a href="/api/tasks/${t.id}/attachments/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a>
        <span class="muted">${fileSize(a.size)} · ${esc(a.by)} · ${fmtTime(a.at)}</span>
        <span class="spacer"></span>
        ${ownOrEditor(a) ? `<button class="link danger" data-action="del-att" data-id="${t.id}" data-aid="${a.id}">remove</button>` : ''}
      </div>`).join('') : '<div class="empty">No files attached.</div>'}</div>
  </section>`;

  const waits = `<section class="card">
    <h4>Waiting periods <span class="count">${wd} days</span></h4>
    <div class="entries">${t.waits.length ? [...t.waits].sort((a, b) => (a.from < b.from ? -1 : 1)).map((w) => `<div class="entry wait">
        <div class="meta"><b>${esc(w.party)}</b><span>${fmt(w.from)} → ${fmt(w.to)}</span><span>${diffD(w.from, w.to) + 1} days</span><span class="spacer"></span>
          <button class="link" data-action="edit-wait" data-id="${t.id}" data-wid="${w.id}">${ed ? 'edit' : 'view'}</button></div>
        <div class="txt">${esc(w.reason)}</div></div>`).join('') : '<div class="empty">No waiting periods recorded.</div>'}</div>
    <div class="row-actions">
      <button class="btn ghost small" data-action="goto-timeline" data-id="${t.id}">Show on timeline</button>
      <button class="btn primary small edit-only" data-action="add-wait" data-id="${t.id}">+ Add waiting period</button>
    </div>
  </section>`;

  const log = `<section class="card">
    <h4>Activity</h4>
    <div class="log">${t.log.length ? t.log.map((l) => `<div><b>${fmtTime(l.at)}</b> · ${esc(l.by)} — ${esc(l.text)}</div>`).join('') : '<div class="empty">No activity yet.</div>'}</div>
  </section>`;

  return `<div class="detail-head"><h3>${noTag(t)} ${esc(t.task)}</h3><span class="muted">${esc(t.responsible)}</span>${isNow(t) ? `<span class="now-badge big" title="${esc(`Per the plan, this task should be under way now (planned ${fmt(t.plannedStart)} → ${fmt(t.plannedEnd)}). This is the schedule, not the status — see the Status column for the actual progress.`)}">📅 Planned now — per the plan this task should be under way (${fmt(t.plannedStart)} → ${fmt(t.plannedEnd)})</span>` : ''}${isLate(t) ? '<span class="pill late">Late</span>' : ''}</div>
    <div class="status-bar"><span class="sb-label">Status</span>${STATUSES.map((s) => canTask(t)
      ? `<button type="button" class="sb-btn ${statusCls(s)} ${t.status === s ? 'on' : ''}" data-action="set-status" data-id="${t.id}" data-s="${esc(s)}">${esc(s)}</button>`
      : (t.status === s ? `<span class="sb-btn ${statusCls(s)} on">${esc(s)}</span>` : '')).join('')}
      <span class="sb-dates">Planned ${fmt(t.plannedStart)} → ${fmt(t.plannedEnd)}</span></div>
    ${delayBoxHTML(t)}
    <div class="cards">${details}${submit}${approval}${atts}${reviews}${feedback}${waits}${log}</div>`;
}

// ------------------------------------------------------------------ timeline (gantt + waiting periods)
function barCls(t) {
  if (isDone(t)) return 'st-done';
  if (isLate(t)) return 'st-late';
  if (t.status === 'Rework Required') return 'st-rw';
  if (t.status === 'In Progress') return 'st-prog';
  if (['Submitted', 'Under Review'].includes(t.status)) return 'st-ip';
  return 'st-ns';
}

function renderTimeline() {
  const wrap = $('#ganttWrap');
  const st = wrap.scrollTop, sl = wrap.scrollLeft;
  const zoom = Number($('#tlZoom').value);
  const showSupport = $('#tlSupport').checked;
  const c = contract();
  const tasks = sortedTasks();
  const today = todayISO();

  let start = addD(c, -28);
  let end = addD(c, 48 * 7 - 1);
  for (const t of tasks) {
    if (t.plannedStart && t.plannedStart < start) start = t.plannedStart;
    if (showSupport && t.plannedEnd && t.plannedEnd > end) end = t.plannedEnd;
    for (const w of t.waits) {
      if (w.from < start) start = w.from;
      if (w.to > end) end = w.to;
    }
  }
  start = addD(c, -7 * Math.ceil(diffD(start, c) / 7)); // align to contract weeks
  end = addD(end, 7);
  const totalDays = diffD(start, end) + 1;
  const W = totalDays * zoom;
  S.tl = { start, zoom, totalDays };
  const x = (d) => diffD(start, d) * zoom;

  // scale
  let months = '';
  let m = new Date(Date.UTC(toD(start).getUTCFullYear(), toD(start).getUTCMonth(), 1));
  while (iso(m) <= end) {
    const next = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    const a = Math.max(0, x(iso(m))), b = Math.min(W, x(iso(next)));
    if (b > a) months += `<div class="g-month" style="left:${a}px;width:${b - a}px">${MON[m.getUTCMonth()]} ${m.getUTCFullYear()}</div>`;
    m = next;
  }
  let weeks = '';
  const step = zoom * 7 < 18 ? 4 : 1;
  for (let i = 0; i * 7 < totalDays; i++) {
    const n = Math.floor(diffD(c, addD(start, i * 7)) / 7) + 1;
    const label = n >= 1 && (n - 1) % step === 0 ? 'W' + n : '';
    weeks += `<div class="g-week" style="left:${i * 7 * zoom}px;width:${7 * zoom}px">${label}</div>`;
  }
  const gridBg = `background-image:linear-gradient(to right,#eef1f5 1px,transparent 1px);background-size:${7 * zoom}px 100%;width:${W}px`;
  const todayLine = today >= start && today <= end ? `<div class="today-line" style="left:${x(today) + zoom / 2}px"></div>` : '';

  const bar = (s, e, cls, title) => {
    if (!s || !e) return '';
    let a = x(s), b = x(e) + zoom, clip = '';
    if (b > W) { b = W; clip = ' clip'; }
    if (a < 0) a = 0;
    if (b <= a) return '';
    return `<div class="bar ${cls}${clip}" style="left:${a}px;width:${b - a}px" title="${esc(title)}"></div>`;
  };

  let rows = '';
  for (const ms of S.data.milestones) {
    const ts = tasks.filter((t) => t.ms === ms.id);
    if (!ts.length) continue;
    const s = msSummary(ms.id);
    rows += `<div class="g-row ms"><div class="g-label">${esc(ms.id === 'PRE' ? ms.name : `${ms.id} — ${ms.name}`)}${s.wait ? `<span class="wd">⏳ ${s.wait}d</span>` : ''}</div>
      <div class="g-track" style="${gridBg}">${bar(s.start, s.end, 'ms', `${fmt(s.start)} → ${fmt(s.end)}`)}${todayLine}</div></div>`;
    for (const t of ts) {
      const wd = waitDays(t);
      const waitsHTML = t.waits.map((w) => {
        const a = Math.max(0, x(w.from)), b = Math.min(W, x(w.to) + zoom);
        const days = diffD(w.from, w.to) + 1;
        return `<div class="wait-bar" data-action="edit-wait" data-id="${t.id}" data-wid="${w.id}" style="left:${a}px;width:${Math.max(3, b - a)}px"
          title="${esc(`${w.party}: ${w.reason}\n${fmt(w.from)} → ${fmt(w.to)} (${days} days)`)}"><span>${days}d</span></div>`;
      }).join('');
      const diamond = t.gate && t.plannedEnd && x(t.plannedEnd) < W ? `<div class="diamond" style="left:${x(t.plannedEnd) + zoom / 2}px">◆</div>` : '';
      rows += `<div class="g-row ${isNow(t) ? 'now' : ''}" data-id="${t.id}">
        <div class="g-label">${isNow(t) ? '<span class="now-dot" title="Planned now: per the plan this task should be under way">📅</span>' : ''}${noTag(t)}<span class="nm" data-action="open-task" data-id="${t.id}" title="${esc(t.task)}">${esc(t.task)}</span>${wd ? `<span class="wd">⏳ ${wd}d</span>` : ''}</div>
        <div class="g-track ${isEditor() ? 'editable' : ''}" data-id="${t.id}" style="${gridBg}">
          ${bar(t.plannedStart, t.plannedEnd, barCls(t), `${t.no} ${t.task}\n${fmt(t.plannedStart)} → ${fmt(t.plannedEnd)} · ${t.status}`)}${diamond}${waitsHTML}${todayLine}
        </div></div>`;
    }
  }
  wrap.innerHTML = `<div class="g-head"><div class="g-label">Task</div><div class="g-scale" style="width:${W}px">${months}${weeks}</div></div>${rows}`;
  if (S.tlScrollTo) {
    const row = $(`.g-row[data-id="${S.tlScrollTo}"]`, wrap);
    S.tlScrollTo = null;
    if (row) {
      row.scrollIntoView({ block: 'center' });
      const tk = taskById(row.dataset.id);
      if (tk && tk.plannedStart) wrap.scrollLeft = Math.max(0, x(tk.plannedStart) - 120);
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 1500);
    }
  } else { wrap.scrollTop = st; wrap.scrollLeft = sl; }
}
$('#tlZoom').addEventListener('change', renderTimeline);
$('#tlSupport').addEventListener('change', renderTimeline);

// ------------------------------------------------------------------ robust drag helper
// Listens on the whole window (not on the element), so the release is never lost, blocks the
// browser's own drag / text selection, and works with mouse, trackpad, pen and touch.
function startDrag(e, { onMove, onEnd }) {
  const x0 = e.clientX;
  let moved = false, done = false;
  const move = (ev) => { if (Math.abs(ev.clientX - x0) > 4) moved = true; onMove(ev.clientX); };
  const finish = (ev, cancelled) => {
    if (done) return;
    done = true;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', blur);
    document.removeEventListener('dragstart', stop, true);
    document.removeEventListener('selectstart', stop, true);
    document.body.classList.remove('dragging');
    onEnd(moved, cancelled && !moved, ev ? ev.clientX : x0);
  };
  const up = (ev) => { move(ev); finish(ev, false); };
  const cancel = (ev) => finish(ev, true);     // if the browser cancels mid-drag we still keep what was dragged
  const blur = () => finish(null, true);
  const stop = (ev) => ev.preventDefault();
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', blur);
  document.addEventListener('dragstart', stop, true);
  document.addEventListener('selectstart', stop, true);
  document.body.classList.add('dragging');
}

// drag on a task row to create a waiting period
let drag = null;
// the page is drawn at 80% (CSS zoom): screen pixels per CSS pixel of an element
const uiScale = (el) => (el && el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1) || 1;
function dayAt(track, clientX) {
  const r = track.getBoundingClientRect();
  return Math.min(S.tl.totalDays - 1, Math.max(0, Math.floor((clientX - r.left) / (S.tl.zoom * uiScale(track)))));
}
function updateGhost() {
  const a = Math.min(drag.d0, drag.d1), b = Math.max(drag.d0, drag.d1);
  drag.ghost.style.left = a * S.tl.zoom + 'px';
  drag.ghost.style.width = (b - a + 1) * S.tl.zoom + 'px';
  drag.ghost.innerHTML = `<span>${b - a + 1}d · ${fmt(addD(S.tl.start, a))} → ${fmt(addD(S.tl.start, b))}</span>`;
}
$('#ganttWrap').addEventListener('pointerdown', (e) => {
  if (!isEditor() || e.button !== 0 || drag) return;
  const track = e.target.closest('.g-track.editable');
  if (!track || e.target.closest('.wait-bar')) return;
  e.preventDefault();
  const d = dayAt(track, e.clientX);
  const ghost = document.createElement('div');
  ghost.className = 'ghost-bar';
  track.appendChild(ghost);
  drag = { track, id: track.dataset.id, d0: d, d1: d, ghost };
  updateGhost();
  startDrag(e, {
    onMove: (x) => { if (drag) { drag.d1 = dayAt(drag.track, x); updateGhost(); } },
    onEnd: (moved, cancelled) => {
      const dd = drag;
      drag = null;
      if (!dd) return;
      dd.ghost.remove();
      if (cancelled || !moved) return;
      const a = Math.min(dd.d0, dd.d1), b = Math.max(dd.d0, dd.d1);
      openWait(dd.id, null, { from: addD(S.tl.start, a), to: addD(S.tl.start, b) });
    },
  });
});
$('#ganttWrap').addEventListener('mousedown', (e) => { if (e.target.closest('.g-track.editable') && !e.target.closest('.wait-bar')) e.preventDefault(); });

// waiting dialog
function defaultReason(t) {
  if (t.type === 'MoLFR Review') return 'Waiting for MoLFR review';
  if (t.type === 'MoLFR Input') return 'Waiting for MoLFR input / data';
  return 'Waiting for MoLFR approval';
}
function updateWaitDays() {
  const f = $('#waitForm');
  const a = f.elements.from.value, b = f.elements.to.value;
  $('#waitDays').textContent = a && b ? `${Math.abs(diffD(a, b)) + 1} days` : '';
}
function openWait(taskId, waitId, preset) {
  const t = taskById(taskId);
  if (!t) return;
  const w = waitId ? t.waits.find((x) => x.id === waitId) : null;
  const f = $('#waitForm');
  S.waitCtx = { mode: 'task', taskId, waitId: w ? w.id : null };
  f.elements.from.value = w ? w.from : preset.from;
  f.elements.to.value = w ? w.to : preset.to;
  f.elements.party.value = w ? w.party : 'MoLFR';
  f.elements.reason.value = w ? w.reason : defaultReason(t);
  $('#waitTask').textContent = `${t.no} — ${t.task}`;
  $('#waitTaskWrap').classList.add('hidden');
  $('#waitDelete').classList.toggle('hidden', !w);
  $('#waitFs').disabled = !isEditor();
  updateWaitDays();
  $('#waitDlg').showModal();
}
// waiting period drawn on the Process Line (project level, optionally linked to a task)
function openLineWait(waitId, preset) {
  const w = waitId ? S.data.lineWaits.find((x) => x.id === waitId) : null;
  const f = $('#waitForm');
  S.waitCtx = { mode: 'line', waitId: w ? w.id : null };
  f.elements.from.value = w ? w.from : preset.from;
  f.elements.to.value = w ? w.to : preset.to;
  f.elements.party.value = w ? w.party : 'MoLFR';
  f.elements.reason.value = w ? w.reason : '';
  $('#waitTaskSel').innerHTML = '<option value="">— Whole project (no specific task) —</option>' +
    sortedTasks().map((t) => `<option value="${t.id}">${esc(t.no)} — ${esc(t.task)}</option>`).join('');
  f.elements.taskId.value = w && w.taskId ? w.taskId : '';
  $('#waitTask').textContent = 'Process Line';
  $('#waitTaskWrap').classList.remove('hidden');
  $('#waitDelete').classList.toggle('hidden', !w);
  $('#waitFs').disabled = !isEditor();
  updateWaitDays();
  $('#waitDlg').showModal();
  if (isEditor() && !w) f.elements.reason.focus();
}
$('#waitForm').elements.from.addEventListener('input', updateWaitDays);
$('#waitForm').elements.to.addEventListener('input', updateWaitDays);
$('#waitCancel').addEventListener('click', () => $('#waitDlg').close());
$('#waitForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isEditor()) return $('#waitDlg').close();
  const f = e.target;
  const body = { from: f.elements.from.value, to: f.elements.to.value, party: f.elements.party.value, reason: f.elements.reason.value };
  const { mode, taskId, waitId } = S.waitCtx;
  try {
    if (mode === 'line') {
      body.taskId = f.elements.taskId.value;
      S.data.lineWaits = waitId ? await api('PUT', `/api/line-waits/${waitId}`, body) : await api('POST', '/api/line-waits', body);
    } else {
      replaceTask(waitId ? await api('PUT', `/api/tasks/${taskId}/waits/${waitId}`, body) : await api('POST', `/api/tasks/${taskId}/waits`, body));
    }
    $('#waitDlg').close();
    toast('Waiting period saved');
    render();
  } catch (err) { toast(err.message, true); }
});
$('#waitDelete').addEventListener('click', async () => {
  const { mode, taskId, waitId } = S.waitCtx;
  if (!waitId || !confirm('Delete this waiting period?')) return;
  try {
    if (mode === 'line') S.data.lineWaits = await api('DELETE', `/api/line-waits/${waitId}`);
    else replaceTask(await api('DELETE', `/api/tasks/${taskId}/waits/${waitId}`));
    $('#waitDlg').close();
    render();
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------ risk register
const riskScore = (r) => (Number(r.severity) || 0) * (Number(r.probability) || 0);
const riskRating = (s) => (s >= 15 ? 'High' : s >= 8 ? 'Medium' : 'Low');
const isOpenRisk = (r) => r.status !== 'Mitigated / Closed';
const RISK_COLS = [
  { k: 'code', h: 'ID' }, { k: 'category', h: 'Category' }, { k: 'risk', h: 'Risk', cls: 'wrap w-deliv', html: (r) => `<b>${esc(r.risk)}</b>` },
  { k: 'severity', h: 'Severity (1–5)' }, { k: 'probability', h: 'Probability (1–5)' },
  { k: 'score', h: 'Score', v: riskScore, html: (r) => `<span class="score rate-${riskRating(riskScore(r))}">${riskScore(r)}</span>` },
  { k: 'rating', h: 'Rating', v: (r) => riskRating(riskScore(r)), html: (r) => `<span class="score rate-${riskRating(riskScore(r))}">${riskRating(riskScore(r))}</span>` },
  { k: 'mitigation', h: 'Mitigation strategy', cls: 'wrap w-desc' }, { k: 'trigger', h: 'Early-warning trigger', cls: 'wrap w-deliv' },
  { k: 'contingency', h: 'Contingency', cls: 'wrap w-deliv' }, { k: 'owner', h: 'Owner' }, { k: 'linkedTasks', h: 'Linked tasks' },
  { k: 'milestone', h: 'Milestone' }, { k: 'status', h: 'Status' }, { k: 'lastReviewed', h: 'Last reviewed', v: (r) => fmt(r.lastReviewed) },
  { k: 'source', h: 'Source' },
];

function renderRisks() {
  const risks = [...S.data.risks].sort((a, b) => a.order - b.order);
  // summary
  const n = (f) => risks.filter(f).length;
  const avg = risks.length ? (risks.reduce((s, r) => s + riskScore(r), 0) / risks.length).toFixed(1) : '0';
  const sum = `<div class="risk-sum">
    <div>Total risks<b>${risks.length}</b></div>
    <div>High<b style="color:#9b1c12">${n((r) => riskRating(riskScore(r)) === 'High')}</b></div>
    <div>Medium<b style="color:#8a5300">${n((r) => riskRating(riskScore(r)) === 'Medium')}</b></div>
    <div>Low<b style="color:#1d6b40">${n((r) => riskRating(riskScore(r)) === 'Low')}</b></div>
    <div>Open<b>${n((r) => r.status === 'Open')}</b></div>
    <div>Monitoring<b>${n((r) => r.status === 'Monitoring')}</b></div>
    <div>Mitigated / Closed<b>${n((r) => r.status === 'Mitigated / Closed')}</b></div>
    <div>Average score<b>${avg}</b></div></div>`;
  let heat = '<div class="heat"><h4>Heat map — open risks (Probability ↓ / Severity →)</h4><table><tr><th></th>' + [1, 2, 3, 4, 5].map((s) => `<th>${s}</th>`).join('') + '</tr>';
  for (let p = 5; p >= 1; p--) {
    heat += `<tr><th>${p}</th>`;
    for (let s = 1; s <= 5; s++) {
      const cnt = risks.filter((r) => isOpenRisk(r) && Number(r.severity) === s && Number(r.probability) === p).length;
      const sc = s * p;
      const bg = sc >= 15 ? '#f8b4ad' : sc >= 8 ? '#ffd98a' : '#cdeccf';
      heat += `<td style="background:${bg};opacity:${cnt ? 1 : 0.45};font-weight:${cnt ? 700 : 400}">${cnt}</td>`;
    }
    heat += '</tr>';
  }
  heat += '</table></div>';
  const cats = {};
  risks.forEach((r) => (cats[r.category || '—'] = (cats[r.category || '—'] || 0) + 1));
  const maxC = Math.max(1, ...Object.values(cats));
  const catHTML = `<div class="cats"><h4>Risks by category</h4>${Object.entries(cats).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<div class="cat-row"><span class="nm">${esc(k)}</span><span class="b" style="width:${(v / maxC) * 160}px"></span><span>${v}</span></div>`).join('')}</div>`;
  $('#riskTop').innerHTML = sum + heat + catHTML;
  $('#riskCats').innerHTML = Object.keys(cats).map((c) => `<option>${esc(c)}</option>`).join('');

  // table
  const q = $('#rkSearch').value.trim().toLowerCase();
  const rf = $('#rkRating').value, sf = $('#rkStatus').value;
  const rows = risks.filter((r) => {
    if (rf && riskRating(riskScore(r)) !== rf) return false;
    if (sf && r.status !== sf) return false;
    if (q && ![r.code, r.category, r.risk, r.mitigation, r.trigger, r.contingency, r.owner, r.linkedTasks].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap = $('#rkWrap');
  const st = wrap.scrollTop;
  wrap.innerHTML = `<table class="grid"><thead><tr>${RISK_COLS.map((c) => `<th>${c.h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr class="task-row" data-action="open-risk" data-id="${r.id}">${RISK_COLS.map((c) => `<td class="${c.cls || 'nowrap'}">${colHTML(c, r)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${RISK_COLS.length}" class="empty" style="padding:20px">No risks match.</td></tr>`}</tbody></table>`;
  wrap.scrollTop = st;
}
['#rkSearch', '#rkRating', '#rkStatus'].forEach((s) => $(s).addEventListener('input', renderRisks));

function updateRiskScore() {
  const f = $('#riskForm');
  const sc = (Number(f.elements.severity.value) || 0) * (Number(f.elements.probability.value) || 0);
  $('#riskScore').innerHTML = `<span class="score rate-${riskRating(sc)}">${sc} · ${riskRating(sc)}</span>`;
}
function openRisk(id) {
  const r = id ? S.data.risks.find((x) => x.id === id) : null;
  const f = $('#riskForm');
  S.riskId = r ? r.id : null;
  const blank = { code: 'R' + pad(S.data.risks.length + 1), category: '', risk: '', severity: 3, probability: 3, mitigation: '', trigger: '', contingency: '', owner: '', linkedTasks: '', milestone: '', status: 'Open', lastReviewed: '', source: '' };
  const v = r || blank;
  for (const k of Object.keys(blank)) if (f.elements[k]) f.elements[k].value = v[k] ?? '';
  $('#riskDlgTitle').textContent = r ? `Risk ${r.code}` : 'New risk';
  $('#riskDelete').classList.toggle('hidden', !r);
  $('#riskFs').disabled = !isEditor();
  updateRiskScore();
  $('#riskDlg').showModal();
}
$('#riskForm').elements.severity.addEventListener('input', updateRiskScore);
$('#riskForm').elements.probability.addEventListener('input', updateRiskScore);
$('#riskCancel').addEventListener('click', () => $('#riskDlg').close());
$('#riskForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isEditor()) return $('#riskDlg').close();
  const body = Object.fromEntries(new FormData(e.target).entries());
  try {
    const r = S.riskId ? await api('PUT', `/api/risks/${S.riskId}`, body) : await api('POST', '/api/risks', body);
    const i = S.data.risks.findIndex((x) => x.id === r.id);
    if (i >= 0) S.data.risks[i] = r; else S.data.risks.push(r);
    $('#riskDlg').close();
    toast('Risk saved');
    render();
  } catch (err) { toast(err.message, true); }
});
$('#riskDelete').addEventListener('click', async () => {
  if (!S.riskId || !confirm('Delete this risk?')) return;
  try {
    await api('DELETE', `/api/risks/${S.riskId}`);
    S.data.risks = S.data.risks.filter((x) => x.id !== S.riskId);
    $('#riskDlg').close();
    render();
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------ users
async function openUsers() {
  try {
    renderUsers(await api('GET', '/api/users'));
    $('#usersDlg').showModal();
  } catch (err) { toast(err.message, true); }
}
function renderUsers(list) {
  $('#usersList').innerHTML = list.map((u) => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td>
    <td><span class="badge ${u.role}">${ROLE_LABEL[u.role] || u.role}</span></td>
    <td>${u.username === S.me.username ? '<span class="muted">you</span>' : `<button class="link danger" data-action="del-user" data-u="${esc(u.username)}">delete</button>`}</td></tr>`).join('');
}
$('#usersClose').addEventListener('click', () => $('#usersDlg').close());
$('#userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  try {
    renderUsers(await api('POST', '/api/users', body));
    e.target.reset();
    toast('User saved');
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------ CSV export
function downloadCSV(name, header, rows) {
  const q = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportWorkplan() {
  const header = ['Task No', 'Task', ...COLS.map((c) => c.h), 'Latest result', 'Latest MoLFR feedback', 'Attachments'];
  const rows = filteredTasks().map((t) => [t.no, t.task, ...COLS.map((c) => colVal(c, t)),
    t.submissions[0]?.text || '', t.reviews[0]?.text || '', t.attachments.map((a) => a.name).join('; ')]);
  downloadCSV(`SOMLITS-work-plan-${todayISO()}.csv`, header, rows);
}
function exportRisks() {
  const rows = [...S.data.risks].sort((a, b) => a.order - b.order).map((r) => RISK_COLS.map((c) => colVal(c, r)));
  downloadCSV(`SOMLITS-risk-register-${todayISO()}.csv`, RISK_COLS.map((c) => c.h), rows);
}

// ------------------------------------------------------------------ events
['#wpSearch', '#wpMs', '#wpStatus', '#wpType'].forEach((s) => $(s).addEventListener('input', renderWorkplan));
$$('.tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  try {
    switch (a) {
      case 'toggle': openTaskDlg(id); break;
      case 'task-close': closeTaskDlg(); break;
      case 'task-prev': stepTask(-1); break;
      case 'task-next': stepTask(1); break;
      case 'set-status': {
        const t = taskById(id);
        if (!t || t.status === el.dataset.s) break;
        replaceTask(await api('PUT', `/api/tasks/${id}`, { status: el.dataset.s }));
        toast('Status: ' + el.dataset.s);
        render();
        break;
      }
      case 'logout':
        await api('POST', '/api/logout');
        closeTaskDlg();
        S.me = null; S.data = null;
        showLogin();
        break;
      case 'users': openUsers(); break;
      case 'start-date': openStartDlg(); break;
      case 'del-user':
        if (confirm(`Delete user "${el.dataset.u}"?`)) renderUsers(await api('DELETE', `/api/users/${encodeURIComponent(el.dataset.u)}`));
        break;
      case 'add-task': {
        const ms = $('#wpMs').value && $('#wpMs').value !== 'PRE' ? $('#wpMs').value : 'M1';
        const t = await api('POST', '/api/tasks', { ms, task: 'New task', type: 'Management' });
        S.data = await api('GET', '/api/data'); // orders shift on insert
        $('#wpSearch').value = ''; $('#wpStatus').value = ''; $('#wpType').value = '';
        render();
        const row = $(`tr[data-id="${t.id}"]`);
        if (row) row.scrollIntoView({ block: 'center' });
        openTaskDlg(t.id);
        toast('Task added — fill in its details');
        break;
      }
      case 'del-task':
        if (!confirm('Delete this task, including its submissions, feedback and attachments?')) return;
        await api('DELETE', `/api/tasks/${id}`);
        S.data.tasks = S.data.tasks.filter((t) => t.id !== id);
        closeTaskDlg();
        render();
        break;
      case 'del-entry':
        if (!confirm('Delete this entry?')) return;
        replaceTask(await api('DELETE', `/api/tasks/${id}/${el.dataset.kind}/${el.dataset.eid}`));
        render();
        break;
      case 'del-att':
        if (!confirm('Remove this attachment?')) return;
        replaceTask(await api('DELETE', `/api/tasks/${id}/attachments/${el.dataset.aid}`));
        render();
        break;
      case 'add-wait': {
        const t = taskById(id);
        const from = t.plannedEnd && t.plannedEnd < todayISO() ? t.plannedEnd : todayISO();
        openWait(id, null, { from, to: todayISO() >= from ? todayISO() : from });
        break;
      }
      case 'edit-wait': openWait(id, el.dataset.wid); break;
      case 'goto-timeline': closeTaskDlg(); S.tlScrollTo = id; switchTab('timeline'); break;
      case 'open-task': openTaskDlg(id); break;
      case 'export-wp': exportWorkplan(); break;
      case 'export-risks': exportRisks(); break;
      case 'add-risk': openRisk(null); break;
      case 'open-risk': openRisk(id); break;
    }
  } catch (err) { toast(err.message, true); }
});

// forms inside the expanded task rows
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const id = f.dataset.id, kind = f.dataset.form;
  const fd = new FormData(f);
  const body = Object.fromEntries(fd.entries());
  try {
    let t;
    if (kind === 'details') { body.gate = f.elements.gate.checked; t = await api('PUT', `/api/tasks/${id}`, body); }
    else if (kind === 'submit') t = await api('POST', `/api/tasks/${id}/submit`, body);
    else if (kind === 'approval') t = await api('PUT', `/api/tasks/${id}/approval`, body);
    else if (kind === 'delay') t = await api('POST', `/api/tasks/${id}/delays`, body);
    else if (kind === 'reviews' || kind === 'feedback') t = await api('POST', `/api/tasks/${id}/${kind}`, body);
    else if (kind === 'attach') {
      if (!f.elements.files.files.length) return toast('Choose a file first', true);
      t = await api('POST', `/api/tasks/${id}/attachments`, fd, true);
    }
    if (t) { replaceTask(t); toast('Saved'); render(); }
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------ project start date
function renderHeaderDates() {
  $('#projSub').textContent = "Start date:";
  const b = $('#startBtn');
  b.textContent = fmt(contract()) + (isEditor() ? '  ✎ change' : '');
  b.disabled = !isEditor();
  b.title = isEditor() ? 'Choose a new project start date; all planned dates move with it' : '';
}
function keyDates(shift) {
  const find = (no) => S.data.tasks.find((t) => t.no === no);
  const mv = (d) => (d ? fmt(addD(d, shift)) : '—');
  const golive = find('77'), handover = find('85'), close = find('90');
  return `Go-live ${mv(golive && golive.plannedEnd)} · Handover ${mv(handover && handover.plannedEnd)} · Support ends ${mv(close && close.plannedEnd)}`;
}
function updateStartPreview() {
  const v = $('#startForm').elements.contractDate.value;
  if (!v) return ($('#startPreview').textContent = '');
  const shift = diffD(contract(), v);
  $('#startPreview').innerHTML = shift
    ? `<b>All planned dates move ${shift > 0 ? 'later' : 'earlier'} by ${Math.abs(shift)} days.</b><br>${esc(keyDates(shift))}`
    : 'Same as the current start date. Nothing will change.';
}
function openStartDlg() {
  if (!isEditor()) return;
  $('#startForm').elements.contractDate.value = contract();
  updateStartPreview();
  $('#startDlg').showModal();
}
$('#startForm').elements.contractDate.addEventListener('input', updateStartPreview);
$('#startCancel').addEventListener('click', () => $('#startDlg').close());
$('#startForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = e.target.elements.contractDate.value;
  try {
    const r = await api('PUT', '/api/settings/start-date', { contractDate: v });
    S.data.settings = r.settings;
    S.data.tasks = r.tasks;
    $('#startDlg').close();
    renderHeaderDates();
    render();
    toast(r.shift ? `Start date changed. All planned dates moved ${r.shift > 0 ? '+' : ''}${r.shift} days` : 'No change');
  } catch (err) { toast(err.message, true); }
});

// ------------------------------------------------------------------ process line (one straight line, every day)
const PL = { cardW: 272, laneH: 140, bandH: 92, waitLaneH: 28, gap: 14 };
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function plRange() {
  const c = contract();
  const showSupport = $('#plSupport').checked;
  let start = addD(c, -28), end = addD(c, 48 * 7 - 1);
  for (const t of S.data.tasks) {
    if (t.plannedStart && t.plannedStart < start) start = t.plannedStart;
    if (showSupport && t.plannedEnd > end) end = t.plannedEnd;
    for (const w of t.waits) { if (w.from < start) start = w.from; if (w.to > end) end = w.to; }
  }
  for (const w of S.data.lineWaits || []) { if (w.from < start) start = w.from; if (w.to > end) end = w.to; }
  start = addD(c, -7 * Math.ceil(diffD(start, c) / 7));
  return { start, end: addD(end, 7) };
}

// everything that happens on each date
// one card per task, hung from its start date (actual start if known, else planned start);
// everything that happens to the task (started, submitted, completed, approved) is written on that same card
function plTasks(start, end) {
  const today = todayISO();
  const out = [];
  for (const t of sortedTasks()) {
    const d = t.actualStart || t.plannedStart;
    if (!d || d < start || d > end) continue;
    const done = isDone(t), begun = done || t.status !== 'Not Started';
    const lines = [];
    // planned
    if (t.plannedStart || t.plannedEnd) lines.push({ k: 'Planned', v: `${t.plannedStart ? fmt(t.plannedStart) : '—'} → ${t.plannedEnd ? fmt(t.plannedEnd) : '—'}`, cls: 'ev-plan' });
    // start
    if (t.actualStart) lines.push({ k: 'Started', v: fmt(t.actualStart), cls: 'ev-start' });
    else if (begun) lines.push({ k: 'Started', v: 'yes', cls: 'ev-start' });
    else if (t.plannedStart && t.plannedStart < today) lines.push({ k: 'Start missed', v: 'not started yet', cls: 'ev-miss' });
    else if (t.plannedStart === today) lines.push({ k: 'Starts', v: 'today', cls: 'ev-start' });
    else lines.push({ k: 'Not started', v: '', cls: 'ev-plan' });
    // submitted
    const sub = t.submissions[t.submissions.length - 1];
    if (sub) lines.push({ k: 'Submitted', v: fmt(sub.date) + (t.submissions.length > 1 ? ` (${t.submissions.length}×)` : ''), cls: 'ev-act' });
    // completed / due
    if (t.actualCompletion) lines.push({ k: 'Completed', v: fmt(t.actualCompletion), cls: 'ev-ok' });
    else if (done) lines.push({ k: 'Completed', v: 'yes', cls: 'ev-ok' });
    else if (t.plannedEnd && t.plannedEnd < today) lines.push({ k: 'Overdue', v: 'since ' + fmt(t.plannedEnd), cls: 'ev-late' });
    else if (t.plannedEnd === today) lines.push({ k: 'Due', v: 'today', cls: 'ev-due' });
    else if (t.plannedEnd) lines.push({ k: 'Due', v: fmt(t.plannedEnd), cls: 'ev-plan' });
    // MoLFR
    if (isApproved(t)) lines.push({ k: 'Approved', v: t.approvalDate ? fmt(t.approvalDate) : 'yes', cls: 'ev-ok' });
    else if (t.approval === 'Rework Required') lines.push({ k: 'Rework', v: t.approvalDate ? fmt(t.approvalDate) : 'required', cls: 'ev-rw' });
    const state = done ? 'done' : (t.plannedEnd && t.plannedEnd < today) ? 'late' : (!begun && t.plannedStart && t.plannedStart < today) ? 'miss' : begun ? 'run' : 'todo';
    out.push({ d, t, lines, state });
  }
  return out.sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
}
function allWaits() {
  const list = (S.data.lineWaits || []).map((w) => {
    const t = w.taskId && taskById(w.taskId);
    return { ...w, kind: 'line', label: (t ? t.no + ': ' : '') + w.reason, taskId: w.taskId };
  });
  for (const t of S.data.tasks) for (const w of t.waits) list.push({ ...w, kind: 'task', taskId: t.id, label: `${t.no}: ${w.reason}` });
  return list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

function renderProcess() {
  const wrap = $('#plWrap');
  const sl = wrap.scrollLeft;
  const zoom = Number($('#plZoom').value);
  const { start, end } = plRange();
  const totalDays = diffD(start, end) + 1;
  const W = totalDays * zoom;
  const x = (d) => diffD(start, d) * zoom;
  const today = todayISO();
  if (!S.plSel) S.plSel = today;
  S.pl = { start, zoom, totalDays };

  // event cards: alternate above and below the line, each side in its own lanes
  const events = plTasks(start, end);
  const upRight = [], downRight = [];
  const freeLane = (arr, left) => { const i = arr.findIndex((r) => r + PL.gap <= left); return i < 0 ? arr.length : i; };
  let flip = false;
  const placed = events.map(({ d, t, lines, state }) => {
    const left = x(d) + zoom / 2 - 1;
    const lu = freeLane(upRight, left), ld = freeLane(downRight, left);
    let side;
    if (lu < ld) side = 'up'; else if (ld < lu) side = 'down'; else { side = flip ? 'down' : 'up'; flip = !flip; }
    const arr = side === 'up' ? upRight : downRight;
    const lane = side === 'up' ? lu : ld;
    if (lane === arr.length) arr.push(0);
    arr[lane] = left + PL.cardW;
    return { d, t, lines, state, left, lane, side };
  });
  const upLanes = Math.max(1, upRight.length), downLanes = downRight.length;
  const topH = upLanes * PL.laneH + 10;
  const lineY = topH + 14;
  const belowTop = topH + PL.bandH + 6;

  // waiting bands in lanes under the line
  const waits = allWaits();
  const wRight = [];
  const wPlaced = waits.map((w) => {
    const a = x(w.from), b = x(w.to) + zoom;
    const minW = Math.max(b - a, 60);
    let lane = wRight.findIndex((r) => r + 4 <= a);
    if (lane < 0) { lane = wRight.length; wRight.push(0); }
    wRight[lane] = a + minW;
    return { w, a, b, lane };
  });
  const stripH = Math.max(2, wRight.length + 1) * PL.waitLaneH + 10;
  const stripTop = belowTop + downLanes * PL.laneH + (downLanes ? 6 : 0);
  const H = stripTop + stripH;

  let html = '';
  // selected day + today columns
  if (S.plSel >= start && S.plSel <= end) html += `<div class="pl-sel" style="left:${x(S.plSel)}px;width:${zoom}px;height:${H}px"></div>`;
  if (today >= start && today <= end) html += `<div class="pl-today" style="left:${x(today) + zoom / 2}px;height:${H}px"></div>`;

  // cards + stems
  for (const p of placed) {
    const cardH = PL.laneH - 24;
    const top = p.side === 'up' ? topH - (p.lane + 1) * PL.laneH : belowTop + p.lane * PL.laneH + 6;
    const t = p.t;
    const items = p.lines.map((l) => `<div class="pl-ev ${l.cls}"><b>${esc(l.k)}</b> ${esc(l.v)}</div>`).join('');
    const stem = p.side === 'up' ? `top:${top + cardH}px;height:${lineY - top - cardH}px` : `top:${lineY}px;height:${top - lineY}px`;
    html += `<div class="pl-stem ${p.side}" style="left:${p.left}px;${stem}"></div>
      <div class="pl-card tcard st-${p.state} ${p.side} ${p.d === S.plSel ? 'sel' : ''}" data-action="open-task" data-id="${t.id}" title="${esc(t.no + ' ' + t.task)}" style="left:${p.left}px;top:${top}px;width:${PL.cardW - 8}px;height:${cardH}px">
        <div class="pl-tname">${noTag(t)}<span>${esc(t.task)}</span></div>${items}</div>`;
  }

  // the straight line: one tick and one date label for every day
  let band = `<div class="pl-line" style="top:14px;width:${W}px"></div>`;
  for (let i = 0; i < totalDays; i++) {
    const d = addD(start, i);
    const dt = toD(d);
    const dow = dt.getUTCDay();
    const isMonth = dt.getUTCDate() === 1;
    const cls = [isMonth ? 'mo' : '', dow === 5 ? 'fri' : '', d === today ? 'today' : '', d === S.plSel ? 'sel' : ''].join(' ');
    band += `<div class="pl-tick ${isMonth ? 'mo' : ''}" style="left:${i * zoom + zoom / 2}px"></div>`;
    band += `<div class="pl-dlab ${cls}" style="left:${i * zoom}px;width:${zoom}px" title="${DOW[dow]} ${fmt(d)}">`
      + `<span class="dw">${DOW[dow].slice(0, zoom >= 44 ? 3 : 2)}</span><span class="dn">${pad(dt.getUTCDate())}</span>`
      + (zoom >= 44 ? `<span class="dm">${MON[dt.getUTCMonth()]}</span>` : '') + `</div>`;
    if (isMonth || i === 0) band += `<div class="pl-mon" style="left:${i * zoom}px">${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}</div>`;
  }
  html += `<div class="pl-band" data-pl="band" style="top:${topH}px;height:${PL.bandH}px;width:${W}px">${band}</div>`;

  // waiting strip
  let strip = `<div class="pl-strip-label">${isEditor() ? 'Drag here to mark waiting ⟶' : 'Waiting periods'}</div>`;
  for (const p of wPlaced) {
    const days = diffD(p.w.from, p.w.to) + 1;
    const action = p.w.kind === 'line' ? `data-action="pl-edit-wait" data-wid="${p.w.id}"` : `data-action="edit-wait" data-id="${p.w.taskId}" data-wid="${p.w.id}"`;
    strip += `<div class="pl-wait" ${action} style="left:${p.a}px;width:${Math.max(3, p.b - p.a)}px;top:${6 + p.lane * PL.waitLaneH}px"
      title="${esc(`${p.w.party}: ${p.w.label}\n${fmt(p.w.from)} → ${fmt(p.w.to)} (${days} days)`)}"><span>⏳ ${esc(p.w.label)} · ${days}d</span></div>`;
  }
  html += `<div class="pl-strip ${isEditor() ? 'editable' : ''}" style="top:${stripTop}px;height:${stripH}px;width:${W}px">${strip}</div>`;

  // keep the line in the vertical middle of the box (extra space split above / below)
  const wrapTop = wrap.getBoundingClientRect().top + window.scrollY;
  wrap.style.height = (S.tab === 'home' ? 860 : Math.max(420, (window.innerHeight - wrapTop - 16) / uiScale(wrap))) + 'px';   // fill the visible screen (fixed on Home)
  const avail = wrap.clientHeight || 0;
  const padTop = Math.max(0, Math.round(avail / 2 - lineY - 20));
  const padBottom = Math.max(0, Math.round(avail / 2 - (H - lineY) + 20));
  wrap.innerHTML = `<div class="pl-canvas" style="width:${W}px;height:${H + padTop + padBottom}px"><div class="pl-inner" style="top:${padTop}px;width:${W}px;height:${H}px">${html}</div></div>`;
  if (!S.plInit || S.plVCenter) wrap.scrollTop = Math.max(0, padTop + lineY - wrap.clientHeight / 2);   // open with the line in view
  S.plVCenter = false;
  if (!S.plInit) { S.plInit = true; wrap.scrollLeft = Math.max(0, x(S.plSel) - 240); }
  else if (S.plScrollTo) { wrap.scrollLeft = Math.max(0, x(S.plScrollTo) - 240); S.plScrollTo = null; }
  else wrap.scrollLeft = sl;
  placePlFlag();
  renderPlDay();
}

// TODAY flag pinned to the top of the box, sliding sideways with the today line
function placePlFlag() {
  const flag = $('#plFlag'), wrap = $('#plWrap');
  if (!flag || !S.pl) return;
  const today = todayISO();
  const xLine = diffD(S.pl.start, today) * S.pl.zoom + S.pl.zoom / 2 - wrap.scrollLeft;
  const show = xLine >= 0 && xLine <= wrap.clientWidth;
  flag.classList.toggle('hidden', !show);
  if (show) { flag.style.left = xLine + 'px'; flag.textContent = 'TODAY · ' + fmt(today); }
}
$('#plWrap').addEventListener('scroll', placePlFlag, { passive: true });

function renderPlDay() {
  const d = S.plSel;
  const tasks = sortedTasks();
  const row = (t, extra = '') => `<div class="pl-item" data-action="open-task" data-id="${t.id}">${noTag(t)}<span class="nm">${esc(t.task)}</span>${extra}${statusPill(t)}</div>`;
  const active = tasks.filter((t) => t.plannedStart && t.plannedStart <= d && t.plannedEnd >= d);
  const starts = tasks.filter((t) => t.plannedStart === d);
  const dues = tasks.filter((t) => t.plannedEnd === d);
  const acts = [];
  tasks.forEach((t) => {
    t.submissions.filter((s) => s.date === d).forEach((s) => acts.push(row(t, `<span class="tagx">📤 submitted by ${esc(s.by)}</span>`)));
    if (t.approvalDate === d && t.approval) acts.push(row(t, `<span class="tagx">${isApproved(t) ? '✅' : '↩'} ${esc(t.approval)}</span>`));
    t.reviews.filter((r) => r.date === d).forEach(() => acts.push(row(t, '<span class="tagx">🏛 MoLFR feedback</span>')));
  });
  const waits = allWaits().filter((w) => w.from <= d && w.to >= d);
  const list = (arr, empty) => (arr.length ? arr.join('') : `<div class="empty">${empty}</div>`);
  const dayNo = (t) => `<span class="tagx">day ${diffD(t.plannedStart, d) + 1} of ${diffD(t.plannedStart, t.plannedEnd) + 1}</span>`;
  $('#plDay').innerHTML = `
    <div class="pl-day-head">
      <button class="btn ghost small" data-action="pl-step" data-n="-1">‹</button>
      <h3>${DOW[toD(d).getUTCDay()]} ${fmt(d)}</h3>
      <button class="btn ghost small" data-action="pl-step" data-n="1">›</button>
      <span class="spacer"></span>
      ${isEditor() ? `<button class="btn primary small" data-action="pl-add-wait">+ Waiting on this day</button>` : ''}
    </div>
    <div class="pl-cols">
      <div><h4>In progress on this day <span class="count">${active.length}</span></h4><div class="pl-list">${list(active.map((t) => row(t, dayNo(t))), 'Nothing scheduled.')}</div></div>
      <div><h4>Starts / due / done on this day</h4><div class="pl-list">
        ${list([...starts.map((t) => row(t, '<span class="tagx st">▶ starts</span>')), ...dues.map((t) => row(t, `<span class="tagx du">${t.gate ? '◆ gate' : '■ due'}</span>`)), ...acts], 'No starts, deadlines or results on this day.')}</div></div>
      <div><h4>Waiting <span class="count">${waits.length}</span></h4><div class="pl-list">
        ${list(waits.map((w) => `<div class="pl-item wait" ${w.kind === 'line' ? `data-action="pl-edit-wait" data-wid="${w.id}"` : `data-action="edit-wait" data-id="${w.taskId}" data-wid="${w.id}"`}>
          <b>⏳ ${esc(w.party)}</b><span class="nm">${esc(w.label)}</span><span class="tagx">${fmt(w.from)} → ${fmt(w.to)}</span></div>`), 'Not waiting on anything.')}</div></div>
    </div>`;
}

['#plSupport', '#plZoom'].forEach((s) => $(s).addEventListener('change', () => { S.plScrollTo = S.plSel; renderProcess(); }));

// click a day / drag a waiting period
let plDrag = null;
const plDayAt = (el, clientX) => {
  const r = el.getBoundingClientRect();
  return Math.min(S.pl.totalDays - 1, Math.max(0, Math.floor((clientX - r.left) / (S.pl.zoom * uiScale(el)))));
};
function plGhost() {
  const a = Math.min(plDrag.d0, plDrag.d1), b = Math.max(plDrag.d0, plDrag.d1);
  plDrag.ghost.style.left = a * S.pl.zoom + 'px';
  plDrag.ghost.style.width = (b - a + 1) * S.pl.zoom + 'px';
  plDrag.ghost.innerHTML = `<span>${b - a + 1}d · ${fmt(addD(S.pl.start, a))} → ${fmt(addD(S.pl.start, b))}</span>`;
}
$('#plWrap').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || plDrag || e.target.closest('[data-action]')) return;
  const canvas = e.target.closest('.pl-canvas');
  if (!canvas) return;
  const strip = e.target.closest('.pl-strip.editable');
  const d0 = plDayAt(canvas, e.clientX);
  if (!strip) { S.plSel = addD(S.pl.start, d0); renderProcess(); return; }
  e.preventDefault();
  const ghost = document.createElement('div');
  ghost.className = 'ghost-bar pl-ghost';
  strip.appendChild(ghost);
  plDrag = { strip, canvas, d0, d1: d0, ghost };
  plGhost();
  startDrag(e, {
    onMove: (x) => { if (plDrag) { plDrag.d1 = plDayAt(plDrag.canvas, x); plGhost(); } },
    onEnd: (moved, cancelled) => {
      const p = plDrag;
      plDrag = null;
      if (!p) return;
      p.ghost.remove();
      if (cancelled) return;
      const a = Math.min(p.d0, p.d1), b = Math.max(p.d0, p.d1);
      if (!moved) { S.plSel = addD(S.pl.start, a); renderProcess(); return; }
      openLineWait(null, { from: addD(S.pl.start, a), to: addD(S.pl.start, b) });
    },
  });
});
$('#plWrap').addEventListener('mousedown', (e) => { if (e.target.closest('.pl-strip.editable') && !e.target.closest('[data-action]')) e.preventDefault(); });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'pl-day': S.plSel = el.dataset.d; renderProcess(); break;
    case 'pl-step': S.plSel = addD(S.plSel, Number(el.dataset.n)); S.plScrollTo = S.plSel; renderProcess(); break;
    case 'pl-today': S.plSel = todayISO(); S.plScrollTo = S.plSel; renderProcess(); break;
    case 'pl-add-wait': openLineWait(null, { from: S.plSel, to: S.plSel }); break;
    case 'pl-edit-wait': openLineWait(el.dataset.wid); break;
  }
});


// ------------------------------------------------------------------ business rules register
const RULE_STATUSES = ['Draft', 'Under MoLFR review', 'Approved', 'Rework required', 'Implemented', 'Retired'];
const ruleStatusCls = (s) => ({ Draft: 'ns', 'Under MoLFR review': 'ur', Approved: 'done', 'Rework required': 'rw', Implemented: 'ip', Retired: 'ns' }[s] || 'ns');
const RULE_COLS = [
  { k: 'code', h: 'Rule ID', html: (r) => `<b>${esc(r.code)}</b>` },
  { k: 'module', h: 'Module', cls: 'wrap w-resp' },
  { k: 'name', h: 'Rule name', cls: 'wrap w-deliv', html: (r) => `<b>${esc(r.name)}</b>` },
  { k: 'statement', h: 'Rule statement', cls: 'wrap w-desc', html: (r) => clamp(r.statement) },
  { k: 'source', h: 'Rationale / source', cls: 'wrap w-dep' },
  { k: 'priority', h: 'Priority', html: (r) => `<span class="pill ${r.priority === 'Must' ? 'rw' : r.priority === 'Should' ? 'ur' : 'ns'}">${esc(r.priority)}</span>` },
  { k: 'status', h: 'Status', html: (r) => `<span class="pill ${ruleStatusCls(r.status)}">${esc(r.status)}</span>` },
  { k: 'owner', h: 'Owner', cls: 'wrap w-resp' },
  { k: 'linked', h: 'Linked tasks / req.' },
  { k: 'version', h: 'Version' },
  { k: 'approvedBy', h: 'Approved by' },
  { k: 'approvalDate', h: 'Approval date', v: (r) => fmt(r.approvalDate) },
  { k: 'comments', h: 'Comments', cls: 'wrap w-comm', html: (r) => clamp(r.comments) },
  { k: 'updated', h: 'Last updated', v: (r) => fmt(r.updated) },
];
const sortedRules = () => [...(S.data.rules || [])].sort((a, b) => a.order - b.order);

function renderRules() {
  const locked = !!S.data.rulesLocked;
  $('#brLocked').classList.toggle('hidden', !locked);
  ['#ruleTop', '#brWrap'].forEach((s) => $(s).classList.toggle('hidden', locked));
  $('#tab-rules .toolbar').classList.toggle('hidden', locked);
  $('#brLockBtn').classList.toggle('hidden', !(S.data.settings && S.data.settings.rulesLocked));
  if (locked) { setTimeout(() => { const i = $('#brUnlockForm').elements.password; if (i && S.tab === 'rules') i.focus(); }, 30); return; }
  const rules = sortedRules();
  const mods = S.data.ruleModules || [];
  const fill = (sel, first, vals) => { const el = $(sel); const cur = el.value; el.innerHTML = `<option value="">${first}</option>` + vals.map((v) => `<option>${esc(v)}</option>`).join(''); el.value = cur; };
  fill('#brModule', 'All modules', mods);
  fill('#brStatus', 'All statuses', RULE_STATUSES);
  const n = (f) => rules.filter(f).length;
  const byMod = {};
  rules.forEach((r) => (byMod[r.module || '—'] = (byMod[r.module || '—'] || 0) + 1));
  const maxM = Math.max(1, ...Object.values(byMod));
  $('#ruleTop').innerHTML = `<div class="risk-sum">
      <div>Total rules<b>${rules.length}</b></div>
      <div>Must<b style="color:#9b1c12">${n((r) => r.priority === 'Must')}</b></div>
      <div>Should<b style="color:#8a5300">${n((r) => r.priority === 'Should')}</b></div>
      <div>Could<b>${n((r) => r.priority === 'Could')}</b></div>
      ${RULE_STATUSES.map((s) => `<div>${s}<b>${n((r) => r.status === s)}</b></div>`).join('')}
    </div>
    <div class="cats"><h4>Rules by module</h4>${Object.entries(byMod).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<div class="cat-row"><span class="nm" style="width:240px">${esc(k)}</span><span class="b" style="width:${(v / maxM) * 140}px"></span><span>${v}</span></div>`).join('')}</div>`;

  const q = $('#brSearch').value.trim().toLowerCase();
  const fm = $('#brModule').value, fs = $('#brStatus').value, fp = $('#brPriority').value;
  const rows = rules.filter((r) => {
    if (fm && r.module !== fm) return false;
    if (fs && r.status !== fs) return false;
    if (fp && r.priority !== fp) return false;
    if (q && ![r.code, r.module, r.name, r.statement, r.source, r.owner, r.linked, r.comments].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap = $('#brWrap');
  const st = wrap.scrollTop;
  wrap.innerHTML = `<table class="grid"><thead><tr>${RULE_COLS.map((c) => `<th>${c.h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr class="task-row" data-action="open-rule" data-id="${r.id}">${RULE_COLS.map((c) => `<td class="${c.cls || 'nowrap'}">${colHTML(c, r)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${RULE_COLS.length}" class="empty" style="padding:20px">No business rules match.</td></tr>`}</tbody></table>`;
  wrap.scrollTop = st;
}
['#brSearch', '#brModule', '#brStatus', '#brPriority'].forEach((s) => $(s).addEventListener('input', renderRules));

function openRule(id) {
  const r = id ? S.data.rules.find((x) => x.id === id) : null;
  const f = $('#ruleForm');
  S.ruleId = r ? r.id : null;
  $('#ruleModuleSel').innerHTML = (S.data.ruleModules || []).map((m) => `<option>${esc(m)}</option>`).join('');
  $('#ruleStatusSel').innerHTML = RULE_STATUSES.map((s) => `<option>${s}</option>`).join('');
  const blank = { code: '(auto)', module: $('#brModule').value || 'General', name: '', statement: '', source: '', priority: 'Must', owner: '', linked: '', status: 'Draft', version: '1.0', approvedBy: '', approvalDate: '', comments: '' };
  const v = r || blank;
  if (r && !(S.data.ruleModules || []).includes(r.module)) $('#ruleModuleSel').insertAdjacentHTML('afterbegin', `<option>${esc(r.module)}</option>`);
  for (const k of Object.keys(blank)) if (f.elements[k]) f.elements[k].value = v[k] ?? '';
  $('#ruleDlgTitle').textContent = r ? `Business rule ${r.code}` : 'New business rule';
  $('#ruleUpdated').textContent = r && r.updated ? `Last updated ${fmt(r.updated)}` : '';
  $('#ruleDelete').classList.toggle('hidden', !r);
  $('#ruleFs').disabled = !canAct();
  const ruleFields = [...$('#ruleFs').querySelectorAll('input, select, textarea')];
  ruleFields.forEach((el) => { el.disabled = isMolfrUser() && !['status', 'approvedBy', 'approvalDate', 'comments'].includes(el.name); });
  $('#ruleSave').classList.toggle('hidden', !canAct());
  $('#ruleDlg').showModal();
}
$('#ruleCancel').addEventListener('click', () => $('#ruleDlg').close());
$('#ruleForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canAct()) return $('#ruleDlg').close();
  const body = Object.fromEntries(new FormData(e.target).entries());
  if (!S.ruleId && body.code === '(auto)') delete body.code;
  try {
    const r = S.ruleId ? await api('PUT', `/api/rules/${S.ruleId}`, body) : await api('POST', '/api/rules', body);
    const i = S.data.rules.findIndex((x) => x.id === r.id);
    if (i >= 0) S.data.rules[i] = r; else S.data.rules.push(r);
    $('#ruleDlg').close();
    toast('Business rule saved');
    render();
  } catch (err) { toast(err.message, true); }
});
$('#ruleDelete').addEventListener('click', async () => {
  if (!S.ruleId || !confirm('Delete this business rule?')) return;
  try {
    await api('DELETE', `/api/rules/${S.ruleId}`);
    S.data.rules = S.data.rules.filter((x) => x.id !== S.ruleId);
    $('#ruleDlg').close();
    render();
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action === 'open-rule') openRule(el.dataset.id);
  else if (el.dataset.action === 'add-rule') openRule(null);
  else if (el.dataset.action === 'rules-lock') {
    api('POST', '/api/rules/lock').then(() => { S.data.rules = []; S.data.rulesLocked = true; render(); }).catch((e) => toast(e.message, true));
  }
  else if (el.dataset.action === 'rules-pw') changeSectionPassword('rules', 'Business Rules');
  else if (el.dataset.action === 'docs-lock') {
    api('POST', '/api/docs/lock').then(() => { S.data.docFolders = []; S.data.docFiles = []; S.data.docsLocked = true; render(); }).catch((e) => toast(e.message, true));
  }
  else if (el.dataset.action === 'docs-pw') changeSectionPassword('docs', 'Documents');
  else if (el.dataset.action === 'export-rules') downloadCSV(`SOMLITS-business-rules-${todayISO()}.csv`, RULE_COLS.map((c) => c.h), sortedRules().map((r) => RULE_COLS.map((c) => colVal(c, r))));
});


// ------------------------------------------------------------------ requirements traceability matrix (RTM)
const REQ_STATUSES = ['Draft', 'Approved (baseline)', 'In development', 'Implemented', 'Tested', 'Accepted', 'Deferred'];
const reqStatusCls = (s) => ({ Draft: 'ns', 'Approved (baseline)': 'sub', 'In development': 'ip', Implemented: 'ur', Tested: 'ip', Accepted: 'done', Deferred: 'ns' }[s] || 'ns');
const splitRefs = (s) => String(s || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
const testCls = (r) => ({ Pass: 'done', Fail: 'rw', Blocked: 'ur' }[r] || 'ns');
const reqApproved = (r) => String(r.approval || '').startsWith('Approved');

function taskChips(r) {
  const refs = splitRefs(r.tasks);
  if (!refs.length) return '<span class="gap">No task</span>';
  return refs.map((n) => {
    const t = S.data.tasks.find((x) => x.no === n.replace(/^task\s*/i, ''));
    if (!t) return `<span class="chip bad" title="No task with this number">${esc(n)}?</span>`;
    return `<span class="chip ${isDone(t) ? 'ok' : isLate(t) ? 'bad' : ''}" data-action="open-task" data-id="${t.id}" title="${esc(t.task)} — ${esc(t.status)}">${esc(t.no)}</span>`;
  }).join('');
}
async function changeSectionPassword(sec, label) {
  const cur = await ask({ title: 'Change ' + label + ' password', label: 'Current password', secret: true });
  if (cur === null) return;
  const next = await ask({ title: 'Change ' + label + ' password', label: 'New password (leave empty to remove the password)', secret: true });
  if (next === null) return;
  try {
    const r = await api('PUT', `/api/${sec}/password`, { current: cur.value, password: next.value });
    S.data.settings[sec + 'Locked'] = r.locked;
    toast(r.locked ? label + ' password changed' : label + ' password removed');
    render();
  } catch (e) { toast(e.message, true); }
}
document.addEventListener('submit', async (e) => {
  const sec = { brUnlockForm: 'rules', docUnlockForm: 'docs' }[e.target.id];
  if (!sec) return;
  e.preventDefault();
  const f = e.target, err = $(sec === 'rules' ? '#brUnlockErr' : '#docUnlockErr');
  err.textContent = '';
  try {
    const r = await api('POST', `/api/${sec}/unlock`, { password: f.elements.password.value });
    f.reset();
    if (sec === 'rules') { S.data.rules = r.rules; S.data.rulesLocked = false; }
    else { S.data.docFolders = r.docFolders; S.data.docFiles = r.docFiles; S.data.docsLocked = false; }
    render();
  } catch (x) { err.textContent = x.message; f.elements.password.select(); }
});
function ruleChips(r) {
  const refs = splitRefs(r.rules);
  if (!refs.length) return '<span class="muted">—</span>';
  if (S.data.rulesLocked) return refs.map((c) => `<span class="chip rule" title="Unlock Business Rules to open">${esc(c)}</span>`).join('');
  return refs.map((c) => {
    const br = (S.data.rules || []).find((x) => x.code.toUpperCase() === c.toUpperCase());
    return br ? `<span class="chip rule" data-action="open-rule" data-id="${br.id}" title="${esc(br.name)}">${esc(br.code)}</span>`
      : `<span class="chip bad" title="No business rule with this ID">${esc(c)}?</span>`;
  }).join('');
}
const RTM_COLS = [
  { k: 'code', h: 'Req ID', html: (r) => `<b>${esc(r.code)}</b>` },
  { k: 'module', h: 'Module', cls: 'wrap w-resp' },
  { k: 'requirement', h: 'Requirement', cls: 'wrap w-desc', html: (r) => clamp(r.requirement) },
  { k: 'source', h: 'Source', cls: 'wrap w-dep' },
  { k: 'priority', h: 'Priority', html: (r) => `<span class="pill ${r.priority === 'Must' ? 'rw' : r.priority === 'Should' ? 'ur' : 'ns'}">${esc(r.priority)}</span>` },
  { k: 'rules', h: 'Business rules', cls: 'wrap w-dep', html: ruleChips },
  { k: 'design', h: 'Design ref.' },
  { k: 'tasks', h: 'Work plan tasks', cls: 'wrap w-dep', html: taskChips },
  { k: 'testCases', h: 'Test cases', html: (r) => (r.testCases ? esc(r.testCases) : '<span class="gap warn">No test</span>') },
  { k: 'testResult', h: 'Test result', html: (r) => `<span class="pill ${testCls(r.testResult)}">${esc(r.testResult || 'Not tested')}</span>` },
  { k: 'acceptance', h: 'Acceptance criterion', cls: 'wrap w-deliv' },
  { k: 'status', h: 'Status', html: (r) => `<span class="pill ${reqStatusCls(r.status)}">${esc(r.status)}</span>` },
  { k: 'approval', h: 'MoLFR approval', html: (r) => `<span class="pill ${reqApproved(r) ? 'done' : r.approval === 'Rework Required' ? 'rw' : 'ns'}">${esc(r.approval || 'Pending')}</span>` },
  { k: 'approvedBy', h: 'Approved by' },
  { k: 'approvalDate', h: 'Approval date', v: (r) => fmt(r.approvalDate) },
  { k: 'comments', h: 'Comments', cls: 'wrap w-comm', html: (r) => clamp(r.comments) },
  { k: 'updated', h: 'Last updated', v: (r) => fmt(r.updated) },
];
const sortedReqs = () => [...(S.data.rtm || [])].sort((a, b) => a.order - b.order);

function renderRtm() {
  const reqs = sortedReqs();
  const fill = (sel, first, vals) => { const el = $(sel); const cur = el.value; el.innerHTML = `<option value="">${first}</option>` + vals.map((v) => `<option>${esc(v)}</option>`).join(''); el.value = cur; };
  fill('#rtModule', 'All modules', S.data.ruleModules || []);
  fill('#rtStatus', 'All statuses', REQ_STATUSES);
  const n = (f) => reqs.filter(f).length;
  const total = reqs.length || 1;
  const bar = (label, count, cls) => `<div class="cov"><div class="cov-h"><span>${label}</span><b>${count} / ${reqs.length}</b></div>
    <div class="cov-bar"><i class="${cls}" style="width:${Math.round((count / total) * 100)}%"></i></div></div>`;
  $('#rtmTop').innerHTML = `<div class="risk-sum">
      <div>Requirements<b>${reqs.length}</b></div>
      <div>Must<b style="color:#9b1c12">${n((r) => r.priority === 'Must')}</b></div>
      <div>Approved by MoLFR<b style="color:#1d6b40">${n(reqApproved)}</b></div>
      <div>Tests passed<b style="color:#1d6b40">${n((r) => r.testResult === 'Pass')}</b></div>
      <div>Tests failed / blocked<b style="color:#9b1c12">${n((r) => ['Fail', 'Blocked'].includes(r.testResult))}</b></div>
      <div>Accepted<b>${n((r) => r.status === 'Accepted')}</b></div>
    </div>
    <div class="cats"><h4>Traceability coverage</h4>
      ${bar('Linked to a work plan task', n((r) => splitRefs(r.tasks).length), 'c1')}
      ${bar('Linked to a business rule', n((r) => splitRefs(r.rules).length), 'c2')}
      ${bar('Has a test case', n((r) => !!r.testCases), 'c3')}
      ${bar('Test passed', n((r) => r.testResult === 'Pass'), 'c4')}
      ${bar('Approved by MoLFR', n(reqApproved), 'c4')}
    </div>`;

  const q = $('#rtSearch').value.trim().toLowerCase();
  const fm = $('#rtModule').value, fs = $('#rtStatus').value, fg = $('#rtGap').value;
  const rows = reqs.filter((r) => {
    if (fm && r.module !== fm) return false;
    if (fs && r.status !== fs) return false;
    if (fg === 'notask' && splitRefs(r.tasks).length) return false;
    if (fg === 'norule' && splitRefs(r.rules).length) return false;
    if (fg === 'notest' && r.testCases) return false;
    if (fg === 'fail' && !['Fail', 'Blocked'].includes(r.testResult)) return false;
    if (fg === 'unapproved' && reqApproved(r)) return false;
    if (q && ![r.code, r.module, r.requirement, r.source, r.rules, r.tasks, r.design, r.testCases, r.acceptance, r.comments].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap = $('#rtWrap');
  const st = wrap.scrollTop;
  wrap.innerHTML = `<table class="grid"><thead><tr>${RTM_COLS.map((c) => `<th>${c.h}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr class="task-row" data-action="open-req" data-id="${r.id}">${RTM_COLS.map((c) => `<td class="${c.cls || 'nowrap'}">${colHTML(c, r)}</td>`).join('')}</tr>`).join('')
    || `<tr><td colspan="${RTM_COLS.length}" class="empty" style="padding:20px">No requirements match.</td></tr>`}</tbody></table>`;
  wrap.scrollTop = st;
}
['#rtSearch', '#rtModule', '#rtStatus', '#rtGap'].forEach((s) => $(s).addEventListener('input', renderRtm));

function openReq(id) {
  const r = id ? S.data.rtm.find((x) => x.id === id) : null;
  const f = $('#reqForm');
  S.reqId = r ? r.id : null;
  $('#reqModuleSel').innerHTML = (S.data.ruleModules || []).map((m) => `<option>${esc(m)}</option>`).join('');
  if (r && !(S.data.ruleModules || []).includes(r.module)) $('#reqModuleSel').insertAdjacentHTML('afterbegin', `<option>${esc(r.module)}</option>`);
  $('#reqStatusSel').innerHTML = REQ_STATUSES.map((s) => `<option>${s}</option>`).join('');
  const blank = { code: '(auto)', module: $('#rtModule').value || 'General', requirement: '', source: '', priority: 'Must', rules: '', tasks: '', design: '', testCases: '', testResult: 'Not tested', acceptance: '', status: 'Draft', approval: 'Pending', approvedBy: '', approvalDate: '', comments: '' };
  const v = r || blank;
  for (const k of Object.keys(blank)) if (f.elements[k]) f.elements[k].value = v[k] ?? '';
  $('#reqDlgTitle').textContent = r ? `Requirement ${r.code}` : 'New requirement';
  $('#reqUpdated').textContent = r && r.updated ? `Last updated ${fmt(r.updated)}` : '';
  $('#reqDelete').classList.toggle('hidden', !r);
  $('#reqFs').disabled = !canAct();
  [...$('#reqFs').querySelectorAll('input, select, textarea')].forEach((el) => {
    el.disabled = isMolfrUser() && !['approval', 'approvedBy', 'approvalDate', 'comments'].includes(el.name);
  });
  $('#reqSave').classList.toggle('hidden', !canAct());
  $('#reqDlg').showModal();
}
$('#reqCancel').addEventListener('click', () => $('#reqDlg').close());
$('#reqForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canAct()) return $('#reqDlg').close();
  const body = Object.fromEntries(new FormData(e.target).entries());
  if (!S.reqId && body.code === '(auto)') delete body.code;
  try {
    const r = S.reqId ? await api('PUT', `/api/rtm/${S.reqId}`, body) : await api('POST', '/api/rtm', body);
    const i = S.data.rtm.findIndex((x) => x.id === r.id);
    if (i >= 0) S.data.rtm[i] = r; else S.data.rtm.push(r);
    $('#reqDlg').close();
    toast('Requirement saved');
    render();
  } catch (err) { toast(err.message, true); }
});
$('#reqDelete').addEventListener('click', async () => {
  if (!S.reqId || !confirm('Delete this requirement?')) return;
  try {
    await api('DELETE', `/api/rtm/${S.reqId}`);
    S.data.rtm = S.data.rtm.filter((x) => x.id !== S.reqId);
    $('#reqDlg').close();
    render();
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'open-req') openReq(el.dataset.id);
  else if (a === 'add-req') openReq(null);
  else if (a === 'export-rtm') downloadCSV(`SOMLITS-RTM-${todayISO()}.csv`, RTM_COLS.map((c) => c.h), sortedReqs().map((r) => RTM_COLS.map((c) => colVal(c, r))));
});


// ------------------------------------------------------------------ delay records (pop-up box)
function delayBoxHTML(t) {
  const n = totalDelay(t);
  const list = delayList(t);
  const baseDate = expectedOf(t) || t.plannedEnd || todayISO();
  const form = isEditor() ? `<form data-form="delay" data-id="${t.id}" class="delay-form" data-base="${esc(baseDate)}">
      <label>Days delayed <input type="number" name="days" min="1" max="3650" required placeholder="e.g. 5"></label>
      <label>Delayed by <select name="by"><option>MoLFR</option><option>AHDAA</option><option>Third party</option></select></label>
      <label>Now expected on <input type="date" name="expected" value="${esc(baseDate)}"></label>
      <label class="grow">Reason <input name="reason" placeholder="e.g. Waiting for MoLFR comments on the BRS"></label>
      <button class="btn primary" type="submit">Record delay</button>
    </form>` : '';
  const hist = list.length ? `<div class="delay-hist">${list.map((d) => `<div class="delay-row">
      <b>${fmt(d.date)}</b><span class="delay-badge sm">+${d.days} d</span><span>by <b>${esc(d.by)}</b></span>
      ${d.expected ? `<span>expected <b>${fmt(d.expected)}</b></span>` : ''}<span class="why">${esc(d.reason || '')}</span>
      <span class="muted">recorded by ${esc(d.recordedBy || '')}</span>
      ${isEditor() ? `<button class="link danger" data-action="del-delay" data-id="${t.id}" data-did="${d.id}">delete</button>` : ''}</div>`).join('')}</div>` : '';
  return `<section class="delay-box ${n ? 'on' : ''}">
    <div class="delay-head"><span class="delay-title">Delay</span>
      ${n ? `<span class="delay-badge">⚠ Delayed ${n} day${n === 1 ? '' : 's'}</span><span>by <b>${esc(delayParties(t))}</b></span>
        <span>planned end <b>${fmt(t.plannedEnd)}</b> → expected <b>${fmt(expectedOf(t))}</b></span>`
      : '<span class="muted">No delay recorded — on schedule.</span>'}
    </div>${form}${hist}</section>`;
}
// keep "Now expected on" in step with the number of days typed
document.addEventListener('input', (e) => {
  const f = e.target.closest('form[data-form="delay"]');
  if (!f || e.target.name !== 'days') return;
  const n = Math.round(Number(e.target.value));
  if (n > 0 && f.dataset.base) f.elements.expected.value = addD(f.dataset.base, n);
});
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action="del-delay"]');
  if (!el || !confirm('Delete this delay record?')) return;
  try {
    replaceTask(await api('DELETE', `/api/tasks/${el.dataset.id}/delays/${el.dataset.did}`));
    render();
  } catch (err) { toast(err.message, true); }
});


// ------------------------------------------------------------------ home page: simple overview
function renderHome() {
  const today = todayISO();
  const until = addD(today, 14);
  const tasks = sortedTasks();
  const byEnd = (a, b) => (a.plannedEnd < b.plannedEnd ? -1 : a.plannedEnd > b.plannedEnd ? 1 : 0);
  const rel = (d) => {
    const n = diffD(today, d);
    if (n === 0) return '<span class="rel today">today</span>';
    if (n === 1) return '<span class="rel soon">tomorrow</span>';
    if (n < 0) return `<span class="rel late">${-n} day${n === -1 ? '' : 's'} late</span>`;
    return `<span class="rel ${n <= 3 ? 'soon' : ''}">in ${n} days</span>`;
  };
  const dates = (t) => `<div class="h-dates">
      <span><i>Planned</i> ${t.plannedStart ? fmt(t.plannedStart) : '—'} → ${t.plannedEnd ? fmt(t.plannedEnd) : '—'}</span>
      <span><i>Actual</i> ${t.actualStart ? fmt(t.actualStart) : `<em>${t.status === 'Not Started' ? 'not started' : '—'}</em>`} → ${t.actualCompletion ? fmt(t.actualCompletion) : '<em>open</em>'}</span></div>`;
  const item = (t, right, tag = '') => `<div class="h-item" data-action="open-task" data-id="${t.id}">
      ${noTag(t)}<div class="h-main"><div class="h-name">${tag}${esc(t.task)}</div>${dates(t)}</div>
      <div class="h-right">${right}</div></div>`;
  const card = (cls, title, list, empty) => `<section class="h-card ${cls}">
      <h3>${title}<span class="count">${list.length}</span></h3>
      <div class="h-list">${list.length ? list.join('') : `<div class="empty">${empty}</div>`}</div>
    </section>`;

  const late = tasks.filter(isLate).sort(byEnd);
  const due = tasks.filter((t) => !isDone(t) && !isLate(t) && t.plannedEnd >= today && t.plannedEnd <= until
    && !['Submitted', 'Under Review'].includes(t.status)).sort(byEnd);
  // waiting for MoLFR = (a) MoLFR inputs / reviews whose window has opened and are not done,
  //                     (b) AHDAA deliverables submitted and waiting for MoLFR approval
  const molfrOpen = tasks.filter((t) => isMolfr(t) && !isDone(t) && t.plannedStart && t.plannedStart <= today)
    .sort(byEnd).map((t) => ({ t, kind: String(t.type).replace('MoLFR ', ''), due: t.plannedEnd }));
  const approvals = tasks.filter((t) => !isMolfr(t) && ['Submitted', 'Under Review'].includes(t.status) && !isApproved(t))
    .map((t) => ({ t, kind: 'Approval', since: (t.submissions[0] && t.submissions[0].date) || t.actualCompletion || today }))
    .sort((a, b) => (a.since < b.since ? -1 : 1));
  const waiting = [...molfrOpen, ...approvals];
  const waitIds = new Set(molfrOpen.map((w) => w.t.id));
  for (let i = due.length - 1; i >= 0; i--) if (waitIds.has(due[i].id)) due.splice(i, 1);   // shown under "Waiting for MoLFR"

  $('#homeTitle').innerHTML = `Today <span class="muted">· ${fmt(today)}</span>`;
  $('#homeGrid').innerHTML = [
    card('late', 'Late', late.map((t) => item(t, rel(t.plannedEnd))), 'Nothing late. 👍'),
    card('due', 'Due in the next 2 weeks', due.map((t) => item(t, `<div class="h-date">${fmt(t.plannedEnd)}</div>${rel(t.plannedEnd)}`)), 'Nothing due.'),
    card('await', 'Waiting for MoLFR', waiting.map((w) => item(w.t,
      w.kind === 'Approval' ? `<div class="h-date">submitted</div><span class="rel ${diffD(w.since, today) > 10 ? 'late' : ''}">${diffD(w.since, today)} days ago</span>`
        : `<div class="h-date">due ${fmt(w.due)}</div>${rel(w.due)}`,
      `<span class="h-kind k-${w.kind.toLowerCase()}">${esc(w.kind)}</span>`)), 'Nothing waiting from MoLFR.'),
  ].join('');
}

window.addEventListener('resize', () => { if (S.tab === 'process' || S.tab === 'home') renderProcess(); });
document.addEventListener('click', (e) => { const b = e.target.closest('[data-tab-go]'); if (b) switchTab(b.dataset.tabGo); });


// ------------------------------------------------------------------ document library
const TASK_ATT = '__task_attachments__';            // read-only virtual folder with every task attachment
const docFolders = () => S.data.docFolders || [];
const docFiles = () => S.data.docFiles || [];
const folderOf = (id) => docFolders().find((f) => f.id === id);
const childFolders = (pid) => docFolders().filter((f) => (f.parentId || '') === (pid || '')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const filesIn = (fid) => docFiles().filter((f) => (f.folderId || '') === (fid || '')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
const folderPath = (id) => { const out = []; let f = folderOf(id); while (f) { out.unshift(f); f = folderOf(f.parentId); } return out; };
const countDeep = (id) => { let n = filesIn(id).length; childFolders(id).forEach((c) => (n += countDeep(c.id))); return n; };
const canChangeFile = (f) => isEditor() || (isMolfrUser() && f.user === S.me.username);
if (!S.docOpen) S.docOpen = new Set();
S.docFolder = S.docFolder ?? '';

function fileIcon(name, mime) {
  const ext = (String(name).split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return ['PDF', '#d6453a'];
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return ['DOC', '#2f5fd0'];
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return ['XLS', '#1f8a4c'];
  if (['ppt', 'pptx', 'odp'].includes(ext)) return ['PPT', '#d9730d'];
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'heic'].includes(ext) || String(mime).startsWith('image/')) return ['IMG', '#8e44ad'];
  if (['zip', 'rar', '7z', 'gz'].includes(ext)) return ['ZIP', '#6b7280'];
  if (['dwg', 'dxf'].includes(ext)) return ['CAD', '#0e7490'];
  return [ext ? ext.slice(0, 4).toUpperCase() : 'FILE', '#64748b'];
}
const canPreview = (name) => /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(name);

function renderDocs() {
  const locked = !!S.data.docsLocked;
  $('#docLocked').classList.toggle('hidden', !locked);
  $('#tab-docs .doc-layout').classList.toggle('hidden', locked);
  $('#docLockBtn').classList.toggle('hidden', !(S.data.settings && S.data.settings.docsLocked));
  if (locked) { setTimeout(() => { const i = $('#docUnlockForm').elements.password; if (i && S.tab === 'docs') i.focus(); }, 30); return; }
  if (S.docFolder && S.docFolder !== TASK_ATT && !folderOf(S.docFolder)) S.docFolder = '';
  // ---- tree
  const node = (f, depth) => {
    const kids = childFolders(f.id);
    const open = S.docOpen.has(f.id);
    return `<div class="dt-row ${S.docFolder === f.id ? 'on' : ''}" style="padding-left:${8 + depth * 16}px" data-action="doc-open" data-id="${f.id}">
        <span class="dt-caret ${kids.length ? '' : 'none'}" data-action="doc-toggle" data-id="${f.id}">${kids.length ? (open ? '▾' : '▸') : ''}</span>
        <span class="dt-ico">📁</span><span class="dt-name">${esc(f.name)}</span><span class="dt-count">${countDeep(f.id) || ''}</span></div>
      ${open ? kids.map((k) => node(k, depth + 1)).join('') : ''}`;
  };
  const attCount = S.data.tasks.reduce((n, t) => n + t.attachments.length, 0);
  $('#docTree').innerHTML = `<div class="dt-row ${S.docFolder === '' ? 'on' : ''}" style="padding-left:8px" data-action="doc-open" data-id="">
      <span class="dt-caret none"></span><span class="dt-ico">🗂</span><span class="dt-name"><b>All documents</b></span><span class="dt-count">${docFiles().length || ''}</span></div>
    ${childFolders('').map((f) => node(f, 1)).join('')}
    <div class="dt-sep"></div>
    <div class="dt-row ${S.docFolder === TASK_ATT ? 'on' : ''}" style="padding-left:8px" data-action="doc-open" data-id="${TASK_ATT}">
      <span class="dt-caret none"></span><span class="dt-ico">📎</span><span class="dt-name">Task attachments</span><span class="dt-count">${attCount || ''}</span></div>`;

  // ---- breadcrumb + toolbar state
  const q = $('#docSearch').value.trim().toLowerCase();
  const inAtt = S.docFolder === TASK_ATT;
  $('#docCrumbs').innerHTML = q ? `<span class="crumb on">Search results for “${esc(q)}”</span>`
    : inAtt ? '<span class="crumb on">📎 Task attachments</span> <span class="muted">· files attached inside work plan tasks (read-only here)</span>'
    : [`<span class="crumb ${S.docFolder ? '' : 'on'}" data-action="doc-open" data-id="">All documents</span>`,
      ...folderPath(S.docFolder).map((f, i, arr) => `<span class="crumb ${i === arr.length - 1 ? 'on' : ''}" data-action="doc-open" data-id="${f.id}">${esc(f.name)}</span>`)].join('<span class="crumb-sep">›</span>');
  $('#docNewSub').dataset.parent = inAtt ? '' : S.docFolder;
  const writable = canAct() && !inAtt && !q;
  $('#docNewSub').classList.toggle('hidden', !writable);
  $('.doc-upload-btn').classList.toggle('hidden', !writable);
  $('.doc-drop-hint').classList.toggle('hidden', !writable);

  // ---- list
  const head = '<div class="dl-head"><span></span><span>Name</span><span>Size</span><span>Uploaded by</span><span>Date</span><span></span></div>';
  let rows = '';
  const fileRow = (f, where) => {
    const [label, color] = fileIcon(f.name, f.mime);
    const loc = where ? `<div class="dl-loc">📁 ${esc(folderPath(f.folderId).map((x) => x.name).join(' › ') || 'All documents')}</div>` : '';
    return `<div class="dl-row">
      <span class="fi" style="background:${color}">${label}</span>
      <span class="dl-name"><a href="/api/files/${f.id}${canPreview(f.name, f.mime) ? '?view=1' : ''}" target="_blank" rel="noopener">${esc(f.name)}</a>${f.note ? `<div class="dl-note">${esc(f.note)}</div>` : ''}${loc}</span>
      <span class="muted">${fileSize(f.size || 0)}</span>
      <span>${esc(f.by || '')}</span>
      <span class="muted">${fmtTime(f.at)}</span>
      <span class="dl-actions">
        <a class="btn ghost small" href="/api/files/${f.id}" title="Download">⬇</a>
        ${canChangeFile(f) ? `<button class="btn ghost small" data-action="doc-file-rename" data-id="${f.id}" title="Rename">✎</button>
          <button class="btn ghost small" data-action="doc-file-move" data-id="${f.id}" title="Move to another folder">⇄</button>
          <button class="btn ghost small danger" data-action="doc-file-del" data-id="${f.id}" title="Delete">🗑</button>` : ''}
      </span></div>`;
  };
  if (q) {
    const hitsF = docFolders().filter((f) => f.name.toLowerCase().includes(q));
    const hits = docFiles().filter((f) => (f.name + ' ' + (f.note || '') + ' ' + (f.by || '')).toLowerCase().includes(q));
    rows = hitsF.map((f) => `<div class="dl-row folder" data-action="doc-open" data-id="${f.id}"><span class="fi folder">📁</span>
        <span class="dl-name"><b>${esc(f.name)}</b><div class="dl-loc">${esc(folderPath(f.parentId).map((x) => x.name).join(' › ') || 'All documents')}</div></span><span></span><span></span><span></span><span></span></div>`).join('')
      + hits.map((f) => fileRow(f, true)).join('');
    if (!rows) rows = '<div class="empty dl-empty">Nothing found.</div>';
  } else if (inAtt) {
    const list = [];
    sortedTasks().forEach((t) => t.attachments.forEach((a) => list.push({ t, a })));
    rows = list.map(({ t, a }) => {
      const [label, color] = fileIcon(a.name, a.mime);
      return `<div class="dl-row"><span class="fi" style="background:${color}">${label}</span>
        <span class="dl-name"><a href="/api/tasks/${t.id}/attachments/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a>
          <div class="dl-loc"><span class="kind">${esc(a.kind || '')}</span> Task ${esc(t.no)} — <span class="link" data-action="open-task" data-id="${t.id}">${esc(t.task)}</span></div></span>
        <span class="muted">${fileSize(a.size || 0)}</span><span>${esc(a.by || '')}</span><span class="muted">${fmtTime(a.at)}</span>
        <span class="dl-actions"><a class="btn ghost small" href="/api/tasks/${t.id}/attachments/${a.id}" title="Download">⬇</a></span></div>`;
    }).join('') || '<div class="empty dl-empty">No files have been attached to tasks yet.</div>';
  } else {
    rows = childFolders(S.docFolder).map((f) => `<div class="dl-row folder" data-action="doc-open" data-id="${f.id}">
        <span class="fi folder">📁</span><span class="dl-name"><b>${esc(f.name)}</b><div class="dl-loc">${countDeep(f.id)} file${countDeep(f.id) === 1 ? '' : 's'}</div></span>
        <span></span><span>${esc(f.by || '')}</span><span class="muted">${fmtTime(f.at)}</span>
        <span class="dl-actions">${isEditor() ? `<button class="btn ghost small" data-action="doc-folder-rename" data-id="${f.id}" title="Rename">✎</button>
          <button class="btn ghost small" data-action="doc-folder-move" data-id="${f.id}" title="Move">⇄</button>
          <button class="btn ghost small danger" data-action="doc-folder-del" data-id="${f.id}" title="Delete folder">🗑</button>` : ''}</span></div>`).join('')
      + filesIn(S.docFolder).map((f) => fileRow(f, false)).join('');
    if (!rows) rows = `<div class="empty dl-empty">This folder is empty.${canAct() ? ' Upload files or create a sub-folder.' : ''}</div>`;
  }
  $('#docList').innerHTML = head + rows;
}

// small promise-based dialog: ask for a name and/or a folder
function ask({ title, label = 'Name', value = '', folder = false, exclude = null, current = '', secret = false }) {
  return new Promise((resolve) => {
    const dlg = $('#askDlg'), f = $('#askForm');
    f.elements.value.type = secret ? 'password' : 'text';
    $('#askTitle').textContent = title;
    $('#askLabel').classList.toggle('hidden', label === null);
    if (label !== null) { $('#askLabel').firstChild.textContent = label + ' '; f.elements.value.value = value; }
    $('#askFolderWrap').classList.toggle('hidden', !folder);
    if (folder) {
      const banned = exclude ? (() => { const out = new Set([exclude]); let grew = true; while (grew) { grew = false; docFolders().forEach((x) => { if (out.has(x.parentId) && !out.has(x.id)) { out.add(x.id); grew = true; } }); } return out; })() : new Set();
      const opts = ['<option value="">All documents (top level)</option>'];
      const walk = (pid, depth) => childFolders(pid).forEach((x) => { if (banned.has(x.id)) return; opts.push(`<option value="${x.id}">${'— '.repeat(depth)}${esc(x.name)}</option>`); walk(x.id, depth + 1); });
      walk('', 1);
      $('#askFolder').innerHTML = opts.join('');
      $('#askFolder').value = current || '';
    }
    const done = (v) => { f.onsubmit = null; $('#askCancel').onclick = null; dlg.close(); resolve(v); };
    f.onsubmit = (e) => { e.preventDefault(); done({ value: f.elements.value.value.trim(), folder: $('#askFolder').value }); };
    $('#askCancel').onclick = () => done(null);
    dlg.onclose = () => { if (f.onsubmit) done(null); };
    dlg.showModal();
    if (label !== null) setTimeout(() => { f.elements.value.focus(); f.elements.value.select(); }, 30);
  });
}

async function uploadDocs(files) {
  if (!files || !files.length) return;
  if (!canAct() || S.docFolder === TASK_ATT) return toast('You cannot upload here', true);
  const fd = new FormData();
  [...files].forEach((f) => fd.append('files', f));
  toast(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
  try {
    const added = await api('POST', `/api/folders/${S.docFolder || 'root'}/files`, fd, true);
    S.data.docFiles = [...docFiles(), ...added];
    toast(`Uploaded ${added.length} file${added.length === 1 ? '' : 's'}`);
    renderDocs();
  } catch (err) { toast(err.message, true); }
}
$('#docFileInput').addEventListener('change', (e) => { uploadDocs(e.target.files); e.target.value = ''; });
$('#docSearch').addEventListener('input', renderDocs);
// drag & drop files from the computer
(() => {
  const main = $('#docMain'); let depth = 0;
  const show = (on) => $('#docDrop').classList.toggle('on', on);
  main.addEventListener('dragenter', (e) => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); depth++; if (canAct() && S.docFolder !== TASK_ATT) show(true); });
  main.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  main.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) show(false); });
  main.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; show(false); uploadDocs(e.dataTransfer.files); });
})();

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !el.dataset.action.startsWith('doc-')) return;
  const id = el.dataset.id;
  try {
    switch (el.dataset.action) {
      case 'doc-toggle':
        e.stopPropagation();
        if (S.docOpen.has(id)) S.docOpen.delete(id); else S.docOpen.add(id);
        renderDocs();
        break;
      case 'doc-open':
        if (e.target.closest('[data-action="doc-toggle"]')) break;
        S.docFolder = id;
        $('#docSearch').value = '';
        folderPath(id).forEach((f) => S.docOpen.add(f.id));
        renderDocs();
        break;
      case 'doc-new-folder': {
        const parent = el.dataset.parent ?? S.docFolder;
        const r = await ask({ title: parent ? `New folder inside “${folderOf(parent)?.name}”` : 'New folder' });
        if (!r || !r.value) break;
        const f = await api('POST', '/api/folders', { name: r.value, parentId: parent === TASK_ATT ? '' : parent || '' });
        S.data.docFolders = [...docFolders(), f];
        if (parent) S.docOpen.add(parent);
        toast('Folder created');
        renderDocs();
        break;
      }
      case 'doc-folder-rename': {
        e.stopPropagation();
        const f = folderOf(id);
        const r = await ask({ title: 'Rename folder', value: f.name });
        if (!r || !r.value || r.value === f.name) break;
        Object.assign(f, await api('PUT', `/api/folders/${id}`, { name: r.value }));
        renderDocs();
        break;
      }
      case 'doc-folder-move': {
        e.stopPropagation();
        const f = folderOf(id);
        const r = await ask({ title: `Move folder “${f.name}”`, label: null, folder: true, exclude: id, current: f.parentId });
        if (!r) break;
        Object.assign(f, await api('PUT', `/api/folders/${id}`, { parentId: r.folder }));
        toast('Folder moved');
        renderDocs();
        break;
      }
      case 'doc-folder-del': {
        e.stopPropagation();
        const f = folderOf(id);
        const n = countDeep(id);
        if (!confirm(`Delete the folder “${f.name}”${n ? ` and the ${n} file${n === 1 ? '' : 's'} inside it` : ''}? This cannot be undone.`)) break;
        await api('DELETE', `/api/folders/${id}`);
        S.data = await api('GET', '/api/data');
        toast('Folder deleted');
        render();
        break;
      }
      case 'doc-file-rename': {
        const f = docFiles().find((x) => x.id === id);
        const r = await ask({ title: 'Rename file', value: f.name });
        if (!r || !r.value || r.value === f.name) break;
        Object.assign(f, await api('PUT', `/api/files/${id}`, { name: r.value }));
        renderDocs();
        break;
      }
      case 'doc-file-move': {
        const f = docFiles().find((x) => x.id === id);
        const r = await ask({ title: `Move “${f.name}”`, label: null, folder: true, current: f.folderId });
        if (!r) break;
        Object.assign(f, await api('PUT', `/api/files/${id}`, { folderId: r.folder }));
        toast('File moved');
        renderDocs();
        break;
      }
      case 'doc-file-del': {
        const f = docFiles().find((x) => x.id === id);
        if (!confirm(`Delete “${f.name}”? This cannot be undone.`)) break;
        await api('DELETE', `/api/files/${id}`);
        S.data.docFiles = docFiles().filter((x) => x.id !== id);
        renderDocs();
        break;
      }
    }
  } catch (err) { toast(err.message, true); }
});


// ------------------------------------------------------------------ meetings register & minutes
const MTG_TYPES = ['Kickoff / inception meeting', 'Steering Committee', 'Weekly progress meeting', 'Sprint review / demonstration',
  'Milestone review / sign-off', 'Requirements workshop', 'Technical Working Group', 'Training session', 'Ad-hoc meeting'];
const MTG_STATUS = ['Planned', 'Held', 'Postponed', 'Cancelled'];
const MIN_STATUS = ['Not started', 'Draft', 'Circulated', 'Approved'];
const meetings = () => [...(S.data.meetings || [])].sort((a, b) => ((a.date || '9') + (a.time || '') < (b.date || '9') + (b.time || '') ? 1 : -1));
const mtgStatusCls = (s) => ({ Planned: 'ip', Held: 'done', Postponed: 'ur', Cancelled: 'ns' }[s] || 'ns');
const minStatusCls = (s) => ({ 'Not started': 'ns', Draft: 'ur', Circulated: 'sub', Approved: 'done' }[s] || 'ns');
const actOverdue = (a) => a.status !== 'Done' && a.due && a.due < todayISO();
S.mtgView = S.mtgView || 'list';

function renderMeetings() {
  const all = meetings();
  const today = todayISO(), soon = addD(today, 14);
  const acts = [];
  all.forEach((m) => (m.actions || []).forEach((a) => acts.push({ m, a })));
  const n = (f) => all.filter(f).length;
  const openActs = acts.filter(({ a }) => a.status !== 'Done');
  $('#mtgTop').innerHTML = `<div class="risk-sum">
      <div>Meetings<b>${all.length}</b></div>
      <div>Upcoming (14 days)<b style="color:#3b63d9">${n((m) => m.status === 'Planned' && m.date >= today && m.date <= soon)}</b></div>
      <div>Held<b style="color:#1d6b40">${n((m) => m.status === 'Held')}</b></div>
      <div>Minutes not approved<b style="color:#8a5300">${n((m) => m.status === 'Held' && m.minutesStatus !== 'Approved')}</b></div>
      <div>Open actions<b>${openActs.length}</b></div>
      <div>Overdue actions<b style="color:#9b1c12">${openActs.filter(({ a }) => actOverdue(a)).length}</b></div>
    </div>`;
  const typeSel = $('#mtgType'); const cur = typeSel.value;
  typeSel.innerHTML = '<option value="">All types</option>' + MTG_TYPES.map((t) => `<option>${esc(t)}</option>`).join('');
  typeSel.value = cur;
  $$('#mtgView .seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.view === S.mtgView));
  $('#mtgActFilter').classList.toggle('hidden', S.mtgView !== 'actions');
  $('#mtgStatus').classList.toggle('hidden', S.mtgView === 'actions');

  const q = $('#mtgSearch').value.trim().toLowerCase();
  const ft = $('#mtgType').value, fs = $('#mtgStatus').value;
  const wrap = $('#mtgWrap');
  if (S.mtgView === 'list') {
    const rows = all.filter((m) => (!ft || m.type === ft) && (!fs || m.status === fs)
      && (!q || [m.code, m.title, m.type, m.chair, m.attendees, m.agenda, m.discussion, m.decisions, ...(m.actions || []).map((a) => a.text + ' ' + a.owner)].join(' ').toLowerCase().includes(q)));
    wrap.innerHTML = `<table class="grid"><thead><tr><th>ID</th><th>Date</th><th>Time</th><th>Type</th><th>Meeting</th><th>Chair</th><th>Location</th><th>Status</th><th>Minutes</th><th>Actions (open / all)</th><th>Files</th></tr></thead><tbody>${
      rows.map((m) => {
        const open = (m.actions || []).filter((a) => a.status !== 'Done').length, overdue = (m.actions || []).filter(actOverdue).length;
        const upcoming = m.status === 'Planned' && m.date >= today && m.date <= soon;
        return `<tr class="task-row ${upcoming ? 'now' : ''}" data-action="mtg-open" data-id="${m.id}">
          <td class="nowrap"><b>${esc(m.code)}</b></td>
          <td class="nowrap">${fmt(m.date)}${m.date === today ? ' <span class="rel today">today</span>' : ''}</td>
          <td class="nowrap">${esc(m.time || '')}${m.end ? '–' + esc(m.end) : ''}</td>
          <td class="nowrap">${esc(m.type)}</td>
          <td class="wrap w-desc"><b>${esc(m.title)}</b></td>
          <td class="wrap w-resp">${esc(m.chair || '')}</td>
          <td class="wrap w-resp">${esc(m.location || '')}</td>
          <td class="nowrap"><span class="pill ${mtgStatusCls(m.status)}">${esc(m.status)}</span></td>
          <td class="nowrap"><span class="pill ${minStatusCls(m.minutesStatus)}">${esc(m.minutesStatus || 'Not started')}</span></td>
          <td class="nowrap">${open} / ${(m.actions || []).length}${overdue ? ` <span class="rel late">${overdue} overdue</span>` : ''}</td>
          <td class="nowrap">${(m.attachments || []).length ? '📎 ' + m.attachments.length : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="11" class="empty" style="padding:20px">No meetings match.</td></tr>'}</tbody></table>`;
  } else {
    const fa = $('#mtgActFilter').value;
    const list = acts.filter(({ m, a }) => (!ft || m.type === ft)
      && (!fa || (fa === 'open' && a.status !== 'Done') || (fa === 'done' && a.status === 'Done') || (fa === 'overdue' && actOverdue(a)))
      && (!q || [a.text, a.owner, a.task, m.title, m.code].join(' ').toLowerCase().includes(q)))
      .sort((x, y) => ((x.a.due || '9') < (y.a.due || '9') ? -1 : 1));
    wrap.innerHTML = `<table class="grid"><thead><tr><th></th><th>Action</th><th>Owner</th><th>Due</th><th>Status</th><th>Linked task</th><th>From meeting</th></tr></thead><tbody>${
      list.map(({ m, a }) => {
        const t = a.task && S.data.tasks.find((x) => x.no === a.task);
        return `<tr class="${actOverdue(a) ? 'act-late' : ''}">
          <td class="nowrap">${isEditor() ? `<input type="checkbox" class="act-check" data-mid="${m.id}" data-aid="${a.id}" ${a.status === 'Done' ? 'checked' : ''} title="Mark done">` : (a.status === 'Done' ? '✔' : '')}</td>
          <td class="wrap w-desc ${a.status === 'Done' ? 'act-done' : ''}">${esc(a.text)}</td>
          <td class="wrap w-resp">${esc(a.owner || '')}</td>
          <td class="nowrap">${fmt(a.due)}${a.due && a.status !== 'Done' ? ' ' + relDays(a.due) : ''}</td>
          <td class="nowrap"><span class="pill ${a.status === 'Done' ? 'done' : actOverdue(a) ? 'rw' : 'ur'}">${a.status === 'Done' ? 'Done' + (a.doneDate ? ' ' + fmt(a.doneDate) : '') : actOverdue(a) ? 'Overdue' : 'Open'}</span></td>
          <td class="nowrap">${t ? `<span class="chip" data-action="open-task" data-id="${t.id}" title="${esc(t.task)}">${esc(t.no)}</span>` : esc(a.task || '')}</td>
          <td class="wrap w-deliv"><span class="link" data-action="mtg-open" data-id="${m.id}">${esc(m.code)} · ${fmt(m.date)} · ${esc(m.title)}</span></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="empty" style="padding:20px">No action items match.</td></tr>'}</tbody></table>`;
  }
}
function relDays(d) {
  const n = diffD(todayISO(), d);
  if (n === 0) return '<span class="rel today">today</span>';
  if (n < 0) return `<span class="rel late">${-n}d late</span>`;
  return `<span class="rel ${n <= 3 ? 'soon' : ''}">in ${n}d</span>`;
}
['#mtgSearch', '#mtgType', '#mtgStatus', '#mtgActFilter'].forEach((s) => $(s).addEventListener('input', renderMeetings));
$('#mtgView').addEventListener('click', (e) => { const b = e.target.closest('.seg-btn'); if (!b) return; S.mtgView = b.dataset.view; renderMeetings(); });
document.addEventListener('change', async (e) => {
  const c = e.target.closest('.act-check');
  if (!c) return;
  const m = S.data.meetings.find((x) => x.id === c.dataset.mid);
  const actions = (m.actions || []).map((a) => (a.id === c.dataset.aid ? { ...a, status: c.checked ? 'Done' : 'Open', doneDate: c.checked ? todayISO() : '' } : a));
  try { replaceMeeting(await api('PUT', `/api/meetings/${m.id}`, { actions })); toast(c.checked ? 'Action done' : 'Action reopened'); renderMeetings(); }
  catch (err) { toast(err.message, true); }
});
function replaceMeeting(m) {
  const i = S.data.meetings.findIndex((x) => x.id === m.id);
  if (i >= 0) S.data.meetings[i] = m; else S.data.meetings.push(m);
}

// ---- meeting pop-up
function actionRowHTML(a = {}) {
  const ro = isEditor() ? '' : 'disabled';
  return `<div class="act-row" data-aid="${esc(a.id || '')}">
    <input name="a_text" value="${esc(a.text || '')}" placeholder="Action to be taken" ${ro}>
    <input name="a_owner" value="${esc(a.owner || '')}" placeholder="Owner (e.g. AHDAA PM / MoLFR)" ${ro}>
    <input name="a_due" type="date" value="${esc(a.due || '')}" ${ro}>
    <input name="a_task" value="${esc(a.task || '')}" placeholder="Task no." ${ro}>
    <select name="a_status" ${ro}><option ${a.status !== 'Done' ? 'selected' : ''}>Open</option><option ${a.status === 'Done' ? 'selected' : ''}>Done</option></select>
    <input type="hidden" name="a_done" value="${esc(a.doneDate || '')}">
    ${isEditor() ? '<button type="button" class="btn ghost small danger" data-action="mtg-act-del" title="Remove">✕</button>' : ''}
  </div>`;
}
function openMeeting(id) {
  const m = id ? S.data.meetings.find((x) => x.id === id) : null;
  S.mtgId = m ? m.id : null;
  const v = m || { code: '(auto)', type: 'Weekly progress meeting', title: '', date: todayISO(), time: '10:00', end: '11:00', location: 'MS Teams', chair: '', attendees: '', apologies: '', agenda: '', status: 'Planned', discussion: '', decisions: '', actions: [], minutesStatus: 'Not started', minutesBy: S.me.name, circulatedDate: '', approvedBy: '', approvalDate: '', comments: '', nextMeeting: '', attachments: [] };
  const ed = isEditor(), mo = isMolfrUser();
  const dis = ed ? '' : 'disabled';
  const disM = ed || mo ? '' : 'disabled';     // MoLFR may approve minutes and comment
  const opt2 = (list, cur) => list.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  $('#mtgDlgTitle').textContent = m ? `${m.code} · ${m.title}` : 'New meeting';
  $('#mtgDlgBody').innerHTML = `<form id="mtgForm" class="mtg-form">
    <section class="card wide">
      <h4>Meeting details</h4>
      <div class="details-grid">
        <label>Meeting ID <input name="code" value="${esc(v.code)}" ${dis}></label>
        <label>Type <select name="type" ${dis}>${opt2(MTG_TYPES.includes(v.type) ? MTG_TYPES : [v.type, ...MTG_TYPES], v.type)}</select></label>
        <label>Status <select name="status" ${dis}>${opt2(MTG_STATUS, v.status)}</select></label>
        <label>Location / link <input name="location" value="${esc(v.location)}" ${dis}></label>
        <label class="span2">Title <input name="title" value="${esc(v.title)}" placeholder="e.g. Weekly progress meeting #3" ${dis}></label>
        <label>Date <input type="date" name="date" value="${esc(v.date)}" ${dis}></label>
        <label>Time <span class="time-pair"><input type="time" name="time" value="${esc(v.time)}" ${dis}><span>–</span><input type="time" name="end" value="${esc(v.end)}" ${dis}></span></label>
        <label>Chair <input name="chair" value="${esc(v.chair)}" ${dis}></label>
        <label class="span2">Attendees <input name="attendees" value="${esc(v.attendees)}" placeholder="Names / organisations, separated by ;" ${dis}></label>
        <label>Apologies <input name="apologies" value="${esc(v.apologies)}" ${dis}></label>
        <label class="span4">Agenda <textarea name="agenda" rows="4" placeholder="1. …&#10;2. …" ${dis}>${esc(v.agenda)}</textarea></label>
      </div>
    </section>
    <section class="card wide">
      <h4>Minutes of meeting</h4>
      <label>Discussion / notes <textarea name="discussion" rows="7" placeholder="Summary of what was discussed under each agenda item…" ${dis}>${esc(v.discussion)}</textarea></label>
      <label>Decisions <textarea name="decisions" rows="3" placeholder="One decision per line" ${dis}>${esc(v.decisions)}</textarea></label>
      <div class="act-head"><b>Action items</b><span class="muted">action · owner · due date · linked task · status</span></div>
      <div id="actRows">${(v.actions || []).map(actionRowHTML).join('')}</div>
      ${ed ? '<button type="button" class="btn ghost small" data-action="mtg-act-add">+ Add action item</button>' : ''}
    </section>
    <section class="card wide">
      <h4>Minutes status &amp; approval</h4>
      <div class="details-grid">
        <label>Minutes status <select name="minutesStatus" ${disM}>${opt2(MIN_STATUS, v.minutesStatus || 'Not started')}</select></label>
        <label>Minutes taken by <input name="minutesBy" value="${esc(v.minutesBy)}" ${dis}></label>
        <label>Circulated on <input type="date" name="circulatedDate" value="${esc(v.circulatedDate)}" ${dis}></label>
        <label>Next meeting <input type="date" name="nextMeeting" value="${esc(v.nextMeeting)}" ${dis}></label>
        <label>Approved by (MoLFR) <input name="approvedBy" value="${esc(v.approvedBy)}" ${disM}></label>
        <label>Approval date <input type="date" name="approvalDate" value="${esc(v.approvalDate)}" ${disM}></label>
        <label class="span2">Comments / MoLFR feedback <input name="comments" value="${esc(v.comments)}" ${disM}></label>
      </div>
    </section>
    ${m ? `<section class="card wide">
      <h4>Attachments <span class="count">${(m.attachments || []).length}</span></h4>
      <div class="entries">${(m.attachments || []).map((a) => `<div class="att"><span class="kind">${esc(a.kind)}</span>
          <a href="/api/meetings/${m.id}/files/${a.id}" target="_blank" rel="noopener">${esc(a.name)}</a>
          <span class="muted">${fileSize(a.size)} · ${esc(a.by)} · ${fmtTime(a.at)}</span><span class="spacer"></span>
          ${isEditor() || (mo && a.user === S.me.username) ? `<button type="button" class="link danger" data-action="mtg-file-del" data-fid="${a.id}">remove</button>` : ''}</div>`).join('') || '<div class="empty">No files yet (signed minutes, presentation, attendance sheet…).</div>'}</div>
      ${ed || mo ? `<div class="row-actions" style="justify-content:flex-start;gap:8px">
        <select id="mtgFileKind"><option>Minutes</option><option>Signed minutes</option><option>Presentation</option><option>Attendance sheet</option><option>Other</option></select>
        <label class="btn ghost small" style="cursor:pointer">⬆ Upload files<input type="file" id="mtgFileInput" multiple hidden></label></div>` : ''}
    </section>` : '<p class="muted">Save the meeting first to attach files.</p>'}
    <div class="row-actions mtg-save-bar">
      ${m && ed ? '<button type="button" class="btn danger" data-action="mtg-del">Delete meeting</button>' : ''}
      <span class="spacer"></span>
      ${m && m.updated ? `<span class="muted">Last updated ${fmtTime(m.updated)} by ${esc(m.updatedBy || '')}</span>` : ''}
      ${ed || mo ? `<button type="submit" class="btn primary">${m ? 'Save' : 'Create meeting'}</button>` : ''}
    </div>
  </form>`;
  $('[data-action="mtg-print"]').classList.toggle('hidden', !m);
  if (!$('#mtgDlg').open) $('#mtgDlg').showModal();
}
function collectMeeting(form) {
  const body = Object.fromEntries(new FormData(form).entries());
  ['a_text', 'a_owner', 'a_due', 'a_task', 'a_status', 'a_done'].forEach((k) => delete body[k]);
  if (body.code === '(auto)') delete body.code;
  body.actions = [...form.querySelectorAll('.act-row')].map((r) => ({
    id: r.dataset.aid, text: r.querySelector('[name=a_text]').value, owner: r.querySelector('[name=a_owner]').value,
    due: r.querySelector('[name=a_due]').value, task: r.querySelector('[name=a_task]').value,
    status: r.querySelector('[name=a_status]').value, doneDate: r.querySelector('[name=a_done]').value,
  }));
  if (!isEditor()) delete body.actions;
  return body;
}
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'mtgForm') return;
  e.preventDefault();
  const body = collectMeeting(e.target);
  try {
    const m = S.mtgId ? await api('PUT', `/api/meetings/${S.mtgId}`, body) : await api('POST', '/api/meetings', body);
    replaceMeeting(m);
    toast(S.mtgId ? 'Meeting saved' : 'Meeting created');
    openMeeting(m.id);
    renderMeetings();
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('change', async (e) => {
  if (e.target.id !== 'mtgFileInput' || !S.mtgId) return;
  const fd = new FormData();
  [...e.target.files].forEach((f) => fd.append('files', f));
  fd.append('kind', $('#mtgFileKind').value);
  try { replaceMeeting(await api('POST', `/api/meetings/${S.mtgId}/files`, fd, true)); toast('Uploaded'); openMeeting(S.mtgId); renderMeetings(); }
  catch (err) { toast(err.message, true); }
});
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !el.dataset.action.startsWith('mtg-')) return;
  try {
    switch (el.dataset.action) {
      case 'mtg-open': openMeeting(el.dataset.id); break;
      case 'mtg-add': openMeeting(null); break;
      case 'mtg-close': $('#mtgDlg').close(); break;
      case 'mtg-act-add': $('#actRows').insertAdjacentHTML('beforeend', actionRowHTML({})); $('#actRows .act-row:last-child input').focus(); break;
      case 'mtg-act-del': el.closest('.act-row').remove(); break;
      case 'mtg-del':
        if (!confirm('Delete this meeting and its minutes?')) break;
        await api('DELETE', `/api/meetings/${S.mtgId}`);
        S.data.meetings = S.data.meetings.filter((x) => x.id !== S.mtgId);
        $('#mtgDlg').close(); renderMeetings(); break;
      case 'mtg-file-del':
        if (!confirm('Remove this file?')) break;
        replaceMeeting(await api('DELETE', `/api/meetings/${S.mtgId}/files/${el.dataset.fid}`));
        openMeeting(S.mtgId); renderMeetings(); break;
      case 'mtg-print': printMinutes(S.data.meetings.find((x) => x.id === S.mtgId)); break;
      case 'mtg-export': {
        const header = ['ID', 'Date', 'Time', 'End', 'Type', 'Title', 'Chair', 'Location', 'Attendees', 'Status', 'Minutes status', 'Decisions', 'Open actions', 'All actions'];
        const rows = meetings().map((m) => [m.code, m.date, m.time, m.end, m.type, m.title, m.chair, m.location, m.attendees, m.status, m.minutesStatus, m.decisions,
          (m.actions || []).filter((a) => a.status !== 'Done').length, (m.actions || []).length]);
        downloadCSV(`SOMLITS-meetings-${todayISO()}.csv`, header, rows);
        break;
      }
    }
  } catch (err) { toast(err.message, true); }
});

// printable minutes (opens a clean page; use the browser's Print → Save as PDF)
function printMinutes(m) {
  if (!m) return;
  const lines = (s) => esc(s || '').replace(/\n/g, '<br>');
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print the minutes', true);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Minutes ${esc(m.code)} – ${esc(m.title)}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1d2433;margin:36px;font-size:13.5px;line-height:1.5}
    h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;margin:22px 0 6px;border-bottom:2px solid #4189dd;padding-bottom:3px;color:#1b4a80}
    .sub{color:#5b6475;margin-bottom:14px}.proj{font-size:12px;color:#5b6475;text-transform:uppercase;letter-spacing:.06em}
    table{border-collapse:collapse;width:100%}td,th{border:1px solid #d6dbe4;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f2f5fa;width:170px}.acts th{width:auto}.sig{margin-top:40px;display:flex;gap:60px}.sig div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px}
    @media print{body{margin:14mm}}
  </style></head><body>
  <div class="proj">${esc(S.data.settings.project)}</div>
  <h1>Minutes of Meeting — ${esc(m.title)}</h1>
  <div class="sub">${esc(m.code)} · ${esc(m.type)}</div>
  <table>
    <tr><th>Date &amp; time</th><td>${fmt(m.date)} ${esc(m.time || '')}${m.end ? '–' + esc(m.end) : ''}</td></tr>
    <tr><th>Location</th><td>${esc(m.location || '')}</td></tr>
    <tr><th>Chair</th><td>${esc(m.chair || '')}</td></tr>
    <tr><th>Attendees</th><td>${lines(m.attendees)}</td></tr>
    ${m.apologies ? `<tr><th>Apologies</th><td>${lines(m.apologies)}</td></tr>` : ''}
    <tr><th>Minutes status</th><td>${esc(m.minutesStatus || '')}${m.circulatedDate ? ' · circulated ' + fmt(m.circulatedDate) : ''}${m.approvedBy ? ' · approved by ' + esc(m.approvedBy) + (m.approvalDate ? ' on ' + fmt(m.approvalDate) : '') : ''}</td></tr>
  </table>
  <h2>Agenda</h2><div>${lines(m.agenda) || '—'}</div>
  <h2>Discussion</h2><div>${lines(m.discussion) || '—'}</div>
  <h2>Decisions</h2><div>${lines(m.decisions) || '—'}</div>
  <h2>Action items</h2>
  ${(m.actions || []).length ? `<table class="acts"><tr><th>#</th><th>Action</th><th>Owner</th><th>Due</th><th>Task</th><th>Status</th></tr>
    ${m.actions.map((a, i) => `<tr><td>${i + 1}</td><td>${esc(a.text)}</td><td>${esc(a.owner)}</td><td>${fmt(a.due)}</td><td>${esc(a.task)}</td><td>${esc(a.status)}</td></tr>`).join('')}</table>` : '<div>—</div>'}
  ${m.nextMeeting ? `<h2>Next meeting</h2><div>${fmt(m.nextMeeting)}</div>` : ''}
  <div class="sig"><div>Prepared by: ${esc(m.minutesBy || '')}</div><div>Approved by (MoLFR): ${esc(m.approvedBy || '')}</div></div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
  </body></html>`);
  w.document.close();
}
