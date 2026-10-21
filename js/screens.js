/* الشاشات */

const S = {
  user: null,
  sf: { q: '', company: '', rank: '', specialty: '', status: '', page: 1 },
  profileTab: 'data',
  gateSid: null,
  exitReason: null,
  cant: { sid: null, amount: '' },
  fit: { sid: null, q: '', type: DB.FITNESS_TYPES[0] },
  report: { type: 'soldiers', from: toInputDate(DB.MONTH_START), to: toInputDate(new Date()), q: '', company: '', status: '' },
  print: { type: null, ids: [], q: '', copies: 1 },
  settingsTab: 'unit',
  form: { photo: null, idPhoto: null },
};
const A = {};
const PAGE_SIZE = 12;

function field(label, control, { req = false, span = '', hint = '', error = '', name = '' } = {}) {
  return `<div class="field ${span}" ${name ? `data-field="${name}"` : ''}>
    <label>${label}${req ? ' <span class="req">*</span>' : ''}</label>
    ${control}
    ${hint ? `<span class="hint">${hint}</span>` : ''}
    ${error ? `<span class="error">${error}</span>` : ''}
  </div>`;
}

function listenScanner(onScan) {
  let buf = '';
  let last = 0;
  const onKey = (e) => {
    if (document.getElementById('modal-root').classList.contains('open')) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const t = Date.now();
    if (t - last > 120) buf = '';
    last = t;
    if (e.key === 'Enter') {
      if (buf.length >= 6) { closeResult(); onScan(buf); }
      buf = '';
    } else if (/^\d$/.test(e.key)) buf += e.key;
  };
  document.addEventListener('keydown', onKey);
  onCleanup(() => document.removeEventListener('keydown', onKey));
}

function openMilNoModal(onFound) {
  const sample = DB.soldiers[2].militaryNo;
  openModal(`
    <div class="modal-head"><h2>إدخال الرقم العسكري</h2><button class="btn btn-ghost btn-icon" data-action="modal-close" aria-label="إغلاق">${icon('x')}</button></div>
    <form id="num-form">
      <div class="modal-body">
        <input id="num-input" class="input input-xl num" inputmode="numeric" autocomplete="off" placeholder="اكتب الرقم العسكري">
        <span class="hint muted">مثال للتجربة: <b class="num">${sample}</b></span>
        ${keypad('num-input')}
      </div>
      <div class="modal-foot">
        <button type="submit" class="btn btn-primary btn-lg">${icon('search')} بحث</button>
        <button type="button" class="btn btn-secondary btn-lg" data-action="modal-close">إلغاء</button>
      </div>
    </form>`);
  const input = document.getElementById('num-input');
  input.focus();
  document.getElementById('num-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const s = soldierByMilNo(input.value);
    if (!s) { toast('لا يوجد عسكري بهذا الرقم', 'error'); input.select(); return; }
    closeModal();
    onFound(s);
  });
}

const randomSoldier = () => DB.soldiers[Math.floor(Math.random() * DB.soldiers.length)];

/* =========================================================
   1. تسجيل الدخول
   ========================================================= */
function screenLogin() {
  return {
    html: `
    <div class="login">
      <div class="card login-card">
        <div class="login-brand">
          <div class="emblem">${icon('shield', 36)}</div>
          <h1>نظام شؤون العسكريين</h1>
          <p>${esc(DB.settings.unitName)}</p>
        </div>
        <form id="login-form" class="stack" autocomplete="off">
          ${field('اسم المستخدم', `<input class="input input-lg" name="username" value="${esc(DB.settings.admin.username)}">`)}
          ${field('كلمة المرور', `<input class="input input-lg" name="password" type="password" placeholder="أدخل كلمة المرور">`)}
          <div class="login-error" id="login-error" hidden>اسم المستخدم أو كلمة المرور غير صحيحة</div>
          <button type="submit" class="btn btn-primary btn-lg btn-block">تسجيل الدخول</button>
          <span class="hint muted" style="text-align:center;font-size:14px">نسخة تجريبية – كلمة المرور الافتراضية <b class="num">1234</b> ويمكن تغييرها من الإعدادات</span>
        </form>
        <div class="login-foot">نظام داخلي – للاستخدام داخل الوحدة فقط</div>
      </div>
    </div>`,
    mount() {
      const f = document.getElementById('login-form');
      f.password.focus();
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const admin = DB.settings.admin;
        if (f.username.value.trim() !== admin.username || f.password.value !== admin.password) {
          document.getElementById('login-error').hidden = false;
          f.password.select();
          return;
        }
        S.user = { name: DB.settings.admin.name, username: f.username.value.trim() };
        sessionStorage.setItem('user', JSON.stringify(S.user));
        go('#/dashboard');
      });
    },
  };
}

/* =========================================================
   2. الرئيسية
   ========================================================= */
const OP_META = {
  exit: { label: 'خروج عسكري', icon: 'exit', cls: 'act-exit' },
  entry: { label: 'عودة عسكري', icon: 'enter', cls: 'act-entry' },
  purchase: { label: 'عملية شراء', icon: 'cart', cls: 'act-purchase' },
  add: { label: 'إضافة عسكري', icon: 'plus', cls: 'act-add' },
};

function recentOps(limit) {
  const ops = [];
  DB.permits.forEach((p) => {
    ops.push({ type: 'exit', at: p.exitAt, sid: p.soldierId, detail: p.reason });
    if (p.returnedAt) ops.push({ type: 'entry', at: p.returnedAt, sid: p.soldierId, detail: `تصريح رقم ${p.no}` });
  });
  DB.canteen.forEach((t) => ops.push({ type: 'purchase', at: t.at, sid: t.soldierId, detail: money(t.amount) }));
  DB.soldiers.forEach((s) => ops.push({ type: 'add', at: s.createdAt, sid: s.id, detail: s.company }));
  return ops.sort((a, b) => b.at - a.at).slice(0, limit);
}

function screenDashboard() {
  const total = DB.soldiers.length;
  const inside = DB.soldiers.filter((s) => s.status === 'in').length;
  const permitsToday = DB.permits.filter((p) => isToday(p.exitAt)).length;
  const txToday = DB.canteen.filter((t) => isToday(t.at));
  const txSum = txToday.reduce((a, t) => a + t.amount, 0);

  const stat = (label, value, { dot = '', sub = '', status = null, report = null } = {}) => {
    const tag = status !== null || report ? 'a' : 'div';
    const attrs = status !== null ? `href="#/soldiers" data-action="goto-soldiers" data-status="${status}"`
      : report ? `href="#/reports" data-action="goto-report-today" data-type="${report}"` : '';
    return `<${tag} class="card stat" ${attrs}>
      <span class="stat-label">${dot ? `<i class="${dot}"></i>` : ''}${label}</span>
      <span class="stat-value num">${value}</span>
      ${sub ? `<span class="stat-sub">${sub}</span>` : ''}
    </${tag}>`;
  };

  const ops = recentOps(10).map((o) => {
    const s = soldierById(o.sid);
    const m = OP_META[o.type];
    return `<li data-href="#/soldiers/${s.id}">
      <span class="act-icon ${m.cls}">${icon(m.icon, 22)}</span>
      <div class="act-main"><strong>${m.label}</strong><span>${esc(s.rank)} / ${esc(s.name)} · <span class="num">${s.militaryNo}</span> · ${esc(o.detail)}</span></div>
      <time>${fmtWhen(o.at)}</time>
    </li>`;
  }).join('');

  return {
    html: `
    <div class="page-header">
      <div><h1>نظرة عامة</h1><p class="subtitle">${longDate(new Date())}</p></div>
    </div>
    <div class="stats">
      ${stat('إجمالي العسكريين', total, { status: '' })}
      ${stat('الموجودون داخل الوحدة', inside, { dot: 'dot-success', status: 'in' })}
      ${stat('خارج الوحدة', total - inside, { dot: 'dot-warning', status: 'out' })}
      ${stat('تصاريح اليوم', permitsToday, { report: 'movements' })}
      ${stat('عمليات الكانتين اليوم', txToday.length, { sub: `بإجمالي ${money(txSum)}`, report: 'canteen' })}
    </div>
    <div class="card">
      <div class="card-header"><h2>آخر العمليات</h2><a class="btn btn-ghost btn-sm" href="#/reports">عرض التقارير</a></div>
      <ul class="activity">${ops}</ul>
    </div>`,
  };
}

A['goto-soldiers'] = (el, e) => {
  e.preventDefault();
  S.sf = { q: '', company: '', rank: '', specialty: '', status: el.dataset.status, page: 1 };
  go('#/soldiers');
};

A['goto-report-today'] = (el, e) => {
  e.preventDefault();
  const today = toInputDate(new Date());
  S.report = { ...S.report, type: el.dataset.type, from: today, to: today, q: '' };
  go('#/reports');
};

/* =========================================================
   3. العسكريون
   ========================================================= */
function filteredSoldiers() {
  const q = S.sf.q.trim();
  return DB.soldiers
    .filter((s) => (!q || s.name.includes(q) || s.militaryNo.includes(q) || s.nationalId.includes(q))
      && (!S.sf.company || s.company === S.sf.company)
      && (!S.sf.rank || s.rank === S.sf.rank)
      && (!S.sf.specialty || s.specialty === S.sf.specialty)
      && (!S.sf.status || s.status === S.sf.status))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function pagerHtml(total, page, action) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1) return '';
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = [];
  for (let p = start; p <= Math.min(pages, start + 4); p++) nums.push(p);
  return `<div class="pager">
    <button class="btn btn-secondary btn-sm" data-action="${action}" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="السابق">${icon('chevronRight')}</button>
    ${nums.map((p) => `<button class="btn btn-secondary btn-sm ${p === page ? 'current' : ''}" data-action="${action}" data-page="${p}">${p}</button>`).join('')}
    <button class="btn btn-secondary btn-sm" data-action="${action}" data-page="${page + 1}" ${page === pages ? 'disabled' : ''} aria-label="التالي">${icon('chevronLeft')}</button>
  </div>`;
}

