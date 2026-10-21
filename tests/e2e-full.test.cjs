'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestApp } = require('./harness.cjs');

test('اختبار التطبيق الكامل: واجهة + API + نسخ احتياطي + بوابة', async t => {
  const {
    document, pool, hooks, until, fill, submit, settle, clickNav, setDevice, internal, gate, ipcCall,
  } = await createTestApp(t, { withBackups: true });

  await until(() => document.querySelector('#login-form'), 'شاشة الدخول');
  assert.ok(document.querySelector('.connection'), 'إعداد الاتصال');
  fill('#connection-form', { serverUrl: 'https://server.local:8443' });
  submit('#connection-form');
  await until(() => hooks.configure.length === 1, 'حفظ عنوان الخادم');
  document.getElementById('export-device').click();
  await until(() => hooks.exportDevice === 1, 'تصدير طلب اعتماد الجهاز');
  document.getElementById('import-ca').click();
  await until(() => hooks.importCA === 1, 'استيراد شهادة الشبكة');

  fill('#login-form', { username: 'admin', password: 'long-test-password' });
  submit('#login-form');
  await until(() => document.querySelector('.sidebar'), 'الدخول للتطبيق');

  await clickNav('new');
  await until(() => document.querySelector('#soldier-form'), 'نموذج عسكري');
  fill('#soldier-form', {
    name: 'محمد اختبار كامل',
    militaryNo: '000077777',
    nationalId: '30101010101011',
    rank: 'جندي',
    company: 'الأولى',
    unit: 'وحدة E2E',
    phone: '01000000001',
    address: 'عنوان سري',
  });
  submit('#soldier-form');
  await until(() => document.querySelector('[data-profile]'), 'حفظ العسكري');
  await until(() => !document.querySelector('#soldier-form button[type="submit"]')?.disabled, 'انتهاء حفظ العسكري');

  await clickNav('users');
  await until(() => document.querySelector('#user-form'), 'المستخدمون');
  const gateUser = 'gatee2euser01';
  fill('#user-form', { username: gateUser, name: 'عامل بوابة', password: 'gate-password-12' });
  submit('#user-form');
  await until(async () => (await pool.query('SELECT 1 AS ok FROM users WHERE username=$1', [gateUser])).rows.length === 1, 'إضافة مستخدم بوابة');
  await until(() => document.querySelector('#users-list') && !document.querySelector('#user-form button[type="submit"]')?.disabled, 'انتهاء حفظ المستخدم');

  await clickNav('gate');
  await until(() => document.querySelector('#gate-search'), 'البوابة');
  fill('#gate-search', { militaryNo: '000077777' });
  submit('#gate-search');
  await until(() => document.querySelector('#gate-form[data-kind="exit"]'), 'تحديد عسكري للخروج');
  const future = new Date(Date.now() + 86400000);
  const returnDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
  document.querySelector('#gate-form input[name="reason"]').click();
  fill('#gate-form', { returnDate, returnTime: '18:00', notes: 'E2E' });
  submit('#gate-form');
  await until(() => document.querySelector('#gate-form[data-kind="entry"]'), 'تسجيل خروج');
  assert.equal((await pool.query('SELECT status FROM soldiers')).rows[0].status, 'out');

  await clickNav('movements');
  await until(() => document.querySelector('.movement-card'), 'بطاقة حركة');
  assert.match(document.body.textContent, /محمد اختبار كامل/);

  await clickNav('canteen');
  await until(() => document.querySelector('#internal-lookup'), 'الكانتين');
  fill('#internal-lookup', { lookupNo: '000077777' });
  submit('#internal-lookup');
  await until(() => document.querySelector('#ledger-form'), 'نموذج كانتين');
  fill('#ledger-form', { amount: '5.50', notes: 'E2E' });
  submit('#ledger-form');
  await until(() => document.querySelector('[data-reversal]'), 'حركة كانتين');

  await clickNav('fitness');
  await until(() => document.querySelector('#fitness-form'), 'اللياقة');
  fill('#internal-lookup', { lookupNo: '000077777' });
  submit('#internal-lookup');
  await until(() => document.querySelector('#fitness-form'), 'اختيار عسكري للياقة');
  fill('#fitness-form', { type: 'ضغط', value: '42', date: returnDate, notes: 'E2E' });
  submit('#fitness-form');
  await until(() => document.body.textContent.includes('42'), 'حفظ لياقة');

  await clickNav('reports');
  await until(() => document.querySelector('#report-form'), 'التقارير');
  const cairoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  fill('#report-form', { type: 'gate', from: cairoToday, to: cairoToday, q: '', company: '' });
  submit('#report-form');
  await until(() => document.body.textContent.includes('1 سجل'), 'عرض تقرير بوابة');
  await settle(400);
  document.getElementById('csv-export').click();
  await until(() => hooks.exportReport === 1, 'تصدير CSV');
  document.querySelector('[data-doc="report"][data-mode="pdf"]').click();
  await until(() => hooks.document.some(d => d.type === 'report'), 'تقرير PDF');

  await clickNav('printing');
  await until(() => document.querySelector('#printing-form'), 'الطباعة');
  const pick = document.querySelector('#printing-form input[name="ids"]');
  pick.checked = true;
  document.querySelector('#printing-form button[value="preview"]').click();
  await until(() => hooks.document.some(d => d.type === 'card' || d.type === 'qr'), 'معاينة طباعة');
  await settle(400);

  await clickNav('settings');
  await until(() => document.querySelector('#settings-form'), 'الإعدادات');
  fill('#settings-form', { unitName: 'وحدة E2E', paper: 'A5', printer: 'Test Printer' });
  submit('#settings-form');
  await until(() => document.getElementById('notice').textContent.includes('تم'), 'حفظ إعدادات');
  await until(() => !document.querySelector('#settings-form button[type="submit"]')?.disabled, 'انتهاء حفظ الإعدادات');

  await clickNav('backups');
  await until(() => document.querySelector('#backup-create'), 'النسخ');
  document.getElementById('backup-create').click();
  await until(() => document.querySelector('[data-backup-save]'), 'إنشاء نسخة');
  await until(() => document.getElementById('notice').textContent.includes('نسخ'), 'تأكيد إنشاء النسخة');
  assert.ok(document.querySelector('.table tbody tr'), 'جدول النسخ');

  hooks.legacyPreviewPayload = {
    valid: true,
    counts: { soldiers: 1, permits: 0 },
    warnings: ['تحذير تجريبي'],
    errors: [],
  };
  await clickNav('import');
  await until(() => document.querySelector('#legacy-preview'), 'استيراد');
  document.getElementById('legacy-preview').click();
  await until(() => document.querySelector('#legacy-form'), 'معاينة استيراد');
  assert.equal(hooks.previewLegacy, 1);

  await clickNav('audit');
  await until(() => document.querySelector('.table tbody tr'), 'سجل عمليات');
  assert.ok(document.querySelector('.table tbody').textContent.length > 10);

  await clickNav('soldiers');
  await until(() => document.querySelector('#search-form'), 'بحث عسكريين');
  fill('#search-form', { q: '000077777' });
  submit('#search-form');
  await until(() => document.querySelector('[data-profile]'), 'نتيجة بحث');
  document.querySelector('[data-profile]').click();
  await until(() => document.querySelector('#archive'), 'ملف عسكري');
  document.getElementById('archive').click();
  await until(() => /أرش|إلغاء/.test(document.getElementById('notice').textContent), 'أرشفة');

  await clickNav('soldiers');
  document.getElementById('reload').click();
  await until(() => document.querySelector('.conn-pill'), 'تحديث');

  document.getElementById('logout').click();
  await until(() => document.querySelector('#login-form'), 'تسجيل خروج');

  setDevice(gate);
  fill('#login-form', { username: 'admin', password: 'long-test-password' });
  submit('#login-form');
  await until(() => document.querySelector('#gate-search'), 'دخول جهاز بوابة');
  assert.equal(document.querySelector('[data-page="soldiers"]'), null);
  assert.equal(document.body.textContent.includes('عنوان سري'), false);
  const blocked = await ipcCall('POST', '/api/settings', { unitName: 'x' }, randomUUID());
  assert.equal(blocked.status, 403);
});
