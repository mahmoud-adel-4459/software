import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { hashPassword } from '@/common/utils/crypto';
import { migratePglite } from '../scripts/migrate-pglite-to-sqlite';
import { ADMIN_PASSWORD, createTestApp } from './helpers';

/** Hash of every file name + size + mtime: proves the source directory was not touched. */
function treeSignature(dir: string): string {
  const hash = createHash('sha256');
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const stat = fs.statSync(full);
        hash.update(`${full}:${stat.size}:${stat.mtimeMs}`);
      }
    }
  };
  walk(dir);
  return hash.digest('hex');
}

test('PGlite -> SQLite migration reproduces every table, money total and counter (source untouched)', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mil-migrate-'));
  t.after(() => {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows may still hold the SQLite handle for a moment; the OS temp cleaner removes it later.
    }
  });
  const source = path.join(root, 'pg');
  const target = path.join(root, 'data', 'app.db');

  const pg = await PGlite.create(source);
  await pg.exec(fs.readFileSync(path.join(__dirname, 'fixtures', 'pg-schema.sql'), 'utf8'));
  const adminId = randomUUID();
  const s1 = randomUUID();
  const s2 = randomUUID();
  const outlet2 = randomUUID();
  const visitorId = randomUUID();
  const permit1 = randomUUID();
  const permit2 = randomUUID();
  const tx1 = randomUUID();
  const hash = await hashPassword(ADMIN_PASSWORD);
  const q = (sql: string, params: unknown[] = []) => pg.query(sql, params);
  await q('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5)', [
    adminId,
    'admin',
    'مسؤول',
    hash,
    'admin',
  ]);
  for (const [id, no, status] of [
    [s1, '000011111', 'out'],
    [s2, '000022222', 'in'],
  ] as const) {
    await q(
      `INSERT INTO soldiers(id,military_no,national_id,name,rank,company,unit,status,details,created_at)
       VALUES($1,$2,'30101010101011','فرد '||$2,'جندي','الأولى','وحدة',$3,$4::jsonb,'2026-10-01T08:00:00Z')`,
      [id, no, status, JSON.stringify({ height: '175', cardNo: 'B-1' })],
    );
  }
  await q(
    `INSERT INTO permits(id,soldier_id,reason,exit_at,expected_return,returned_at,created_by) VALUES($1,$2,'إجازة','2026-10-02T08:00:00Z','2026-10-03T08:00:00Z','2026-10-02T20:00:00Z',$3)`,
    [permit1, s2, adminId],
  );
  await q(
    `INSERT INTO permits(id,soldier_id,reason,exit_at,expected_return,created_by,notes) VALUES($1,$2,'مأمورية','2026-10-05T08:00:00Z','2026-10-06T08:00:00Z',$3,'ملاحظة')`,
    [permit2, s1, adminId],
  );
  for (const [permit, soldier, kind, at] of [
    [permit1, s2, 'exit', '2026-10-02T08:00:00Z'],
    [permit1, s2, 'entry', '2026-10-02T20:00:00Z'],
    [permit2, s1, 'exit', '2026-10-05T08:00:00Z'],
  ] as const) {
    await q(
      'INSERT INTO gate_events(id,permit_id,soldier_id,kind,at,user_id,device_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [randomUUID(), permit, soldier, kind, at, adminId, 'dev-1', randomUUID()],
    );
  }
  await q(`INSERT INTO food_outlets(id,kind,name,sort_order) VALUES($1,'buffet','بوفيه 1',1)`, [outlet2]);
  const canteen = '00000000-0000-0000-0000-000000000010';
  await q(
    `INSERT INTO canteen_transactions(id,soldier_id,outlet_id,amount_cents,at,created_by,notes) VALUES($1,$2,$3,12345,'2026-10-03T10:00:00Z',$4,'شراء')`,
    [tx1, s1, canteen, adminId],
  );
  await q(
    `INSERT INTO canteen_transactions(id,soldier_id,outlet_id,amount_cents,reversal_of,at,created_by,notes) VALUES($1,$2,$3,-12345,$4,'2026-10-03T11:00:00Z',$5,'عكس')`,
    [randomUUID(), s1, canteen, tx1, adminId],
  );
  await q(
    `INSERT INTO canteen_transactions(id,soldier_id,outlet_id,amount_cents,at,created_by) VALUES($1,$2,$3,990,'2026-10-04T10:00:00Z',$4)`,
    [randomUUID(), s2, outlet2, adminId],
  );
  await q(
    `INSERT INTO fitness_records(id,soldier_id,type,value,unit,date,created_by) VALUES($1,$2,'ضغط',40.5,'مرة','2026-10-03',$3)`,
    [randomUUID(), s1, adminId],
  );
  await q(
    `INSERT INTO fitness_records(id,soldier_id,type,value,unit,date,created_by,raw_result) VALUES($1,$2,'جري 3 كم',NULL,'نص قديم','2026-10-04',$3,'جيد جدًا')`,
    [randomUUID(), s1, adminId],
  );
  await q(
    `INSERT INTO attachments(id,soldier_id,kind,name,mime,content,sha256,size) VALUES($1,$2,'photo','p.png','image/png','AAAA','abc',3)`,
    [randomUUID(), s1],
  );
  await q(
    `INSERT INTO visitors(id,name,category_id,badge_no) VALUES($1,'زائر','00000000-0000-0000-0000-000000000020','Z123456')`,
    [visitorId],
  );
  await q(
    `INSERT INTO visitor_visits(id,visitor_id,purpose,check_in,created_by) VALUES($1,$2,'اجتماع','2026-10-06T09:00:00Z',$3)`,
    [randomUUID(), visitorId, adminId],
  );
  await q(`INSERT INTO audit_log(id,user_id,device_id,action,entity_id) VALUES($1,$2,'dev-1','gate.exit',$3)`, [
    randomUUID(),
    adminId,
    permit2,
  ]);
  await q(`INSERT INTO requests(id,user_id,device_id,body_hash,response) VALUES($1,$2,'dev-1','h',$3::jsonb)`, [
    randomUUID(),
    adminId,
    JSON.stringify({ id: permit2 }),
  ]);
  await q(`UPDATE settings SET data = data || '{"unitName":"وحدة الاختبار"}'::jsonb, version = 4`);
  await pg.close();

  const before = treeSignature(source);
  const result = await migratePglite({ source, target });
  assert.deepEqual(
    result.lines.filter((l) => !l.ok),
    [],
  );
  assert.equal(result.ok, true);
  assert.equal(treeSignature(source), before, 'source data directory must not be modified');
  assert.equal(result.counts.canteen_transactions, 3);

  // The migrated file boots the new backend and serves the old data through the unchanged API.
  const app = await createTestApp(t, { withBackups: false, dir: root });
  const { api } = app;
  const permits = (await api('GET', '/api/permits')).permits;
  assert.deepEqual(permits.map((p: { no: number }) => p.no).sort(), [1, 2]);
  assert.deepEqual(await api('GET', '/api/summary'), { outside: 1, late: 1 });
  const ledger = await api('GET', `/api/canteen?soldierId=${s1}&month=2026-10`);
  assert.equal(ledger.totalCents, 0);
  assert.equal(ledger.transactions.length, 2);
  assert.equal(ledger.transactions.find((x: { id: string }) => x.id === tx1).reversed_by !== null, true);
  const fitness = (await api('GET', '/api/reports?type=fitness&from=2026-10-01&to=2026-10-31')).rows;
  assert.deepEqual(fitness.map((r: { value: string | null }) => r.value).sort(), ['40.5', null]);
  assert.equal((await api('GET', `/api/fitness?soldierId=${s1}`)).records[0].date, '2026-10-04T00:00:00.000Z');
  const catalog = await api('GET', '/api/catalog');
  assert.equal(catalog.settings.unitName, 'وحدة الاختبار');
  assert.equal(catalog.settings.version, 4);
  // Counters continue after the migrated maximum.
  const next = await api('POST', '/api/gate', {
    kind: 'exit',
    soldierId: s2,
    reason: 'إجازة اعتيادية',
    expectedReturn: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(next.no, 3);
  assert.equal((await app.backend.store.prisma.gateEvent.aggregate({ _max: { sequence: true } }))._max.sequence, 4);
  await app.close();
});