function soldiersTableBody() {
  const list = filteredSoldiers();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  S.sf.page = Math.min(S.sf.page, pages);
  const slice = list.slice((S.sf.page - 1) * PAGE_SIZE, S.sf.page * PAGE_SIZE);
  const rows = slice.length
    ? slice.map((s) => `<tr class="clickable" data-href="#/soldiers/${s.id}">
        <td>${avatar(s, 'sm')}</td>
        <td class="cell-name">${esc(s.name)}</td>
        <td class="num">${s.militaryNo}</td>
        <td class="num col-md">${s.nationalId}</td>
        <td>${esc(s.rank)}</td>
        <td>${esc(s.company)}</td>
        <td class="col-lg">${esc(s.specialty)}</td>
        <td>${statusBadge(s)}</td>
        <td><div class="cell-actions">
          <a class="btn btn-secondary btn-sm" href="#/soldiers/${s.id}">عرض الملف</a>
          <a class="btn btn-ghost btn-sm" href="#/soldiers/${s.id}/edit" aria-label="تعديل">${icon('edit', 18)}<span class="btn-label">تعديل</span></a>
        </div></td>
      </tr>`).join('')
    : `<tr><td colspan="9">${emptyState('لا توجد نتائج مطابقة', 'جرّب تغيير كلمة البحث أو الفلاتر')}</td></tr>`;
  const from = list.length ? (S.sf.page - 1) * PAGE_SIZE + 1 : 0;
  const foot = `<span>عرض ${from}–${Math.min(S.sf.page * PAGE_SIZE, list.length)} من ${list.length}</span>${pagerHtml(list.length, S.sf.page, 'soldiers-page')}`;
  return { rows, foot };
}

function updateSoldiersTable() {
  const { rows, foot } = soldiersTableBody();
  document.getElementById('s-body').innerHTML = rows;
  document.getElementById('s-foot').innerHTML = foot;
}

function screenSoldiers() {
  const { rows, foot } = soldiersTableBody();
  const sel = (key, list, ph) => `<select class="select" data-filter="${key}">${optionList(list, S.sf[key], ph)}</select>`;
  return {
    html: `
    <div class="page-header">
      <div><h1>العسكريون</h1><p class="subtitle">${DB.soldiers.length} عسكري مسجل في الوحدة</p></div>
      <div class="page-actions"><a class="btn btn-primary btn-lg" href="#/soldiers/new">${icon('plus')} إضافة عسكري</a></div>
    </div>
    <div class="card filters-card">
      <div class="search-lg">${icon('search', 24)}<input id="s-q" class="input" value="${esc(S.sf.q)}" placeholder="ابحث بالاسم أو الرقم العسكري أو الرقم القومي" autocomplete="off"></div>
      <div class="filters">
        ${sel('company', DB.COMPANIES, 'كل السرايا')}
        ${sel('rank', DB.RANKS, 'كل الدرجات')}
        ${sel('specialty', DB.SPECIALTIES, 'كل التخصصات')}
        <select class="select" data-filter="status">
          <option value="">كل الحالات</option>
          <option value="in" ${S.sf.status === 'in' ? 'selected' : ''}>داخل الوحدة</option>
          <option value="out" ${S.sf.status === 'out' ? 'selected' : ''}>خارج الوحدة</option>
        </select>
        <button class="btn btn-ghost" data-action="soldiers-clear">مسح الفلاتر</button>
      </div>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>الصورة</th><th>الاسم</th><th>الرقم العسكري</th><th class="col-md">الرقم القومي</th><th>الدرجة</th><th>السرية</th><th class="col-lg">التخصص</th><th>الحالة</th><th style="text-align:end">الإجراءات</th></tr></thead>
          <tbody id="s-body">${rows}</tbody>
        </table>
      </div>
      <div class="table-foot" id="s-foot">${foot}</div>
    </div>`,
    mount() {
      const q = document.getElementById('s-q');
      q.focus();
      q.addEventListener('input', () => { S.sf.q = q.value; S.sf.page = 1; updateSoldiersTable(); });
      document.querySelectorAll('[data-filter]').forEach((el) => el.addEventListener('change', () => {
        S.sf[el.dataset.filter] = el.value; S.sf.page = 1; updateSoldiersTable();
      }));
    },
  };
}

A['soldiers-page'] = (el) => { S.sf.page = Number(el.dataset.page); updateSoldiersTable(); };
A['soldiers-clear'] = () => { S.sf = { q: '', company: '', rank: '', specialty: '', status: '', page: 1 }; refresh(); };

/* =========================================================
   4. إضافة / تعديل عسكري
   ========================================================= */
function uploadTile(kind, cls, title, sub, img) {
  return `<label class="upload ${cls} ${img ? 'has-image' : ''}" data-upload="${kind}">
    ${img ? `<img src="${img}" alt="">` : `${icon(kind === 'idPhoto' ? 'idcard' : 'camera', 34)}<strong>${title}</strong><span>${sub}</span>`}
    <input type="file" accept="image/*" data-upload-input="${kind}">
  </label>`;
}

function screenSoldierForm(id) {
  const s = id ? soldierById(id) : null;
  if (id && !s) return screenNotFound();
  S.form = { photo: s?.photo || null, idPhoto: s?.idPhoto || null };
  const v = (k) => {
    if (!s) return k === 'unit' ? esc(DB.settings.unitName) : '';
    return esc(s[k] instanceof Date ? toInputDate(s[k]) : s[k]);
  };
  const input = (name, attrs = '') => `<input class="input" name="${name}" value="${v(name)}" ${attrs}>`;
  const numInput = (name, attrs = '') => `<input class="input num" name="${name}" value="${v(name)}" inputmode="numeric" ${attrs}>`;
  const select = (name, list) => `<select class="select" name="${name}">${optionList(list, s?.[name], 'اختر')}</select>`;

  return {
    html: `
    <div class="page-header">
      <div>
        <div class="crumbs"><a href="#/soldiers">العسكريون</a><span>/</span><span>${s ? 'تعديل بيانات' : 'إضافة عسكري'}</span></div>
        <h1>${s ? `تعديل بيانات: ${esc(s.name)}` : 'إضافة عسكري جديد'}</h1>
      </div>
    </div>
    <form id="soldier-form" novalidate>
      <div class="card form-section">
        <div class="card-header"><h2><span class="section-num">1</span>البيانات الأساسية</h2></div>
        <div class="card-body basic-grid">
          <div class="field"><label>صورة العسكري</label><div data-photo-slot="main">${uploadTile('photo', 'upload-portrait', 'التقاط أو رفع صورة', 'صورة شخصية حديثة', S.form.photo)}</div></div>
          <div class="grid grid-2">
            ${field('اسم العسكري', input('name', 'placeholder="الاسم رباعي"'), { req: true, span: 'span-2', name: 'name', error: 'يرجى إدخال اسم العسكري' })}
            ${field('الرقم القومي', numInput('nationalId', 'maxlength="14" placeholder="14 رقمًا"'), { req: true, name: 'nationalId', error: 'الرقم القومي يجب أن يتكون من 14 رقمًا' })}
            ${field('الرقم العسكري', numInput('militaryNo', 'placeholder="مثال: 202514237"'), { req: true, name: 'militaryNo', error: 'يرجى إدخال رقم عسكري صحيح وغير مكرر' })}
            ${field('الدرجة العسكرية', select('rank', DB.RANKS), { req: true, name: 'rank', error: 'يرجى اختيار الدرجة العسكرية' })}
            ${field('الوصف', input('description', 'placeholder="مثال: قمحي البشرة – بدون علامات مميزة"'))}
          </div>
        </div>
      </div>

      <div class="card form-section">
        <div class="card-header"><h2><span class="section-num">2</span>البيانات العسكرية</h2></div>
        <div class="card-body grid grid-3">
          ${field('السرية', select('company', DB.COMPANIES), { req: true, name: 'company', error: 'يرجى اختيار السرية' })}
          ${field('الوحدة', input('unit'))}
          ${field('الوحدة السابقة', input('prevUnit', 'placeholder="إن وجدت"'))}
          ${field('التخصص', select('specialty', DB.SPECIALTIES))}
          ${field('تاريخ التجنيد', `<input class="input" type="date" name="enlistDate" value="${v('enlistDate')}">`)}
          <div></div>
          ${field('رقم التصريح', numInput('permitNo'))}
          ${field('تاريخ التصريح', `<input class="input" type="date" name="permitDate" value="${v('permitDate')}">`)}
        </div>
      </div>

      <div class="card form-section">
        <div class="card-header"><h2><span class="section-num">3</span>البيانات الشخصية</h2></div>
        <div class="card-body grid grid-3">
          ${field('العنوان', input('address', 'placeholder="المحافظة – المركز – العنوان"'), { span: 'span-2' })}
          ${field('العمر', `<div class="input-affix"><input class="input num" name="age" value="${v('age')}" inputmode="numeric" maxlength="2"><span>سنة</span></div>`)}
          ${field('رقم الهاتف', numInput('phone', 'maxlength="11" placeholder="01xxxxxxxxx"'))}
          ${field('رقم إضافي', numInput('phone2', 'maxlength="11" placeholder="اختياري"'))}
        </div>
      </div>

      <div class="card form-section">
        <div class="card-header"><h2><span class="section-num">4</span>البيانات البدنية</h2></div>
        <div class="card-body grid grid-3">
          ${field('الطول', `<div class="input-affix"><input class="input num" name="height" value="${v('height')}" inputmode="numeric" maxlength="3"><span>سم</span></div>`)}
          ${field('الوزن', `<div class="input-affix"><input class="input num" name="weight" value="${v('weight')}" inputmode="numeric" maxlength="3"><span>كجم</span></div>`)}
        </div>
      </div>

      <div class="card form-section">
        <div class="card-header"><h2><span class="section-num">5</span>المستندات</h2></div>
        <div class="card-body docs-grid">
          <div class="field"><label>صورة البطاقة</label>${uploadTile('idPhoto', 'upload-landscape', 'رفع صورة البطاقة الشخصية', 'صورة واضحة للوجهين', S.form.idPhoto)}</div>
          <div class="field"><label>صورة العسكري</label><div data-photo-slot="doc">${uploadTile('photo', 'upload-landscape', 'رفع صورة العسكري', 'نفس الصورة المستخدمة في البطاقة', S.form.photo)}</div></div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-lg">${icon('check')} ${s ? 'حفظ التعديلات' : 'حفظ العسكري'}</button>
        <a class="btn btn-secondary btn-lg" href="${s ? `#/soldiers/${s.id}` : '#/soldiers'}">إلغاء</a>
        <span class="spacer"></span>
        <span class="muted" style="font-size:15px">الحقول المميزة بعلامة <span class="req">*</span> مطلوبة</span>
      </div>
    </form>`,
    mount() {
      const form = document.getElementById('soldier-form');
      form.addEventListener('change', (e) => {
        const kind = e.target.dataset.uploadInput;
        if (!kind || !e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = () => {
          S.form[kind] = reader.result;
          if (kind === 'photo') {
            document.querySelector('[data-photo-slot="main"]').innerHTML = uploadTile('photo', 'upload-portrait', '', '', reader.result);
            document.querySelector('[data-photo-slot="doc"]').innerHTML = uploadTile('photo', 'upload-landscape', '', '', reader.result);
          } else {
            e.target.closest('.upload').outerHTML = uploadTile('idPhoto', 'upload-landscape', '', '', reader.result);
          }
        };
        reader.readAsDataURL(e.target.files[0]);
      });
      form.addEventListener('submit', (e) => { e.preventDefault(); saveSoldier(form, s); });
      if (!s) form.name.focus();
    },
  };
}

function saveSoldier(form, existing) {
  const d = Object.fromEntries(new FormData(form).entries());
  Object.keys(d).forEach((k) => { if (typeof d[k] === 'string') d[k] = d[k].trim(); });
  const errors = [];
  if (!d.name) errors.push('name');
  if (!/^\d{14}$/.test(d.nationalId)) errors.push('nationalId');
  const dup = DB.soldiers.find((x) => x.militaryNo === d.militaryNo && x !== existing);
  if (!d.militaryNo || dup) errors.push('militaryNo');
  if (!d.rank) errors.push('rank');
  if (!d.company) errors.push('company');

  form.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
  if (errors.length) {
    errors.forEach((n) => form.querySelector(`[data-field="${n}"]`)?.classList.add('has-error'));
    const first = form.querySelector('.field.has-error');
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.querySelector('input,select')?.focus({ preventScroll: true });
    toast('يرجى استكمال البيانات المطلوبة', 'error');
    return;
  }

  const data = {
    name: d.name, nationalId: d.nationalId, militaryNo: d.militaryNo, rank: d.rank, description: d.description,
    company: d.company, unit: d.unit || DB.settings.unitName, prevUnit: d.prevUnit, specialty: d.specialty,
    enlistDate: fromInputDate(d.enlistDate), permitNo: d.permitNo, permitDate: fromInputDate(d.permitDate),
    address: d.address, phone: d.phone, phone2: d.phone2, age: d.age, height: d.height, weight: d.weight,
    photo: S.form.photo, idPhoto: S.form.idPhoto,
  };
  if (existing) {
    Object.assign(existing, data);
    saveDB();
    toast('تم حفظ التعديلات');
    go(`#/soldiers/${existing.id}`);
  } else {
    const s = { id: Math.max(...DB.soldiers.map((x) => x.id)) + 1, status: 'in', createdAt: new Date(), ...data };
    DB.soldiers.push(s);
    saveDB();
    toast('تمت إضافة العسكري بنجاح');
    S.profileTab = 'data';
    go(`#/soldiers/${s.id}`);
  }
}

