'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { requireValue } = require('./errors.cjs');
const { digest } = require('../shared/crypto.cjs');
const gateFields = 'id, military_no, name, rank, company, unit, status, version';
const internalFields = `${gateFields}, national_id, phone, address, created_at, archived, details`;

class Store {
  constructor(pool) { this.pool = pool; }
  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(728301)');
      await client.query(fs.readFileSync(path.join(__dirname, 'database/001-initial.sql'), 'utf8'));
      const applied = (await client.query('SELECT version FROM schema_migrations')).rows.map(r => r.version);
      for (const name of fs.readdirSync(path.join(__dirname, 'database')).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
        const version = Number(name.split('-')[0]);
        if (!applied.includes(version)) await client.query(fs.readFileSync(path.join(__dirname, 'database', name), 'utf8'));
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async user(username) { return (await this.pool.query('SELECT * FROM users WHERE username=$1 AND disabled=false', [username])).rows[0]; }
  async userById(id) { return (await this.pool.query('SELECT * FROM users WHERE id=$1 AND disabled=false', [id])).rows[0]; }
  async list(context, search = '', offset = 0, archived = false) {
    const fields = context.kind === 'internal' && context.user.role === 'admin' ? internalFields : gateFields;
    return (await this.pool.query(`SELECT ${fields} FROM soldiers WHERE (name ILIKE $1 OR military_no ILIKE $1) AND archived=$2 ORDER BY name,id LIMIT 200 OFFSET $3`, [`%${search}%`, archived, offset])).rows;
  }
  async permits() {
    return (await this.pool.query(`SELECT p.id,p.no,p.soldier_id,p.reason,p.exit_at,p.expected_return,p.returned_at,p.notes,p.entry_notes,
      p.voided,s.name,s.military_no,s.rank,s.company FROM permits p
      JOIN soldiers s ON s.id=p.soldier_id ORDER BY p.exit_at DESC LIMIT 200`)).rows.map(({ created_by, ...row }) => row);
  }
  async mutate(context, requestId, body, operation) {
    const client = await this.pool.connect();
    const bodyHash = digest(JSON.stringify(body));
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock_shared(728302)');
      const activeUser = (await client.query('SELECT role,disabled,auth_version FROM users WHERE id=$1', [context.user.id])).rows[0];
      requireValue(activeUser && !activeUser.disabled && activeUser.role === context.user.role &&
        (context.user.auth_version === undefined || activeUser.auth_version === context.user.auth_version), 'تغيرت صلاحيات الحساب؛ سجل الدخول مجددًا', 401);
      // Serialize retries for the same request before checking its stored result.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [requestId]);
      const old = (await client.query('SELECT * FROM requests WHERE id=$1', [requestId])).rows[0];
      if (old) {
        requireValue(old.user_id === context.user.id && old.device_id === context.deviceId && old.body_hash === bodyHash,
          'رقم الطلب مستخدم لعملية مختلفة', 409);
        await client.query('COMMIT');
        return old.response;
      }
      const result = await operation(client);
      await client.query('INSERT INTO requests(id,user_id,device_id,body_hash,response) VALUES($1,$2,$3,$4,$5)',
        [requestId, context.user.id, context.deviceId, bodyHash, JSON.stringify(result)]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async audit(client, context, action, entityId) {
    await client.query('INSERT INTO audit_log(id,user_id,device_id,action,entity_id) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), context.user.id, context.deviceId, action, entityId]);
  }
  async createSoldier(client, context, data) {
    const row = (await client.query(`INSERT INTO soldiers(id,military_no,national_id,name,rank,company,unit,phone,address,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [randomUUID(), data.militaryNo, data.nationalId, data.name, data.rank, data.company, data.unit, data.phone, data.address,JSON.stringify(data.details||{})])).rows[0];
    await this.audit(client, context, 'soldier.create', row.id);
    return row;
  }
  async gate(client, context, data, requestId) {
    const soldier = (await client.query('SELECT * FROM soldiers WHERE id=$1 FOR UPDATE', [data.soldierId])).rows[0];
    requireValue(soldier, 'العسكري غير موجود', 404);
    requireValue(!soldier.archived, 'ملف العسكري مؤرشف', 409);
    let permit;
    if (data.kind === 'exit') {
      requireValue(soldier.status === 'in', 'العسكري مسجل خارج الوحدة بالفعل', 409);
      const serverNow = (await client.query('SELECT now() AS at')).rows[0].at;
      requireValue(Date.parse(data.expectedReturn) > new Date(serverNow).getTime(), 'موعد العودة يجب أن يكون في المستقبل');
      permit = (await client.query(`INSERT INTO permits(id,soldier_id,reason,exit_at,expected_return,notes,created_by)
        VALUES($1,$2,$3,now(),$4,$5,$6) RETURNING *`,
        [randomUUID(), soldier.id, data.reason, data.expectedReturn, data.notes, context.user.id])).rows[0];
    } else {
      requireValue(soldier.status === 'out', 'العسكري مسجل داخل الوحدة بالفعل', 409);
      permit = (await client.query(`UPDATE permits SET returned_at=now(),entry_notes=$2
        WHERE soldier_id=$1 AND returned_at IS NULL AND voided=false RETURNING *`, [soldier.id, data.notes])).rows[0];
      requireValue(permit, 'لا يوجد تصريح نشط؛ اطلب مراجعة المسؤول', 409);
    }
    await client.query('UPDATE soldiers SET status=$2,version=version+1 WHERE id=$1', [soldier.id, data.kind === 'exit' ? 'out' : 'in']);
    await client.query('INSERT INTO gate_events(id,permit_id,soldier_id,kind,user_id,device_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), permit.id, soldier.id, data.kind, context.user.id, context.deviceId, requestId]);
    await this.audit(client, context, `gate.${data.kind}`, permit.id);
    const { created_by, ...safe } = permit;
    return safe;
  }
  async gateVisitor(client, context, data, requestId) {
    const visitor = (await client.query(
      `SELECT v.*, c.name AS category_name, c.tier AS category_tier
       FROM visitors v JOIN visitor_categories c ON c.id=v.category_id
       WHERE v.id=$1 FOR UPDATE`,
      [data.visitorId],
    )).rows[0];
    requireValue(visitor && !visitor.disabled, 'الزائر غير موجود أو معطل', 404);
    requireValue(!visitor.disabled && !((await client.query('SELECT disabled FROM visitor_categories WHERE id=$1', [visitor.category_id])).rows[0]?.disabled), 'فئة الزائر معطلة', 409);
    let row;
    if (data.action === 'in') {
      const open = (await client.query(
        'SELECT id FROM visitor_visits WHERE visitor_id=$1 AND check_out IS NULL AND NOT voided',
        [visitor.id],
      )).rows[0];
      requireValue(!open, 'الزائر مسجل داخل الوحدة بالفعل', 409);
      row = (await client.query(
        `INSERT INTO visitor_visits(id,visitor_id,purpose,created_by,device_id,request_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [randomUUID(), visitor.id, data.purpose, context.user.id, context.deviceId, requestId],
      )).rows[0];
    } else {
      requireValue(data.action === 'out', 'حركة زائر غير صالحة', 400);
      row = (await client.query(
        `UPDATE visitor_visits SET check_out=now(), entry_notes=$2
         WHERE visitor_id=$1 AND check_out IS NULL AND NOT voided RETURNING *`,
        [visitor.id, data.notes || ''],
      )).rows[0];
      requireValue(row, 'لا توجد زيارة مفتوحة لهذا الزائر', 409);
    }
    await this.audit(client, context, `visitor.${data.action}`, row.id);
    return { visit: row, visitor };
  }
}
module.exports = { Store };
