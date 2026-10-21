'use strict';
const { randomUUID } = require('node:crypto');
const { requireValue } = require('./errors.cjs');
const { hashPassword, digest } = require('../shared/crypto.cjs');
const { EXIT_REASONS, FITNESS_TYPES } = require('../shared/catalog.cjs');
const { cairoDate,dayStart,nextDay }=require('../shared/time.cjs');
const { DETAIL_FIELD_KEYS, GATE_READABLE_ATTACHMENTS, PHOTO_KINDS } = require('../shared/soldier-profile.cjs');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const value = (v, max = 200, required = false) => {
  requireValue(typeof v === 'string' && v.trim().length <= max && (!required || v.trim()), 'تحقق من الحقول المطلوبة وأطوالها'); return v.trim();
};
function identifier(v) { requireValue(typeof v === 'string' && uuid.test(v), 'معرف غير صالح'); return v; }
function date(v) {
  requireValue(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v, 'تاريخ غير صالح'); return v;
}
function positive(v, max = 100000000) { requireValue(Number.isSafeInteger(v) && v > 0 && v <= max, 'قيمة رقمية غير صالحة'); return v; }
function detailsValue(source={}) {
  requireValue(source && typeof source === 'object' && !Array.isArray(source), 'تفاصيل الملف غير صالحة');
  const details = {};
  for (const key of DETAIL_FIELD_KEYS) {
    details[key] = value(source[key] || '', ['weaponNo', 'cardNo'].includes(key) ? 40 : 200);
    if (['enlistDate', 'dischargeDate', 'unitJoinDate', 'birthDate'].includes(key) && details[key]) date(details[key]);
    if (['height', 'weight'].includes(key) && details[key]) requireValue(Number(details[key]) > 0 && Number(details[key]) < 1000, 'قياس غير صالح');
    if (key === 'age' && details[key]) requireValue(/^\d{1,3}$/.test(details[key]) && Number(details[key]) > 0 && Number(details[key]) < 120, 'عمر غير صالح');
  }
  return details;
}
function image(data, mime) {
  requireValue(typeof data === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(data) && data.length < 7100000, 'المرفق أكبر من 5 ميجابايت أو غير صالح');
  const bytes = Buffer.from(data, 'base64');
  requireValue(bytes.length > 0 && bytes.length <= 5 * 1024 * 1024 && bytes.toString('base64') === data, 'ملف غير صالح');
  const valid = mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) :
    mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    mime === 'application/pdf' ? bytes.subarray(0,5).toString() === '%PDF-' : false;
  requireValue(valid, 'المسموح PNG أو JPEG أو PDF حقيقي فقط'); return bytes;
}
async function lockSoldier(client, id) {
  const row = (await client.query('SELECT * FROM soldiers WHERE id=$1 FOR UPDATE', [identifier(id)])).rows[0];
  requireValue(row, 'العسكري غير موجود', 404); return row;
}
async function activeSoldier(client, id) { const row = await lockSoldier(client, id); requireValue(!row.archived, 'ملف العسكري مؤرشف', 409); return row; }
function requireInternal(context) { requireValue(context.kind === 'internal', 'هذه الوظيفة متاحة للجهاز الداخلي فقط', 403); }
function requireAdmin(context) { requireValue(context.kind === 'internal' && context.user.role === 'admin', 'هذه الوظيفة للمسؤول فقط', 403); }
function requireClerkOrAdmin(context) { requireValue(context.kind === 'internal' && ['admin', 'clerk'].includes(context.user.role), 'هذه الوظيفة للجهاز الداخلي (مسؤول أو كاشير) فقط', 403); }
function internal(context) { requireAdmin(context); }
const DEFAULT_CANTEEN_OUTLET = '00000000-0000-0000-0000-000000000010';

async function listOutlets(pool, { includeDisabled = false } = {}) {
  const rows = (await pool.query('SELECT id,kind,name,disabled,sort_order FROM food_outlets ORDER BY kind,sort_order,name')).rows;
  return includeDisabled ? rows : rows.filter(o => !o.disabled);
}
async function listVisitorCategories(pool, { includeDisabled = false } = {}) {
  const rows = (await pool.query('SELECT id,name,tier,disabled,sort_order FROM visitor_categories ORDER BY sort_order,name')).rows;
  return includeDisabled ? rows : rows.filter(c => !c.disabled);
}
async function nextVisitorBadge(client) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const badge = `Z${String(Math.floor(Math.random() * 900000) + 100000)}`;
    if (!(await client.query('SELECT 1 FROM visitors WHERE badge_no=$1', [badge])).rows[0]) return badge;
  }
  requireValue(false, 'تعذر إنشاء رقم بطاقة الزائر');
}

