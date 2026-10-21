'use strict';
const { randomUUID, randomBytes } = require('node:crypto');
const { verify, requestMessage, checkPassword, hashPassword } = require('../shared/crypto.cjs');
const { AppError, requireValue } = require('./errors.cjs');
const { handleModules, detailsValue, requireAdmin, requireClerkOrAdmin } = require('./modules.cjs');
const {validateLegacy,importLegacy}=require('./import.cjs');
const {mergeBackupPolicy}=require('./backup.cjs');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value, max = 200, required = false) {
  requireValue(typeof value === 'string' && value.trim().length <= max && (!required || value.trim()), 'تحقق من الحقول المطلوبة وأطوالها');
  return value.trim();
}
function internal(context) { requireValue(context.kind === 'internal' && context.user.role === 'admin', 'هذه الوظيفة متاحة للجهاز الداخلي فقط', 403); }
async function readBody(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    requireValue(bytes <= (['/api/backup/import','/api/import/preview','/api/import/apply'].includes(req.url)?48:8)*1024*1024, 'حجم الطلب أكبر من المسموح', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function createHandler({ store, licenseProvider, backupManager, clock = Date.now }) {
  const nonces = new Map();
  const sessions = new Map();
  const attempts = new Map();
  let restoring=false;let active=0;
  function prune() {
    for (const map of [nonces, sessions, attempts]) for (const [key, value] of map) {
      if ((typeof value === 'number' ? value : value.expires) < clock()) map.delete(key);
    }
  }
  const handler = async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      requireValue(!restoring,'الخادم في وضع الاستعادة؛ حاول بعد قليل',503);
      active++;
      res.once('finish',()=>{active--;});res.once('close',()=>{if(!res.writableFinished)active--;});
      const raw = await readBody(req);
      const url = new URL(req.url, 'https://server.invalid');
      requireValue(['GET', 'POST'].includes(req.method), 'طريقة غير مسموحة', 405);
      prune();
      const license = licenseProvider();
      const deviceId = req.headers['x-device-id'];
      const device = license.devices.find(d => d.id === deviceId);
      requireValue(device, 'هذا الجهاز غير معتمد؛ تواصل مع الجهة المالكة', 403);
      const timestamp = req.headers['x-timestamp'];
      const nonce = req.headers['x-nonce'];
      requireValue(typeof timestamp === 'string' && /^\d{13}$/.test(timestamp) && Math.abs(clock() - Number(timestamp)) < 60000 &&
        typeof nonce === 'string' && uuid.test(nonce), 'طلب منتهي أو هوية غير صالحة', 401);
      const nonceKey = `${deviceId}:${nonce}`;
      requireValue(!nonces.has(nonceKey), 'لا يمكن إعادة استخدام توقيع الطلب', 401);
      requireValue(verify(device.publicKey, requestMessage({ deviceId, timestamp, nonce, method: req.method, path: req.url, body: raw }),
        req.headers['x-signature'] || ''), 'تعذر التحقق من هوية الجهاز', 401);
      requireValue(nonces.size < 10000, 'طلبات كثيرة؛ حاول بعد قليل', 429);
      nonces.set(nonceKey, clock() + 120000);
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new AppError(400, 'صيغة الطلب غير صحيحة'); }
      requireValue(data && typeof data === 'object' && !Array.isArray(data), 'الطلب غير صالح');
      const send = (value, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
      if (req.method === 'POST' && url.pathname === '/api/login') {
        const key = deviceId;
        const counter = attempts.get(key) || { count: 0, expires: clock() + 300000 };
        requireValue(counter.count < 10, 'محاولات كثيرة؛ انتظر خمس دقائق', 429);
        counter.count++; attempts.set(key, counter);
        const username = text(data.username, 80, true);
        requireValue(typeof data.password === 'string' && data.password.length <= 256, 'بيانات الدخول غير صحيحة', 401);
        const user = await store.user(username);
        // Dummy scrypt for unknown users avoids a cheap username timing distinction.
        const encoded = user?.password_hash || '00000000000000000000000000000000:' + '00'.repeat(64);
        const valid = await checkPassword(data.password, encoded);
        requireValue(user && valid, 'اسم المستخدم أو كلمة المرور غير صحيحة', 401);
        attempts.delete(key);
        requireValue(sessions.size < 1000, 'جلسات كثيرة؛ حاول لاحقًا', 429);
        const token = randomBytes(32).toString('hex');
        sessions.set(token, { userId: user.id, deviceId, authVersion:user.auth_version, expires: clock() + 1800000 });
        send({ token, user: { name: user.name, username: user.username, role: user.role }, kind: device.kind, installation: license.installation });
        return;
      }
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      const session = sessions.get(token);
      requireValue(session && session.deviceId === deviceId && session.expires > clock(), 'انتهت الجلسة؛ سجل الدخول', 401);
      const user = await store.userById(session.userId);
      requireValue(user && user.auth_version===session.authVersion, 'الحساب معطل أو تغير؛ سجل الدخول', 401);
      const context = { user, deviceId, kind: device.kind };
      if(req.method==='POST'&&url.pathname.startsWith('/api/import/')){
        requireAdmin(context);
        if(url.pathname==='/api/import/preview'){send(validateLegacy(data));return;}
        if(url.pathname==='/api/import/apply'){requireValue(data.confirm==='IMPORT'&&uuid.test(req.headers['x-request-id']||''),'تأكيد الاستيراد ومعرف الطلب مطلوبان');const result=await importLegacy(store,context,req.headers['x-request-id'],data.source);send(result,201);return;}
      }
      if(url.pathname.startsWith('/api/backup')) {
        requireAdmin(context);requireValue(backupManager,'النسخ الاحتياطي غير مهيأ؛ اضبط مفتاح النسخ ومساره على الخادم',503);
        if(req.method==='GET'&&url.pathname==='/api/backups'){
          const settingsRow=(await store.pool.query('SELECT data FROM settings WHERE id=1')).rows[0];
          send({backups:backupManager.list(),schedule:backupManager.scheduleStatus(mergeBackupPolicy(settingsRow?.data))});return;
        }
        if(req.method==='GET'&&url.pathname==='/api/backup/download'){send(backupManager.read(url.searchParams.get('id')));return;}
        if(req.method==='GET'&&url.pathname==='/api/backup/preview'){send(backupManager.preview(url.searchParams.get('id')));return;}
        if(req.method==='POST'&&url.pathname==='/api/backup/create'){send(await backupManager.create(),201);return;}
        if(req.method==='POST'&&url.pathname==='/api/backup/import'){send(backupManager.import(data),201);return;}
        if(req.method==='POST'&&url.pathname==='/api/backup/restore') {
          requireValue(data.confirm==='RESTORE'&&typeof data.password==='string'&&data.password.length<=256&&await checkPassword(data.password,user.password_hash),'أدخل كلمة مرور المسؤول وأكد الاستعادة');
          requireValue(active===1,'انتظر انتهاء الطلبات الأخرى ثم أعد الاستعادة',409);
          restoring=true;try{const result=await backupManager.restore(data.id);sessions.clear();send(result);}finally{restoring=false;}return;
        }
        throw new AppError(404,'وظيفة نسخ غير موجودة');
      }
      const moduleResult=await handleModules({req,url,data,context,store,requestId:req.headers['x-request-id']});
      if(moduleResult) { if(req.method==='POST')session.expires=clock()+1800000; send(moduleResult.body,moduleResult.status||200);return; }
      // Reads/polling do not prolong a session indefinitely. Successful writes refresh it.
      if (req.method === 'POST' && url.pathname === '/api/logout') { sessions.delete(token); send({ ok: true }); return; }
      if (req.method === 'GET' && url.pathname === '/api/soldiers') {
        const offset=Number(url.searchParams.get('offset')||0);
        requireValue(Number.isSafeInteger(offset)&&offset>=0&&offset<=1000000,'صفحة غير صالحة');
        if (context.kind === 'internal') requireClerkOrAdmin(context);
        const archived=url.searchParams.get('archived')==='true'; if(archived) requireAdmin(context);
        send({ soldiers: await store.list(context, text(url.searchParams.get('q') || '', 100),offset,archived), serverTime: new Date(clock()).toISOString() }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/permits') { send({ permits: await store.permits() }); return; }
      if (req.method === 'GET' && url.pathname === '/api/summary') {
        send((await store.pool.query(`SELECT COUNT(*) AS outside, COUNT(CASE WHEN expected_return < now() THEN 1 END) AS late
          FROM permits WHERE returned_at IS NULL AND voided=false`)).rows[0]); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/users') {
        requireAdmin(context);
        send({ users: (await store.pool.query('SELECT id,username,name,role,disabled FROM users ORDER BY username')).rows }); return;
      }
      const requestId = req.headers['x-request-id'];
      requireValue(typeof requestId === 'string' && uuid.test(requestId), 'معرف العملية مطلوب');
      if (req.method === 'POST' && url.pathname === '/api/admin/users') {
        requireAdmin(context);
        const username = text(data.username, 80, true); const name = text(data.name, 200, true);
        requireValue(['admin', 'gate', 'clerk'].includes(data.role) && typeof data.password === 'string' && data.password.length >= 12 && data.password.length <= 256,
          'اختر دورًا صحيحًا وكلمة مرور من 12 إلى 256 حرفًا');
        const passwordHash = await hashPassword(data.password);
        // Hash the original request only for retry matching; never persist its password.
        const retryBody = { path: url.pathname, username, name, role: data.role, credentialDigest: require('../shared/crypto.cjs').digest(data.password) };
        const createdUser = await store.mutate(context, requestId, retryBody, async client => {
          const result = (await client.query('INSERT INTO users(id,username,name,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,username,name,role',
            [randomUUID(), username, name, passwordHash, data.role])).rows[0];
          await store.audit(client, context, 'user.create', result.id); return result;
        });
        session.expires = clock() + 1800000; send(createdUser, 201); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/soldiers') {
        requireAdmin(context);
        const soldier = {
          name: text(data.name, 200, true), militaryNo: text(data.militaryNo, 30, true),
          nationalId: text(data.nationalId, 14, true), rank: text(data.rank, 80, true),
          company: text(data.company, 100, true), unit: text(data.unit, 100, true),
          phone: text(data.phone || '', 30), address: text(data.address || '', 500),
          details:detailsValue(data.details||{}),
        };
        requireValue(/^\d{14}$/.test(soldier.nationalId) && /^\d{6,30}$/.test(soldier.militaryNo), 'الرقم القومي 14 رقمًا والرقم العسكري من 6 إلى 30 رقمًا');
        const createdSoldier = await store.mutate(context, requestId, { path: url.pathname, ...soldier }, c => store.createSoldier(c, context, soldier));
        session.expires = clock() + 1800000; send(createdSoldier, 201); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/gate') {
        requireValue(uuid.test(data.soldierId || '') && ['exit', 'entry'].includes(data.kind), 'بيانات الحركة غير صحيحة');
        const movement = { soldierId: data.soldierId, kind: data.kind, notes: text(data.notes || '', 1000) };
        if (data.kind === 'exit') {
          movement.reason = text(data.reason, 100, true);
          requireValue(typeof data.expectedReturn === 'string' && Number.isFinite(Date.parse(data.expectedReturn)), 'موعد العودة غير صالح');
          movement.expectedReturn = new Date(data.expectedReturn).toISOString();
        }
        const savedMovement = await store.mutate(context, requestId, { path: url.pathname, ...movement }, c => store.gate(c, context, movement, requestId));
        session.expires = clock() + 1800000; send(savedMovement, 201); return;
      }
      if (req.method === 'POST' && url.pathname === '/api/gate/visitor') {
        requireValue(uuid.test(data.visitorId || '') && ['in', 'out'].includes(data.action), 'بيانات زائر غير صحيحة');
        const movement = {
          visitorId: data.visitorId,
          action: data.action,
          purpose: data.action === 'in' ? text(data.purpose, 500, true) : '',
          notes: text(data.notes || '', 1000),
        };
        const saved = await store.mutate(context, requestId, { path: url.pathname, ...movement }, c => store.gateVisitor(c, context, movement, requestId));
        session.expires = clock() + 1800000; send(saved, 201); return;
      }
      throw new AppError(404, 'الوظيفة غير موجودة');
    } catch (error) {
      const status = error.status || (error.code === '23505' ? 409 : error.code === '23514' ? 400 : 500);
      res.statusCode = status;
      res.end(JSON.stringify({ error: error.status ? error.message : status === 409 ? 'سجل مكرر أو حركة متعارضة؛ حدّث البيانات' :
        status === 400 ? 'القيم لا تحقق شروط العملية' : 'تعذر تنفيذ العملية؛ راجع اتصال الخادم وقاعدة البيانات' }));
      if (status === 500) console.error('API failure', error.code || error.name);
    }
  };
  handler.getActiveRequestCount=()=>active;
  return handler;
}
module.exports = { createHandler };