/* =========================================================
   5. ملف العسكري
   ========================================================= */
const PROFILE_TABS = [
  ['data', 'البيانات'], ['docs', 'المستندات'], ['permits', 'التصاريح'],
  ['attendance', 'الحضور والانصراف'], ['canteen', 'الكانتين'], ['fitness', 'اللياقة'],
];

function dl(items) {
  return `<dl class="dl-grid">${items.map(([k, val]) => `<div><dt>${k}</dt><dd>${val === '' || val == null ? '—' : esc(val)}</dd></div>`).join('')}</dl>`;
}

function profileTabHtml(s, tab) {
  if (tab === 'data') {
    return `
      <div class="card"><div class="card-header"><h2>البيانات الأساسية</h2></div>
        ${dl([['اسم العسكري', s.name], ['الرقم القومي', s.nationalId], ['الرقم العسكري', s.militaryNo], ['الدرجة العسكرية', s.rank], ['الوصف', s.description]])}</div>
      <div class="card"><div class="card-header"><h2>البيانات العسكرية</h2></div>
        ${dl([['السرية', s.company], ['الوحدة', s.unit], ['الوحدة السابقة', s.prevUnit], ['التخصص', s.specialty], ['تاريخ التجنيد', fmtDate(s.enlistDate)], ['رقم التصريح', s.permitNo], ['تاريخ التصريح', fmtDate(s.permitDate)]])}</div>
      <div class="card"><div class="card-header"><h2>البيانات الشخصية والبدنية</h2></div>
        ${dl([['العنوان', s.address], ['رقم الهاتف', s.phone], ['رقم إضافي', s.phone2], ['العمر', s.age ? `${s.age} سنة` : ''], ['الطول', s.height ? `${s.height} سم` : ''], ['الوزن', s.weight ? `${s.weight} كجم` : '']])}</div>`;
  }
  if (tab === 'docs') {
    const tile = (title, img, fallbackIcon) => `<div class="doc-tile">
      <div class="doc-preview">${img ? `<img src="${img}" alt="">` : `<div class="empty">${icon(fallbackIcon, 34)}<span>لم يتم رفع الصورة</span></div>`}</div>
      <div class="doc-tile-foot"><strong>${title}</strong><a class="btn btn-ghost btn-sm" href="#/soldiers/${s.id}/edit">${img ? 'تغيير' : 'رفع'}</a></div></div>`;
    return `<div class="doc-tiles">
      ${tile('صورة البطاقة', s.idPhoto, 'idcard')}
      ${tile('صورة العسكري', s.photo, 'camera')}
      <div class="doc-tile"><div class="doc-preview"><div class="card-mini">${idCard(s)}</div></div>
        <div class="doc-tile-foot"><strong>بطاقة العسكري</strong><button class="btn btn-ghost btn-sm" data-action="card-preview" data-id="${s.id}">${icon('printer', 18)} طباعة</button></div></div>
    </div>`;
  }
  if (tab === 'permits') {
    const list = DB.permits.filter((p) => p.soldierId === s.id).sort((a, b) => b.exitAt - a.exitAt);
    if (!list.length) return `<div class="card">${emptyState('لا توجد تصاريح مسجلة', '', 'report')}</div>`;
    return `<div class="card"><div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>رقم التصريح</th><th>سبب الخروج</th><th>وقت الخروج</th><th>العودة المتوقعة</th><th>وقت العودة</th><th>الحالة</th></tr></thead>
      <tbody>${list.map((p) => `<tr><td class="num">${p.no}</td><td>${esc(p.reason)}</td><td>${fmtDT(p.exitAt)}</td><td>${fmtDT(p.expectedReturn)}</td><td>${fmtDT(p.returnedAt)}</td>
        <td>${p.returnedAt ? '<span class="badge badge-success">عاد</span>' : '<span class="badge badge-warning">لم يعد بعد</span>'}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  }
  if (tab === 'attendance') {
    const moves = [];
    DB.permits.filter((p) => p.soldierId === s.id).forEach((p) => {
      moves.push({ type: 'exit', at: p.exitAt, note: p.reason });
      if (p.returnedAt) moves.push({ type: 'entry', at: p.returnedAt, note: p.entryNotes || '' });
    });
    moves.sort((a, b) => b.at - a.at);
    if (!moves.length) return `<div class="card">${emptyState('لا توجد حركات مسجلة', '', 'gate')}</div>`;
    return `<div class="card"><div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>الحركة</th><th>التاريخ</th><th>الوقت</th><th>السبب / الملاحظات</th></tr></thead>
      <tbody>${moves.map((m) => `<tr><td>${m.type === 'exit' ? '<span class="badge badge-warning">خروج</span>' : '<span class="badge badge-success">دخول</span>'}</td>
        <td>${fmtDate(m.at)}</td><td>${fmtTime(m.at)}</td><td>${esc(m.note) || '—'}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  }
  if (tab === 'canteen') {
    const list = DB.canteen.filter((t) => t.soldierId === s.id).sort((a, b) => b.at - a.at);
    return `<div class="card">
      <div class="card-header"><h2>حساب شهر ${monthName(new Date())}</h2><strong class="num" style="font-size:22px;color:var(--primary)">${money(monthTotal(s.id))}</strong></div>
      ${list.length ? `<div class="table-wrap"><table class="table table-compact">
        <thead><tr><th>التاريخ</th><th>الوقت</th><th>قيمة العملية</th></tr></thead>
        <tbody>${list.map((t) => `<tr><td>${fmtDate(t.at)}</td><td>${fmtTime(t.at)}</td><td class="num">${money(t.amount)}</td></tr>`).join('')}</tbody>
      </table></div>` : emptyState('لا توجد عمليات هذا الشهر', '', 'cart')}
    </div>`;
  }
  if (tab === 'fitness') {
    const list = DB.fitness.filter((f) => f.soldierId === s.id).sort((a, b) => b.date - a.date);
    return `<div class="card">
      <div class="card-header"><h2>سجل اللياقة</h2><button class="btn btn-secondary btn-sm" data-action="fitness-for" data-id="${s.id}">${icon('plus', 18)} إضافة قياس</button></div>
      ${fitnessTable(list)}
    </div>`;
  }
  return '';
}

