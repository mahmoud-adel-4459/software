'use strict';
const root = document.getElementById('root');
const state = { info: null, session: null, soldiers: [], permits: [], summary: { outside: 0, late: 0 }, page: 'gate', selected: null, gateVisitor: null, connected: false };
Object.assign(state,{catalog:{settings:{unitName:'الوحدة',extraReasons:[]},exitReasons:[],fitnessTypes:{}},users:[],editingUserId:null,printSearchHits:[],printSearchQ:'',reportFilter:{type:'soldiers',from:today().slice(0,8)+'01',to:today(),q:'',company:'',outletId:''},dailyReportDate:today(),dailyReport:null,query:'',offset:0,archived:false});
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateTime = value => value ? new Intl.DateTimeFormat('ar-EG-u-nu-latn', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(value)) : '—';
let noticeTimer;
const ERROR_HINTS = [
  { match: /غير معتمد/, hint: 'للتجربة استخدم npm.cmd run play أو شغّل.cmd من مجلد المشروع — وليس Setup.exe.' },
  { match: /Failed to fetch|تعذر الاتصال|ECONNREFUSED|ETIMEDOUT|لا يستجيب/i, hint: 'أغلق البرنامج وشغّله مجددًا: npm.cmd run play' },
  { match: /شهادة الخادم غير موثوقة|certificate|UNABLE_TO_VERIFY/i, hint: 'من مجلد المشروع نفّذ مرة واحدة: npm.cmd run lab:setup ثم npm.cmd run play' },
  { match: /انتهت الجلسة/, hint: 'سجّل الدخول من جديد.' },
  { match: /اضبط عنوان الخادم/, hint: 'من شاشة الدخول: إعداد الاتصال → عنوان https://…' },
  { match: /403/, hint: 'تحقق من صلاحية الحساب أو جهاز البوابة/الداخلي.' },
];
function hintForError(message) {
  const extra = ERROR_HINTS.find(h => h.match.test(message));
  return extra ? `${message} — ${extra.hint}` : message;
}
function notify(value) {
  document.getElementById('notice').textContent = typeof value === 'string' ? hintForError(value) : value;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { document.getElementById('notice').textContent = ''; }, 8000);
}
async function unwrap(promise) {
  const result = await promise;
  if (!result.ok) {
    if (result.status === 401) { state.session = null; state.connHint = 'انتهت الجلسة'; render(); }
    if (result.status === 403 && String(result.error).includes('غير معتمد')) state.connHint = 'جهاز غير معتمد';
    throw new Error(result.error);
  }
  return result.data;
}
function connPillHtml() {
  if (!state.session) return '';
  if (state.connHint === 'جهاز غير معتمد') {
    return `<div class="conn-pill is-error" title="هذا الجهاز غير مدرج في الترخيص"><span>جهاز غير معتمد</span></div>`;
  }
  if (state.connHint === 'انتهت الجلسة') {
    return `<div class="conn-pill is-warn" title="سجّل الدخول مجددًا"><span>انتهت الجلسة</span></div>`;
  }
  const ok = state.connected;
  return `<div class="conn-pill ${ok ? '' : 'is-error'}" title="${ok ? 'متصل بالخادم' : 'تعذر تحديث البيانات — تحقق من الشبكة والخادم'}">${icon(ok ? 'wifi' : 'wifiOff', 16)}<span>${ok ? 'متصل' : 'غير متصل'}</span></div>`;
}
const request = (method, path, data, id) => unwrap(window.desktop.request(method, path, data, id));
function input(label, name, value = '', type = 'text', required = true) {
  return `<div class="field"><label for="${name}">${label}</label><input class="input" id="${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''} maxlength="${name === 'nationalId' ? 14 : 200}"></div>`;
}
function connection() {
  if (state.info?.playMode) {
    return `<p class="muted login-help" style="padding:0 28px 16px">تجربة محلية — بدون ترخيص.<br>المستخدم: <strong>admin</strong> · كلمة المرور في ملف <code>play-login.txt</code> بجانب المشروع.</p>`;
  }
  const mid = state.info?.machineId || '';
  const standaloneHint = state.info?.standaloneMode && state.info?.loginHintPath
    ? `<p class="muted">كلمة مرور المسؤول المحلي: ملف login.txt داخل مجلد standalone في بيانات التطبيق.</p>` : '';
  return `<details class="card connection" ${state.info?.serverUrl ? '' : 'open'}><summary class="card-header">إعداد اتصال الخادم واعتماد الجهاز</summary>
    <div class="card-body">
      <div class="machine-id-box">
        <label for="machine-id-field">رقم تعريف الكمبيوتر (للتفعيل)</label>
        <p class="muted">انسخه وأدخله في موقع التراخيص للحصول على كود التفعيل.</p>
        <div class="machine-id-row">
          <input class="input" id="machine-id-field" type="text" readonly value="${escapeHtml(mid)}" aria-label="رقم تعريف الكمبيوتر">
          <button type="button" class="btn btn-secondary" id="copy-machine-id">نسخ</button>
        </div>
        ${state.info?.machineGuid ? `<p class="muted small">Windows MachineGuid: <code>${escapeHtml(state.info.machineGuid)}</code></p>` : ''}
      </div>
      ${standaloneHint}
      <p>قبل الدخول (وضع الشبكة)، أرسل طلب اعتماد هذا الجهاز إلى الجهة المالكة لإضافته إلى ترخيص المنشأة.</p>
      <form id="connection-form" class="stack">${input('عنوان الخادم الآمن', 'serverUrl', state.info?.serverUrl || '', 'url')}
      <button class="btn btn-primary" type="submit">حفظ عنوان الخادم</button></form>
      <div class="actions"><button class="btn btn-secondary" id="export-device">حفظ طلب اعتماد الجهاز</button>
      <button class="btn btn-secondary" id="import-ca">استيراد شهادة الشبكة الداخلية</button></div>
      <p class="muted">${state.info?.caImported ? 'شهادة الشبكة مستوردة' : 'يُفضّل استيراد شهادة CA الداخلية'} · الإصدار ${escapeHtml(state.info?.version)}${state.info?.labMode ? ' · تجربة محلية' : ''}${state.info?.standaloneMode ? ' · خادم محلي' : ''}</p>
      <details class="connection-advanced"><summary>متقدم — اعتماد API (v0.2)</summary>
      <p><span>معرف الجهاز</span> <code>${escapeHtml(state.info?.deviceId)}</code></p>
      <p><span>بصمة المفتاح</span> <code>${escapeHtml(state.info?.fingerprint)}</code></p></details>
    </div></details>`;
}
function login() {
  root.innerHTML = `<div class="auth-shell"><div class="auth-panel login-shell"><div class="card login-card">
    <div class="login-brand"><div class="emblem" aria-hidden="true">⚑</div><h1>نظام شؤون العسكريين</h1><p>تطبيق سطح المكتب · شبكة داخلية</p></div>
    <form id="login-form" class="stack" style="padding:24px 28px 8px">${input('اسم المستخدم', 'username')}${input('كلمة المرور', 'password', '', 'password')}
    <button class="btn btn-primary btn-block" type="submit">تسجيل الدخول</button></form>
    <p class="muted login-help" style="padding:0 28px 24px">${state.info?.playMode ? 'بيانات تجريبية (3 عسكريين). كلمة المرور في play-login.txt' : 'يحدد الخادم صلاحيات المستخدم والجهاز. لا توجد كلمة مرور افتراضية.'}</p>
  </div>${connection()}</div></div>`;
  document.getElementById('connection-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    try { await unwrap(window.desktop.configure(new FormData(event.target).get('serverUrl'))); state.info = await unwrap(window.desktop.info()); render(); notify('تم حفظ عنوان الخادم'); }
    catch (error) { notify(error.message); }
  });
  document.getElementById('export-device')?.addEventListener('click', async () => {
    try { if (await unwrap(window.desktop.exportDevice())) notify('تم حفظ طلب الاعتماد؛ أرسله إلى الجهة المالكة'); } catch (error) { notify(error.message); }
  });
  document.getElementById('import-ca')?.addEventListener('click', async () => {
    try { if (await unwrap(window.desktop.importCA())) { state.info = await unwrap(window.desktop.info()); render(); notify('تم استيراد الشهادة'); } } catch (error) { notify(error.message); }
  });
  document.getElementById('copy-machine-id')?.addEventListener('click', async () => {
    const value = document.getElementById('machine-id-field')?.value;
    if (!value) return notify('رقم التعريف غير متاح');
    try {
      if (window.desktop.copyText) await unwrap(window.desktop.copyText(value));
      else await navigator.clipboard.writeText(value);
      notify('تم نسخ رقم تعريف الكمبيوتر');
    } catch (e) { notify(e.message); }
  });
  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.target.querySelector('button'); button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(event.target));
      state.session = await unwrap(window.desktop.login(values));
      if (state.session.kind === 'gate' || state.session.user.role === 'gate') state.page = 'gate';
      else if (state.session.user.role === 'clerk') { state.page = 'canteen'; state.reportFilter.type = 'canteen'; }
      else state.page = 'soldiers';
      await load(); render();
    } catch (error) {
      if (error.message.includes('غير معتمد')) state.connHint = 'جهاز غير معتمد';
      notify(error.message);
    }
    finally { button.disabled = false; }
  });
}
const isAdmin = () => state.session?.kind === 'internal' && state.session?.user.role === 'admin';
const isClerk = () => state.session?.kind === 'internal' && state.session?.user.role === 'clerk';
const isInternalStaff = () => isAdmin() || isClerk();
const isInternal = isAdmin;
const PAGE_TITLES = { soldiers: 'العسكريون', new: 'إضافة عسكري', visitors: 'الزوار', canteen: 'الكانتين', buffet: 'البوفيه', fitness: 'اللياقة', reports: 'التقارير', 'daily-report': 'التقرير اليومي', printing: 'الطباعة', settings: 'الإعدادات', users: 'المستخدمون', backups: 'النسخ والاستعادة', import: 'استيراد بيانات', audit: 'سجل العمليات', gate: 'بوابة الخروج والدخول', movements: 'حركات البوابة', profile: 'ملف عسكري', edit: 'تعديل بيانات' };
const NAV_ICON = { soldiers: 'users', new: 'userPlus', visitors: 'userPlus', canteen: 'cart', buffet: 'coffee', fitness: 'dumbbell', reports: 'chart', 'daily-report': 'chart', printing: 'printer', settings: 'settings', users: 'shield', backups: 'database', import: 'import', audit: 'scroll', gate: 'gate', movements: 'activity' };
function navGroups() {
  const gate = [['gate', 'البوابة'], ['movements', 'حركات البوابة']];
  if (!isInternalStaff()) return [{ label: 'التشغيل', items: gate }];
  if (isClerk()) {
    return [
      { label: 'العمليات', items: [['canteen', 'الكانتين'], ['buffet', 'البوفيه'], ['reports', 'التقارير']] },
    ];
  }
  return [
    { label: 'السجل', items: [['soldiers', 'العسكريون'], ['new', 'إضافة عسكري'], ['visitors', 'الزوار']] },
    { label: 'العمليات', items: [['canteen', 'الكانتين'], ['buffet', 'البوفيه'], ['fitness', 'اللياقة'], ...gate] },
    { label: 'الإدارة', items: [['daily-report', 'التقرير اليومي'], ['reports', 'التقارير التفصيلية'], ['printing', 'الطباعة'], ['settings', 'الإعدادات'], ['users', 'المستخدمون'], ['backups', 'النسخ والاستعادة'], ['import', 'استيراد بيانات'], ['audit', 'سجل العمليات']] },
  ];
}
function renderNav() {
  return navGroups().map(group => `<div class="nav-group"><div class="nav-group-label">${group.label}</div>${group.items.map(([key, label]) =>
    `<a href="#${key}" data-page="${key}" ${state.page === key ? 'aria-current="page"' : ''} class="${state.page === key ? 'active' : ''}"><span class="nav-ic">${icon(NAV_ICON[key] || 'settings')}</span><span class="nav-label">${label}</span></a>`).join('')}</div>`).join('');
}
function shellTitle() { return PAGE_TITLES[state.page] || 'شؤون العسكريين'; }
async function load(search = state.query) {
  state.query=search;
  const [soldiers, permits, summary,catalog] = await Promise.all([request('GET', `/api/soldiers?q=${encodeURIComponent(search)}&offset=${state.offset}&archived=${isAdmin()&&state.archived}`), request('GET', '/api/permits'), request('GET', '/api/summary'),request('GET','/api/catalog')]);
  state.soldiers = soldiers.soldiers; state.permits = permits.permits; state.summary = summary; state.catalog=catalog;state.connected = true;state.connHint = '';
  await loadModule();
}
function table(headers, rows) {
  const empty = `<tr><td colspan="${headers.length}"><div class="empty-state"><div class="empty-state-icon">${icon('search', 24)}</div><h3>لا توجد سجلات</h3><p>غيّر معايير البحث أو أضف سجلًا جديدًا.</p></div></td></tr>`;
  return `<div class="table-wrap table-pro"><table class="table table-pro"><thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.length ? rows.map(row => `<tr>${row.map((cell, i) => `<td class="${i === 0 ? 'wrap cell-name' : ''}">${cell}</td>`).join('')}</tr>`).join('') : empty}</tbody></table></div>`;
}
function soldiersPage() {
  const statusBadge = s => s.status === 'in' ? '<span class="badge badge-success">داخل الوحدة</span>' : '<span class="badge badge-warning">خارج الوحدة</span>';
  return `${pageHeader('العسكريون', { eyebrow: 'سجل الأفراد', subtitle: 'بحث، بطاقات QR، وملفات كاملة مع المرفقات.', actions: `<button class="btn btn-primary" data-page="new">${icon('userPlus', 16)}<span>إضافة عسكري</span></button>` })}${summaryTiles()}
    <div class="card table-card"><form id="search-form" class="table-toolbar"><div class="field"><label for="q">بحث</label><input class="input" id="q" name="q" value="${escapeHtml(state.query)}" placeholder="الاسم أو الرقم العسكري"></div>
    <label class="toggle-inline"><input type="checkbox" name="archived" ${state.archived ? 'checked' : ''}> الملفات المؤرشفة</label><button class="btn btn-secondary" type="submit">${icon('search', 16)}<span>بحث</span></button></form>
    <div class="card-body no-pad">${table(['الاسم', 'الرقم العسكري', 'الرتبة', 'السرية', 'الحالة', 'QR / طباعة', 'ملف'], state.soldiers.map(s =>
      [escapeHtml(s.name), `<span class="num">${escapeHtml(s.military_no)}</span>`, escapeHtml(s.rank), escapeHtml(s.company), statusBadge(s),
        soldierQrActions(s.id), `<button class="btn btn-secondary btn-sm" data-profile="${s.id}">الملف</button>`]))}</div>
    <div class="pager-bar"><button class="btn btn-secondary btn-sm" id="previous-page" ${state.offset ? '' : 'disabled'}>السابق</button><span class="muted">الصفحة ${state.offset / 200 + 1}</span><button class="btn btn-secondary btn-sm" id="next-page" ${state.soldiers.length === 200 ? '' : 'disabled'}>التالي</button></div></div>`;
}
function soldierForm(existing=null) {
  const s=existing||{};
  const editing=!!existing;
  return `${pageHeader(editing?'تعديل بيانات العسكري':'إضافة عسكري',{eyebrow:'الملف الشخصي',subtitle:'الحقول الإلزامية محددة؛ التفاصيل الإضافية اختيارية.'})}<form id="soldier-form" class="card"><div class="card-body desk-form">
    ${input('الاسم الرباعي', 'name',s.name||'')}${input('الرقم العسكري', 'militaryNo',s.military_no||'')}${input('الرقم القومي', 'nationalId',s.national_id||'')}
    ${input('الدرجة', 'rank', s.rank||'جندي')}${input('السرية', 'company',s.company||'')}${input('الوحدة', 'unit',s.unit||state.catalog.settings.unitName)}
    ${input('رقم الهاتف', 'phone', s.phone||'', 'tel', false)}${input('العنوان المدني', 'address', s.address||'', 'text', false)}
    ${Object.entries(detailLabels).map(([key,label])=>{const det=parseSoldierDetails(s.details);return input(label,key,det[key]||'',['enlistDate','dischargeDate','unitJoinDate','birthDate'].includes(key)?'date':['height','weight','age'].includes(key)?'number':'text',false);}).join('')}
    ${soldierPhotosSection(editing?(state.record?.attachments||[]):[])}
    <div class="wide actions"><button class="btn btn-primary" type="submit">حفظ العسكري</button><button class="btn btn-secondary" type="button" data-page="soldiers">إلغاء</button></div>
    </div></form>`;
}
function gatePosHead() {
  return `<header class="gate-pos-head page-header gate-heading"><div class="gate-pos-brand"><p class="page-eyebrow">محطة البوابة · POS</p><h1>بوابة الخروج والدخول</h1></div>
    <div class="gate-pos-stats"><div class="gate-pos-stat"><span>خارج الوحدة</span><b class="badge-number">${escapeHtml(state.summary.outside)}</b></div>
    <div class="gate-pos-stat warn"><span>متأخرون</span><b class="badge-number">${escapeHtml(state.summary.late)}</b></div></div></header>`;
}
function gateLastPermitBanner() {
  if (!state.lastPermit) return '';
  return `<div class="card gate-pos-flash"><div class="card-body gate-pos-flash-body"><div><strong>آخر إذن #${escapeHtml(state.lastPermit.no)}</strong>
    <p class="muted">${state.lastPermit.returned_at ? 'تم تسجيل الدخول على الإذن' : 'تم إصدار إذن الخروج'}</p></div>${docButtons('voucher', state.lastPermit.id)}</div></div>`;
}
function gatePhotosPanel() {
  const photos = state.gatePhotoUrls || {};
  return `<div class="card gate-photos-card"><div class="card-header"><h2>صور العسكري</h2></div><div class="card-body"><div class="soldier-photo-grid gate-photo-grid">${SOLDIER_PHOTO_KINDS.map(([kind, label]) => {
    const src = photos[kind];
    return `<div class="gate-photo-slot"><p class="photo-slot-label">${escapeHtml(label)}</p><div class="soldier-photo-preview">${src ? `<img src="${escapeHtml(src)}" alt="">` : '<span class="muted">—</span>'}</div></div>`;
  }).join('')}</div></div></div>`;
}
function gateProfilePanel(soldier) {
  return `<div class="card gate-profile-card"><div class="card-header"><h2>بيانات الدخول / الخروج</h2></div><div class="card-body"><dl class="info-grid gate-profile-grid">${gateProfileRows(soldier).map(r => `<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`).join('')}</dl></div></div>`;
}
function gatePermitBanner(action, subOverride) {
  const map = {
    exit: { title: 'إذن خروج', sub: 'العسكري داخل الوحدة — أصدر تصريح الخروج ثم أكّد', mod: 'exit' },
    entry: { title: 'إذن دخول', sub: 'العسكري خارج الوحدة — سجّل العودة وإغلاق الإذن', mod: 'entry' },
    'visitor-in': { title: 'إذن دخول زائر', sub: 'اكتب سبب الزيارة ثم أكّد الدخول', mod: 'entry' },
    'visitor-out': { title: 'إذن خروج زائر', sub: 'أكّد خروج الزائر من الوحدة', mod: 'exit' },
  };
  const c = map[action];
  if (!c) return '';
  const sub = subOverride || c.sub;
  return `<div class="gate-permit-banner gate-permit-banner--${c.mod}" role="status" aria-live="polite">
    <p class="gate-permit-banner-kicker">بعد المسح — الحركة المطلوبة</p>
    <p class="gate-permit-banner-title">${escapeHtml(c.title)}</p>
    <p class="gate-permit-banner-sub">${escapeHtml(sub)}</p></div>`;
}
function gateSoldierStrip(soldier) {
  const inside = soldier.status === 'in';
  const badge = inside ? '<span class="badge badge-success badge-lg"><i></i> داخل الوحدة</span>' : '<span class="badge badge-warning badge-lg"><i></i> خارج الوحدة</span>';
  return `<div class="card soldier-strip gate-pos-strip"><div class="avatar avatar-lg">${soldier.photo ? `<img src="${escapeHtml(soldier.photo)}" alt="">` : ''}</div>
    <div class="ss-main"><p class="ss-name">${escapeHtml(soldier.name)}</p><div class="ss-meta">
      <span><em>الرقم</em> <strong class="num gate-id-number">${escapeHtml(soldier.military_no)}</strong></span>
      <span><em>الرتبة</em> ${escapeHtml(soldier.rank)}</span><span><em>السرية</em> ${escapeHtml(soldier.company)}</span><span><em>الوحدة</em> ${escapeHtml(soldier.unit)}</span></div></div>
    <div class="ss-side">${badge}<button type="button" class="btn btn-secondary" id="gate-clear">عسكري آخر</button></div></div>`;
}
function gateIdleScan() {
  return `<div class="gate-pos"><section class="card gate-pos-scan"><form id="gate-search" class="gate-idle">
    <div class="scanner" tabindex="0"><div class="scanner-frame" aria-hidden="true"><span class="c c1"></span><span class="c c2"></span><span class="c c3"></span><span class="c c4"></span></div>
    <strong>امسح بطاقة العسكري</strong><span>قارئ USB يملأ الحقل تلقائيًا</span><p class="ready"><i></i> المحطة جاهزة</p></div>
    <div class="or-divider">أو أدخل الرقم يدويًا</div>
    <div class="field gate-pos-input"><label for="militaryNo">الرقم العسكري</label>
    <input class="input input-xl num" id="militaryNo" name="militaryNo" inputmode="numeric" autocomplete="off" placeholder="000000000" required maxlength="30"></div>
    <button class="btn btn-primary btn-xxl btn-block" type="submit">التعرف على العسكري</button></form></section>
    <aside class="card gate-pos-side"><div class="card-header"><h2>خطوات التشغيل</h2></div><div class="card-body">
    <ol class="gate-pos-steps"><li class="active">مسح أو إدخال الرقم</li><li>مراجعة البيانات</li><li>تأكيد الخروج أو الدخول</li></ol>
    <p class="muted gate-pos-hint">${state.catalog.exitReasons.length} سبب خروج · مسح عسكري أو زائر (QR) · Enter للتأكيد</p></div></aside></div>`;
}
function visitorTierBadge(tier) {
  const cls = tier === 'admin' ? 'badge-success' : tier === 'special' ? 'badge-warning' : 'badge';
  return `<span class="badge ${cls}">${escapeHtml(visitorTierLabel(tier))}</span>`;
}
function gateVisitorPos(payload) {
  const { visitor, openVisit } = payload;
  const inside = Boolean(openVisit);
  const strip = `<div class="card soldier-strip gate-pos-strip gate-visitor-strip"><div class="ss-main"><h2>${escapeHtml(visitor.name)}</h2>
    <span><em>بطاقة</em> <strong class="num">${escapeHtml(visitor.badge_no)}</strong></span>
    <span>${visitorTierBadge(visitor.category_tier)} · ${escapeHtml(visitor.category_name)}</span>
    ${visitor.organization ? `<span class="muted">${escapeHtml(visitor.organization)}</span>` : ''}</div>
    <div class="ss-side"><button type="button" class="btn btn-secondary" id="gate-clear">مسح آخر</button></div></div>`;
  if (inside) {
    return `${strip}${gatePermitBanner('visitor-out')}<div class="card gate-card"><div class="card-body"><p class="state-line">الزائر <strong>داخل الوحدة</strong> منذ ${dateTime(openVisit.check_in)}</p>
      <p><strong>سبب الزيارة:</strong> ${escapeHtml(openVisit.purpose)}</p></div></div>
      <form id="visitor-gate-form" class="card gate-action" data-action="out"><div class="card-body stack">${input('ملاحظات الخروج (اختياري)', 'notes', '', 'text', false)}
      <button class="btn btn-primary" type="submit">تسجيل خروج الزائر</button></div></form>`;
  }
  return `${strip}${gatePermitBanner('visitor-in')}<div class="card gate-card"><div class="card-body"><p class="state-line">تسجيل <strong>دخول زائر</strong></p></div></div>
    <form id="visitor-gate-form" class="card gate-action" data-action="in"><div class="card-body stack">${input('جاي ليه؟ (سبب الزيارة)', 'purpose', '', 'text')}
    <button class="btn btn-primary" type="submit">تسجيل دخول الزائر</button></div></form>`;
}
async function reloadGateSoldier(militaryNo) {
  const profile = await request('GET', `/api/gate/soldier?militaryNo=${encodeURIComponent(militaryNo)}`);
  state.selected = profile.soldier;
  state.gateVisitor = null;
  state.gatePhotoUrls = {};
  await Promise.all((profile.photos || []).map(async p => {
    const file = await request('GET', `/api/attachment?id=${p.id}`);
    state.gatePhotoUrls[p.kind] = `data:${file.mime};base64,${file.content}`;
  }));
  state.selected.photo = state.gatePhotoUrls.photo || '';
  state.permits = (await request('GET', '/api/permits')).permits;
}
function gateExitPos(soldier, active) {
  const reasons = state.catalog.exitReasons.map((reason, i) =>
    `<label class="reason gate-reason"><input type="radio" name="reason" value="${escapeHtml(reason)}" required><span class="rn">${String(i + 1).padStart(2, '0')}</span>${escapeHtml(reason)}</label>`).join('');
  return `${gateSoldierStrip(soldier)}${gatePermitBanner('exit')}${gateProfilePanel(soldier)}${gatePhotosPanel()}${active ? `<div class="card gate-pos-active-permit"><div class="card-body"><strong>تصريح نشط #${escapeHtml(active.no)}</strong> · ${escapeHtml(active.reason)} · العودة ${dateTime(active.expected_return)} ${docButtons('voucher', active.id)}</div></div>` : ''}
    <form id="gate-form" data-kind="exit"><div class="exit-layout gate-pos-exit"><div class="card exit-reasons"><div class="card-header"><h2>سبب الخروج</h2><span class="muted">اختر بندًا واحدًا</span></div>
    <div class="card-body"><fieldset class="exit-options"><legend class="visually-hidden">سبب الخروج</legend><div class="reason-grid gate-reason-grid">${reasons}</div></fieldset></div></div>
    <div class="exit-side"><div class="card"><div class="card-header"><h2>موعد العودة والتأكيد</h2></div>
    <div class="exit-fields">${input('يوم العودة', 'returnDate', '', 'date')}${input('وقت العودة', 'returnTime', '', 'time')}
    <div class="span-full field"><label for="notes">ملاحظات</label><input class="input" id="notes" name="notes" type="text" maxlength="200"></div></div>
    <div class="exit-actions"><button class="btn btn-primary btn-xxl btn-block" type="submit">تأكيد الخروج وإصدار الإذن</button></div></div></div></div></form>`;
}
function gateEntryPos(soldier, active) {
  const entrySub = active ? `إغلاق إذن الخروج #${active.no} — تسجيل العودة` : 'العسكري خارج الوحدة — سجّل العودة';
  return `${gateSoldierStrip(soldier)}${gatePermitBanner('entry', entrySub)}${gateProfilePanel(soldier)}${gatePhotosPanel()}<div class="gate-result gate-pos-result"><div class="card gate-card">
    ${active ? `<dl class="kv gate-pos-kv"><div><dt>إذن</dt><dd>#${escapeHtml(active.no)}</dd></div><div><dt>السبب</dt><dd>${escapeHtml(active.reason)}</dd></div><div><dt>العودة المتوقعة</dt><dd>${dateTime(active.expected_return)}</dd></div></dl>` : ''}</div>
    <div class="card gate-action"><p class="state-line">تسجيل <strong>دخول</strong> إلى الوحدة</p>
    <form id="gate-form" class="stack gate-pos-entry-form" data-kind="entry">${input('ملاحظات (اختياري)', 'notes', '', 'text', false)}
    <button class="btn btn-green btn-xxl btn-block" type="submit">تسجيل العودة الآن</button></form>${active ? docButtons('voucher', active.id) : ''}</div></div>`;
}
function gatePage() {
  const soldier = state.selected;
  const active = soldier && state.permits.find(p => p.soldier_id === soldier.id && !p.returned_at && !p.voided);
  let body = gateIdleScan();
  if (state.gateVisitor) body = gateVisitorPos(state.gateVisitor);
  else if (soldier) body = soldier.status === 'in' ? gateExitPos(soldier, active) : gateEntryPos(soldier, active);
  return `<div class="gate-pos-shell">${gatePosHead()}${gateLastPermitBanner()}${body}</div>`;
}
function movementsPage() {
  return `${pageHeader('حركات البوابة',{eyebrow:'متابعة الأذون',subtitle:'أحدث 200 تصريح مع حالة العودة والتأخير.'})}${summaryTiles()}
    <div class="movement-grid">${state.permits.length ? state.permits.map(p=>{
      const late=!p.voided&&!p.returned_at&&Date.parse(p.expected_return)<Date.now();
      const status=p.voided?'cancelled':p.returned_at?'returned':late?'late':'outside';
      const label=p.voided?'إذن ملغى':p.returned_at?'عاد إلى الوحدة':late?'متأخر عن العودة':'خارج الوحدة';
      return `<article class="card movement-card movement-${status}" aria-label="إذن ${escapeHtml(p.no)} — ${escapeHtml(p.name)}"><div class="movement-card-head"><span class="movement-permit">إذن خروج ودخول <b>#${escapeHtml(p.no)}</b></span><span class="movement-status">${label}</span></div><div class="card-body"><h2>${escapeHtml(p.name)}</h2><p class="movement-number">الرقم العسكري: ${escapeHtml(p.military_no)}</p><p class="movement-reason">${escapeHtml(p.reason)}</p><dl class="movement-times"><div><dt>وقت الخروج</dt><dd>${dateTime(p.exit_at)}</dd></div><div><dt>العودة المتوقعة</dt><dd>${dateTime(p.expected_return)}</dd></div><div><dt>الدخول الفعلي</dt><dd>${p.returned_at?dateTime(p.returned_at):'لم يسجل بعد'}</dd></div></dl>${docButtons('voucher',p.id)}</div></article>`;
    }).join('') : '<div class="card movement-empty"><h2>لا توجد حركات بوابة بعد</h2><p class="muted">سجل خروج عسكري من شاشة البوابة لعرض إذنه هنا.</p><button class="btn btn-primary" data-page="gate">فتح البوابة</button></div>'}</div>
    <p class="muted">تُعرض أحدث 200 تصريح؛ التقارير الداخلية تعرض الحركات بالفترة المطلوبة.</p>`;
}
function render() {
  if (!state.session) { login(); return; }
  if (isClerk() && !['canteen', 'buffet', 'reports'].includes(state.page)) state.page = 'canteen';
  if (!isInternalStaff() && !['gate', 'movements'].includes(state.page)) state.page = 'gate';
  if (state.sidebarCollapsed == null) state.sidebarCollapsed = sessionStorage.getItem('sidebarCollapsed') === '1';
  const content = modulePage(state.page) || (state.page === 'soldiers' ? soldiersPage() : state.page === 'new' ? soldierForm() : state.page === 'movements' ? movementsPage() : gatePage());
  const gateTerminal = state.page === 'gate' && (state.session.kind === 'gate' || !isInternalStaff());
  const collapsed = state.sidebarCollapsed;
  root.innerHTML = `<div class="app${gateTerminal ? ' gate-terminal' : ''}${collapsed ? ' is-sidebar-collapsed' : ''}"><aside class="sidebar"><div class="brand"><div class="emblem sidebar-emblem" aria-hidden="true">⚑</div><div class="brand-text"><strong>شؤون العسكريين</strong><span>${escapeHtml(state.session.installation)}</span></div></div>
    <nav class="nav" aria-label="القائمة الرئيسية">${renderNav()}</nav>
    <div class="sidebar-foot"><span>${state.session.kind === 'gate' ? 'جهاز البوابة' : 'الجهاز الداخلي'} · v0.2</span></div></aside>
    <div class="main"><header class="topbar"><div class="topbar-start"><button type="button" class="btn btn-icon btn-ghost" id="sidebar-toggle" aria-label="طي أو expand القائمة">${icon('menu')}</button>
    <div class="topbar-titles"><p class="crumbs">شؤون العسكريين / ${escapeHtml(shellTitle())}</p><h2 class="topbar-title">${escapeHtml(shellTitle())}</h2></div></div>
    <div class="topbar-end">${connPillHtml()}
    <button type="button" class="btn btn-ghost btn-sm btn-icon" id="reload" aria-label="تحديث البيانات">${icon('refresh')}</button>
    <div class="user-heading"><span class="user-avatar" aria-hidden="true">${escapeHtml(state.session.user.name.slice(0, 1))}</span><div><strong>${escapeHtml(state.session.user.name)}</strong><small>${isAdmin() ? 'مسؤول · داخلي' : isClerk() ? 'كاشير · داخلي' : state.session.user.role === 'gate' ? 'مناوب · بوابة' : 'بوابة'}</small></div></div>
    <button class="btn btn-secondary btn-sm" id="logout" type="button">${icon('logOut', 16)}<span class="logout-label">خروج</span></button></div></header>
    <main class="page"><div class="page-content">${content}</div></main></div></div>`;
  root.querySelectorAll('[data-page]').forEach(el => { el.onclick = event => { event.preventDefault(); navigate(el.dataset.page); }; });
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    sessionStorage.setItem('sidebarCollapsed', state.sidebarCollapsed ? '1' : '0');
    render();
  });
  document.getElementById('logout').onclick = async () => {
    state.session = null; state.soldiers = []; state.permits = []; state.selected = null;
    try { await unwrap(window.desktop.logout()); } catch (error) { notify(error.message); } render();
  };
  document.getElementById('reload').onclick = async () => {
    try { await load(); if (state.selected) state.selected = state.soldiers.find(s => s.id === state.selected.id) || null; render(); }
    catch (error) { state.connected = false; render(); notify(error.message); }
  };
  bindForms();
  bindModules();
}
function bindForms() {
  document.getElementById('search-form')?.addEventListener('submit', async event => {
    event.preventDefault();state.offset=0;state.archived=event.target.elements.archived.checked;try { await load(new FormData(event.target).get('q')); render(); } catch (error) { notify(error.message); }
  });
  bindSoldierPhotoPickers();
  const soldierFormEl = document.getElementById('soldier-form');
  soldierFormEl?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = soldierFormEl.querySelector('button[type="submit"]');
    if (button.disabled) return;
    const values = Object.fromEntries(new FormData(soldierFormEl));
    const details = {};
    for (const key of Object.keys(detailLabels)) { details[key] = values[key]; delete values[key]; }
    const editing = state.page === 'edit';
    const body = { ...values, details, ...(editing ? { id: state.record.soldier.id, version: state.record.soldier.version } : {}) };
    const serialized = JSON.stringify(body);
    if (soldierFormEl.dataset.payload !== serialized) { soldierFormEl.dataset.request = crypto.randomUUID(); soldierFormEl.dataset.payload = serialized; }
    button.disabled = true;
    try {
      const result = await request('POST', editing ? '/api/soldier/update' : '/api/soldiers', body, soldierFormEl.dataset.request);
      const soldierId = editing ? state.record.soldier.id : result.id;
      await uploadPendingSoldierPhotos(soldierId);
      state.pendingSoldierPhotos = {};
      state.page = 'soldiers';
      state.query = '';
      state.offset = 0;
      notify(editing ? 'تم حفظ العسكري' : 'تم حفظ العسكري — اطبع QR من عمود «QR / طباعة»');
      try { await load(); } catch { state.connected = false; notify('تم الحفظ، لكن تعذر تحديث القائمة'); }
      render();
    } catch (error) { notify(error.message); }
    finally { button.disabled = false; }
  });
  for(const [id,change] of [['previous-page',-200],['next-page',200]])document.getElementById(id)?.addEventListener('click',async()=>{state.offset+=change;try{await load();render();}catch(e){notify(e.message);}});
  document.getElementById('gate-search')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const raw = new FormData(event.target).get('militaryNo').trim();
      const scan = parseGateScan(raw);
      if (scan.kind === 'visitor') {
        const profile = await request('GET', `/api/gate/visitor?id=${encodeURIComponent(scan.id)}`);
        state.gateVisitor = profile;
        state.selected = null;
        state.gatePhotoUrls = {};
        render();
        return;
      }
      if (scan.kind === 'none' || !scan.militaryNo) { notify('امسح QR أو أدخل رقمًا صالحًا'); return; }
      await reloadGateSoldier(scan.militaryNo);
      render();
    } catch (error) { state.selected = null; state.gateVisitor = null; state.gatePhotoUrls = {}; state.connected = false; notify(error.message); }
  });
  document.getElementById('gate-clear')?.addEventListener('click', () => {
    state.selected = null; state.gateVisitor = null; render(); queueMicrotask(() => document.getElementById('militaryNo')?.focus());
  });
  document.getElementById('militaryNo')?.focus();
  const gateForm = document.getElementById('gate-form');
  gateForm?.addEventListener('submit', event => {
    const values = Object.fromEntries(new FormData(gateForm));
    if(gateForm.dataset.kind==='exit'){
      if(!values.reason||!values.returnDate||!values.returnTime){event.preventDefault();notify('اختر سبب الخروج ويوم ووقت العودة');return;}
      values.expectedReturn=new Date(`${values.returnDate}T${values.returnTime}`).toISOString();delete values.returnDate;delete values.returnTime;
    }
    saveForm(event, '/api/gate', { ...values, soldierId: state.selected.id, kind: gateForm.dataset.kind }, async result => {
      state.lastPermit = result;
      try {
        await reloadGateSoldier(state.selected.military_no);
        notify(gateForm.dataset.kind === 'exit' ? 'تم تسجيل الخروج — يمكن تسجيل العودة أو خروج جديد لاحقًا' : 'تم تسجيل الدخول — يمكن تسجيل خروج جديد');
      } catch (e) { state.selected = null; notify(e.message); }
      render();
    });
  });
  document.getElementById('visitor-gate-form')?.addEventListener('submit', event => {
    const form = event.target;
    const action = form.dataset.action;
    const values = Object.fromEntries(new FormData(form));
    if (action === 'in' && !values.purpose?.trim()) { event.preventDefault(); notify('اكتب سبب الزيارة (جاي ليه)'); return; }
    const visitorId = state.gateVisitor?.visitor?.id;
    saveForm(event, '/api/gate/visitor', { visitorId, action, purpose: values.purpose || '', notes: values.notes || '' }, async () => {
      try {
        state.gateVisitor = await request('GET', `/api/gate/visitor?id=${encodeURIComponent(visitorId)}`);
        notify(action === 'in' ? 'تم تسجيل دخول الزائر' : 'تم تسجيل خروج الزائر');
      } catch (e) { notify(e.message); }
      render();
    });
  });
}
async function saveForm(event, endpoint, body, success, doneMessage) {
  event.preventDefault();
  const form = event.target; const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  // Reuse the request ID if delivery failed; rotate when the payload changes.
  const serialized = JSON.stringify(body);
  if (form.dataset.payload !== serialized) { form.dataset.request = crypto.randomUUID(); form.dataset.payload = serialized; }
  try {
    const result=await request('POST', endpoint, body, form.dataset.request);
    success(result); notify(doneMessage || 'تم حفظ العملية على الخادم');
    try { await load(); } catch { state.connected = false; notify('تم الحفظ، لكن تعذر تحديث القائمة؛ اضغط تحديث'); }
    render();
  } catch (error) { notify(error.message); }
  finally { button.disabled = false; }
}
function showLoginOrWizard() {
  if (typeof setupRequired === 'function' && setupRequired(state.info)) {
    renderSetupWizard(root, state, { escapeHtml, input, notify, unwrap, onDone: () => render() });
    return;
  }
  render();
}
async function boot() {
  if (!window.desktop) { root.textContent = 'شغّل تطبيق سطح المكتب عبر npm start؛ هذه الصفحة لا تعمل مباشرة في المتصفح.'; return; }
  try { state.info = await unwrap(window.desktop.info()); showLoginOrWizard(); } catch (error) { root.textContent = error.message; }
}
setInterval(async () => {
  if (!state.session || !['soldiers', 'movements'].includes(state.page) || document.activeElement?.matches('input')) return;
  try { await load(); render(); } catch { state.connected = false; render(); }
}, 10000);
boot();
