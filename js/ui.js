/* أدوات ومكونات الواجهة المشتركة */

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c1.8.7 3 2.5 3.5 5.2"/>',
  gate: '<path d="M3 21h18"/><path d="M6 21V4h12v17"/><circle cx="14.5" cy="12.5" r=".9" fill="currentColor"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.2a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  report: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/><path d="M8.5 13h7M8.5 17h7"/>',
  printer: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M6 14h12v7H6z"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20.5 14v.5M14 20.5h.5M17.5 20.5H21v-3.5"/>',
  hash: '<path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/>',
  logout: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  exit: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M9 8l-4 4 4 4"/><path d="M5 12h10"/>',
  enter: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 20h16"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.5-1.5 1.7-2.3 3-2.3s2.5.8 3 2.3M14 10h4M14 13h4"/>',
  ticket: '<path d="M3 6h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6z"/><path d="M14 6v2M14 11v2M14 16v2"/>',
  backspace: '<path d="M3 5h12l6 7-6 7H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="m12 9-6 6M6 9l6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};

function icon(name, size = 22) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => (d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '—');
function fmtTime(d) {
  if (!d) return '—';
  let h = d.getHours();
  const ap = h < 12 ? 'ص' : 'م';
  h = h % 12 || 12;
  return `${pad2(h)}:${pad2(d.getMinutes())} ${ap}`;
}
const fmtDT = (d) => (d ? `${fmtDate(d)} – ${fmtTime(d)}` : '—');
const money = (n) => `${Number(n).toLocaleString('en-US')} ج.م`;
const isToday = (d) => d && d.toDateString() === new Date().toDateString();
const fmtWhen = (d) => (isToday(d) ? `اليوم ${fmtTime(d)}` : fmtDT(d));
const longDate = (d) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
const monthName = (d) => new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' }).format(d);

const toInputDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const toInputTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const toInputDT = (d) => `${toInputDate(d)}T${toInputTime(d)}`;
const fromInputDate = (v) => (v ? new Date(`${v}T00:00`) : null);

/* استعلامات */
const soldierById = (id) => DB.soldiers.find((s) => s.id === Number(id));
const soldierByMilNo = (no) => DB.soldiers.find((s) => s.militaryNo === String(no).trim());
const activePermit = (sid) => DB.permits.find((p) => p.soldierId === sid && !p.returnedAt);
const monthTotal = (sid) => DB.canteen.filter((t) => t.soldierId === sid && t.at >= DB.MONTH_START).reduce((a, t) => a + t.amount, 0);
const allExitReasons = () => [...DB.EXIT_REASONS, ...DB.extraReasons];

/* مكونات */
function statusBadge(s, lg = false) {
  return s.status === 'in'
    ? `<span class="badge badge-success ${lg ? 'badge-lg' : ''}"><i></i>داخل الوحدة</span>`
    : `<span class="badge badge-warning ${lg ? 'badge-lg' : ''}"><i></i>خارج الوحدة</span>`;
}

const SILHOUETTE = '<svg viewBox="0 0 64 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="64" height="80" fill="#E8ECF1"/><circle cx="32" cy="31" r="12" fill="#B9C2CE"/><path d="M9 80c2-16 11-24 23-24s21 8 23 24z" fill="#B9C2CE"/></svg>';

function avatar(s, size = 'md') {
  return `<div class="avatar avatar-${size}">${s && s.photo ? `<img src="${s.photo}" alt="">` : SILHOUETTE}</div>`;
}

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/* رمز QR شكلي للمعاينة فقط – في الإنتاج يُولَّد برمز QR حقيقي يحمل الرقم العسكري */
function qrSvg(text, size = 120) {
  const n = 25;
  let seed = hashStr(text) || 1;
  const rand = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) % 1000) / 1000; };
  const inFinder = (x, y) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y) && rand() < 0.48) d += `M${x} ${y}h1v1h-1z`;
  const finder = (x, y) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
  d += finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7);
  return `<svg class="qr" width="${size}" height="${size}" viewBox="-1 -1 ${n + 2} ${n + 2}" shape-rendering="crispEdges" aria-label="QR"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#111" fill-rule="evenodd"/></svg>`;
}