function screenProfile(id) {
  const s = soldierById(id);
  if (!s) return screenNotFound();
  const p = activePermit(s.id);
  return {
    html: `
    <div class="page-header">
      <div class="crumbs"><a href="#/soldiers">العسكريون</a><span>/</span><span>ملف عسكري</span></div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="card-preview" data-id="${s.id}">${icon('printer')} طباعة البطاقة</button>
        <a class="btn btn-primary" href="#/soldiers/${s.id}/edit">${icon('edit')} تعديل البيانات</a>
      </div>
    </div>
    <div class="card profile-head">
      ${avatar(s, 'xl')}
      <div class="ph-main">
        <div class="ph-top">
          <div><div class="ph-rank">${esc(s.rank)}</div><h1>${esc(s.name)}</h1></div>
          ${statusBadge(s, true)}
        </div>
        <dl class="info-grid">
          <div><dt>الرقم العسكري</dt><dd class="num">${s.militaryNo}</dd></div>
          <div><dt>الرقم القومي</dt><dd class="num">${s.nationalId}</dd></div>
          <div><dt>السرية</dt><dd>${esc(s.company)}</dd></div>
          <div><dt>الوحدة</dt><dd>${esc(s.unit)}</dd></div>
          <div><dt>التخصص</dt><dd>${esc(s.specialty) || '—'}</dd></div>
        </dl>
        ${p ? `<div class="notice notice-warning">${icon('clock')}<span>خارج الوحدة منذ <b>${fmtWhen(p.exitAt)}</b> – ${esc(p.reason)} – العودة المتوقعة <b>${fmtWhen(p.expectedReturn)}</b></span></div>` : ''}
      </div>
      <div class="ph-qr">${qrSvg(s.militaryNo, 112)}<span>QR العسكري</span></div>
    </div>
    <div class="tabs" role="tablist">
      ${PROFILE_TABS.map(([k, l]) => `<button class="tab ${S.profileTab === k ? 'active' : ''}" role="tab" data-action="profile-tab" data-tab="${k}">${l}</button>`).join('')}
    </div>
    <div id="tab-body">${profileTabHtml(s, S.profileTab)}</div>`,
  };
}

A['profile-tab'] = (el) => {
  S.profileTab = el.dataset.tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === el));
  const id = currentRoute()[1];
  document.getElementById('tab-body').innerHTML = profileTabHtml(soldierById(id), S.profileTab);
};

A['card-preview'] = (el) => {
  const s = soldierById(el.dataset.id);
  openModal(`
    <div class="modal-head"><h2>بطاقة العسكري</h2><button class="btn btn-ghost btn-icon" data-action="modal-close" aria-label="إغلاق">${icon('x')}</button></div>
    <div class="modal-body"><div class="card-preview print-area">${idCard(s)}</div>
      <span class="muted" style="font-size:15px">المقاس الفعلي: 85.6 × 54 مم (مقاس البطاقة القياسي)</span></div>
    <div class="modal-foot">
      <button class="btn btn-primary btn-lg" data-action="window-print">${icon('printer')} طباعة</button>
      <button class="btn btn-secondary btn-lg" data-action="modal-close">إغلاق</button>
    </div>`, 'modal-wide');
};

A['fitness-for'] = (el) => { S.fit.sid = Number(el.dataset.id); S.fit.q = ''; go('#/fitness'); };

/* =========================================================
   6. البوابة
   ========================================================= */
function gateLookup(no) {
  const s = soldierByMilNo(no);
  if (!s) { toast('لا يوجد عسكري بهذا الرقم', 'error'); return; }
  S.gateSid = s.id;
  go('#/gate');
}

function screenGate() {
  const s = S.gateSid ? soldierById(S.gateSid) : null;
  if (!s) {
    return {
      html: `
      <div class="page-header"><div><h1>البوابة</h1><p class="subtitle">تسجيل خروج ودخول العسكريين</p></div></div>
      <div class="gate-idle">
        <button class="scanner" data-action="gate-scan" aria-label="مسح QR">
          <div class="scanner-frame"><i class="c c1"></i><i class="c c2"></i><i class="c c3"></i><i class="c c4"></i>${icon('qr', 104)}</div>
          <strong>قم بمسح QR الخاص بالعسكري</strong>
          <span>قرّب بطاقة العسكري من جهاز المسح</span>
          <span class="ready"><i></i>الماسح جاهز</span>
        </button>
        <div class="or-divider">أو</div>
        <button class="btn btn-secondary btn-xl" data-action="gate-manual">${icon('hash', 26)} إدخال الرقم العسكري</button>
      </div>`,
      mount() { listenScanner(gateLookup); },
    };
  }

  const p = activePermit(s.id);
  const late = p && p.expectedReturn < new Date();
  const action = s.status === 'in'
    ? `<p class="state-line">العسكري موجود داخل الوحدة</p>
       <a class="btn btn-primary btn-xxl" href="#/gate/exit/${s.id}">${icon('exit', 30)} تسجيل خروج</a>`
    : `${p ? `<dl class="kv">
          <div><dt>سبب الخروج</dt><dd>${esc(p.reason)}</dd></div>
          <div><dt>وقت الخروج</dt><dd>${fmtWhen(p.exitAt)}</dd></div>
          <div><dt>العودة المتوقعة</dt><dd>${fmtWhen(p.expectedReturn)} ${late ? '<span class="badge badge-danger">متأخر</span>' : ''}</dd></div>
        </dl>` : '<p class="state-line">العسكري خارج الوحدة</p>'}
       <a class="btn btn-green btn-xxl" href="#/gate/entry/${s.id}">${icon('enter', 30)} تسجيل دخول</a>`;

  return {
    html: `
    <div class="page-header">
      <div><h1>البوابة</h1><p class="subtitle">تم التعرف على العسكري</p></div>
      <div class="page-actions"><button class="btn btn-secondary btn-lg" data-action="gate-reset">${icon('qr')} مسح عسكري آخر</button></div>
    </div>
    <div class="gate-result">
      <div class="card gate-card">
        ${avatar(s, 'xl')}
        <div style="flex:1;min-width:0">
          <div class="ph-rank">${esc(s.rank)}</div>
          <h2>${esc(s.name)}</h2>
          <dl class="info-grid">
            <div><dt>الرقم العسكري</dt><dd class="num">${s.militaryNo}</dd></div>
            <div><dt>السرية</dt><dd>${esc(s.company)}</dd></div>
            <div><dt>الوحدة</dt><dd>${esc(s.unit)}</dd></div>
            <div><dt>الحالة</dt><dd style="margin-top:6px">${statusBadge(s, true)}</dd></div>
          </dl>
        </div>
      </div>
      <div class="card gate-action">${action}</div>
    </div>`,
    mount() { listenScanner(gateLookup); },
  };
}

A['gate-scan'] = () => { S.gateSid = randomSoldier().id; refresh(); };
A['gate-manual'] = () => openMilNoModal((s) => { S.gateSid = s.id; refresh(); });
A['gate-reset'] = () => { S.gateSid = null; refresh(); };

/* =========================================================
   7. تصريح الخروج
   ========================================================= */
function screenExit(id) {
  const s = soldierById(id);
  if (!s) return screenNotFound();
  if (s.status === 'out') { setTimeout(() => { toast('العسكري مسجل خارج الوحدة بالفعل', 'error'); go('#/gate'); }); return { html: '' }; }
  S.exitReason = null;
  const now = new Date();
  const reasonBtn = (r, i, extra = false) =>
    `<button type="button" class="reason ${extra ? 'reason-extra' : ''}" data-action="pick-reason" data-reason="${esc(r)}"><span class="rn">${pad2(i)}</span>${esc(r)}</button>`;

  return {
    html: `
    <div class="page-header">
      <div class="title-row">
        <a class="btn btn-secondary btn-icon" href="#/gate" aria-label="رجوع">${icon('back')}</a>
        <div><h1>تصريح خروج</h1><p class="subtitle">اختر سبب الخروج ثم أكد العملية</p></div>
      </div>
    </div>
    ${soldierStrip(s)}
    <form id="exit-form" class="exit-layout" novalidate>
      <div class="card exit-reasons">
        <div class="card-header"><h2>سبب الخروج <span class="req">*</span></h2><span class="muted" id="reason-picked">لم يتم الاختيار</span></div>
        <div class="card-body">
          <div class="reason-grid">${DB.EXIT_REASONS.map((r, i) => reasonBtn(r, i + 1)).join('')}</div>
          ${DB.extraReasons.length ? `<div class="subhead">أسباب إضافية</div>
            <div class="reason-grid">${DB.extraReasons.map((r, i) => reasonBtn(r, DB.EXIT_REASONS.length + i + 1, true)).join('')}</div>` : ''}
        </div>
      </div>
      <div class="card exit-side">
        <div class="card-header"><h2>بيانات الخروج</h2></div>
        <div class="card-body exit-fields">
          ${field('تاريخ الخروج', `<input class="input" type="date" name="exitDate" value="${toInputDate(now)}">`)}
          ${field('وقت الخروج', `<input class="input" type="time" name="exitTime" value="${toInputTime(now)}">`)}
          ${field('تاريخ العودة المتوقع', `<input class="input" type="date" name="expectedDate" value="${toInputDate(now)}">`, { req: true })}
          ${field('وقت العودة المتوقع', `<input class="input" type="time" name="expectedTime">`, { req: true, name: 'expected', error: 'يرجى تحديد وقت عودة لاحق لوقت الخروج' })}
          ${field('ملاحظات', `<textarea class="textarea" name="notes" rows="2" placeholder="اختياري"></textarea>`, { span: 'span-full' })}
        </div>
        <div class="exit-actions">
          <button type="submit" class="btn btn-primary btn-xl btn-block" id="exit-confirm" disabled>${icon('check', 26)} تأكيد الخروج</button>
          <a class="btn btn-secondary btn-lg btn-block" href="#/gate">إلغاء</a>
        </div>
      </div>
    </form>`,
    mount() {
      const form = document.getElementById('exit-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!S.exitReason) return;
        const exitAt = new Date(`${form.exitDate.value}T${form.exitTime.value || '00:00'}`);
        const expected = form.expectedDate.value && form.expectedTime.value ? new Date(`${form.expectedDate.value}T${form.expectedTime.value}`) : null;
        const f = form.querySelector('[data-field="expected"]');
        if (!expected || expected <= exitAt) { f.classList.add('has-error'); form.expectedTime.focus(); return; }
        f.classList.remove('has-error');
        const permit = { id: DB.permits.length + 1, no: DB.nextPermitNo(), soldierId: s.id, reason: S.exitReason, exitAt, expectedReturn: expected, returnedAt: null, notes: form.notes.value.trim(), entryNotes: '' };
        DB.permits.push(permit);
        s.status = 'out';
        saveDB();
        S.gateSid = null;
        go('#/gate');
        showResult({
          title: 'تم تسجيل الخروج',
          soldier: s,
          lines: [['سبب الخروج', permit.reason], ['وقت الخروج', fmtWhen(exitAt)], ['العودة المتوقعة', fmtWhen(expected)]],
          undo: () => {
            DB.permits.splice(DB.permits.indexOf(permit), 1);
            s.status = 'in';
            saveDB();
            refresh();
          },
        });
      });
    },
  };
}

