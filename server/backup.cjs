'use strict';
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto'); const zlib=require('node:zlib');
const {requireValue}=require('./errors.cjs');
const COLUMNS={
  users:['id','username','name','password_hash','role','disabled','auth_version'],
  soldiers:['id','military_no','national_id','name','rank','company','unit','phone','address','status','version','created_at','archived','details'],
  permits:['id','no','soldier_id','reason','exit_at','expected_return','returned_at','notes','entry_notes','created_by','voided'],
  gate_events:['id','permit_id','soldier_id','kind','at','user_id','device_id','request_id','sequence'],
  audit_log:['id','user_id','device_id','action','entity_id','at'],
  requests:['id','user_id','device_id','body_hash','response','created_at'],
  attachments:['id','soldier_id','kind','name','mime','content','sha256','size','created_at'],
  food_outlets:['id','kind','name','disabled','sort_order','created_at'],
  canteen_transactions:['id','soldier_id','outlet_id','amount_cents','reversal_of','notes','at','created_by'],
  fitness_records:['id','soldier_id','type','value','unit','date','notes','created_by','raw_result'],
  gate_corrections:['id','event_id','reason','before_state','after_state','at','created_by'],
  settings:['id','version','data'],
  legacy_imports:['id','sha256','at','created_by'],
  visitor_categories:['id','name','tier','sort_order','disabled'],
  visitors:['id','name','category_id','badge_no','phone','national_id','organization','notes','disabled','created_at'],
  visitor_visits:['id','visitor_id','purpose','check_in','check_out','entry_notes','created_by','device_id','request_id','voided'],
};
const JSON_COLUMNS=new Set(['details','response','before_state','after_state','data']);
const MAX=32*1024*1024;
const BACKUP_INTERVAL_HOURS=[6,12,24,48];
const BACKUP_POLICY_DEFAULTS={autoBackup:true,autoBackupIntervalHours:24,backupRetentionDays:30};
function mergeBackupPolicy(data){
  const d=data&&typeof data==='object'?data:{};
  let hours=Number(d.autoBackupIntervalHours);
  if(!BACKUP_INTERVAL_HOURS.includes(hours))hours=BACKUP_POLICY_DEFAULTS.autoBackupIntervalHours;
  let retention=Number(d.backupRetentionDays);
  if(!Number.isInteger(retention)||retention<7||retention>365)retention=BACKUP_POLICY_DEFAULTS.backupRetentionDays;
  return {autoBackup:d.autoBackup!==false,autoBackupIntervalHours:hours,backupRetentionDays:retention};
}
function parseBackupPolicyFields(data){
  requireValue(typeof data.autoBackup==='boolean','خيار النسخ التلقائي غير صالح');
  const hours=Number(data.autoBackupIntervalHours);
  requireValue(BACKUP_INTERVAL_HOURS.includes(hours),'فترة النسخ التلقائي: 6 أو 12 أو 24 أو 48 ساعة');
  const retention=Number(data.backupRetentionDays);
  requireValue(Number.isInteger(retention)&&retention>=7&&retention<=365,'احتفاظ النسخ من 7 إلى 365 يومًا');
  return {autoBackup:data.autoBackup,autoBackupIntervalHours:hours,backupRetentionDays:retention};
}
function seal(snapshot,key,serverId) {
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from(`military-backup-v1:${serverId}`));
  const encrypted=Buffer.concat([cipher.update(zlib.gzipSync(Buffer.from(JSON.stringify(snapshot)))),cipher.final()]);
  requireValue(encrypted.length<MAX,'النسخة تتجاوز الحد المسموح؛ استخدم نسخ PostgreSQL التشغيلية',413);
  return {version:1,serverId,createdAt:new Date().toISOString(),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),content:encrypted.toString('base64')};
}
function open(envelope,key,serverId) {
  requireValue(envelope?.version===1&&envelope.serverId===serverId&&typeof envelope.content==='string'&&envelope.content.length<MAX*1.4,'نسخة غير صالحة أو لا تخص المنشأة');
  try {
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'base64'));
    decipher.setAAD(Buffer.from(`military-backup-v1:${serverId}`));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
    const compressed=Buffer.concat([decipher.update(Buffer.from(envelope.content,'base64')),decipher.final()]);
    const snapshot=JSON.parse(zlib.gunzipSync(compressed,{maxOutputLength:128*1024*1024}).toString('utf8'));
    validateSnapshot(snapshot);return snapshot;
  }catch(error){if(error.status)throw error;requireValue(false,'تعذر التحقق من النسخة؛ الملف تالف أو مفتاح التشفير مختلف');}
}
function validateSnapshot(snapshot) {
  requireValue(snapshot?.schema===3&&snapshot.tables&&Object.keys(snapshot.tables).length===Object.keys(COLUMNS).length,'إصدار النسخة غير مدعوم');
  for(const [table,columns] of Object.entries(COLUMNS)) {
    const rows=snapshot.tables[table];requireValue(Array.isArray(rows)&&rows.length<=1000000,'جدول غير صالح في النسخة');
    for(const row of rows)requireValue(row&&Object.keys(row).length===columns.length&&columns.every(col=>Object.hasOwn(row,col)),'أعمدة النسخة لا تطابق الإصدار');
  }
  requireValue(snapshot.tables.users.some(u=>u.role==='admin'&&!u.disabled),'النسخة لا تحتوي مسؤولًا نشطًا');
  const ids=new Set(snapshot.tables.soldiers.map(s=>s.id));
  const counts=new Map();for(const p of snapshot.tables.permits)if(!p.returned_at&&!p.voided)counts.set(p.soldier_id,(counts.get(p.soldier_id)||0)+1);
  for(const s of snapshot.tables.soldiers){const active=counts.get(s.id)||0;
    requireValue(active<2&&(s.status==='out')===(active===1),'حالة الأفراد والتصاريح في النسخة غير متسقة');}
  for(const p of snapshot.tables.permits)requireValue(ids.has(p.soldier_id),'تصريح يتيم في النسخة');
}
class BackupManager {
  constructor({store,key,serverId,directory,retentionDays=30}) {
    requireValue(typeof key==='string'&&/^[0-9a-f]{64}$/i.test(key),'اضبط BACKUP_KEY_HEX كمفتاح عشوائي من 64 حرفًا سداسيًا');
    requireValue(Number.isInteger(retentionDays)&&retentionDays>=7&&retentionDays<=365,'احتفاظ النسخ من 7 إلى 365 يومًا');
    this.store=store;this.key=Buffer.from(key,'hex');this.serverId=serverId;this.retentionDays=retentionDays;this.directory=path.resolve(directory);fs.mkdirSync(this.directory,{recursive:true});
  }
  filename(id){requireValue(typeof id==='string'&&/^[0-9a-f-]{36}\.mab$/.test(id),'اسم نسخة غير صالح');return path.join(this.directory,id);}
  write(envelope){const id=`${crypto.randomUUID()}.mab`;fs.writeFileSync(this.filename(id),JSON.stringify(envelope),{flag:'wx',mode:0o600});return id;}
  list(){return fs.readdirSync(this.directory).filter(n=>/^[0-9a-f-]{36}\.mab$/.test(n)).map(id=>({id,createdAt:fs.statSync(this.filename(id)).mtime.toISOString(),size:fs.statSync(this.filename(id)).size})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  read(id){const file=this.filename(id);requireValue(fs.existsSync(file),'النسخة غير موجودة',404);requireValue(fs.statSync(file).size<48*1024*1024,'نسخة أكبر من الحد');return JSON.parse(fs.readFileSync(file,'utf8'));}
  async snapshot(client){const tables={};for(const table of Object.keys(COLUMNS))tables[table]=(await client.query(`SELECT ${COLUMNS[table].join(',')} FROM ${table}`)).rows;return {schema:3,tables};}
  async create(){const client=await this.store.pool.connect();try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');const snapshot=await this.snapshot(client);
    const envelope=seal(snapshot,this.key,this.serverId);const id=this.write(envelope);await client.query('COMMIT');return {id,createdAt:envelope.createdAt};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
  preview(id){const snapshot=open(this.read(id),this.key,this.serverId);return {schema:snapshot.schema,counts:Object.fromEntries(Object.entries(snapshot.tables).map(([t,rows])=>[t,rows.length]))};}
  import(envelope){open(envelope,this.key,this.serverId);return {id:this.write(envelope)};}
  async restore(id){
    const snapshot=open(this.read(id),this.key,this.serverId);const client=await this.store.pool.connect();
    try {
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(728302)');
      await client.query(`LOCK TABLE ${Object.keys(COLUMNS).join(',')} IN ACCESS EXCLUSIVE MODE`);
      const before=seal(await this.snapshot(client),this.key,this.serverId);const safetyId=this.write(before);
      for(const table of Object.keys(COLUMNS).reverse())await client.query(`DELETE FROM ${table}`);
      for(const [table,columns] of Object.entries(COLUMNS)) {
        const rows=table==='canteen_transactions'?[...snapshot.tables[table]].sort((a,b)=>Boolean(a.reversal_of)-Boolean(b.reversal_of)):snapshot.tables[table];
        for(const row of rows)await client.query(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map((_,i)=>`$${i+1}`).join(',')})`,columns.map(col=>JSON_COLUMNS.has(col)?JSON.stringify(row[col]):row[col]));
      }
      await client.query("SELECT setval(pg_get_serial_sequence('permits','no'), GREATEST(COALESCE((SELECT MAX(no) FROM permits),0),1), (SELECT COUNT(*)>0 FROM permits))");
      await client.query("SELECT setval(pg_get_serial_sequence('gate_events','sequence'), GREATEST(COALESCE((SELECT MAX(sequence) FROM gate_events),0),1), (SELECT COUNT(*)>0 FROM gate_events))");
      await client.query('COMMIT');
      try{fs.appendFileSync(path.join(this.directory,'restore-history.jsonl'),JSON.stringify({at:new Date().toISOString(),restored:id,safety:safetyId})+'\n');}catch{console.error('Restore committed; history file could not be written');}
      return {restored:id,safetyId};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  scheduleStatePath(){return path.join(this.directory,'schedule-state.json');}
  readScheduleState(){try{if(fs.existsSync(this.scheduleStatePath()))return JSON.parse(fs.readFileSync(this.scheduleStatePath(),'utf8'));}catch{}return {};}
  writeScheduleState(patch){const next={...this.readScheduleState(),...patch};fs.writeFileSync(this.scheduleStatePath(),JSON.stringify(next),{mode:0o600});}
  prune(){const cutoff=Date.now()-this.retentionDays*86400000;for(const backup of this.list())if(Date.parse(backup.createdAt)<cutoff){const target=path.resolve(this.filename(backup.id));requireValue(path.dirname(target)===this.directory,'مسار نسخة غير صالح');fs.unlinkSync(target);}}
  scheduleStatus(policy=mergeBackupPolicy({})){
    const state=this.readScheduleState();
    const last=state.lastAutoBackupAt||null;
    let nextDueAt=null;
    if(policy.autoBackup&&last)nextDueAt=new Date(Date.parse(last)+policy.autoBackupIntervalHours*3600000).toISOString();
    else if(policy.autoBackup&&!last)nextDueAt=new Date(Date.now()).toISOString();
    return {...policy,lastAutoBackupAt:last,nextDueAt,lastSkipReason:state.lastSkipReason||null,running:Boolean(this._scheduleRunning)};
  }
  stopSchedule(){if(this._scheduleTimer)clearInterval(this._scheduleTimer);this._scheduleTimer=null;}
  startSchedule({loadPolicy,isBusy,tickMs=15*60*1000}={}){
    this.stopSchedule();
    const state=this.readScheduleState();
    if(state.lastAutoBackupAt&&!this.lastAutoBackupAt)this.lastAutoBackupAt=state.lastAutoBackupAt;
    const tick=async()=>{
      if(this._scheduleRunning)return;
      let policy;
      try{policy=loadPolicy?await loadPolicy():mergeBackupPolicy({});}catch(e){console.error('Backup policy read failed:',e.code||e.message);return;}
      this.retentionDays=policy.backupRetentionDays;
      if(!policy.autoBackup){this.writeScheduleState({lastSkipReason:'disabled'});return;}
      const intervalMs=policy.autoBackupIntervalHours*3600000;
      const lastMs=this.lastAutoBackupAt?Date.parse(this.lastAutoBackupAt):0;
      if(lastMs&&Date.now()<lastMs+intervalMs)return;
      if(isBusy&&isBusy()){this.writeScheduleState({lastSkipReason:'busy'});return;}
      this._scheduleRunning=true;
      try{
        const created=await this.create();
        this.lastAutoBackupAt=created.createdAt;
        this.prune();
        this.writeScheduleState({lastAutoBackupAt:created.createdAt,lastSkipReason:null});
      }catch(e){console.error('Scheduled backup failed:',e.status?e.message:e.code||e.name);}
      finally{this._scheduleRunning=false;}
    };
    this._scheduleTimer=setInterval(()=>{tick().catch(e=>console.error('Scheduled backup tick failed:',e.code||e.message));},tickMs);
    this._scheduleTimer.unref();
    tick().catch(()=>{});
    return this._scheduleTimer;
  }
}
module.exports={BackupManager,seal,open,validateSnapshot,COLUMNS,mergeBackupPolicy,parseBackupPolicyFields,BACKUP_INTERVAL_HOURS,BACKUP_POLICY_DEFAULTS};
