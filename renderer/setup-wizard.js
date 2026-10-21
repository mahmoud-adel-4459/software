'use strict';
function setupRequired(info) {
  if (info?.labMode || info?.previewMode || info?.standaloneMode || info?.playMode) {
    try { sessionStorage.setItem('setupComplete', '1'); } catch { /* ignore */ }
    return false;
  }
  try {
    if (sessionStorage.getItem('setupComplete') === '1') return false;
  } catch { return false; }
  return !info?.serverUrl || !info?.caImported;
}
function renderSetupWizard(root, state, helpers) {
  const { escapeHtml, input, notify, unwrap, onDone } = helpers;
  let step = 1;
  const maxStep = 5;
  function stepsBar() {
    const labels = state.info?.labMode
      ? ['مرحبًا']
      : ['مرحبًا', 'الخادم', 'الشهادة', 'الاعتماد', 'جاهز'];
    return `<div class="setup-wizard-steps">${labels.map((l, i) => {
      const n = i + 1;
      const cls = n === step ? 'is-active' : n < step ? 'is-done' : '';
      return `<span class="${cls}">${n}. ${l}</span>`;
    }).join('')}</div>`;
  }
  function body() {
    if (step === 1) {
      return `<div class="card setup-wizard"><div class="card-body stack">
        <h2>تطبيق سطح المكتب — وليس موقعًا في المتصفح</h2>
        <p>لا تفتح عنوان الخادم (مثل <code>https://127.0.0.1:8443</code>) في Chrome أو Edge للعمل اليومي.</p>
        <p>استخدم نافذة <strong>Electron</strong> هذه للدخول والطباعة.</p>
        ${state.info?.labMode ? '<p class="muted">وضع تجربة محلية: الاتصال مضبوط تلقائيًا.</p>' : ''}
        <button type="button" class="btn btn-primary" id="wiz-next">التالي</button>
      </div></div>`;
    }
    if (step === 2) {
      return `<div class="card setup-wizard"><div class="card-body stack">
        <h2>عنوان الخادم الآمن</h2>
        <form id="wiz-server" class="stack">${input('عنوان HTTPS', 'serverUrl', state.info?.serverUrl || 'https://', 'url')}
        <div class="actions"><button type="button" class="btn btn-secondary" id="wiz-back">رجوع</button><button class="btn btn-primary" type="submit">حفظ والمتابعة</button></div></form>
      </div></div>`;
    }
    if (step === 3) {
      const local = /127\.0\.0\.1:8443|localhost:8443/i.test(state.info?.serverUrl || '');
      return `<div class="card setup-wizard"><div class="card-body stack">
        <h2>شهادة الشبكة الداخلية (CA)</h2>
        <p>استورد ملف <code>.pem</code> أو <code>.crt</code> للجهة المصدرة التي وقّعت شهادة الخادم.</p>
        ${local ? `<p class="muted">تجربة محلية: اضغط «شهادة التجربة» أو اختر <code>Demo-Lab\\private\\ca-cert.pem</code> على سطح المكتب. يجب أن يعمل خادم Lab (<code>تشغيل-التجربة.cmd</code>) قبل تسجيل الدخول.</p>
        <p class="desktop-error">المثبت العادي لا يشمل بيانات التجربة — للعمل مع بيانات جاهزة استخدم <strong>Demo-Lab</strong> وليس Setup فقط.</p>` : ''}
        <div class="actions"><button type="button" class="btn btn-secondary" id="wiz-back">رجوع</button>
        ${local ? '<button type="button" class="btn btn-secondary" id="wiz-ca-bundled">شهادة التجربة المحلية</button>' : ''}
        <button type="button" class="btn btn-primary" id="wiz-ca">${state.info?.caImported ? 'تم الاستيراد — التالي' : 'استيراد الشهادة'}</button></div>
      </div></div>`;
    }
    if (step === 4) {
      return `<div class="card setup-wizard"><div class="card-body stack">
        <h2>اعتماد هذا الجهاز</h2>
        <p>صدّر طلب الاعتماد وأرسله للجهة المالكة لإضافته إلى ترخيص الوحدة.</p>
        <div class="actions"><button type="button" class="btn btn-secondary" id="wiz-back">رجوع</button>
        <button type="button" class="btn btn-secondary" id="wiz-export">حفظ طلب الاعتماد</button>
        <button type="button" class="btn btn-primary" id="wiz-next">تخطي — لدي ترخيص</button></div>
      </div></div>`;
    }
    return `<div class="card setup-wizard"><div class="card-body stack">
      <h2>اكتمل الإعداد</h2>
      <p>سجّل الدخول باسم المستخدم وكلمة المرور التي يوفّرها مسؤول الخادم.</p>
      <button type="button" class="btn btn-primary btn-block" id="wiz-finish">الذهاب لتسجيل الدخول</button>
    </div></div>`;
  }
  function paint() {
    root.innerHTML = `<div class="auth-shell"><div class="auth-panel login-shell">
      <div class="login-brand"><div class="emblem" aria-hidden="true">⚑</div><h1>إعداد أول تشغيل</h1></div>
      ${stepsBar()}${body()}
    </div></div>`;
    root.querySelector('#wiz-next')?.addEventListener('click', () => {
      if (state.info?.labMode && step === 1) {
        try { sessionStorage.setItem('setupComplete', '1'); } catch { /* ignore */ }
        onDone();
        return;
      }
      step = Math.min(step + 1, maxStep);
      paint();
    });
    root.querySelector('#wiz-back')?.addEventListener('click', () => { step = Math.max(1, step - 1); paint(); });
    root.querySelector('#wiz-finish')?.addEventListener('click', () => {
      try { sessionStorage.setItem('setupComplete', '1'); } catch { /* ignore */ }
      onDone();
    });
    root.querySelector('#wiz-server')?.addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const url = new FormData(event.target).get('serverUrl');
        await unwrap(window.desktop.configure(url));
        state.info = await unwrap(window.desktop.info());
        step = 3;
        paint();
        notify('تم حفظ عنوان الخادم');
      } catch (e) { notify(e.message); }
    });
    async function afterCaImport() {
      state.info = await unwrap(window.desktop.info());
      notify('تم استيراد الشهادة');
      step = 4;
      paint();
    }
    root.querySelector('#wiz-ca-bundled')?.addEventListener('click', async () => {
      try {
        if (typeof window.desktop.importBundledCA === 'function') {
          await unwrap(window.desktop.importBundledCA());
          await afterCaImport();
        } else notify('متاح في تطبيق Electron فقط');
      } catch (e) { notify(e.message); }
    });
    root.querySelector('#wiz-ca')?.addEventListener('click', async () => {
      if (state.info?.caImported) { step = 4; paint(); return; }
      try {
        if (await unwrap(window.desktop.importCA())) await afterCaImport();
      } catch (e) { notify(e.message); }
    });
    root.querySelector('#wiz-export')?.addEventListener('click', async () => {
      try {
        if (await unwrap(window.desktop.exportDevice())) notify('تم حفظ طلب الاعتماد');
      } catch (e) { notify(e.message); }
    });
  }
  if (state.info?.labMode) { step = 1; paint(); return; }
  paint();
}