A['pick-reason'] = (el) => {
  S.exitReason = el.dataset.reason;
  document.querySelectorAll('.reason').forEach((b) => b.classList.toggle('selected', b === el));
  document.getElementById('reason-picked').innerHTML = `السبب المختار: <b style="color:var(--primary)">${esc(S.exitReason)}</b>`;
  document.getElementById('exit-confirm').disabled = false;
};

/* =========================================================
   8. تسجيل الدخول (العودة)
   ========================================================= */
function screenEntry(id) {
  const s = soldierById(id);
  if (!s) return screenNotFound();
  if (s.status === 'in') { setTimeout(() => { toast('العسكري مسجل داخل الوحدة بالفعل', 'error'); go('#/gate'); }); return { html: '' }; }
  const p = activePermit(s.id);
  const late = p && p.expectedReturn < new Date();
  return {
    html: `
    <div class="page-header">
      <div class="title-row">
        <a class="btn btn-secondary btn-icon" href="#/gate" aria-label="رجوع">${icon('back')}</a>
        <div><h1>تسجيل الدخول</h1><p class="subtitle">عودة العسكري إلى الوحدة</p></div>
      </div>
    </div>
    <div class="gate-result">
      <div class="card gate-card">
        ${avatar(s, 'xl')}
        <div style="flex:1;min-width:0">
          <div class="ph-rank">${esc(s.rank)}</div>
          <h2>${esc(s.name)}</h2>
          <dl class="info-grid">
            <div><dt>الرقم العسكري</dt><dd class="num">${s.militaryNo}</dd></div>
            <div><dt>السرية</dt><dd>${esc(s.company)}</dd></div>
            <div><dt>الوحدة</dt><dd>${esc(s.unit)}</dd></div>
            <div><dt>الحالة</dt><dd style="margin-top:6px">${statusBadge(s, true)}</dd></div>
          </dl>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>بيانات الخروج</h2>${late ? '<span class="badge badge-danger">متأخر عن موعد العودة</span>' : ''}</div>
        <div class="card-body">${p ? `<dl class="kv">
          <div><dt>رقم التصريح</dt><dd class="num">${p.no}</dd></div>
          <div><dt>سبب الخروج</dt><dd>${esc(p.reason)}</dd></div>
          <div><dt>وقت الخروج</dt><dd>${fmtDT(p.exitAt)}</dd></div>
          <div><dt>العودة المتوقعة</dt><dd>${fmtDT(p.expectedReturn)}</dd></div>
        </dl>` : '<p class="muted">لا يوجد تصريح خروج مسجل لهذا العسكري</p>'}</div>
      </div>
    </div>
    <form id="entry-form" class="card" style="margin-top:20px">
      <div class="card-body grid grid-3">
        ${field('تاريخ الدخول', `<input class="input input-lg" type="date" name="entryDate" value="${toInputDate(new Date())}">`)}
        ${field('وقت الدخول', `<input class="input input-lg" type="time" name="entryTime" value="${toInputTime(new Date())}">`)}
        ${field('ملاحظات', `<input class="input input-lg" name="notes" placeholder="اختياري">`)}
      </div>
    </form>
    <div class="form-actions">
      <button type="submit" form="entry-form" class="btn btn-green btn-xl">${icon('enter', 26)} تسجيل الدخول</button>
      <a class="btn btn-secondary btn-xl" href="#/gate">إلغاء</a>
    </div>`,
    mount() {
      const form = document.getElementById('entry-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const at = form.entryDate.value ? new Date(`${form.entryDate.value}T${form.entryTime.value || '00:00'}`) : new Date();
        if (p) { p.returnedAt = at; p.entryNotes = form.notes.value.trim(); }
        s.status = 'in';
        saveDB();
        S.gateSid = null;
        go('#/gate');
        showResult({
          title: 'تم تسجيل الدخول',
          soldier: s,
          lines: [['وقت الدخول', fmtWhen(at)], ...(p ? [['سبب الخروج', p.reason]] : [])],
          undo: () => {
            if (p) { p.returnedAt = null; p.entryNotes = ''; }
            s.status = 'out';
            saveDB();
            refresh();
          },
        });
      });
    },
  };
}

/* =========================================================
   9. الكانتين
   ========================================================= */
function canteenRecentHtml() {
  const list = DB.canteen.filter((t) => isToday(t.at)).sort((a, b) => b.at - a.at).slice(0, 8);
  if (!list.length) return emptyState('لا توجد عمليات اليوم', '', 'cart');
  return `<div class="table-wrap"><table class="table table-compact">
    <thead><tr><th>الوقت</th><th>العسكري</th><th>الرقم العسكري</th><th>قيمة العملية</th></tr></thead>
    <tbody>${list.map((t) => { const s = soldierById(t.soldierId); return `<tr class="${t.soldierId === S.cant.sid ? 'highlight' : ''}"><td>${fmtTime(t.at)}</td><td class="cell-name">${esc(s.rank)} / ${esc(s.name)}</td><td class="num">${s.militaryNo}</td><td class="num"><b>${money(t.amount)}</b></td></tr>`; }).join('')}</tbody>
  </table></div>`;
}

function canteenIdentify(s) { S.cant = { sid: s.id, amount: '' }; refresh(); }

function screenCanteen() {
  const s = S.cant.sid ? soldierById(S.cant.sid) : null;
  const recent = `<div class="card" style="margin-top:20px"><div class="card-header"><h2>آخر العمليات اليوم</h2></div>${canteenRecentHtml()}</div>`;

  if (!s) {
    return {
      html: `
      <div class="page-header"><div><h1>الكانتين</h1><p class="subtitle">حدد العسكري ثم أدخل قيمة العملية</p></div></div>
      <form id="c-find" class="card identify">
        ${field('الرقم العسكري', `<div class="input-group"><input id="c-mil" class="input input-xl num" inputmode="numeric" autocomplete="off" placeholder="اكتب الرقم العسكري"><button type="submit" class="btn btn-primary btn-xl">${icon('search', 24)} بحث</button></div>`)}
        <span class="or-v">أو</span>
        <button type="button" class="btn btn-secondary btn-xl" data-action="canteen-scan">${icon('qr', 26)} مسح QR</button>
      </form>
      ${recent}`,
      mount() {
        const input = document.getElementById('c-mil');
        input.focus();
        document.getElementById('c-find').addEventListener('submit', (e) => {
          e.preventDefault();
          const found = soldierByMilNo(input.value);
          if (!found) { toast('لا يوجد عسكري بهذا الرقم', 'error'); input.select(); return; }
          canteenIdentify(found);
        });
        listenScanner((no) => { const f = soldierByMilNo(no); f ? canteenIdentify(f) : toast('لا يوجد عسكري بهذا الرقم', 'error'); });
      },
    };
  }

  return {
    html: `
    <div class="page-header">
      <div><h1>الكانتين</h1><p class="subtitle">أدخل قيمة العملية ثم اضغط تسجيل</p></div>
      <div class="page-actions"><button class="btn btn-secondary btn-lg" data-action="canteen-reset">تغيير العسكري</button></div>
    </div>
    <div class="pos">
      <div class="card pos-soldier">
        <div class="pos-id">
          ${avatar(s, 'lg')}
          <div><h2>${esc(s.name)}</h2><div class="muted">${esc(s.rank)} · ${esc(s.company)}</div><div class="num" style="font-size:18px;font-weight:600;margin-top:2px">${s.militaryNo}</div></div>
        </div>
        <div class="balance">
          <span>حساب شهر ${monthName(new Date())}</span>
          <strong class="num">${money(monthTotal(s.id))}</strong>
          <small>يُخصم إجمالي الحساب في نهاية الشهر</small>
        </div>
      </div>
      <div class="card pos-entry">
        <span class="amount-label">قيمة العملية</span>
        <div class="amount-display"><b id="c-amount-view">0</b><small>جنيه</small></div>
        <input type="hidden" id="c-amount" value="">
        ${keypad('c-amount')}
        <button class="btn btn-primary btn-xxl btn-block" id="c-submit" data-action="canteen-submit" disabled>${icon('check', 28)} تسجيل العملية</button>
      </div>
    </div>
    ${recent}`,
    mount() {
      const hidden = document.getElementById('c-amount');
      const sync = () => {
        document.getElementById('c-amount-view').textContent = hidden.value ? Number(hidden.value).toLocaleString('en-US') : '0';
        document.getElementById('c-submit').disabled = !(Number(hidden.value) > 0);
      };
      hidden.addEventListener('input', sync);
      const onKey = (e) => {
        if (document.getElementById('modal-root').classList.contains('open')) return;
        if (/^\d$/.test(e.key)) pressKey(hidden, e.key);
        else if (e.key === 'Backspace') pressKey(hidden, 'back');
        else if (e.key === 'Escape') pressKey(hidden, 'clear');
        else if (e.key === 'Enter' && Number(hidden.value) > 0) { e.preventDefault(); A['canteen-submit'](); }
      };
      document.addEventListener('keydown', onKey);
      onCleanup(() => document.removeEventListener('keydown', onKey));
    },
  };
}

