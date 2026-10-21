'use strict';
const {randomUUID}=require('node:crypto');const {requireValue}=require('./errors.cjs');const {image,detailsValue}=require('./modules.cjs');const {digest}=require('../shared/crypto.cjs');
function validateLegacy(source){
  requireValue(source?.v===1,'ملف المصدر يجب أن يكون نسخة v=1 من النموذج القديم');
  for(const name of ['soldiers','permits','canteen','fitness'])requireValue(Array.isArray(source[name])&&source[name].length<=100000,`جدول ${name} مفقود أو أكبر من الحد`);
  const errors=[];const ids=new Set(),numbers=new Set(),permits=new Set(),active=new Map();
  const check=(condition,message)=>{if(!condition&&errors.length<100)errors.push(message);};
  for(const s of source.soldiers){check(s&&Number.isSafeInteger(s.id)&&!ids.has(s.id),'معرف فرد مكرر أو غير صالح');if(!s)continue;ids.add(s.id);
    check(typeof s.name==='string'&&s.name.trim()&&s.name.length<=200,`اسم غير صالح للفرد ${s.id}`);
    check(typeof s.militaryNo==='string'&&/^\d{6,30}$/.test(s.militaryNo)&&!numbers.has(s.militaryNo),`رقم عسكري مكرر أو غير صالح: ${s.militaryNo}`);numbers.add(s.militaryNo);
    check(typeof s.nationalId==='string'&&/^\d{14}$/.test(s.nationalId),`رقم قومي غير صالح للفرد ${s.id}`);
    check(['in','out'].includes(s.status),`حالة غير صالحة للفرد ${s.id}`);
    for(const key of ['createdAt','enlistDate','permitDate'])if(s[key])check(Number.isFinite(Date.parse(s[key])),`تاريخ ${key} غير صالح للفرد ${s.id}`);
    for(const key of ['rank','company','unit'])check(typeof s[key]==='string'&&s[key].trim()&&s[key].length<=100,`حقل ${key} غير صالح للفرد ${s.id}`);
    for(const key of ['photo','idPhoto'])if(s[key]){try{const match=/^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(s[key]);requireValue(match,'صيغة صورة قديمة غير مدعومة');image(match[2],match[1]);}catch(e){check(false,`صورة غير صالحة للفرد ${s.id}: ${e.message}`);}}
  }
  for(const p of source.permits){check(p&&ids.has(p.soldierId)&&!permits.has(String(p.no)),`تصريح مكرر أو فرد غير موجود: ${p?.no}`);if(!p)continue;permits.add(String(p.no));
    check(/^\d+$/.test(String(p.no))&&Number.isSafeInteger(Number(p.no))&&Number(p.no)>0,'رقم تصريح غير صالح');
    check(Number.isFinite(Date.parse(p.exitAt))&&Date.parse(p.expectedReturn)>Date.parse(p.exitAt)&&(!p.returnedAt||Date.parse(p.returnedAt)>=Date.parse(p.exitAt)),`تواريخ غير صالحة للتصريح ${p.no}`);
    check(typeof p.reason==='string'&&p.reason.length<=100&&p.reason.trim(),`سبب غير صالح للتصريح ${p.no}`);
    if(!p.returnedAt)active.set(p.soldierId,(active.get(p.soldierId)||0)+1);
  }
  for(const s of source.soldiers)if(s)check((active.get(s.id)||0)<=1&&((s.status==='out')===(active.get(s.id)===1)),`حالة حضور غير متسقة للفرد ${s.id}`);
  for(const tx of source.canteen)check(tx&&ids.has(tx.soldierId)&&Number.isFinite(tx.amount)&&tx.amount>0&&tx.amount<=1000000&&Math.abs(tx.amount*100-Math.round(tx.amount*100))<0.000001&&Number.isFinite(Date.parse(tx.at)),'عملية كانتين غير صالحة');
  for(const f of source.fitness)check(f&&ids.has(f.soldierId)&&typeof f.type==='string'&&f.type.length<=100&&typeof f.result==='string'&&f.result.length<=1000&&Number.isFinite(Date.parse(f.date)),'سجل لياقة غير صالح');
  return {valid:!errors.length,errors,counts:Object.fromEntries(['soldiers','permits','canteen','fitness'].map(k=>[k,source[k].length])),warnings:['لا تُنقل كلمة مرور المسؤول القديمة. نتائج اللياقة النصية تُحفظ كما هي دون اختراع درجات تقييم.','راجع أن الملف يحتوي بيانات حقيقية؛ النموذج القديم يولد بيانات تجريبية تلقائيًا.']};
}
async function importLegacy(store,context,requestId,source){
  const preview=validateLegacy(source);requireValue(preview.valid,preview.errors.join('؛ '));
  const hash=digest(JSON.stringify(source));
  return store.mutate(context,requestId,{route:'legacy.import',hash},async client=>{
    await client.query('SELECT pg_advisory_xact_lock(728304)');
    requireValue(!(await client.query('SELECT id FROM legacy_imports WHERE sha256=$1',[hash])).rows.length,'هذا الملف مستورد بالفعل',409);
    const map=new Map();
    for(const old of source.soldiers){
      const details={};for(const key of ['description','prevUnit','specialty','permitNo','phone2','height','weight'])details[key]=String(old[key]||'');
      for(const key of ['enlistDate','permitDate'])details[key]=old[key]?new Date(old[key]).toISOString().slice(0,10):'';
      const soldier=await store.createSoldier(client,context,{name:old.name.trim(),militaryNo:old.militaryNo,nationalId:old.nationalId,rank:old.rank,company:old.company,unit:old.unit,phone:String(old.phone||''),address:String(old.address||''),details:detailsValue(details)});map.set(old.id,soldier.id);
      await client.query('UPDATE soldiers SET status=$2,created_at=$3 WHERE id=$1',[soldier.id,old.status,old.createdAt||new Date().toISOString()]);
      for(const kind of ['photo','idPhoto'])if(old[kind]){const match=/^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(old[kind]);const bytes=image(match[2],match[1]);await client.query('INSERT INTO attachments(id,soldier_id,kind,name,mime,content,sha256,size) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),soldier.id,kind,`${kind}.${match[1]==='image/png'?'png':'jpg'}`,match[1],match[2],digest(bytes),bytes.length]);}
    }
    for(const p of source.permits){const id=randomUUID();await client.query('INSERT INTO permits(id,no,soldier_id,reason,exit_at,expected_return,returned_at,notes,entry_notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,Number(p.no),map.get(p.soldierId),p.reason,p.exitAt,p.expectedReturn,p.returnedAt||null,p.notes||'',p.entryNotes||'',context.user.id]);
      await client.query('INSERT INTO gate_events(id,permit_id,soldier_id,kind,at,user_id,device_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,map.get(p.soldierId),'exit',p.exitAt,context.user.id,context.deviceId,randomUUID()]);
      if(p.returnedAt)await client.query('INSERT INTO gate_events(id,permit_id,soldier_id,kind,at,user_id,device_id,request_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),id,map.get(p.soldierId),'entry',p.returnedAt,context.user.id,context.deviceId,randomUUID()]);
    }
    for(const tx of source.canteen)await client.query('INSERT INTO canteen_transactions(id,soldier_id,outlet_id,amount_cents,at,created_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),map.get(tx.soldierId),'00000000-0000-0000-0000-000000000010',Math.round(tx.amount*100),tx.at,context.user.id]);
    for(const f of source.fitness)await client.query('INSERT INTO fitness_records(id,soldier_id,type,value,unit,date,notes,created_by,raw_result) VALUES($1,$2,$3,NULL,$4,$5,$6,$7,$8)',[randomUUID(),map.get(f.soldierId),f.type,'نص قديم',new Date(f.date).toISOString().slice(0,10),f.notes||'',context.user.id,f.result]);
    await client.query("SELECT setval(pg_get_serial_sequence('permits','no'),GREATEST(COALESCE((SELECT MAX(no) FROM permits),0),1), (SELECT COUNT(*)>0 FROM permits))");
    const id=randomUUID();await client.query('INSERT INTO legacy_imports(id,sha256,created_by) VALUES($1,$2,$3)',[id,hash,context.user.id]);await store.audit(client,context,'legacy.import',id);return {id,counts:preview.counts};
  });
}
module.exports={validateLegacy,importLegacy};
