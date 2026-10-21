/* الهيكل العام والتنقل */

const NAV = [
  ['dashboard', 'الرئيسية', 'home'],
  ['soldiers', 'العسكريون', 'users'],
  ['gate', 'البوابة', 'gate'],
  ['canteen', 'الكانتين', 'cart'],
  ['fitness', 'اللياقة', 'activity'],
  ['reports', 'التقارير', 'report'],
  ['printing', 'الطباعة', 'printer'],
  ['settings', 'الإعدادات', 'settings'],
];

let cleanups = [];
const onCleanup = (fn) => cleanups.push(fn);

const currentRoute = () => (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function refresh() { route({ keepScroll: true }); }

function layout(active, content) {
  return `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="emblem">${icon('shield', 26)}</div>
        <div class="brand-text"><strong>شؤون العسكريين</strong><span>${esc(DB.settings.unitName)}</span></div>
      </div>
      <nav class="nav">
        ${NAV.map(([k, l, ic]) => `<a href="#/${k}" class="${active === k ? 'active' : ''}">${icon(ic, 24)}<span>${l}</span></a>`).join('')}
      </nav>
      <div class="sidebar-foot">الإصدار 1.0 – نظام محلي</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-date">${icon('calendar', 20)}<span>${longDate(new Date())}</span></div>
        <div class="topbar-user">
          <div class="user-chip"><span class="initial">${esc((S.user.name.split('/')[1] || S.user.name).trim().charAt(0))}</span><div><strong>${esc(S.user.name)}</strong><span>مسؤول النظام</span></div></div>
          <button class="btn btn-ghost btn-sm" data-action="logout">${icon('logout', 20)} خروج</button>
        </div>
      </header>
      <main class="page">${content}</main>
    </div>
  </div>`;
}

function route({ keepScroll = false } = {}) {
  cleanups.forEach((fn) => fn());
  cleanups = [];
  closeModal();
  const root = document.getElementById('root');
  const [a, b, c] = currentRoute();

  if (!S.user) {
    if (a !== 'login') { location.hash = '#/login'; return; }
    const v = screenLogin();
    root.innerHTML = v.html;
    v.mount();
    return;
  }
  if (a === 'login') { location.hash = '#/dashboard'; return; }

  let view;
  switch (a) {
    case 'dashboard': view = screenDashboard(); break;
    case 'soldiers':
      if (b === 'new') view = screenSoldierForm(null);
      else if (b && c === 'edit') view = screenSoldierForm(b);
      else if (b) view = screenProfile(b);
      else view = screenSoldiers();
      break;
    case 'gate':
      if (b === 'exit') view = screenExit(c);
      else if (b === 'entry') view = screenEntry(c);
      else view = screenGate();
      break;
    case 'canteen': view = screenCanteen(); break;
    case 'fitness': view = screenFitness(); break;
    case 'reports': view = screenReports(); break;
    case 'printing': view = screenPrinting(); break;
    case 'settings': view = screenSettings(); break;
    default: view = screenNotFound();
  }

  const y = window.scrollY;
  root.innerHTML = layout(a, view.html);
  view.mount?.();
  window.scrollTo(0, keepScroll ? y : 0);
}

function pressKey(input, key) {
  let v = input.value;
  if (key === 'back') v = v.slice(0, -1);
  else if (key === 'clear') v = '';
  else if (v.length < (input.id === 'c-amount' ? 5 : 14)) v = v === '0' ? key : v + key;
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

A['logout'] = () => {
  S.user = null;
  sessionStorage.removeItem('user');
  go('#/login');
};
A['modal-close'] = () => closeModal();
A['window-print'] = () => window.print();

document.addEventListener('click', (e) => {
  const key = e.target.closest('.key');
  if (key) {
    const input = document.getElementById(key.closest('.keypad').dataset.target);
    if (input) { pressKey(input, key.dataset.key); if (input.type !== 'hidden') input.focus(); }
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (actionEl && !actionEl.disabled) {
    const fn = A[actionEl.dataset.action];
    if (fn) { fn(actionEl, e); return; }
  }
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a, button, input, select')) go(row.dataset.href);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (isResultOpen()) closeResult();
  else if (document.getElementById('modal-root').classList.contains('open')) closeModal();
});

window.addEventListener('hashchange', () => route());

try { S.user = JSON.parse(sessionStorage.getItem('user')); } catch { S.user = null; }
route();