A['canteen-scan'] = () => canteenIdentify(randomSoldier());
A['canteen-reset'] = () => { S.cant = { sid: null, amount: '' }; refresh(); };
A['canteen-submit'] = () => {
  const amount = Number(document.getElementById('c-amount').value);
  if (!(amount > 0)) return;
  const s = soldierById(S.cant.sid);
  const tx = { id: DB.canteen.length + 1, soldierId: s.id, amount, at: new Date() };
  DB.canteen.push(tx);
  saveDB();
  S.cant = { sid: null, amount: '' };
  refresh();
  showResult({
    title: 'تم تسجيل العملية',
    soldier: s,
    lines: [['قيمة العملية', money(amount)], [`حساب شهر ${monthName(tx.at)}`, money(monthTotal(s.id))]],
    undo: () => {
      DB.canteen.splice(DB.canteen.indexOf(tx), 1);
      saveDB();
      refresh();
    },
  });
};

/* =========================================================
   10. اللياقة
   ========================================================= */
function fitnessTable(list, withSoldier = false) {
  if (!list.length) return emptyState('لا توجد قياسات مسجلة', '', 'activity');
  return `<div class="table-wrap"><table class="table table-compact">
    <thead><tr>${withSoldier ? '<th>العسكري</th>' : ''}<th>تاريخ القياس</th><th>نوع اللياقة</th><th>النتيجة</th><th>الملاحظات</th></tr></thead>
    <tbody>${list.map((f) => { const s = soldierById(f.soldierId); return `<tr>${withSoldier ? `<td class="cell-name">${esc(s.name)}</td>` : ''}<td>${fmtDate(f.date)}</td><td>${esc(f.type)}</td><td><b>${esc(f.result)}</b></td><td>${esc(f.notes) || '—'}</td></tr>`; }).join('')}</tbody>
  </table></div>`;
}

function fitnessResultsHtml() {
  const q = S.fit.q.trim();
  if (!q) return '';
  const list = DB.soldiers.filter((s) => s.name.includes(q) || s.militaryNo.includes(q)).slice(0, 6);
  if (!list.length) return `<div class="results">${emptyState('لا توجد نتائج')}</div>`;
  return `<div class="results">${list.map((s) => `<button class="result-item" data-action="fitness-select" data-id="${s.id}">
    ${avatar(s, 'sm')}<div><strong>${esc(s.name)}</strong><span>${esc(s.rank)} · <span class="num">${s.militaryNo}</span> · ${esc(s.company)}</span></div>${icon('chevronLeft')}
  </button>`).join('')}</div>`;
}