function idCard(s) {
  const st = DB.settings;
  return `
  <div class="idcard">
    <div class="idc-head">
      ${st.showLogo ? (st.logo ? `<img class="idc-logo" src="${st.logo}" alt="">` : `<div class="idc-emblem">${icon('shield', 16)}</div>`) : ''}
      <div class="idc-title"><strong>${esc(st.unitName)}</strong><span>بطاقة تعريف عسكري</span></div>
    </div>
    <div class="idc-body">
      <div class="idc-photo">${avatar(s, 'fill')}</div>
      <div class="idc-name">${esc(s.name)}</div>
      <dl class="idc-info">
        <div><dt>الرقم العسكري</dt><dd class="num">${esc(s.militaryNo)}</dd></div>
        <div><dt>الرقم القومي</dt><dd class="num">${esc(s.nationalId)}</dd></div>
        <div><dt>الدرجة</dt><dd>${esc(s.rank)}</dd></div>
        <div><dt>السرية</dt><dd>${esc(s.company)}</dd></div>
        <div><dt>الوحدة</dt><dd>${esc(s.unit)}</dd></div>
      </dl>
      <div class="idc-qr">${qrSvg(s.militaryNo, 60)}</div>
    </div>
  </div>`;
}

function soldierStrip(s, actionsHtml = '') {
  return `
  <div class="card soldier-strip">
    ${avatar(s, 'lg')}
    <div class="ss-main">
      <div class="ss-name">${esc(s.name)}</div>
      <div class="ss-meta">
        <span><em>الرقم العسكري</em><b class="num">${esc(s.militaryNo)}</b></span>
        <span><em>الدرجة</em><b>${esc(s.rank)}</b></span>
        <span><em>السرية</em><b>${esc(s.company)}</b></span>
      </div>
    </div>
    <div class="ss-side">${statusBadge(s, true)}${actionsHtml}</div>
  </div>`;
}

function optionList(list, selected, placeholder) {
  return (placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '') +
    list.map((o) => `<option value="${esc(o)}" ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('');
}

function keypad(target) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
  return `<div class="keypad" data-target="${target}">${keys.map((k) => {
    if (k === 'back') return `<button type="button" class="key key-fn" data-key="back" aria-label="حذف">${icon('backspace', 26)}</button>`;
    if (k === 'clear') return `<button type="button" class="key key-fn" data-key="clear">مسح</button>`;
    return `<button type="button" class="key" data-key="${k}">${k}</button>`;
  }).join('')}</div>`;
}

function emptyState(title, text = '', iconName = 'search') {
  return `<div class="empty">${icon(iconName, 36)}<strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
}

function toast(msg, type = 'success') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'check' : 'x', 22)}<span>${esc(msg)}</span>`;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2800);
}

let resultTimer = null;
function closeResult() {
  clearTimeout(resultTimer);
  const root = document.getElementById('result-root');
  if (!root) return;
  root.classList.remove('open');
  root.innerHTML = '';
}
const isResultOpen = () => document.getElementById('result-root')?.classList.contains('open');

function showResult({ title, soldier, lines = [], undo, duration = 4000 }) {
  const root = document.getElementById('result-root');
  closeResult();
  root.innerHTML = `
    <div class="result-card" role="alertdialog" aria-live="assertive">
      <div class="result-icon">${icon('check', 56)}</div>
      <h2>${esc(title)}</h2>
      <div class="result-soldier">
        ${avatar(soldier, 'md')}
        <div><strong>${esc(soldier.rank)} / ${esc(soldier.name)}</strong><span class="num">${soldier.militaryNo}</span></div>
      </div>
      <dl class="kv result-lines">${lines.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      <div class="result-actions">
        <button class="btn btn-primary btn-xl" data-result="close">متابعة</button>
        ${undo ? `<button class="btn btn-secondary btn-xl" data-result="undo">${icon('back', 22)} تراجع</button>` : ''}
      </div>
      <div class="result-bar"><i style="animation-duration:${duration}ms"></i></div>
    </div>`;
  root.classList.add('open');
  root.onclick = (e) => {
    const b = e.target.closest('[data-result]');
    if (!b) return;
    closeResult();
    if (b.dataset.result === 'undo') {
      undo();
      toast('تم التراجع عن العملية');
    }
  };
  resultTimer = setTimeout(closeResult, duration);
}

function openModal(html, cls = '') {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-action="modal-close"></div><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
}
function closeModal() {
  const root = document.getElementById('modal-root');
  root.classList.remove('open');
  root.innerHTML = '';
}

function downloadCsv(filename, headers, rows) {
  const escCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map(escCell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
