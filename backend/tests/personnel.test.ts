import { completeSoldierInput } from './soldier.fixture';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyMigrations, readMigrations } from '@/config/migrator';
import { openRaw } from '@/config/prisma';
import { createTestApp } from './helpers';

test('expanding medical and security categories preserves existing personnel entries exactly', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'personnel-upgrade-'));
  const db = openRaw(path.join(dir, 'app.db'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const migrations = readMigrations();
  applyMigrations(db, migrations.filter(m => m.name < '20261022020000_personnel_medical_security'));
  const user = randomUUID();
  const soldier = randomUUID();
  db.prepare('INSERT INTO users(id,username,name,password_hash,role) VALUES(?,?,?,?,?)').run(user, 'admin', 'Admin', 'hash', 'admin');
  db.prepare('INSERT INTO soldiers(id,military_no,national_id,name,rank,company,unit,details) VALUES(?,?,?,?,?,?,?,?)')
    .run(soldier, '000123456', '30101010101011', 'Soldier', 'Private', 'Company', 'Unit', '{}');
  db.prepare('INSERT INTO soldier_personnel_records(id,soldier_id,category,title,record_date,details,created_by,version) VALUES(?,?,?,?,?,?,?,?)')
    .run(randomUUID(), soldier, 'medical', 'Original order', '2026-10-22', 'Original details', user, 3);
  const before = db.prepare('SELECT * FROM soldier_personnel_records').all();
  applyMigrations(db, migrations);
  // Later migrations only add leave times, empty for existing entries.
  const after = db.prepare('SELECT * FROM soldier_personnel_records').all() as Record<string, unknown>[];
  assert.deepEqual(after.map(({ start_time: _s, end_time: _e, ...row }) => row), before);
  assert.ok(after.every((row) => row.start_time === '' && row.end_time === ''));
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('soldier histories are independent, versioned, admin-only and included in backup restore', async t => {
  const app = await createTestApp(t);
  const create = (militaryNo: string) => app.api('POST', '/api/soldiers', completeSoldierInput({ militaryNo, nationalId: '30101010101011',
    name: 'اختبار سجلات', rank: 'جندي', company: 'الأولى', unit: 'الوحدة' }));
  const soldier = await create('000123456');
  const other = await create('000123457');
  const path = '/api/soldier/records';
  const list = () => app.api('GET', `${path}?soldierId=${soldier.id}`);
  const body = { soldierId: soldier.id, category: 'grant', title: 'سجل أول', recordDate: '2026-10-22',
    endDate: '2026-10-24', reference: '100/أ', details: 'تفاصيل مستقلة' };
  for (const category of ['grant', 'leave', 'penalty', 'reward', 'medical', 'medical_affairs', 'security_report']) {
    await app.api('POST', path, { ...body, category });
    await app.api('POST', path, { ...body, category, title: 'سجل ثانٍ' });
  }
  let records = (await list()).records;
  assert.equal(records.length, 14);
  assert.equal((await app.api('GET', `${path}?soldierId=${other.id}`)).records.length, 0);
  const first = records[0];
  const edited = await app.api('POST', path, { ...body, category: first.category, id: first.id, version: first.version, title: 'بيان معدل' });
  assert.equal(edited.version, 2);
  assert.equal((await app.send(app.internal, 'POST', path, { ...body, id: first.id, version: first.version }, app.adminToken)).status, 409);
  assert.equal((await app.send(app.internal, 'POST', path, { ...body, id: first.id, version: 2, soldierId: other.id }, app.adminToken)).status, 404);
  for (const fields of [{ recordDate: '2026-02-31' }, { endDate: '2026-10-01' }, { category: 'invalid' }, { title: '' }]) {
    assert.equal((await app.send(app.internal, 'POST', path, { ...body, ...fields }, app.adminToken)).status, 400);
  }
  const backup = await app.backend.backupManager!.create();
  assert.equal(app.backend.backupManager!.preview(backup.id).counts.soldier_personnel_records, 14);
  await app.api('POST', `${path}/delete`, { soldierId: soldier.id, id: first.id, version: 2 });
  assert.equal((await list()).records.length, 13);
  assert.equal((await app.backend.store.prisma.soldierPersonnelRecord.findUniqueOrThrow({ where: { id: first.id } })).deleted, true);
  await app.backend.backupManager!.restore(backup.id);
  records = (await list()).records;
  assert.equal(records.length, 14);
  assert.equal(records.find((r: { id: string }) => r.id === first.id).title, 'بيان معدل');
  assert.ok(await app.backend.store.prisma.auditLog.count({ where: { action: { contains: 'soldier.' } } }) >= 15);
  await app.api('POST', '/api/admin/users', { username: 'records-clerk', name: 'Clerk', role: 'clerk', password: 'records-password-12' });
  const clerk = await app.login(app.internal, 'records-clerk', 'records-password-12');
  assert.equal((await app.send(app.internal, 'GET', `${path}?soldierId=${soldier.id}`, {}, clerk)).status, 403);
  assert.equal((await app.send(app.internal, 'POST', path, body, clerk)).status, 403);
  const gate = await app.login(app.gate, 'admin', 'test-password-long');
  assert.equal((await app.send(app.gate, 'GET', `${path}?soldierId=${soldier.id}`, {}, gate)).status, 403);
});