function screenFitness() {
  const s = S.fit.sid ? soldierById(S.fit.sid) : null;
  if (!s) {
    const recent = [...DB.fitness].sort((a, b) => b.date - a.date).slice(0, 8);
    return {
      html: `
      <div class="page-header"><div><h1>اللياقة</h1><p class="subtitle">ابحث عن العسكري لعرض سجل اللياقة وإضافة قياس جديد</p></div></div>
      <div class="card filters-card">
        <div class="search-lg">${icon('search', 24)}<input id="f-q" class="input" value="${esc(S.fit.q)}" placeholder="ابحث بالاسم أو الرقم العسكري" autocomplete="off"></div>
        <div id="f-results">${fitnessResultsHtml()}</div>
      </div>
      <div class="card"><div class="card-header"><h2>آخر القياسات المسجلة</h2></div>${fitnessTable(recent, true)}</div>`,
      mount() {
        const q = document.getElementById('f-q');
        q.focus();
        q.addEventListener('input', () => { S.fit.q = q.value; document.getElementById('f-results').innerHTML = fitnessResultsHtml(); });
      },
    };
  }

  const history = DB.fitness.filter((f) => f.soldierId === s.id).sort((a, b) => b.date - a.date);
  return {
    html: `
    <div class="page-header"><div><h1>اللياقة</h1><p class="subtitle">إضافة قياس جديد وعرض السجل</p></div></div>
    ${soldierStrip(s, `<button class="btn btn-secondary" data-action="fitness-change">تغيير العسكري</button>`)}
    <div class="fit-layout">
      <form id="fit-form" class="card" novalidate>
        <div class="card-header"><h2>إضافة قياس جديد</h2></div>
        <div class="card-body stack">
          ${field('تاريخ القياس', `<input class="input" type="date" name="date" value="${toInputDate(new Date())}">`)}
          <div class="field"><label>نوع اللياقة</label><div class="chip-group">${DB.FITNESS_TYPES.map((t) => `<button type="button" class="chip ${S.fit.type === t ? 'selected' : ''}" data-action="fitness-type" data-type="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>
          ${field('النتيجة', `<input class="input" name="result" placeholder="مثال: 13:20 دقيقة أو 40 مرة">`, { req: true, name: 'result', error: 'يرجى إدخال النتيجة' })}
          ${field('الملاحظات', `<textarea class="textarea" name="notes" rows="2" placeholder="اختياري"></textarea>`)}
          <button type="submit" class="btn btn-primary btn-lg btn-block">${icon('check')} حفظ القياس</button>
        </div>
      </form>
      <div class="card"><div class="card-header"><h2>سجل اللياقة</h2><span class="muted">${history.length} قياس</span></div>${fitnessTable(history)}</div>
    </div>`,
    mount() {
      const form = document.getElementById('fit-form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = form.querySelector('[data-field="result"]');
        if (!form.result.value.trim()) { f.classList.add('has-error'); form.result.focus(); return; }
        DB.fitness.push({ id: DB.fitness.length + 1, soldierId: s.id, date: fromInputDate(form.date.value) || new Date(), type: S.fit.type, result: form.result.value.trim(), notes: form.notes.value.trim() });
        saveDB();
        toast('تم حفظ القياس');
        refresh();
      });
    },
  };
}

A['fitness-select'] = (el) => { S.fit.sid = Number(el.dataset.id); refresh(); };
A['fitness-change'] = () => { S.fit.sid = null; S.fit.q = ''; refresh(); };
A['fitness-type'] = (el) => {
  S.fit.type = el.dataset.type;
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('selected', c === el));
};

/* =========================================================
   11. التقارير
   ========================================================= */
const REPORTS = [
  ['soldiers', 'تقرير العسكريين', 'users'],
  ['movements', 'تقرير الخروج والدخول', 'gate'],
  ['canteen', 'تقرير الكانتين', 'cart'],
  ['fitness', 'تقرير اللياقة', 'activity'],
];

function buildReport() {
  const r = S.report;
  const q = r.q.trim();
  const from = fromInputDate(r.from);
  const to = fromInputDate(r.to);
  if (to) to.setHours(23, 59, 59, 999);
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const matchS = (s) => !q || s.name.includes(q) || s.militaryNo.includes(q) || s.nationalId.includes(q);

  if (r.type === 'soldiers') {
    const list = DB.soldiers.filter((s) => matchS(s) && (!r.company || s.company === r.company) && (!r.status || s.status === r.status));
    return {
      headers: ['الاسم', 'الرقم العسكري', 'الرقم القومي', 'الدرجة', 'السرية', 'التخصص', 'الحالة'],
      rows: list.map((s) => ({
        html: [`<b>${esc(s.name)}</b>`, `<span class="num">${s.militaryNo}</span>`, `<span class="num">${s.nationalId}</span>`, esc(s.rank), esc(s.company), esc(s.specialty), statusBadge(s)],
        csv: [s.name, s.militaryNo, s.nationalId, s.rank, s.company, s.specialty, s.status === 'in' ? 'داخل الوحدة' : 'خارج الوحدة'],
      })),
      summary: `${list.length} عسكري`,
    };
  }
  if (r.type === 'movements') {
    const list = DB.permits.filter((p) => inRange(p.exitAt) && matchS(soldierById(p.soldierId))).sort((a, b) => b.exitAt - a.exitAt);
    return {
      headers: ['الاسم', 'الرقم العسكري', 'سبب الخروج', 'وقت الخروج', 'العودة المتوقعة', 'وقت الدخول', 'الحالة'],
      rows: list.map((p) => {
        const s = soldierById(p.soldierId);
        return {
          html: [`<b>${esc(s.name)}</b>`, `<span class="num">${s.militaryNo}</span>`, esc(p.reason), fmtDT(p.exitAt), fmtDT(p.expectedReturn), fmtDT(p.returnedAt), p.returnedAt ? '<span class="badge badge-success">عاد</span>' : '<span class="badge badge-warning">لم يعد</span>'],
          csv: [s.name, s.militaryNo, p.reason, fmtDT(p.exitAt), fmtDT(p.expectedReturn), p.returnedAt ? fmtDT(p.returnedAt) : '', p.returnedAt ? 'عاد' : 'لم يعد'],
        };
      }),
      summary: `${list.length} تصريح`,
    };
  }
  if (r.type === 'canteen') {
    const list = DB.canteen.filter((t) => inRange(t.at) && matchS(soldierById(t.soldierId))).sort((a, b) => b.at - a.at);
    const total = list.reduce((a, t) => a + t.amount, 0);
    return {
      headers: ['التاريخ', 'الوقت', 'الاسم', 'الرقم العسكري', 'السرية', 'قيمة العملية'],
      rows: list.map((t) => {
        const s = soldierById(t.soldierId);
        return {
          html: [fmtDate(t.at), fmtTime(t.at), `<b>${esc(s.name)}</b>`, `<span class="num">${s.militaryNo}</span>`, esc(s.company), `<span class="num">${money(t.amount)}</span>`],
          csv: [fmtDate(t.at), fmtTime(t.at), s.name, s.militaryNo, s.company, t.amount],
        };
      }),
      totalRow: ['الإجمالي', '', '', '', '', money(total)],
      summary: `${list.length} عملية · الإجمالي ${money(total)}`,
    };
  }
  const list = DB.fitness.filter((f) => inRange(f.date) && matchS(soldierById(f.soldierId))).sort((a, b) => b.date - a.date);
  return {
    headers: ['تاريخ القياس', 'الاسم', 'الرقم العسكري', 'نوع اللياقة', 'النتيجة', 'الملاحظات'],
    rows: list.map((f) => {
      const s = soldierById(f.soldierId);
      return {
        html: [fmtDate(f.date), `<b>${esc(s.name)}</b>`, `<span class="num">${s.militaryNo}</span>`, esc(f.type), `<b>${esc(f.result)}</b>`, esc(f.notes) || '—'],
        csv: [fmtDate(f.date), s.name, s.militaryNo, f.type, f.result, f.notes],
      };
    }),
    summary: `${list.length} قياس`,
  };
}

function reportTableHtml() {
  const rep = buildReport();
  const title = REPORTS.find((x) => x[0] === S.report.type)[1];
  const range = S.report.type === 'soldiers' ? `حتى ${fmtDate(new Date())}` : `من ${fmtDate(fromInputDate(S.report.from))} إلى ${fmtDate(fromInputDate(S.report.to))}`;
  return `
    <div class="print-title" style="padding:0 0 6mm"><h2>${esc(DB.settings.unitName)} – ${title}</h2><p>${range} · ${rep.summary}</p></div>
    <div class="table-wrap scroll"><table class="table table-compact report-table">
      <thead><tr>${rep.headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rep.rows.length ? rep.rows.map((r) => `<tr>${r.html.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${rep.headers.length}">${emptyState('لا توجد بيانات في الفترة المحددة')}</td></tr>`}
      ${rep.totalRow && rep.rows.length ? `<tr class="total-row">${rep.totalRow.map((c) => `<td>${c}</td>`).join('')}</tr>` : ''}</tbody>
    </table></div>
    <div class="table-foot no-print"><span>${rep.summary}</span></div>`;
}

function screenReports() {
  const r = S.report;
  const filters = r.type === 'soldiers'
    ? `${field('السرية', `<select class="select" data-rf="company">${optionList(DB.COMPANIES, r.company, 'كل السرايا')}</select>`)}
       ${field('الحالة', `<select class="select" data-rf="status"><option value="">كل الحالات</option><option value="in" ${r.status === 'in' ? 'selected' : ''}>داخل الوحدة</option><option value="out" ${r.status === 'out' ? 'selected' : ''}>خارج الوحدة</option></select>`)}`
    : `${field('من تاريخ', `<input class="input" type="date" data-rf="from" value="${r.from}">`)}
       ${field('إلى تاريخ', `<input class="input" type="date" data-rf="to" value="${r.to}">`)}`;
  return {
    html: `
    <div class="page-header">
      <div><h1>التقارير</h1><p class="subtitle">اختر التقرير وحدد الفترة ثم اطبع أو صدّر</p></div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-lg" data-action="report-export">${icon('download')} تصدير Excel</button>
        <button class="btn btn-primary btn-lg" data-action="window-print">${icon('printer')} طباعة التقرير</button>
      </div>
    </div>
    <div class="seg">${REPORTS.map(([k, l, ic]) => `<button class="seg-btn ${r.type === k ? 'active' : ''}" data-action="report-type" data-type="${k}">${icon(ic)}${l}</button>`).join('')}</div>
    <div class="card filters-card">
      <div class="report-filters">
        ${filters}
        <div class="field search-field"><label>بحث</label><div class="search-lg">${icon('search')}<input class="input" data-rf="q" value="${esc(r.q)}" placeholder="الاسم أو الرقم العسكري أو الرقم القومي" style="min-height:var(--h);font-size:17px"></div></div>
      </div>
    </div>
    <div class="card print-area" id="report-body">${reportTableHtml()}</div>`,
    mount() {
      document.querySelectorAll('[data-rf]').forEach((el) => el.addEventListener(el.tagName === 'INPUT' && el.type !== 'date' ? 'input' : 'change', () => {
        S.report[el.dataset.rf] = el.value;
        document.getElementById('report-body').innerHTML = reportTableHtml();
      }));
    },
  };
}

A['report-type'] = (el) => { S.report.type = el.dataset.type; S.report.q = ''; refresh(); };
A['report-export'] = () => {
  const rep = buildReport();
  const title = REPORTS.find((x) => x[0] === S.report.type)[1];
  downloadCsv(`${title} ${toInputDate(new Date())}.csv`, rep.headers, rep.rows.map((r) => r.csv));
  toast('تم تصدير التقرير');
};

/* =========================================================
   12. الطباعة
   ========================================================= */
const PRINT_TYPES = {
  card: { title: 'طباعة بطاقة عسكري', desc: 'بطاقة تعريف بالمقاس القياسي', icon: 'idcard', copiesLabel: 'عدد النسخ لكل عسكري' },
  qr: { title: 'طباعة QR', desc: 'ملصقات QR بالاسم والرقم العسكري', icon: 'qr', copiesLabel: 'عدد الملصقات لكل عسكري' },
  vouchers: { title: 'طباعة البونات', desc: 'بونات الكانتين للعسكريين', icon: 'ticket', copiesLabel: 'عدد البونات لكل عسكري' },
};

function printPreviewHtml() {
  const t = S.print.type;
  const items = [];
  S.print.ids.forEach((id) => { const s = soldierById(id); for (let i = 0; i < S.print.copies; i++) items.push(s); });
  if (!items.length) return `<div class="empty" style="padding-top:120mm">${icon('printer', 48)}<strong style="font-size:22pt">اختر عسكريًا لعرض المعاينة</strong></div>`;
  if (t === 'card') {
    return `<div class="paper-grid-cards">${items.map((s) => `<div class="crop">${idCard(s)}<i class="cm tl"></i><i class="cm tr"></i><i class="cm bl"></i><i class="cm br"></i></div>`).join('')}</div>`;
  }
  if (t === 'qr') {
    return `<div class="paper-grid-qr">${items.map((s) => `<div class="qr-label">${qrSvg(s.militaryNo, 120)}<strong>${esc(s.rank)} / ${esc(s.name)}</strong><span>${s.militaryNo}</span></div>`).join('')}</div>`;
  }
  let serial = 1000;
  return `<div class="paper-grid-vouchers">${items.map((s) => `<div class="voucher">
    <div class="voucher-head"><strong>بون كانتين – ${esc(DB.settings.unitName)}</strong><span>رقم ${++serial}</span></div>
    <div class="line"><em>الاسم</em><b>${esc(s.rank)} / ${esc(s.name)}</b></div>
    <div class="line"><em>الرقم العسكري</em><b class="num">${s.militaryNo}</b></div>
    <div class="line"><em>السرية</em><b>${esc(s.company)}</b></div>
    <div class="line"><em>التاريخ</em><span class="blank"></span></div>
    <div class="line"><em>القيمة</em><span class="blank"></span></div>
    <div class="sign"><span>توقيع المستلم: ..............</span><span>توقيع المسؤول: ..............</span></div>
  </div>`).join('')}</div>`;
}

function printSearchHtml() {
  const q = S.print.q.trim();
  if (!q) return '';
  const list = DB.soldiers.filter((s) => (s.name.includes(q) || s.militaryNo.includes(q)) && !S.print.ids.includes(s.id)).slice(0, 5);
  if (!list.length) return `<div class="results">${emptyState('لا توجد نتائج')}</div>`;
  return `<div class="results">${list.map((s) => `<button class="result-item" data-action="print-add" data-id="${s.id}">${avatar(s, 'sm')}<div><strong>${esc(s.name)}</strong><span class="num">${s.militaryNo}</span></div>${icon('plus')}</button>`).join('')}</div>`;
}

function printSelectedHtml() {
  if (!S.print.ids.length) return '<span class="muted" style="font-size:15px">لم يتم اختيار أي عسكري</span>';
  return S.print.ids.map((id) => { const s = soldierById(id); return `<div class="sel-item">${avatar(s, 'sm')}<div><strong>${esc(s.name)}</strong><span class="num">${s.militaryNo}</span></div><button class="btn btn-danger-ghost btn-icon" data-action="print-remove" data-id="${s.id}" aria-label="إزالة">${icon('x')}</button></div>`; }).join('');
}

function updatePrintPanels() {
  document.getElementById('p-results').innerHTML = printSearchHtml();
  document.getElementById('p-selected').innerHTML = printSelectedHtml();
  document.getElementById('p-preview').innerHTML = printPreviewHtml();
  document.getElementById('p-print').disabled = !S.print.ids.length;
  document.getElementById('p-count').textContent = `${S.print.ids.length * S.print.copies} عنصر`;
}

function screenPrinting() {
  const t = S.print.type;
  const opts = Object.entries(PRINT_TYPES).map(([k, o]) => `<button class="print-opt ${t === k ? 'active' : ''}" data-action="print-type" data-type="${k}">
    <span class="po-icon">${icon(o.icon, 30)}</span><div><strong>${o.title}</strong><span>${o.desc}</span></div></button>`).join('');
  const work = t ? `
    <div class="print-work">
      <div class="card">
        <div class="card-header"><h2>${PRINT_TYPES[t].title}</h2></div>
        <div class="card-body stack">
          <div class="field"><label>اختيار العسكري</label>
            <div class="search-lg">${icon('search')}<input id="p-q" class="input" value="${esc(S.print.q)}" placeholder="الاسم أو الرقم العسكري" autocomplete="off" style="min-height:var(--h);font-size:17px"></div>
            <div id="p-results">${printSearchHtml()}</div>
          </div>
          <div class="field"><label>العسكريون المختارون</label><div class="selected-list" id="p-selected">${printSelectedHtml()}</div></div>
          ${field(PRINT_TYPES[t].copiesLabel, `<select class="select" id="p-copies">${[1, 2, 3, 4, 6, 8].map((n) => `<option ${n === S.print.copies ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}
          <button class="btn btn-primary btn-xl btn-block" id="p-print" data-action="window-print" ${S.print.ids.length ? '' : 'disabled'}>${icon('printer', 26)} طباعة</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>معاينة الطباعة</h2><span class="muted">${esc(DB.settings.paper)} · <span id="p-count">${S.print.ids.length * S.print.copies} عنصر</span></span></div>
        <div class="paper-wrap"><div class="paper print-area" id="p-preview">${printPreviewHtml()}</div></div>
      </div>
    </div>` : `<div class="card">${emptyState('اختر نوع الطباعة للبدء', 'ستظهر معاينة الطباعة قبل الإرسال إلى الطابعة', 'printer')}</div>`;

  return {
    html: `
    <div class="page-header"><div><h1>الطباعة</h1><p class="subtitle">اختر ما تريد طباعته ثم راجع المعاينة</p></div></div>
    <div class="print-options">${opts}</div>
    ${work}`,
    mount() {
      const q = document.getElementById('p-q');
      if (!q) return;
      q.addEventListener('input', () => { S.print.q = q.value; document.getElementById('p-results').innerHTML = printSearchHtml(); });
      document.getElementById('p-copies').addEventListener('change', (e) => { S.print.copies = Number(e.target.value); updatePrintPanels(); });
    },
  };
}

A['print-type'] = (el) => { S.print.type = el.dataset.type; refresh(); };
A['print-add'] = (el) => { S.print.ids.push(Number(el.dataset.id)); S.print.q = ''; document.getElementById('p-q').value = ''; updatePrintPanels(); };
A['print-remove'] = (el) => { S.print.ids = S.print.ids.filter((id) => id !== Number(el.dataset.id)); updatePrintPanels(); };

/* =========================================================
   13. الإعدادات
   ========================================================= */
const SETTINGS_TABS = [
  ['unit', 'بيانات الوحدة', 'shield'],
  ['user', 'المستخدم / المسؤول', 'user'],
  ['reasons', 'أسباب الخروج', 'exit'],
  ['print', 'إعدادات الطباعة', 'printer'],
];

function settingsBody() {
  const st = DB.settings;
  const tab = S.settingsTab;
  const foot = `<div class="section-foot"><button type="submit" class="btn btn-primary btn-lg">${icon('check')} حفظ</button></div>`;
  if (tab === 'unit') {
    return `<form class="card" data-settings-form="unit">
      <div class="card-header"><h2>بيانات الوحدة</h2></div>
      <div class="card-body grid grid-2">
        ${field('اسم الوحدة', `<input class="input" name="unitName" value="${esc(st.unitName)}">`, { hint: 'يظهر في رأس البطاقات والتقارير المطبوعة' })}
        ${field('الجهة التابعة لها', `<input class="input" name="parentFormation" value="${esc(st.parentFormation)}">`)}
        <div class="field">
          <label>شعار الوحدة</label>
          <div class="logo-row">
            <label class="upload logo-upload ${st.logo ? 'has-image' : ''}" id="logo-tile">
              ${st.logo ? `<img src="${st.logo}" alt="">` : `${icon('image', 30)}<strong>رفع الشعار</strong><span>PNG بخلفية بيضاء</span>`}
              <input type="file" accept="image/*" id="logo-input">
            </label>
            ${st.logo ? `<button type="button" class="btn btn-danger-ghost btn-sm" data-action="logo-remove">${icon('trash', 18)} إزالة الشعار</button>` : ''}
          </div>
          <span class="hint">يظهر في رأس البطاقة العسكرية</span>
        </div>
      </div>${foot}</form>`;
  }
  if (tab === 'user') {
    return `<form class="card" data-settings-form="user">
      <div class="card-header"><h2>المستخدم / المسؤول</h2></div>
      <div class="card-body grid grid-2">
        ${field('اسم المسؤول', `<input class="input" name="adminName" value="${esc(st.admin.name)}">`)}
        ${field('اسم المستخدم', `<input class="input" name="username" value="${esc(st.admin.username)}">`)}
      </div>
      <div class="card-header" style="border-top:1px solid var(--border)"><h2>تغيير كلمة المرور</h2></div>
      <div class="card-body grid grid-3">
        ${field('كلمة المرور الحالية', '<input class="input" type="password" name="current" autocomplete="current-password">', { name: 'current', error: 'كلمة المرور الحالية غير صحيحة' })}
        ${field('كلمة المرور الجديدة', '<input class="input" type="password" name="next" autocomplete="new-password">', { name: 'next', error: 'يجب ألا تقل عن 4 أحرف', hint: 'اتركها فارغة إذا لم ترغب في التغيير' })}
        ${field('تأكيد كلمة المرور', '<input class="input" type="password" name="confirm" autocomplete="new-password">', { name: 'confirm', error: 'كلمتا المرور غير متطابقتين' })}
      </div>${foot}</form>`;
  }
  if (tab === 'reasons') {
    const canAdd = DB.extraReasons.length < 2;
    return `<div class="card">
      <div class="card-header"><h2>الأسباب الإضافية</h2><span class="muted">${DB.extraReasons.length} من 2</span></div>
      <div class="card-body stack">
        ${DB.extraReasons.map((r, i) => `<div class="extra-item"><span>${esc(r)}</span><button class="btn btn-danger-ghost btn-sm" data-action="reason-remove" data-index="${i}">${icon('trash', 18)} حذف</button></div>`).join('')}
        ${canAdd ? `<form class="input-group" id="reason-add"><input class="input input-lg" name="reason" placeholder="اكتب السبب الإضافي" maxlength="40"><button type="submit" class="btn btn-primary btn-lg">${icon('plus')} إضافة سبب</button></form>`
          : '<span class="muted">تم الوصول إلى الحد الأقصى للأسباب الإضافية</span>'}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>الأسباب الثابتة</h2><span class="muted">${DB.EXIT_REASONS.length} سببًا – غير قابلة للتعديل</span></div>
      <div class="card-body"><div class="fixed-reasons">${DB.EXIT_REASONS.map((r, i) => `<div class="fixed-reason"><span class="rn">${pad2(i + 1)}</span>${esc(r)}${icon('lock', 16)}</div>`).join('')}</div></div>
    </div>`;
  }
  return `<form class="card" data-settings-form="print">
    <div class="card-header"><h2>إعدادات الطباعة</h2></div>
    <div class="card-body grid grid-2">
      ${field('الطابعة الافتراضية', `<select class="select" name="printer">${optionList(['طابعة النظام الافتراضية', 'HP LaserJet Pro M404', 'Canon i-SENSYS LBP6030'], st.printer)}</select>`)}
      ${field('مقاس الورق', `<select class="select" name="paper">${optionList(['A4', 'A5'], st.paper)}</select>`)}
      ${field('هوامش الطباعة', `<select class="select" name="margins">${optionList(['عادية', 'ضيقة'], st.margins)}</select>`)}
      <div class="field"><label>شعار الوحدة على البطاقة</label><label class="toggle"><input type="checkbox" name="showLogo" ${st.showLogo ? 'checked' : ''}><span class="track"></span><span>إظهار الشعار</span></label></div>
    </div>${foot}</form>`;
}

function screenSettings() {
  return {
    html: `
    <div class="page-header"><div><h1>الإعدادات</h1><p class="subtitle">إعدادات النظام الأساسية</p></div></div>
    <div class="settings">
      <nav class="card settings-nav">${SETTINGS_TABS.map(([k, l, ic]) => `<button class="${S.settingsTab === k ? 'active' : ''}" data-action="settings-tab" data-tab="${k}">${icon(ic)}${l}</button>`).join('')}</nav>
      <div id="settings-body">${settingsBody()}</div>
    </div>`,
    mount() {
      const body = document.getElementById('settings-body');
      let pendingLogo;
      body.addEventListener('change', (e) => {
        if (e.target.id !== 'logo-input' || !e.target.files[0]) return;
        const reader = new FileReader();
        reader.onload = () => {
          pendingLogo = reader.result;
          const tile = document.getElementById('logo-tile');
          tile.classList.add('has-image');
          tile.innerHTML = `<img src="${pendingLogo}" alt=""><input type="file" accept="image/*" id="logo-input">`;
        };
        reader.readAsDataURL(e.target.files[0]);
      });
      body.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = e.target;
        const st = DB.settings;
        if (f.id === 'reason-add') {
          const r = f.reason.value.trim();
          if (!r) return;
          if (allExitReasons().includes(r)) { toast('هذا السبب موجود بالفعل', 'error'); return; }
          DB.extraReasons.push(r);
          saveDB();
          toast('تمت إضافة السبب');
          body.innerHTML = settingsBody();
          return;
        }
        const kind = f.dataset.settingsForm;
        if (kind === 'unit') {
          st.unitName = f.unitName.value.trim() || st.unitName;
          st.parentFormation = f.parentFormation.value.trim();
          if (pendingLogo !== undefined) st.logo = pendingLogo;
        }
        if (kind === 'user') {
          f.querySelectorAll('.has-error').forEach((x) => x.classList.remove('has-error'));
          const bad = (n) => f.querySelector(`[data-field="${n}"]`).classList.add('has-error');
          if (f.next.value || f.current.value) {
            if (f.current.value !== st.admin.password) { bad('current'); return; }
            if (f.next.value.length < 4) { bad('next'); return; }
            if (f.next.value !== f.confirm.value) { bad('confirm'); return; }
            st.admin.password = f.next.value;
          }
          st.admin.name = f.adminName.value.trim() || st.admin.name;
          st.admin.username = f.username.value.trim() || st.admin.username;
          S.user.name = st.admin.name;
          sessionStorage.setItem('user', JSON.stringify(S.user));
        }
        if (kind === 'print') { st.printer = f.printer.value; st.paper = f.paper.value; st.margins = f.margins.value; st.showLogo = f.showLogo.checked; }
        saveDB();
        toast('تم حفظ الإعدادات');
        refresh();
      });
    },
  };
}

A['settings-tab'] = (el) => {
  S.settingsTab = el.dataset.tab;
  document.querySelectorAll('.settings-nav button').forEach((b) => b.classList.toggle('active', b === el));
  document.getElementById('settings-body').innerHTML = settingsBody();
};
A['logo-remove'] = () => {
  DB.settings.logo = null;
  saveDB();
  toast('تمت إزالة الشعار');
  document.getElementById('settings-body').innerHTML = settingsBody();
};
A['reason-remove'] = (el) => {
  DB.extraReasons.splice(Number(el.dataset.index), 1);
  saveDB();
  toast('تم حذف السبب');
  document.getElementById('settings-body').innerHTML = settingsBody();
};

function screenNotFound() {
  return { html: `<div class="card">${emptyState('الصفحة غير موجودة', 'تأكد من الرابط أو عد إلى الرئيسية', 'search')}<div style="text-align:center;padding-bottom:32px"><a class="btn btn-primary" href="#/dashboard">العودة إلى الرئيسية</a></div></div>` };
}
