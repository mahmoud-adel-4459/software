'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestApp } = require('./harness.cjs');

test('every internal feature screen renders with page header and primary action', async t => {
  const { document, until, fill, submit, clickNav } = await createTestApp(t);
  const pages = [
    ['soldiers', 'العسكريون', '#search-form'],
    ['new', 'إضافة عسكري', '#soldier-form'],
    ['visitors', 'الزوار', '#visitor-add-form'],
    ['canteen', 'الكانتين', '#internal-lookup'],
    ['buffet', 'البوفيه', '#internal-lookup'],
    ['fitness', 'اللياقة', '#internal-lookup'],
    ['daily-report', 'التقرير اليومي الشامل', '#daily-report-form'],
    ['reports', 'التقارير', '#report-form'],
    ['printing', 'الطباعة', '#printing-form'],
    ['settings', 'الإعدادات', '#settings-form'],
    ['users', 'المستخدمون', '#user-form'],
    ['backups', 'النسخ الاحتياطي والاستعادة', '#backup-create'],
    ['import', 'استيراد بيانات النسخة القديمة', '#legacy-preview'],
    ['audit', 'سجل العمليات', '.table'],
    ['gate', 'بوابة الخروج والدخول', '#gate-search'],
    ['movements', 'حركات البوابة', '.movement-grid'],
  ];
  await until(() => document.querySelector('#login-form'), 'login form');
  fill('#login-form', { username: 'admin', password: 'long-test-password' });
  submit('#login-form');
  await until(() => document.querySelector('.sidebar'), 'app shell');
  assert.ok(document.querySelector('.conn-pill'), 'connection status pill');
  assert.ok(document.querySelector('.sidebar-emblem'), 'sidebar emblem');
  assert.ok(document.querySelector('.page-eyebrow'), 'page eyebrow on default page');
  for (const [key, title, marker] of pages) {
    await clickNav(key);
    await until(() => document.querySelector('h1')?.textContent.includes(title), `page ${key}`);
    assert.ok(document.querySelector('.page-header'), `${key} page header`);
    assert.ok(document.querySelector(marker), `${key} marker ${marker}`);
  }
});