async function assertOutlet(client, outletId, kind) {
  const row = (await client.query('SELECT id,kind,disabled FROM food_outlets WHERE id=$1', [identifier(outletId)])).rows[0];
  requireValue(row && !row.disabled && row.kind === kind, 'نقطة البيع غير متاحة', 404);
  return row;
}

async function handleModules({ req, url, data, context, store, requestId }) {
  const route = url.pathname; const get = req.method === 'GET';
  if (get && route === '/api/catalog') {
    const settings = (await store.pool.query('SELECT data,version FROM settings WHERE id=1')).rows[0];
    const outlets = await listOutlets(store.pool);
    const adminOutlets = context.kind === 'internal' && context.user.role === 'admin'
      ? await listOutlets(store.pool, { includeDisabled: true }) : null;
    const visitorCategories = await listVisitorCategories(store.pool);
    const visitorCategoriesAll = context.kind === 'internal' && context.user.role === 'admin'
      ? await listVisitorCategories(store.pool, { includeDisabled: true }) : null;
    const { mergeBackupPolicy } = require('./backup.cjs');
    const { catalogForClient } = require('../shared/reports.cjs');
    const backupPolicy = mergeBackupPolicy(settings.data);
    return { body: { exitReasons: [...EXIT_REASONS, ...settings.data.extraReasons], fitnessTypes: FITNESS_TYPES,
      reports: catalogForClient(context.user.role),
      outlets: { canteen: outlets.filter(o => o.kind === 'canteen'), buffet: outlets.filter(o => o.kind === 'buffet') },
      outletsAll: adminOutlets,
      visitorCategories,
      visitorCategoriesAll,
      settings: context.kind === 'internal' && context.user.role === 'admin' ? { ...settings.data, ...backupPolicy, version: settings.version } : { unitName: settings.data.unitName, parentFormation: settings.data.parentFormation,logo: settings.data.showLogo ? settings.data.logo : null,showLogo:settings.data.showLogo,paper:settings.data.paper,margins:settings.data.margins } } };
  }
  if (get && route === '/api/attachment') {
    const attachment = (await store.pool.query('SELECT * FROM attachments WHERE id=$1', [identifier(url.searchParams.get('id'))])).rows[0];
    requireValue(attachment, 'المرفق غير موجود', 404);
    if (!GATE_READABLE_ATTACHMENTS.includes(attachment.kind)) internal(context);
    return { body: attachment };
  }
  if (get && route === '/api/photos') {
    return { body: { photos: (await store.pool.query("SELECT id,soldier_id,mime FROM attachments WHERE soldier_id=$1 AND kind='photo' ORDER BY created_at DESC", [identifier(url.searchParams.get('soldierId'))])).rows } };
  }
  if (get && route === '/api/gate/soldier') {
    requireValue(context.kind === 'gate' || (context.kind === 'internal' && ['gate', 'admin'].includes(context.user.role)), 'محطة البوابة فقط', 403);
    const militaryNo = value(url.searchParams.get('militaryNo'), 30, true);
    requireValue(/^\d{6,30}$/.test(militaryNo), 'الرقم العسكري غير صالح');
    const soldier = (await store.pool.query(
      'SELECT id,military_no,name,rank,company,unit,phone,address,status,details FROM soldiers WHERE military_no=$1 AND archived=false',
      [militaryNo],
    )).rows[0];
    requireValue(soldier, 'لا يوجد عسكري بهذا الرقم', 404);
    const photos = (await store.pool.query(
      "SELECT DISTINCT ON (kind) id, kind, mime FROM attachments WHERE soldier_id=$1 AND kind IN ('photo','idPhoto','carnetFront','carnetBack') ORDER BY kind, created_at DESC",
      [soldier.id],
    )).rows;
    return { body: { soldier, photos } };
  }
  if (get && route === '/api/gate/visitor') {
    requireValue(context.kind === 'gate' || (context.kind === 'internal' && ['gate', 'admin'].includes(context.user.role)), 'محطة البوابة فقط', 403);
    const idParam = url.searchParams.get('id');
    const badge = url.searchParams.get('badge');
    let visitor;
    if (idParam) {
      visitor = (await store.pool.query(
        `SELECT v.id,v.name,v.badge_no,v.phone,v.national_id,v.organization,v.notes,v.disabled,
          c.id AS category_id,c.name AS category_name,c.tier AS category_tier,c.disabled AS category_disabled
         FROM visitors v JOIN visitor_categories c ON c.id=v.category_id WHERE v.id=$1`,
        [identifier(idParam)],
      )).rows[0];
    } else {
      const badgeNo = value(badge || '', 20, true);
      visitor = (await store.pool.query(
        `SELECT v.id,v.name,v.badge_no,v.phone,v.national_id,v.organization,v.notes,v.disabled,
          c.id AS category_id,c.name AS category_name,c.tier AS category_tier,c.disabled AS category_disabled
         FROM visitors v JOIN visitor_categories c ON c.id=v.category_id WHERE v.badge_no=$1`,
        [badgeNo],
      )).rows[0];
    }
    requireValue(visitor && !visitor.disabled, 'لا يوجد زائر بهذا الرمز', 404);
    requireValue(!visitor.category_disabled, 'فئة الزائر معطلة', 409);
    const openVisit = (await store.pool.query(
      'SELECT id,purpose,check_in FROM visitor_visits WHERE visitor_id=$1 AND check_out IS NULL AND NOT voided ORDER BY check_in DESC LIMIT 1',
      [visitor.id],
    )).rows[0] || null;
    return { body: { visitor, openVisit } };
  }
  if(get&&route==='/api/permit') {
    const row=(await store.pool.query('SELECT p.id,p.no,p.reason,p.exit_at,p.expected_return,p.returned_at,p.voided,s.name,s.military_no,s.rank,s.company FROM permits p JOIN soldiers s ON s.id=p.soldier_id WHERE p.id=$1',[identifier(url.searchParams.get('id'))])).rows[0];requireValue(row,'التصريح غير موجود',404);return {body:row};
  }
  if (get && route === '/api/canteen/transaction') {
    requireClerkOrAdmin(context);
    const id = identifier(url.searchParams.get('id'));
    const row = (await store.pool.query(`SELECT t.id,t.at,t.amount_cents,t.notes,t.reversal_of,r.id AS reversed_by,
      s.name,s.military_no,s.rank,s.company,s.unit,u.name AS cashier,o.name AS outlet_name,o.kind AS outlet_kind
      FROM canteen_transactions t JOIN soldiers s ON s.id=t.soldier_id JOIN food_outlets o ON o.id=t.outlet_id
      LEFT JOIN users u ON u.id=t.created_by LEFT JOIN canteen_transactions r ON r.reversal_of=t.id WHERE t.id=$1`, [id])).rows[0];
    requireValue(row, 'عملية غير موجودة', 404);
    return { body: row };
  }
  if (get && route === '/api/reports/daily') {
    requireAdmin(context);
    const { buildDailyReport } = require('./daily-report.cjs');
    return { body: await buildDailyReport(store, date(url.searchParams.get('date') || cairoDate())) };
  }
  if (get && route === '/api/reports') {
    requireClerkOrAdmin(context);
    if (context.user.role === 'clerk') requireValue(['canteen', 'buffet'].includes(url.searchParams.get('type')), 'كاشير الكانتين يمكنه تقارير الكانتين والبوفيه فقط', 403);
    return { body: await report(store, url) };
  }
  const known = ['/api/soldier','/api/soldier/update','/api/soldier/archive','/api/attachments','/api/canteen','/api/canteen/reverse','/api/outlets','/api/outlets/update','/api/fitness','/api/settings','/api/users/update','/api/gate/correct','/api/reports','/api/audit','/api/visitors','/api/visitors/update','/api/visitor-categories','/api/visitor-categories/update'];
  if (!known.includes(route)) return null;
  if (get && route === '/api/visitors') {
    requireAdmin(context);
    const q = value(url.searchParams.get('q') || '', 100);
    const rows = (await store.pool.query(
      `SELECT v.id,v.name,v.badge_no,v.phone,v.organization,v.disabled,c.name AS category_name,c.tier AS category_tier
       FROM visitors v JOIN visitor_categories c ON c.id=v.category_id
       WHERE ($1='' OR v.name ILIKE $2 OR v.badge_no ILIKE $2 OR v.organization ILIKE $2)
       ORDER BY v.name LIMIT 500`,
      [q, `%${q}%`],
    )).rows;
    return { body: { visitors: rows } };
  }
  if (get && route === '/api/soldier') {
    requireClerkOrAdmin(context);
    const id = identifier(url.searchParams.get('id'));
    if (context.user.role === 'clerk') {
      const soldier = (await store.pool.query('SELECT id,military_no,name,rank,company,unit,status,version FROM soldiers WHERE id=$1', [id])).rows[0];
      requireValue(soldier, 'العسكري غير موجود', 404);
      return { body: { soldier, attachments: [] } };
    }
    requireAdmin(context);
    const soldier = (await store.pool.query('SELECT * FROM soldiers WHERE id=$1', [id])).rows[0];
    requireValue(soldier, 'العسكري غير موجود', 404);
    const attachments = (await store.pool.query('SELECT id,name,mime,kind,size,created_at FROM attachments WHERE soldier_id=$1 ORDER BY created_at DESC', [soldier.id])).rows;
    return { body: { soldier, attachments } };
  }
  if (get && route === '/api/canteen') {
    requireClerkOrAdmin(context);
    const id = identifier(url.searchParams.get('soldierId')); const month = value(url.searchParams.get('month') || cairoDate().slice(0,7), 7, true);
    const outletId = identifier(url.searchParams.get('outletId') || DEFAULT_CANTEEN_OUTLET);
    requireValue(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'الشهر غير صالح');
    const outlet = (await store.pool.query('SELECT id,kind,disabled FROM food_outlets WHERE id=$1', [outletId])).rows[0];
    requireValue(outlet && !outlet.disabled, 'نقطة البيع غير متاحة', 404);
    const [y,m] = month.split('-').map(Number); const end = `${m === 12 ? y+1 : y}-${String(m === 12 ? 1 : m+1).padStart(2,'0')}-01`;
    const rows = (await store.pool.query(`SELECT t.*,r.id AS reversed_by FROM canteen_transactions t LEFT JOIN canteen_transactions r ON r.reversal_of=t.id
      WHERE t.soldier_id=$1 AND t.outlet_id=$2 AND t.at >= $3 AND t.at < $4 ORDER BY t.at DESC,t.id`, [id, outletId, dayStart(`${month}-01`), dayStart(end)])).rows;
    return { body: { transactions: rows.map(({ created_by, ...r }) => r), totalCents: rows.reduce((sum, r) => sum + r.amount_cents, 0), month, outletId } };
  }
  if (get && route === '/api/fitness') {
    requireAdmin(context);
    return { body: { records: (await store.pool.query('SELECT id,soldier_id,type,value,unit,date,notes,raw_result FROM fitness_records WHERE soldier_id=$1 ORDER BY date DESC', [identifier(url.searchParams.get('soldierId'))])).rows } };
  }
  if (get && route === '/api/audit') {
    requireAdmin(context);
    return { body: { rows: (await store.pool.query('SELECT a.*,u.name AS username FROM audit_log a JOIN users u ON u.id=a.user_id ORDER BY a.at DESC LIMIT 500')).rows } };
  }
  requireValue(!get && req.method === 'POST' && uuid.test(requestId || ''), 'معرف العملية مطلوب');
  const safe = { ...data }; delete safe.password;
  if (data.password) safe.credentialDigest = digest(data.password);
  const body = await store.mutate(context, requestId, { route, ...safe }, async client => {
    let row;
    if (route === '/api/soldier/update') {
      requireAdmin(context);
      const old = await lockSoldier(client, data.id); positive(data.version);
      requireValue(old.version === data.version, 'تم تعديل الملف من جهاز آخر؛ أعد فتحه', 409);
      const militaryNo = value(data.militaryNo,30,true), nationalId = value(data.nationalId,14,true);
      requireValue(/^\d{6,30}$/.test(militaryNo) && /^\d{14}$/.test(nationalId), 'الأرقام غير صحيحة');
      const details = detailsValue(data.details);
      row = (await client.query(`UPDATE soldiers SET name=$2,military_no=$3,national_id=$4,rank=$5,company=$6,unit=$7,phone=$8,address=$9,details=$10,version=version+1 WHERE id=$1 RETURNING *`,
        [old.id,value(data.name,200,true),militaryNo,nationalId,value(data.rank,80,true),value(data.company,100,true),value(data.unit,100,true),value(data.phone||'',30),value(data.address||'',500),JSON.stringify(details)])).rows[0];
    } else if (route === '/api/soldier/archive') {
      requireAdmin(context);
      const old = await lockSoldier(client,data.id); requireValue(typeof data.archived === 'boolean' && old.version === data.version, 'الملف تغير؛ أعد فتحه',409);
      requireValue(old.status === 'in' || !data.archived,'أعد العسكري إلى الوحدة قبل أرشفة الملف',409);
      row = (await client.query('UPDATE soldiers SET archived=$2,version=version+1 WHERE id=$1 RETURNING id,archived,version',[old.id,data.archived])).rows[0];
    } else if (route === '/api/attachments') {
      requireAdmin(context);
      await activeSoldier(client,data.soldierId); requireValue(['photo','idPhoto','tagPhoto','carnetFront','carnetBack','document'].includes(data.kind),'نوع المرفق غير صالح');
      const bytes = image(data.content,data.mime); requireValue(data.kind==='document' || data.mime.startsWith('image/'),'الصورة يجب أن تكون PNG أو JPEG');
      await client.query('DELETE FROM attachments WHERE soldier_id=$1 AND kind=$2', [data.soldierId, data.kind]);
      row = (await client.query('INSERT INTO attachments(id,soldier_id,kind,name,mime,content,sha256,size) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,soldier_id,kind,name,mime,size',
        [randomUUID(),data.soldierId,data.kind,value(data.name,200,true),data.mime,data.content,digest(bytes),bytes.length])).rows[0];
    } else if (route === '/api/visitors') {
      requireAdmin(context);
      const categoryId = identifier(data.categoryId);
      const category = (await client.query('SELECT id,disabled FROM visitor_categories WHERE id=$1', [categoryId])).rows[0];
      requireValue(category && !category.disabled, 'فئة الزائر غير متاحة', 404);
      const badge = data.badgeNo ? value(data.badgeNo, 20, true) : await nextVisitorBadge(client);
      row = (await client.query(
        `INSERT INTO visitors(id,name,category_id,badge_no,phone,national_id,organization,notes)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,name,badge_no,category_id,phone,organization,disabled`,
        [randomUUID(), value(data.name, 200, true), categoryId, badge, value(data.phone || '', 30),
          value(data.nationalId || '', 14), value(data.organization || '', 200), value(data.notes || '', 1000)],
      )).rows[0];
    } else if (route === '/api/visitors/update') {
      requireAdmin(context);
      const id = identifier(data.id);
      const current = (await client.query('SELECT * FROM visitors WHERE id=$1 FOR UPDATE', [id])).rows[0];
      requireValue(current, 'الزائر غير موجود', 404);
      const categoryId = data.categoryId != null ? identifier(data.categoryId) : current.category_id;
      const category = (await client.query('SELECT id,disabled FROM visitor_categories WHERE id=$1', [categoryId])).rows[0];
      requireValue(category && !category.disabled, 'فئة الزائر غير متاحة', 404);
      const disabled = typeof data.disabled === 'boolean' ? data.disabled : current.disabled;
      row = (await client.query(
        `UPDATE visitors SET name=$2,category_id=$3,phone=$4,national_id=$5,organization=$6,notes=$7,disabled=$8
         WHERE id=$1 RETURNING id,name,badge_no,category_id,phone,organization,disabled`,
        [id, data.name != null ? value(data.name, 200, true) : current.name, categoryId,
          data.phone != null ? value(data.phone, 30) : current.phone,
          data.nationalId != null ? value(data.nationalId, 14) : current.national_id,
          data.organization != null ? value(data.organization, 200) : current.organization,
          data.notes != null ? value(data.notes, 1000) : current.notes, disabled],
      )).rows[0];
    } else if (route === '/api/visitor-categories') {
      requireAdmin(context);
      requireValue(['normal', 'special', 'admin'].includes(data.tier), 'نوع الفئة غير صالح');
      const name = value(data.name, 80, true);
      row = (await client.query(
        'INSERT INTO visitor_categories(id,name,tier,sort_order) VALUES($1,$2,$3,$4) RETURNING id,name,tier,disabled,sort_order',
        [randomUUID(), name, data.tier, Number.isFinite(data.sortOrder) ? data.sortOrder : 0],
      )).rows[0];
    } else if (route === '/api/visitor-categories/update') {
      requireAdmin(context);
      const id = identifier(data.id);
      const current = (await client.query('SELECT * FROM visitor_categories WHERE id=$1 FOR UPDATE', [id])).rows[0];
      requireValue(current, 'الفئة غير موجودة', 404);
      const disabled = typeof data.disabled === 'boolean' ? data.disabled : current.disabled;
      if (disabled && !current.disabled) {
        const others = (await client.query('SELECT COUNT(*)::int AS n FROM visitor_categories WHERE NOT disabled AND id<>$1', [id])).rows[0].n;
        requireValue(others >= 1, 'يجب أن تبقى فئة زائر واحدة نشطة على الأقل', 409);
      }
      const tier = data.tier != null ? data.tier : current.tier;
      requireValue(['normal', 'special', 'admin'].includes(tier), 'نوع الفئة غير صالح');
      row = (await client.query(
        'UPDATE visitor_categories SET name=$2,tier=$3,disabled=$4 WHERE id=$1 RETURNING id,name,tier,disabled,sort_order',
        [id, data.name != null ? value(data.name, 80, true) : current.name, tier, disabled],
      )).rows[0];
    } else if (route === '/api/outlets') {
      requireAdmin(context);
      requireValue(['canteen', 'buffet'].includes(data.kind), 'نوع نقطة البيع غير صالح');
      const name = value(data.name, 80, true);
      const kind = data.kind;
      row = (await client.query('INSERT INTO food_outlets(id,kind,name,sort_order) VALUES($1,$2,$3,$4) RETURNING id,kind,name,disabled,sort_order',
        [randomUUID(), kind, name, Number.isFinite(data.sortOrder) ? data.sortOrder : 0])).rows[0];
    } else if (route === '/api/outlets/update') {
      requireAdmin(context);
      const id = identifier(data.id);
      const current = (await client.query('SELECT * FROM food_outlets WHERE id=$1 FOR UPDATE', [id])).rows[0];
      requireValue(current, 'نقطة البيع غير موجودة', 404);
      const name = data.name != null ? value(data.name, 80, true) : current.name;
      const disabled = typeof data.disabled === 'boolean' ? data.disabled : current.disabled;
      if (disabled && !current.disabled) {
        const others = (await client.query('SELECT COUNT(*)::int AS n FROM food_outlets WHERE kind=$1 AND NOT disabled AND id<>$2', [current.kind, id])).rows[0].n;
        const label = current.kind === 'buffet' ? 'بوفيه' : 'كانتين';
        requireValue(others >= 1, `يجب أن يبقى ${label} واحد نشط على الأقل`, 409);
      }
      row = (await client.query('UPDATE food_outlets SET name=$2,disabled=$3 WHERE id=$1 RETURNING id,kind,name,disabled,sort_order',
        [id, name, disabled])).rows[0];
    } else if (route === '/api/canteen') {
      requireClerkOrAdmin(context);
      await activeSoldier(client, data.soldierId);
      const cents = positive(data.amountCents);
      const outletId = identifier(data.outletId || DEFAULT_CANTEEN_OUTLET);
      const outlet = (await client.query('SELECT kind,disabled FROM food_outlets WHERE id=$1', [outletId])).rows[0];
      requireValue(outlet && !outlet.disabled, 'نقطة البيع غير متاحة', 404);
      row = (await client.query('INSERT INTO canteen_transactions(id,soldier_id,outlet_id,amount_cents,notes,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,soldier_id,outlet_id,amount_cents,at',
        [randomUUID(), data.soldierId, outletId, cents, value(data.notes || '', 1000), context.user.id])).rows[0];
    } else if (route === '/api/canteen/reverse') {
      requireClerkOrAdmin(context);
      const original=(await client.query('SELECT * FROM canteen_transactions WHERE id=$1 FOR UPDATE',[identifier(data.id)])).rows[0];
      requireValue(original && original.amount_cents>0 && !original.reversal_of,'لا يمكن عكس هذه العملية',409);
      row=(await client.query('INSERT INTO canteen_transactions(id,soldier_id,outlet_id,amount_cents,reversal_of,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,amount_cents,reversal_of',
        [randomUUID(),original.soldier_id,original.outlet_id,-original.amount_cents,original.id,value(data.reason,1000,true),context.user.id])).rows[0];
    } else if (route === '/api/fitness') {
      requireAdmin(context);
      await activeSoldier(client,data.soldierId); requireValue(Object.hasOwn(FITNESS_TYPES,data.type) && typeof data.value==='number' && Number.isFinite(data.value) && data.value>=0 && data.value<=100000,'نتيجة غير صالحة');
      row=(await client.query('INSERT INTO fitness_records(id,soldier_id,type,value,unit,date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,type,value,unit,date',
        [randomUUID(),data.soldierId,data.type,data.value,FITNESS_TYPES[data.type],date(data.date),value(data.notes||'',1000),context.user.id])).rows[0];
    } else if (route === '/api/settings') {
      requireAdmin(context);
      const current=(await client.query('SELECT * FROM settings WHERE id=1 FOR UPDATE')).rows[0];
      requireValue(current.version===data.version,'الإعدادات تغيرت؛ حدّث الصفحة',409);
      requireValue(Array.isArray(data.extraReasons) && data.extraReasons.length<=2,'يسمح بسببين إضافيين فقط');
      const reasons=data.extraReasons.map(r=>value(r,40,true)); requireValue(new Set([...EXIT_REASONS,...reasons]).size===EXIT_REASONS.length+reasons.length,'سبب خروج مكرر');
      requireValue(['A4','A5'].includes(data.paper) && ['normal','narrow'].includes(data.margins),'إعدادات طباعة غير صالحة');
      let logo = data.logo || null;
      if (logo) { requireValue(typeof logo==='string' && /^data:image\/(png|jpeg);base64,/.test(logo),'شعار غير صالح'); const [header,content]=logo.split(','); image(content,header.slice(5,header.indexOf(';'))); }
      const { parseBackupPolicyFields } = require('./backup.cjs');
      const backupPolicy=parseBackupPolicyFields(data);
      const settings={unitName:value(data.unitName,100,true),parentFormation:value(data.parentFormation||'',100),extraReasons:reasons,paper:data.paper,margins:data.margins,printer:value(data.printer||'',200),showLogo:Boolean(data.showLogo),logo,...backupPolicy};
      row=(await client.query('UPDATE settings SET data=$1,version=version+1 WHERE id=1 RETURNING id,version',[JSON.stringify(settings)])).rows[0];
    } else if (route === '/api/users/update') {
      requireAdmin(context);
      identifier(data.id); requireValue(['admin','gate','clerk'].includes(data.role) && typeof data.disabled==='boolean','بيانات الحساب غير صالحة');
      await client.query('SELECT pg_advisory_xact_lock(728303)');
      const target=(await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[data.id])).rows[0]; requireValue(target,'المستخدم غير موجود',404);
      if (target.role==='admin' && !target.disabled && (data.role!=='admin' || data.disabled)) {
        const admins=(await client.query("SELECT id FROM users WHERE role='admin' AND disabled=false")).rows;
        requireValue(admins.length>1 && data.id!==context.user.id,'لا يمكن تعطيل حسابك أو آخر مسؤول',409);
      }
      let passwordHash=target.password_hash;
      if (data.password) { requireValue(typeof data.password==='string' && data.password.length>=12 && data.password.length<=256,'كلمة المرور من 12 إلى 256 حرفًا'); passwordHash=await hashPassword(data.password); }
      row=(await client.query('UPDATE users SET name=$2,role=$3,disabled=$4,password_hash=$5,auth_version=auth_version+1 WHERE id=$1 RETURNING id,name,role,disabled',
        [target.id,value(data.name,200,true),data.role,data.disabled,passwordHash])).rows[0];
    } else if (route === '/api/gate/correct') {
      requireAdmin(context);
      const event=(await client.query('SELECT * FROM gate_events WHERE id=$1',[identifier(data.eventId)])).rows[0]; requireValue(event,'الحركة غير موجودة',404);
      const soldier=await lockSoldier(client,event.soldier_id);
      const last=(await client.query('SELECT id FROM gate_events WHERE soldier_id=$1 ORDER BY at DESC,sequence DESC LIMIT 1',[soldier.id])).rows[0];
      requireValue(last.id===event.id && !(await client.query('SELECT id FROM gate_corrections WHERE event_id=$1',[event.id])).rows.length,'يمكن عكس أحدث حركة غير مصححة فقط',409);
      const permit=(await client.query('SELECT * FROM permits WHERE id=$1 FOR UPDATE',[event.permit_id])).rows[0];
      const before={status:soldier.status,permit};
      if (event.kind==='exit') {
        requireValue(!permit.returned_at && !permit.voided,'التصريح مغلق',409); await client.query('UPDATE permits SET voided=true WHERE id=$1',[permit.id]);
      } else {
        requireValue(permit.returned_at && !permit.voided,'حركة العودة غير قابلة للعكس',409); await client.query('UPDATE permits SET returned_at=NULL WHERE id=$1',[permit.id]);
      }
      const status=event.kind==='exit'?'in':'out'; await client.query('UPDATE soldiers SET status=$2,version=version+1 WHERE id=$1',[soldier.id,status]);
      row=(await client.query('INSERT INTO gate_corrections(id,event_id,reason,before_state,after_state,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,event_id',
        [randomUUID(),event.id,value(data.reason,1000,true),JSON.stringify(before),JSON.stringify({status}),context.user.id])).rows[0];
    } else requireValue(false,'وظيفة غير معروفة',404);
    await store.audit(client,context,route.slice(5).replaceAll('/','.'),route==='/api/settings'?'00000000-0000-0000-0000-000000000001':row.id); return row;
  });
  return { body, status:201 };
}
async function report(store,url) {
  const { REPORT_IDS, summarizeReport } = require('../shared/reports.cjs');
  const type=url.searchParams.get('type')||'soldiers';
  requireValue(REPORT_IDS.includes(type),'نوع تقرير غير صالح');
  const from=date(url.searchParams.get('from')||cairoDate());
  const to=date(url.searchParams.get('to')||from); requireValue(from<=to,'بداية الفترة بعد نهايتها');
  const q=value(url.searchParams.get('q')||'',100); const company=value(url.searchParams.get('company')||'',100);
  let sql,params;
  const filter=`(s.name ILIKE $3 OR s.military_no ILIKE $3) AND ($4='' OR s.company=$4)`;
  const range=` >= $1`;
  const end=` < $2`;
  if (type==='soldiers') {
    sql=`SELECT s.* FROM soldiers s WHERE (s.name ILIKE $1 OR s.military_no ILIKE $1) AND ($2='' OR s.company=$2) ORDER BY s.name`; params=[`%${q}%`,company];
  } else if (type==='gate') {
    sql=`SELECT e.id,e.kind,e.at,s.name,s.military_no,s.company,p.no,p.reason,p.expected_return,p.returned_at,p.voided,c.reason AS correction_reason FROM gate_events e JOIN soldiers s ON s.id=e.soldier_id JOIN permits p ON p.id=e.permit_id LEFT JOIN gate_corrections c ON c.event_id=e.id WHERE e.at${range} AND e.at${end} AND ${filter} ORDER BY e.at DESC,e.sequence DESC`; params=[dayStart(from),dayStart(nextDay(to)),`%${q}%`,company];
  } else if (type==='canteen' || type==='buffet') {
    const outletKind = type === 'buffet' ? 'buffet' : 'canteen';
    const outletFilter = url.searchParams.get('outletId');
    let outletClause = `o.kind='${outletKind}'`;
    params = [dayStart(from), dayStart(nextDay(to)), `%${q}%`, company];
    if (outletFilter) {
      outletClause += ' AND t.outlet_id=$5';
      params.push(identifier(outletFilter));
    }
    sql = `SELECT t.id,t.at,t.amount_cents,t.reversal_of,t.notes,o.name AS outlet_name,s.name,s.military_no,s.company
      FROM canteen_transactions t JOIN soldiers s ON s.id=t.soldier_id JOIN food_outlets o ON o.id=t.outlet_id
      WHERE ${outletClause} AND t.at${range} AND t.at${end} AND ${filter} ORDER BY t.at DESC`;
  } else if (type==='fitness') {
    sql=`SELECT f.id,f.date,f.type,f.value,f.unit,f.notes,f.raw_result,s.name,s.military_no,s.company FROM fitness_records f JOIN soldiers s ON s.id=f.soldier_id WHERE f.date >= $1 AND f.date <= $2 AND ${filter} ORDER BY f.date DESC`; params=[from,to,`%${q}%`,company];
  } else if (type === 'visitor') {
    sql = `SELECT vv.id,vv.check_in AS at,vv.check_out,vv.purpose,vv.entry_notes,v.name,v.badge_no,v.organization,c.name AS category_name,c.tier AS category_tier
      FROM visitor_visits vv JOIN visitors v ON v.id=vv.visitor_id JOIN visitor_categories c ON c.id=v.category_id
      WHERE vv.check_in >= $1 AND vv.check_in < $2 AND NOT vv.voided
      AND ($3='' OR v.name ILIKE $3 OR v.badge_no ILIKE $3 OR v.organization ILIKE $3 OR vv.purpose ILIKE $3)
      ORDER BY vv.check_in DESC`;
    params = [dayStart(from), dayStart(nextDay(to)), q ? `%${q}%` : ''];
  } else requireValue(false,'نوع تقرير غير صالح');
  const rows=(await store.pool.query(`${sql} LIMIT 10001`,params)).rows;
  requireValue(rows.length<=10000,'التقرير يتجاوز 10000 سجل؛ ضيق الفترة أو البحث',413);
  const summary=summarizeReport(type,rows);
  const totalCents=summary.totalCents!=null?summary.totalCents:(['canteen','buffet'].includes(type)?rows.reduce((s,r)=>s+r.amount_cents,0):null);
  return { type, from, to, rows, summary, totalCents };
}
module.exports={handleModules,image,date,internal,requireAdmin,requireClerkOrAdmin,requireInternal,detailsValue};
