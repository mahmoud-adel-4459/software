'use strict';
const cash=cents=>`${(Number(cents)/100).toFixed(2)} ج.م`;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monthNow=()=>today().slice(0,7);
function pageHeader(title,{eyebrow,subtitle,pill,actions}={}) {
  return `<div class="page-header${pill?' gate-heading':''}"><div>${eyebrow?`<p class="page-eyebrow">${escapeHtml(eyebrow)}</p>`:''}<h1>${escapeHtml(title)}</h1>${subtitle?`<p class="muted subtitle">${subtitle}</p>`:''}</div>${pill?`<span class="device-pill">${escapeHtml(pill)}</span>`:''}${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
}
function summaryTiles(){return `<div class="kpi-row" role="region" aria-label="ملخص الحالة"><div class="kpi"><div class="kpi-label">خارج الوحدة</div><div class="kpi-value badge-number">${escapeHtml(state.summary.outside)}</div></div><div class="kpi"><div class="kpi-label">متأخرون عن العودة</div><div class="kpi-value badge-number warn">${escapeHtml(state.summary.late)}</div></div></div>`;}
function selectField(label,name,options,chosen='') {return `<div class="field"><label for="${name}">${label}</label><select class="select" id="${name}" name="${name}">${options.map(([v,l])=>`<option value="${escapeHtml(v)}" ${v===chosen?'selected':''}>${escapeHtml(l)}</option>`).join('')}</select></div>`;}
function docButtons(type,id,extra={}){const idAttr=id?` data-id="${escapeHtml(id)}"`:'';const more=[extra.soldierId?` data-soldier-id="${escapeHtml(extra.soldierId)}"`:'',extra.month?` data-month="${escapeHtml(extra.month)}"`:'',extra.outletId?` data-outlet-id="${escapeHtml(extra.outletId)}"`:'',extra.date?` data-date="${escapeHtml(extra.date)}"`:''].join('');return `<div class="actions doc-actions"><button class="btn btn-secondary" data-doc="${type}"${idAttr}${more} data-mode="preview">معاينة</button><button class="btn btn-primary" data-doc="${type}"${idAttr}${more} data-mode="print">طباعة</button><button class="btn btn-secondary" data-doc="${type}"${idAttr}${more} data-mode="pdf">حفظ PDF</button></div>`;}
function soldierQrActions(soldierId){return `<div class="actions qr-print-actions"><button type="button" class="btn btn-ghost btn-sm" data-qr-preview="${soldierId}">معاينة</button><button type="button" class="btn btn-secondary btn-sm" data-soldier-qr="${soldierId}" data-qr-kind="qr" data-mode="print">ملصق</button><button type="button" class="btn btn-ghost btn-sm" data-soldier-qr="${soldierId}" data-qr-kind="qr" data-mode="pdf">PDF</button><button type="button" class="btn btn-ghost btn-sm" data-soldier-qr="${soldierId}" data-qr-kind="card" data-mode="print">بطاقة</button></div>`;}
function soldierQrPanel(soldier){return `<div class="card soldier-qr-panel"><div class="card-header"><h2>باركود البوابة (QR)</h2></div><div class="card-body stack"><p class="muted">يحمل بيانات العسكري للمسح عند الدخول والخروج — اطبع ملصقًا للبطاقة أو البطاقة الكاملة.</p><p><strong>${escapeHtml(soldier.name)}</strong> · <span class="num">${escapeHtml(soldier.military_no)}</span></p>${soldierQrActions(soldier.id)}</div></div>`;}
function ledgerOutletId(page){return page==='buffet'?state.buffetOutletId:state.canteenOutletId;}
function ledgerData(page){return page==='buffet'?state.buffetLedger:state.canteen;}
async function loadLedgerModule(page){
  const kind=page==='buffet'?'buffet':'canteen';
  const list=state.catalog.outlets?.[kind]||[];
  if(page==='buffet'&&!state.buffetOutletId&&list[0])state.buffetOutletId=list[0].id;
  if(page==='canteen'&&!state.canteenOutletId&&list[0])state.canteenOutletId=list[0].id;
  const outletId=ledgerOutletId(page);
  if(state.selectedInternal&&outletId){
    const data=await request('GET',`/api/canteen?soldierId=${state.selectedInternal.id}&month=${state.month||monthNow()}&outletId=${outletId}`);
    if(page==='buffet')state.buffetLedger=data;else state.canteen=data;
  }
}
async function navigate(page){try{if(page==='new')state.pendingSoldierPhotos={};await loadModule(page);if(!state.session)return;state.page=page;render();}catch(e){notify(e.message);}}
async function loadModule(page=state.page){
  if(!isInternalStaff())return;
  if(isClerk()&&!['canteen','buffet','reports'].includes(page))return;
  if(page==='daily-report'&&!isAdmin())return;
  if(isClerk()&&page==='users')return;
  if(page==='users')state.users=(await request('GET','/api/admin/users')).users;
  if(page==='settings')state.printers=await unwrap(window.desktop.printers());
  if(page==='canteen'||page==='buffet')await loadLedgerModule(page);
  if(page==='fitness'&&state.selectedInternal)state.fitness=(await request('GET',`/api/fitness?soldierId=${state.selectedInternal.id}`)).records;
  if(page==='daily-report'){
    const d=state.dailyReportDate||today();
    state.dailyReport=await request('GET',`/api/reports/daily?date=${encodeURIComponent(d)}`);
  }
  if(page==='reports'){
    if(!state.catalog.reports?.length){const cat=await request('GET','/api/catalog');state.catalog={...state.catalog,...cat};}
    const params=new URLSearchParams(state.reportFilter);if(!params.get('outletId'))params.delete('outletId');state.report=await request('GET','/api/reports?'+params);
  }
  if(page==='audit')state.audit=(await request('GET','/api/audit')).rows;
  if(page==='backups'){try{const res=await request('GET','/api/backups');state.backups=res.backups;state.backupSchedule=res.schedule;state.backupError='';}catch(e){state.backupError=e.message;state.backups=[];state.backupSchedule=null;}}
  if(page==='visitors')state.visitors=(await request('GET',`/api/visitors?q=${encodeURIComponent(state.visitorQuery||'')}`)).visitors;
}
function modulePage(page){
  if(page==='profile')return profilePage();if(page==='edit')return soldierForm(state.record.soldier);
  if(page==='visitors')return visitorsPage();
  if(page==='users')return usersPage();
  if(page==='canteen'||page==='buffet')return foodLedgerPage(page);if(page==='fitness')return fitnessPage();if(page==='reports')return reportsPage();
  if(page==='daily-report')return dailyReportPage();
  if(page==='settings')return settingsPage();if(page==='printing')return printingPage();if(page==='backups')return backupsPage();
  if(page==='import')return importPage();
  if(page==='audit')return `${pageHeader('سجل العمليات',{eyebrow:'المراجعة والأمان',subtitle:'آخر العمليات الإدارية على الخادم مع معرف الجهاز والسجل المتأثر.'})}<div class="card">${table(['التاريخ','المستخدم','الإجراء','الجهاز','السجل'],(state.audit||[]).map(r=>[dateTime(r.at),escapeHtml(r.username),escapeHtml(r.action),escapeHtml(r.device_id),escapeHtml(r.entity_id)]))}</div><p class="module-hint">أحدث 500 عملية؛ الأثر الكامل محفوظ في الخادم.</p>`;
  return null;
}
function profilePage(){const s=state.record.soldier;return `${pageHeader(`ملف ${s.name}`,{eyebrow:'بيانات العسكري',subtitle:'الحقول الشخصية والمرفقات المركزية.',actions:`<button class="btn btn-primary" data-edit="${s.id}">تعديل</button><button class="btn btn-secondary" id="archive">${s.archived?'إلغاء الأرشفة':'أرشفة الملف'}</button>`})}
  ${soldierQrPanel(s)}<div class="card"><div class="card-body"><dl class="info-grid">${gateProfileRows(s).map(r=>`<div><dt>${escapeHtml(r.label)}</dt><dd>${escapeHtml(r.value)}</dd></div>`).join('')}<div><dt>الرقم القومي</dt><dd>${escapeHtml(s.national_id||'—')}</dd></div></dl></div></div>
  ${soldierPhotosSection(state.record.attachments)}<div class="card"><div class="card-header"><h2>مستندات إضافية</h2></div><div class="card-body stack"><form id="attachment-form" class="actions">${selectField('نوع المرفق','kind',[['document','مستند PDF/صورة']])}<button type="submit" class="btn btn-primary">اختيار وحفظ مرفق</button></form>
  ${table(['الاسم','النوع','الحجم','حفظ'],state.record.attachments.filter(a=>a.kind==='document').map(a=>[escapeHtml(a.name),escapeHtml(attachmentKindLabels[a.kind]||a.kind),`${Math.ceil(a.size/1024)} KB`,`<button class="btn btn-secondary btn-sm" data-attachment="${a.id}">حفظ المرفق</button>`]))}</div></div>
  <div class="actions"><button type="button" class="btn btn-secondary" id="save-profile-photos">حفظ الصور المختارة أعلاه</button></div>`;}
const detailLabels=SOLDIER_DETAIL_FIELDS;
const attachmentKindLabels={photo:'صورة 4×6',idPhoto:'صورة البطاقة',carnetFront:'الكarnet — الوجه',carnetBack:'الكarnet — الظهر',tagPhoto:'صورة البطلقة',document:'مستند'};
const soldierPhotoKinds=SOLDIER_PHOTO_KINDS;
function soldierPhotosSection(existing=[]){
  const saved=new Set(existing.map(a=>a.kind));
  return `<fieldset class="wide fieldset-card soldier-photos"><legend>صور العسكري</legend><div class="soldier-photo-grid">
  ${soldierPhotoKinds.map(([kind,label])=>{const file=state.pendingSoldierPhotos?.[kind];const src=file?`data:${file.mime};base64,${file.content}`:'';const savedMark=saved.has(kind)&&!file?' <span class="muted">(محفوظة)</span>':'';return `<div class="soldier-photo-slot" data-photo-kind="${kind}"><p class="photo-slot-label">${label}${savedMark}</p><div class="soldier-photo-preview">${src?`<img src="${escapeHtml(src)}" alt="">`:'<span class="muted">—</span>'}</div><div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-pick-photo="${kind}">اختيار</button>${file?`<button type="button" class="btn btn-ghost btn-sm" data-clear-photo="${kind}">إزالة</button>`:''}</div></div>`;}).join('')}
  </div><p class="muted wide">PNG أو JPEG — يمكن رفعها مع الحفظ أو لاحقًا من ملف العسكري.</p></fieldset>`;}
async function uploadPendingSoldierPhotos(soldierId){const pending=state.pendingSoldierPhotos||{};for(const [kind,file] of Object.entries(pending)){if(file)await request('POST','/api/attachments',{...file,kind,soldierId},crypto.randomUUID());}}
function bindSoldierPhotoPickers(){
  document.querySelectorAll('[data-pick-photo]').forEach(button=>{button.onclick=async()=>{try{const kind=button.dataset.pickPhoto;const file=await unwrap(window.desktop.pickAttachment());if(!file)return;if(!file.mime.startsWith('image/')){notify('اختر PNG أو JPEG');return;}state.pendingSoldierPhotos=state.pendingSoldierPhotos||{};state.pendingSoldierPhotos[kind]=file;const slot=button.closest('.soldier-photo-slot');slot.querySelector('.soldier-photo-preview').innerHTML=`<img src="data:${file.mime};base64,${file.content}" alt="">`;if(!slot.querySelector('[data-clear-photo]')){const clear=document.createElement('button');clear.type='button';clear.className='btn btn-ghost btn-sm';clear.dataset.clearPhoto=kind;clear.textContent='إزالة';slot.querySelector('.actions').append(clear);}bindSoldierPhotoPickers();}catch(e){notify(e.message);}};});
  document.querySelectorAll('[data-clear-photo]').forEach(button=>{button.onclick=()=>{const kind=button.dataset.clearPhoto;if(state.pendingSoldierPhotos)delete state.pendingSoldierPhotos[kind];const slot=button.closest('.soldier-photo-slot');slot.querySelector('.soldier-photo-preview').innerHTML='<span class="muted">—</span>';button.remove();};});
}
function individualLookup(){return `<form id="internal-lookup" class="card search-panel"><div class="card-body">${input('الرقم العسكري','lookupNo',state.selectedInternal?.military_no||'')}<button class="btn btn-primary" type="submit">اختيار العسكري</button></div></form>${state.selectedInternal?`<div class="desktop-status selected-soldier">${escapeHtml(state.selectedInternal.rank)} / ${escapeHtml(state.selectedInternal.name)} · ${escapeHtml(state.selectedInternal.company)}</div>`:''}`;}
function foodLedgerPage(page){
  const isBuffet=page==='buffet';
  const title=isBuffet?'البوفيه':'الكانتين';
  const kind=isBuffet?'buffet':'canteen';
  const outlets=state.catalog.outlets?.[kind]||[];
  const outletId=ledgerOutletId(page);
  const ledger=ledgerData(page);
  const month=state.month||monthNow();
  const outletLabel=isBuffet?'البوفيه':'الكانتين';
  const outletPicker=outlets.length?selectField(outletLabel,'outletId',outlets.map(o=>[o.id,o.name]),outletId||''):`<p class="desktop-error">${isBuffet?'لا يوجد بوفيه — أضف بوفيه من الإعدادات (مسؤول).':'لا يوجد كانتين — أضف كانتين من الإعدادات (مسؤول).'}</p>`;
  return `${pageHeader(title,{eyebrow:'الحساب المالي',subtitle:'تسجيل المشتريات، إيصال، كشف شهري، وعكس العمليات — لكل نقطة بيع على حدة.'})}${outletPicker}${individualLookup()}${state.selectedInternal&&outletId?`<form id="ledger-form" class="card" data-ledger-page="${page}"><div class="card-body desk-form">${input('المبلغ بالجنيه','amount','','number')}${input('ملاحظات','notes','','text',false)}<button class="btn btn-primary" type="submit">تسجيل المشتريات</button></div></form>
  <form id="month-form" class="actions" data-ledger-page="${page}">${input('شهر الحساب','month',month,'month')}<button class="btn btn-secondary">عرض الشهر</button></form><div class="desktop-status">إجمالي مشتريات الشهر: <strong>${cash(ledger?.totalCents||0)}</strong></div>
  ${docButtons('canteen-statement','',{soldierId:state.selectedInternal.id,month,outletId})}
  <div class="card">${table(['التاريخ','المبلغ','ملاحظات','التصحيح','الإيصال'],(ledger?.transactions||[]).map(r=>[dateTime(r.at),cash(r.amount_cents),escapeHtml(r.notes),r.amount_cents>0&&!r.reversed_by?`<form data-reversal="${r.id}" class="actions"><input class="input" name="reason" placeholder="سبب التصحيح" required aria-label="سبب التصحيح"><button class="btn btn-secondary" type="submit">عكس العملية</button></form>`:r.reversal_of?'حركة عكسية':'تم عكسها',docButtons('canteen',r.id)]))}</div>`:''}`;
}
function fitnessPage(){return `${pageHeader('اللياقة',{eyebrow:'القياسات والاختبارات',subtitle:'تسجيل نتائج اللياقة حسب نوع الاختبار وتاريخه.'})}${individualLookup()}${state.selectedInternal?`<form id="fitness-form" class="card"><div class="card-body desk-form">${selectField('نوع الاختبار','type',Object.entries(state.catalog.fitnessTypes).map(([t,u])=>[t,`${t} (${u})`]))}${input('النتيجة بالقيمة الموضحة','value','','number')}${input('تاريخ الاختبار','date',today(),'date')}${input('ملاحظات','notes','','text',false)}<button class="btn btn-primary" type="submit">حفظ الاختبار</button></div></form><div class="card">${table(['التاريخ','الاختبار','النتيجة','ملاحظات'],(state.fitness||[]).map(r=>[escapeHtml(String(r.date).slice(0,10)),escapeHtml(r.type),`${escapeHtml(r.value??r.raw_result)} ${escapeHtml(r.unit)}`,escapeHtml(r.notes)]))}</div>`:''}`;}
function importPage(){const p=state.legacyPreview;return `${pageHeader('استيراد بيانات النسخة القديمة',{eyebrow:'نقل البيانات',subtitle:'معاينة ذرية قبل الدمج؛ التكرار يوقف العملية بالكامل.'})}<div class="actions"><button class="btn btn-primary" id="legacy-preview">اختيار ملف ومراجعته</button></div><p class="module-hint">يضيف الاستيراد الأفراد والحركات والمرفقات دون نقل كلمة المرور القديمة.</p>${p?`<div class="card"><div class="card-body">${table(['الجدول','السجلات'],Object.entries(p.counts).map(([k,v])=>[escapeHtml(k),escapeHtml(v)]))}<p>${p.warnings.map(escapeHtml).join('<br>')}</p><p class="desktop-error">${p.errors.map(escapeHtml).join('<br>')}</p>${p.valid?`<form id="legacy-form" class="stack">${input('اكتب IMPORT بعد مراجعة الملف','confirm')}<button class="btn btn-primary" type="submit">استيراد البيانات</button></form>`:''}</div></div>`:''}`;}
function dailyReportPage(){
  const d=state.dailyReportDate||today();
  let body;
  if(state.dailyReport&&window.DailyReport)body=window.DailyReport.dailyReportHtml(state.dailyReport,dateTime);
  else if(state.dailyReport)body='<p class="desktop-error">تعذر عرض لوحة التقرير (ملف daily-report.js غير محمّل). أعد تشغيل التطبيق من نسخة محدّثة.</p>';
  else body='<p class="muted">جاري تحميل التقرير…</p>';
  return `${pageHeader('التقرير اليومي الشامل',{eyebrow:'لوحة الوحدة',subtitle:'لقطة الأفراد + كل نشاط اليوم (بوابة، زوار، كانتين، بوفيه، لياقة) برسوم وجداول.'})}
  <form id="daily-report-form" class="card search-panel"><div class="card-body desk-form">
  ${input('تاريخ التقرير','date',d,'date')}
  <div class="actions"><button type="button" class="btn btn-ghost btn-sm" data-daily-preset="today">اليوم</button><button type="button" class="btn btn-ghost btn-sm" data-daily-preset="yesterday">أمس</button><button class="btn btn-primary" type="submit">تحديث</button></div>
  </div></form>
  <div class="actions report-export-actions">${docButtons('daily-report','',{date:d})}</div>
  ${body}`;
}
function cairoAddDays(iso,delta){const p=iso.split('-').map(Number);const d=new Date(Date.UTC(p[0],p[1]-1,p[2],12,0,0));d.setUTCDate(d.getUTCDate()+delta);return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function reportCatalogEntry(type){return (state.catalog.reports||[]).find(r=>r.id===type);}
function formatReportCell(key,value){if(value==null||value==='')return key==='check_out'?'—':'';if(['at','check_out'].includes(key))return dateTime(value);if(key==='amount_cents')return cash(value);if(key==='kind')return value==='entry'?'دخول':'خروج';if(key==='status')return value==='in'?'داخل الوحدة':'خارج الوحدة';if(key==='archived')return value?'نعم':'لا';return escapeHtml(String(value));}
function reportOutletPick(meta,f){if(!meta?.filters?.outlet)return '';const kind=meta.filters.outletKind||'canteen';const outlets=state.catalog.outlets?.[kind==='buffet'?'buffet':'canteen']||[];if(!outlets.length)return '';const label=kind==='buffet'?'بوفيه':'كانتين';return selectField(`${label} محدد (اختياري)`,'outletId',[['',`الكل (${outlets.length})`],...outlets.map(o=>[o.id,o.name])],f.outletId||'');}
function reportSummaryTiles(type,summary,totalCents){if(!summary)return '';const tiles=[];const push=(label,val)=>tiles.push(`<div class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value badge-number">${escapeHtml(val)}</div></div>`);
  push('عدد السجلات',summary.rows);
  if(type==='soldiers'){push('داخل الوحدة',summary.inside);push('خارج الوحدة',summary.outside);if(summary.archived)push('مؤرشف',summary.archived);}
  else if(type==='gate'){push('دخول',summary.entries);push('خروج',summary.exits);if(summary.corrected)push('بعد تصحيح',summary.corrected);}
  else if(type==='visitor'){push('زيارة مفتوحة',summary.openVisits);push('مكتملة',summary.completed);}
  else if(type==='canteen'||type==='buffet'){push('الإجمالي',cash(totalCents??summary.totalCents??0));if(summary.reversals)push('تصحيحات',summary.reversals);}
  return `<div class="kpi-row report-summary" role="region" aria-label="ملخص التقرير">${tiles.join('')}</div>`;}
function reportsPage(){const f=state.reportFilter;const rows=state.report?.rows||[];const meta=reportCatalogEntry(f.type);const fields=meta?.columns||[];const types=(state.catalog.reports||[]).map(r=>[r.id,r.title]);const ff=meta?.filters||{};const periodHint=ff.fromTo?'':'<p class="report-filter-note muted">هذا التقرير لا يستخدم «من / إلى» — التاريخ للتقارير الأخرى فقط.</p>';
  return `${pageHeader('التقارير',{eyebrow:'تحليل البيانات',subtitle:'اختر نوع التقرير؛ تظهر الفلاتر المناسبة فقط. حتى 10000 سجل — CSV / PDF للمسؤول.'})}
  <form id="report-form" class="card report-form"><div class="card-header"><h2>${escapeHtml(meta?.title||'التقرير')}</h2><span class="muted">${escapeHtml(meta?.short||'')}</span></div>
  <div class="card-body desk-form">${selectField('نوع التقرير','type',types.length?types:[['canteen','الكانتين'],['buffet','البوفيه']],f.type)}<p class="report-type-hint module-hint">${escapeHtml(meta?.hint||'')}</p>
  ${reportOutletPick(meta,f)}<div class="report-period-row" ${ff.fromTo?'':'hidden'}><div class="report-presets actions"><button type="button" class="btn btn-ghost btn-sm" data-report-preset="today">اليوم</button><button type="button" class="btn btn-ghost btn-sm" data-report-preset="7d">آخر 7 أيام</button><button type="button" class="btn btn-ghost btn-sm" data-report-preset="month">هذا الشهر</button></div>${input('من','from',f.from,'date')}${input('إلى','to',f.to,'date')}</div>${periodHint}
  ${input(ff.fromTo?'بحث (اسم أو رقم)':'بحث بالاسم أو الرقم','q',f.q,'text',false)}${ff.company!==false?input('السرية (مطابقة تامة)','company',f.company,'text',false):''}<button class="btn btn-primary" type="submit">عرض التقرير</button></div></form>
  ${state.report?reportSummaryTiles(f.type,state.report.summary,state.report.totalCents):''}
  <div class="actions report-export-actions">${isAdmin()?'<button class="btn btn-secondary" id="csv-export">تصدير CSV</button>':''}${isAdmin()?docButtons('report',''):''}</div>
  <div class="card table-pro-wrap"><div class="card-header"><h2>النتائج</h2><span class="muted">${rows.length} سجل</span></div><div class="card-body no-pad">${fields.length?table(fields.map(c=>c[1]),rows.map(r=>fields.map(([key])=>formatReportCell(key,r[key])))):'<p class="muted">اختر نوع التقرير واضغط عرض.</p>'}</div></div>
  ${f.type==='gate'&&rows.length?`<div class="card"><div class="card-header"><h2>تصحيح حركة بوابة</h2><span class="muted">من نفس نتائج التقرير</span></div><div class="card-body no-pad">${table(['العسكري','الحركة','التصحيح'],rows.slice(0,50).map(r=>[escapeHtml(r.name),r.kind==='entry'?'دخول':'خروج',r.correction_reason?escapeHtml(r.correction_reason):`<form data-correction="${r.id}" class="actions"><input class="input" name="reason" placeholder="سبب التصحيح" required aria-label="سبب التصحيح"><button class="btn btn-secondary" type="submit">عكس الحركة</button></form>`]))}</div></div>`:''}`;}
function outletSettingsBlock(title,kind,addLabel){const rows=(state.catalog.outletsAll||[]).filter(o=>o.kind===kind);return `<div class="card"><div class="card-header"><h2>${title}</h2></div><div class="card-body stack"><form class="desk-form" data-outlet-add="${kind}">${input(addLabel,'name','','text')}<button class="btn btn-primary" type="submit">إضافة</button></form>
  ${table(['الاسم','الحالة','إجراء'],rows.map(o=>[escapeHtml(o.name),o.disabled?'معطل':'نشط',o.disabled?'—':`<button type="button" class="btn btn-secondary btn-sm" data-outlet-disable="${o.id}">تعطيل</button>`]))}</div></div>`;}
function visitorCategorySettingsBlock(){const rows=state.catalog.visitorCategoriesAll||[];const tiers=[['normal','عادي'],['special','خاص'],['admin','إداري']];return `<div class="card"><div class="card-header"><h2>فئات الزوار</h2></div><div class="card-body stack"><form id="visitor-category-add-form" class="desk-form">${input('اسم فئة جديدة','name','','text')}${selectField('النوع','tier',tiers,'normal')}<button class="btn btn-primary" type="submit">إضافة فئة</button></form>
  ${table(['الاسم','النوع','الحالة','إجراء'],rows.map(c=>[escapeHtml(c.name),visitorTierLabel(c.tier),c.disabled?'معطل':'نشط',c.disabled?'—':`<button type="button" class="btn btn-secondary btn-sm" data-visitor-category-disable="${c.id}">تعطيل</button>`]))}</div></div>`;}
function visitorsPage(){const cats=(state.catalog.visitorCategories||[]).filter(c=>!c.disabled);const tierOpts=[['normal','عادي'],['special','خاص'],['admin','إداري']];return `${pageHeader('الزوار',{eyebrow:'بطاقات الدخول',subtitle:'إضافة زوار بفئات (عادي، خاص، إداري) وطباعة QR للبوابة.'})}
  <form id="visitor-add-form" class="card"><div class="card-header"><h2>زائر جديد</h2></div><div class="card-body desk-form">${input('الاسم','name','')}${selectField('الفئة','categoryId',cats.map(c=>[c.id,c.name]),cats[0]?.id||'')}
  ${input('رقم البطاقة (اختياري — يُولَّد تلقائيًا)','badgeNo','','text',false)}${input('الجهة / الجهة الزائرة','organization','','text',false)}${input('الهاتف','phone','','tel',false)}${input('ملاحظات','notes','','text',false)}<button class="btn btn-primary" type="submit">حفظ الزائر</button></div></form>
  <form id="visitor-search-form" class="card search-panel"><div class="card-body">${input('بحث','q',state.visitorQuery||'','text',false)}<button class="btn btn-secondary" type="submit">بحث</button></div></form>
  <div class="card">${table(['الاسم','البطاقة','الفئة','الجهة','QR'],(state.visitors||[]).map(v=>[escapeHtml(v.name),`<span class="num">${escapeHtml(v.badge_no)}</span>`,escapeHtml(v.category_name),escapeHtml(v.organization||'—'),`<button type="button" class="btn btn-ghost btn-sm" data-visitor-qr="${v.id}">QR</button>`]))}</div>
  <p class="module-hint">امسح QR الزائر في البوابة لتسجيل «جاي ليه» ثم الدخول أو الخروج.</p>`;}
function backupScheduleBlock(){
  const sch=state.backupSchedule;if(!sch)return '';
  const skip={busy:'مؤجل — الخادم مشغول بالعمليات',disabled:'النسخ التلقائي متوقف من الإعدادات'}[sch.lastSkipReason];
  const status=sch.running?'جاري نسخ تلقائي…':skip|| (sch.autoBackup?'يعمل في الخلفية':'—');
  return `<div class="card backup-schedule-card"><div class="card-header"><h2>النسخ التلقائي</h2><span class="muted">${escapeHtml(status)}</span></div><div class="card-body desk-form">
  <p class="module-hint">يُفحص كل 15 دقيقة؛ إذا كان هناك طلبات نشطة يُؤجَّل النسخ حتى يهدأ النظام دون إبطاء الواجهة.</p>
  <div class="kpi-row"><div class="kpi"><div class="kpi-label">الفترة</div><div class="kpi-value">${sch.autoBackup?`كل ${sch.autoBackupIntervalHours} ساعة`:'متوقف'}</div></div>
  <div class="kpi"><div class="kpi-label">آخر نسخ تلقائي</div><div class="kpi-value">${sch.lastAutoBackupAt?dateTime(sch.lastAutoBackupAt):'—'}</div></div>
  <div class="kpi"><div class="kpi-label">النسخة التالية (تقريبي)</div><div class="kpi-value">${sch.autoBackup&&sch.nextDueAt?dateTime(sch.nextDueAt):'—'}</div></div>
  <div class="kpi"><div class="kpi-label">الاحتفاظ</div><div class="kpi-value">${sch.backupRetentionDays} يومًا</div></div></div></div></div>`;}
function settingsPage(){const s=state.catalog.settings;return `${pageHeader('الإعدادات',{eyebrow:'إعداد الوحدة',subtitle:'الشعار، الكانتينات والبوفيهات، فئات الزوار، أسباب الخروج، وخيارات الطباعة.'})}<form id="settings-form" class="card"><div class="card-body desk-form">${input('اسم الوحدة','unitName',s.unitName)}${input('الجهة التابعة لها','parentFormation',s.parentFormation,'text',false)}${input('سبب إضافي أول','reason1',s.extraReasons[0]||'','text',false)}${input('سبب إضافي ثانٍ','reason2',s.extraReasons[1]||'','text',false)}${selectField('مقاس الورق','paper',[['A4','A4'],['A5','A5']],s.paper)}${selectField('الهوامش','margins',[['normal','عادية'],['narrow','ضيقة']],s.margins)}${selectField('الطابعة','printer',[['','طابعة النظام الافتراضية'],...(state.printers||[]).map(p=>[p.name,p.displayName||p.name])],s.printer)}
  <fieldset class="wide fieldset-card"><legend>النسخ الاحتياطي التلقائي</legend><div class="field"><label><input type="checkbox" name="autoBackup" ${s.autoBackup!==false?'checked':''}> تفعيل النسخ الدوري على هذا الجهاز/الخادم</label></div>
  ${selectField('كل كم ساعة','autoBackupIntervalHours',[[6,'6 ساعات'],[12,'12 ساعة'],[24,'24 ساعة (يومي)'],[48,'48 ساعة']],String(s.autoBackupIntervalHours||24))}${input('احتفاظ بالنسخ (أيام)','backupRetentionDays',String(s.backupRetentionDays||30),'number')}</fieldset>
  <div class="field"><label><input type="checkbox" name="showLogo" ${s.showLogo?'checked':''}> إظهار شعار الوحدة</label><button class="btn btn-secondary" type="button" id="choose-logo">اختيار الشعار</button><button class="btn btn-secondary" type="button" id="remove-logo">إزالة الشعار</button>${s.logo?`<img class="unit-logo" src="${escapeHtml(s.logo)}" alt="شعار الوحدة">`:''}</div><button class="btn btn-primary" type="submit">حفظ الإعدادات</button></div></form>
  ${visitorCategorySettingsBlock()}${outletSettingsBlock('كانتينات الوحدة','canteen','اسم كانتين جديد')}${outletSettingsBlock('بوفيهات الوحدة','buffet','اسم بوفيه جديد')}
  <div class="card"><div class="card-body"><h2>أسباب الخروج الثابتة</h2><p>${state.catalog.exitReasons.slice(0,23).map(escapeHtml).join(' · ')}</p></div></div>`;}
function printSearchResultsBlock(){
  const hits=state.printSearchHits||[];
  if(!hits.length)return '';
  const one=hits.length===1;
  return `<div class="card print-search-results"><div class="card-header"><h2>نتائج البحث (${hits.length})</h2><span class="muted">${one?'تم اختيار العسكري تلقائيًا':'اختر عسكريًا ثم اطبع'}</span></div><div class="card-body no-pad">${table(['','الاسم','الرقم','الرتبة','طباعة مباشرة'],hits.map(s=>[
    `<input type="radio" name="printSoldierId" value="${escapeHtml(s.id)}" ${one?'checked':''} aria-label="اختيار ${escapeHtml(s.name)}">`,
    escapeHtml(s.name),`<span class="num">${escapeHtml(s.military_no)}</span>`,escapeHtml(s.rank),soldierQrActions(s.id)]))}</div></div>`;
}
function printingPage(){return `${pageHeader('الطباعة',{eyebrow:'المستندات',subtitle:'ابحث بالاسم أو الرقم واطبع QR فورًا.'})}
  <form id="print-lookup-form" class="card print-quick-card"><div class="card-header"><h2>بحث وطباعة QR</h2></div><div class="card-body desk-form stack">
  <div class="field wide"><label for="printQ">اسم العسكري أو الرقم العسكري</label><div class="input-with-action"><input class="input" id="printQ" name="q" value="${escapeHtml(state.printSearchQ||'')}" placeholder="مثال: محمد أو 000012345" autocomplete="off"><button type="button" class="btn btn-secondary" id="print-search-btn">بحث</button></div></div>
  ${printSearchResultsBlock()}
  ${selectField('نوع المستند','type',[['qr','ملصق QR (بوابة)'],['card','بطاقة عسكري']])}${input('عدد النسخ','copies','1','number')}
  <div class="actions wide"><button type="submit" class="btn btn-primary" name="mode" value="print">طباعة المختار</button><button type="submit" class="btn btn-secondary" name="mode" value="preview">معاينة</button><button type="submit" class="btn btn-secondary" name="mode" value="pdf">PDF</button></div></div></form>
  <form id="printing-form" class="card"><div class="card-header"><h2>طباعة جماعية</h2></div><div class="card-body desk-form">${selectField('نوع الطباعة','type',[['qr','ملصقات QR'],['card','بطاقات عسكريين']])}${input('عدد النسخ لكل عسكري','copies','1','number')}
  <fieldset class="wide fieldset-card"><legend>اختر من نتائج البحث الحالية (${state.soldiers.length})</legend>${state.soldiers.length?state.soldiers.map(s=>`<label class="print-pick"><input type="checkbox" name="ids" value="${s.id}"> ${escapeHtml(s.name)} · ${escapeHtml(s.military_no)}</label>`).join(''):'<p class="muted">ابحث في صفحة العسكريين ثم عد هنا.</p>'}</fieldset><div class="actions wide"><button class="btn btn-primary" name="mode" value="preview" type="submit">معاينة</button><button class="btn btn-secondary" name="mode" value="print" type="submit">طباعة</button><button class="btn btn-secondary" name="mode" value="pdf" type="submit">حفظ PDF</button></div></div></form>
  <p class="module-hint">الملصق مناسب للاستيكر على البطاقة؛ البطاقة أكبر وتضم الرتبة والسرية. إعدادات الطابعة من الإعدادات.</p>`;}
function backupsPage(){return `${pageHeader('النسخ الاحتياطي والاستعادة',{eyebrow:'حماية البيانات',subtitle:'نسخ مشفرة على الخادم، معاينة قبل الاستعادة، ونسخة أمان تلقائية.'})}${backupScheduleBlock()}<div class="actions"><button class="btn btn-primary" id="backup-create">إنشاء نسخة على الخادم</button><button class="btn btn-secondary" id="backup-import">استيراد ملف نسخة</button></div>
  <p class="module-hint">ضبط الفترة والاحتفاظ من <a href="#" data-nav="settings">الإعدادات</a>.</p>
  ${state.backupError?`<p class="desktop-error">${escapeHtml(state.backupError)}</p>`:''}<div class="card">${table(['التاريخ','الحجم','الإجراءات'],(state.backups||[]).map(b=>[dateTime(b.createdAt),`${Math.ceil(b.size/1024)} KB`,`<div class="actions"><button class="btn btn-secondary" data-backup-save="${b.id}">حفظ خارجي</button><button class="btn btn-secondary" data-backup-preview="${b.id}">مراجعة للاستعادة</button></div>`]))}</div>
  ${state.restorePreview?`<div class="card"><div class="card-header"><h2>مراجعة النسخة قبل الاستعادة</h2></div><div class="card-body"><p>ستُستبدل البيانات الحالية. ينشئ الخادم نسخة أمان أولًا ويلغي جلسات الجهازين بعد النجاح.</p>${table(['الجدول','السجلات'],Object.entries(state.restorePreview.counts).map(([k,v])=>[escapeHtml(k),escapeHtml(v)]))}<form id="restore-form" class="stack">${input('كلمة مرور المسؤول','password','','password')}${input('اكتب RESTORE لتأكيد الاستبدال','confirm')}<button class="btn btn-primary" type="submit">استعادة النسخة المحددة</button></form></div></div>`:''}`;}
const USER_ROLES=[
  {id:'gate',label:'مناوب بوابة',hint:'تسجيل خروج ودخول العسكري والزوار — من جهاز البوابة أو الداخلي.'},
  {id:'clerk',label:'كاشير',hint:'الكانتين والبوفيه وتقاريرهم فقط — بدون عسكريين أو إعدادات.'},
  {id:'admin',label:'مسؤول النظام',hint:'صلاحية كاملة: عسكريون، نسخ، مستخدمون، وإعدادات الوحدة.'},
];
const roleLabel=r=>({admin:'مسؤول',gate:'بوابة',clerk:'كاشير'}[r]||r);
function userRolePicker(name,selected='gate'){return `<fieldset class="wide fieldset-card user-role-picker"><legend>الدور والصلاحيات</legend><div class="user-role-grid">${USER_ROLES.map(r=>`<label class="user-role-card"><input type="radio" name="${name}" value="${r.id}" ${r.id===selected?'checked':''}><span class="user-role-card-body"><strong>${escapeHtml(r.label)}</strong><span class="muted">${escapeHtml(r.hint)}</span></span></label>`).join('')}</div></fieldset>`;}
function usersSummaryRow(){const list=state.users||[];const count=id=>list.filter(u=>u.role===id&&!u.disabled).length;return `<div class="kpi-row user-kpi-row" role="region" aria-label="ملخص الحسابات"><div class="kpi"><div class="kpi-label">نشط — بوابة</div><div class="kpi-value badge-number">${count('gate')}</div></div><div class="kpi"><div class="kpi-label">نشط — كاشير</div><div class="kpi-value badge-number">${count('clerk')}</div></div><div class="kpi"><div class="kpi-label">نشط — مسؤول</div><div class="kpi-value badge-number">${count('admin')}</div></div><div class="kpi"><div class="kpi-label">معطّل</div><div class="kpi-value badge-number">${list.filter(u=>u.disabled).length}</div></div></div>`;}
function validateNewUser(values){const username=String(values.username||'').trim();const name=String(values.name||'').trim();const password=String(values.password||'');if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username))return 'اسم المستخدم: 3–40 حرفًا (حروف إنجليزية، أرقام، . _ -)';if(name.length<2)return 'أدخل الاسم المعروض (حرفان على الأقل)';if(password.length<12)return 'كلمة المرور 12 حرفًا على الأقل';if(!['admin','gate','clerk'].includes(values.role))return 'اختر دورًا';return null;}
function userEditPanel(){const u=(state.users||[]).find(x=>x.id===state.editingUserId);if(!u)return '';return `<div class="card user-edit-panel" id="user-edit-panel"><div class="card-header"><h2>تعديل: ${escapeHtml(u.username)}</h2></div><div class="card-body desk-form"><form data-user-update="${u.id}">${input('الاسم المعروض',`name-${u.id}`,u.name)}${userRolePicker(`role-${u.id}`,u.role)}
  <label class="field toggle-inline wide"><input name="disabled" type="checkbox" ${u.disabled?'checked':''}> تعطيل الحساب (لا يستطيع تسجيل الدخول)</label>
  ${input('كلمة مرور جديدة (اتركها فارغة بدون تغيير)','password','','password',false)}
  <div class="actions wide"><button type="submit" class="btn btn-primary">حفظ التعديلات</button><button type="button" class="btn btn-secondary" id="user-edit-cancel">إلغاء</button></div></form></div></div>`;}
function usersPage(){return `${pageHeader('المستخدمون',{eyebrow:'الصلاحيات',subtitle:'أنشئ حسابًا، اختر دورًا واضحًا، وسلّم بيانات الدخول لصاحبها.'})}${usersSummaryRow()}
  <div class="users-layout"><form id="user-form" class="card users-add-card"><div class="card-header"><h2>١ — حساب جديد</h2><span class="muted">يُحفظ على الخادم فورًا</span></div><div class="card-body desk-form">
  ${input('اسم الدخول (username)','username','','text')}${input('الاسم المعروض في النظام','name','','text')}
  <div class="field wide"><label for="password">كلمة المرور</label><div class="input-with-action"><input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="12" required placeholder="12 حرفًا على الأقل"><button type="button" class="btn btn-secondary btn-sm" id="user-gen-password">اقتراح كلمة مرور</button></div><p class="muted field-hint">سلّم اسم الدخول وكلمة المرور للمستخدم بشكل آمن؛ لا تُعرض مرة أخرى بعد الحفظ.</p></div>
  ${userRolePicker('role','gate')}
  <button class="btn btn-primary wide" type="submit">إنشاء الحساب</button></div></form>
  <div class="users-list-col"><div class="card" id="users-list"><div class="card-header"><h2>٢ — الحسابات الحالية</h2></div><div class="card-body no-pad">${table(['اسم الدخول','الاسم','الدور','الحالة',''],(state.users||[]).map(u=>[
    `<span class="num">${escapeHtml(u.username)}</span>`,escapeHtml(u.name),`<span class="badge ${u.role==='admin'?'badge-success':u.role==='clerk'?'badge-warning':''}">${roleLabel(u.role)}</span>`,u.disabled?'<span class="badge">معطّل</span>':'<span class="badge badge-success">نشط</span>',
    `<button type="button" class="btn btn-secondary btn-sm" data-user-edit="${u.id}">إدارة</button>`]))}</div></div>
  ${userEditPanel()}<p class="module-hint">على جهاز البوابة: حتى المسؤول يرى شاشة البوابة فقط. الجهاز الداخلي يفتح القوائم حسب الدور.</p></div></div>`;}
async function searchSoldiersForPrint(q){
  const text=String(q||'').trim();
  if(!text){state.printSearchHits=[];state.printSearchQ='';return [];}
  const soldiers=(await request('GET',`/api/soldiers?q=${encodeURIComponent(text)}`)).soldiers.slice(0,40);
  state.printSearchHits=soldiers;
  state.printSearchQ=text;
  return soldiers;
}
async function resolvePrintSoldier(q,selectedId){
  if(selectedId)return selectedId;
  const text=String(q||'').trim();
  if(!text)return null;
  let soldiers=state.printSearchHits;
  if(!soldiers?.length||state.printSearchQ!==text)soldiers=await searchSoldiersForPrint(text);
  const exact=soldiers.find(s=>s.military_no===text);
  if(exact)return exact.id;
  if(soldiers.length===1)return soldiers[0].id;
  return null;
}
async function showQrPreview(soldierId){
  const list=state.soldiers.find(s=>s.id===soldierId);
  let soldier=list;
  if(!soldier&&state.record?.soldier?.id===soldierId)soldier=state.record.soldier;
  if(!soldier){const r=await request('GET',`/api/soldier?id=${soldierId}`);soldier=r.soldier;}
  const qr=await unwrap(window.desktop.qr(soldierId));
  const card=document.createElement('div');card.className='card qr-preview-card';
  card.innerHTML=`<div class="card-body stack"><div class="qr-preview-head"><h2>${escapeHtml(soldier.name)}</h2><p class="num">${escapeHtml(soldier.military_no)}</p></div><img class="qr-preview" src="${qr}" alt="QR"><div class="actions">${soldierQrActions(soldierId)}<button type="button" class="btn btn-secondary" data-qr-preview-close>إغلاق</button></div></div>`;
  root.querySelector('.page-content')?.prepend(card);
  card.querySelector('[data-qr-preview-close]')?.addEventListener('click',()=>card.remove());
}
function bindSoldierQrPrint(){
  if(state.qrPrintClickBound)return;
  state.qrPrintClickBound=true;
  root.addEventListener('click',async event=>{
    const preview=event.target.closest('[data-qr-preview]');
    if(preview&&!preview.disabled){preview.disabled=true;try{await showQrPreview(preview.dataset.qrPreview);}catch(e){notify(e.message);}finally{preview.disabled=false;}return;}
    const print=event.target.closest('[data-soldier-qr]');
    if(print&&!print.disabled){print.disabled=true;try{await unwrap(window.desktop.document({type:print.dataset.qrKind,ids:[print.dataset.soldierQr],copies:1,mode:print.dataset.mode}));notify(print.dataset.mode==='print'?'تم إرسال الطباعة':print.dataset.mode==='pdf'?'تم حفظ PDF':'');}catch(e){notify(e.message);}finally{print.disabled=false;}}
    const searchBtn=event.target.closest('#print-search-btn');
    if(searchBtn){searchBtn.disabled=true;try{const q=document.getElementById('printQ')?.value||'';const hits=await searchSoldiersForPrint(q);if(!hits.length)notify('لا يوجد عسكري بهذا البحث');else notify(`${hits.length} نتيجة`);render();}catch(e){notify(e.message);}finally{searchBtn.disabled=false;}}
  });
  root.addEventListener('submit',async event=>{
    if(event.target.id!=='print-lookup-form')return;
    event.preventDefault();
    const submitter=event.submitter;const mode=submitter?.value||'print';
    const values=Object.fromEntries(new FormData(event.target));
    const q=String(values.q||'').trim();
    if(!q)return notify('أدخل اسمًا أو رقمًا عسكريًا');
    const copies=Math.max(1,Math.min(8,Number(values.copies)||1));
    try{
      let id=await resolvePrintSoldier(q,values.printSoldierId);
      if(!id){
        const hits=await searchSoldiersForPrint(q);
        render();
        if(!hits.length)notify('لا يوجد عسكري بهذا البحث');
        else if(hits.length>1)notify('عدة نتائج — اختر عسكريًا من الجدول أو اضغط «بحث»');
        return;
      }
      await unwrap(window.desktop.document({type:values.type,ids:[id],copies,mode}));
      const name=(state.printSearchHits||[]).find(s=>s.id===id)?.name||'';
      notify(mode==='print'?`طباعة ${name||'QR'}`:mode==='pdf'?'تم حفظ PDF':'معاينة');
    }catch(e){notify(e.message);}
  });
}
function bindUserAdmin(){
  document.getElementById('user-gen-password')?.addEventListener('click',()=>{const chars='abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';let p='';const arr=new Uint32Array(14);crypto.getRandomValues(arr);for(const n of arr)p+=chars[n%chars.length];const el=document.getElementById('password');if(el){el.value=p;el.type='text';notify('تم اقتراح كلمة مرور — انسخها قبل الحفظ');}});
  document.getElementById('user-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.target;const button=form.querySelector('button[type="submit"]');if(button.disabled)return;const values=Object.fromEntries(new FormData(form));const err=validateNewUser(values);if(err)return notify(err);button.disabled=true;const body={username:values.username.trim(),name:values.name.trim(),password:values.password,role:values.role};const serialized=JSON.stringify(body);if(form.dataset.payload!==serialized){form.dataset.request=crypto.randomUUID();form.dataset.payload=serialized;}try{const created=await request('POST','/api/admin/users',body,form.dataset.request);form.reset();form.querySelector('input[name="role"][value="gate"]')?.click();state.editingUserId=null;await load();await loadModule('users');notify(`تم إنشاء حساب «${created.username}» — ${roleLabel(created.role)}`);render();}catch(e){notify(e.message);}finally{button.disabled=false;}});
  root.querySelectorAll('[data-user-edit]').forEach(btn=>{btn.onclick=()=>{state.editingUserId=btn.dataset.userEdit;render();queueMicrotask(()=>document.getElementById('user-edit-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'}));};});
  document.getElementById('user-edit-cancel')?.addEventListener('click',()=>{state.editingUserId=null;render();});
  root.querySelectorAll('[data-user-update]').forEach(form=>form.addEventListener('submit',event=>{const id=form.dataset.userUpdate;const values=new FormData(form);const pwd=values.get('password');if(pwd&&String(pwd).length>0&&String(pwd).length<12){event.preventDefault();notify('كلمة المرور الجديدة 12 حرفًا على الأقل');return;}saveForm(event,'/api/users/update',{id,name:values.get(`name-${id}`),role:values.get(`role-${id}`),disabled:form.elements.disabled.checked,password:pwd},()=>{state.editingUserId=null;},'تم تحديث الحساب');}));
}
function bindModules(){
  bindSoldierQrPrint();
  bindUserAdmin();
  document.getElementById('legacy-preview')?.addEventListener('click',async()=>{try{const preview=await unwrap(window.desktop.previewLegacy());if(preview){state.legacyPreview=preview;render();}}catch(e){notify(e.message);}});
  document.getElementById('legacy-form')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{await unwrap(window.desktop.applyLegacy(new FormData(event.target).get('confirm')));state.legacyPreview=null;state.page='soldiers';await load();render();notify('تم استيراد البيانات والمرفقات دون نقل كلمة المرور القديمة');}catch(e){notify(e.message);}finally{button.disabled=false;}});
  root.querySelectorAll('[data-profile],[data-edit]').forEach(button=>{button.onclick=async()=>{try{state.pendingSoldierPhotos={};state.record=await request('GET',`/api/soldier?id=${button.dataset.profile||button.dataset.edit}`);state.page=button.dataset.edit?'edit':'profile';render();}catch(e){notify(e.message);}};});
  document.getElementById('archive')?.addEventListener('click',async()=>{const s=state.record.soldier;try{await request('POST','/api/soldier/archive',{id:s.id,version:s.version,archived:!s.archived},crypto.randomUUID());state.page='soldiers';await load();render();notify(s.archived?'تم إلغاء الأرشفة':'تمت الأرشفة');}catch(e){notify(e.message);}});
  document.getElementById('save-profile-photos')?.addEventListener('click',async()=>{try{await uploadPendingSoldierPhotos(state.record.soldier.id);state.pendingSoldierPhotos={};state.record=await request('GET',`/api/soldier?id=${state.record.soldier.id}`);render();notify('تم حفظ الصور');}catch(e){notify(e.message);}});
  bindSoldierPhotoPickers();
  document.getElementById('attachment-form')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{const file=await unwrap(window.desktop.pickAttachment());if(file){await request('POST','/api/attachments',{...file,kind:new FormData(event.target).get('kind'),soldierId:state.record.soldier.id},crypto.randomUUID());state.record=await request('GET',`/api/soldier?id=${state.record.soldier.id}`);render();notify('تم حفظ المرفق');}}catch(e){notify(e.message);}finally{button.disabled=false;}});
  root.querySelectorAll('[data-attachment]').forEach(button=>button.onclick=async()=>{try{await unwrap(window.desktop.saveAttachment(button.dataset.attachment));}catch(e){notify(e.message);}});
  document.getElementById('internal-lookup')?.addEventListener('submit',async event=>{event.preventDefault();try{const no=new FormData(event.target).get('lookupNo').trim();const result=await request('GET',`/api/soldiers?q=${encodeURIComponent(no)}`);state.selectedInternal=result.soldiers.find(s=>s.military_no===no)||null;if(!state.selectedInternal)notify('لا يوجد عسكري نشط بهذا الرقم');await loadModule();render();}catch(e){notify(e.message);}});
  document.getElementById('outletId')?.addEventListener('change',async event=>{const page=state.page;if(page==='buffet')state.buffetOutletId=event.target.value;else if(page==='canteen')state.canteenOutletId=event.target.value;await loadLedgerModule(page);render();});
  const ledger=document.getElementById('ledger-form');if(ledger){ledger.elements.amount.step='0.01';ledger.elements.amount.min='0.01';ledger.addEventListener('submit',event=>{const page=ledger.dataset.ledgerPage;const outletId=ledgerOutletId(page);const values=Object.fromEntries(new FormData(ledger));if(!/^\d{1,7}(\.\d{1,2})?$/.test(values.amount)){event.preventDefault();notify('أدخل مبلغًا موجبًا بدقة قرشين');return;}const [whole,decimal='']=values.amount.split('.');saveForm(event,'/api/canteen',{soldierId:state.selectedInternal.id,outletId,amountCents:Number(whole)*100+Number(decimal.padEnd(2,'0')),notes:values.notes},async result=>{if(!result?.id)return;try{await unwrap(window.desktop.document({type:'canteen',id:result.id,mode:'preview'}));}catch(e){notify(e.message);}});});}
  document.querySelectorAll('#month-form').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();state.month=new FormData(event.target).get('month');await navigate(form.dataset.ledgerPage||state.page);}));
  root.querySelectorAll('[data-outlet-add]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const kind=form.dataset.outletAdd;const name=new FormData(form).get('name').trim();if(!name)return notify(kind==='buffet'?'أدخل اسم البوفيه':'أدخل اسم الكانتين');try{await request('POST','/api/outlets',{name,kind},crypto.randomUUID());await load();await navigate('settings');notify(kind==='buffet'?'تمت إضافة البوفيه':'تمت إضافة الكانتين');}catch(e){notify(e.message);}}));
  root.querySelectorAll('[data-outlet-disable]').forEach(btn=>btn.onclick=async()=>{try{await request('POST','/api/outlets/update',{id:btn.dataset.outletDisable,disabled:true},crypto.randomUUID());await load();await navigate('settings');notify('تم التعطيل');}catch(e){notify(e.message);}});
  document.getElementById('visitor-category-add-form')?.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));if(!values.name.trim())return notify('أدخل اسم الفئة');try{await request('POST','/api/visitor-categories',{name:values.name.trim(),tier:values.tier},crypto.randomUUID());await load();await navigate('settings');notify('تمت إضافة الفئة');}catch(e){notify(e.message);}});
  root.querySelectorAll('[data-visitor-category-disable]').forEach(btn=>btn.onclick=async()=>{try{await request('POST','/api/visitor-categories/update',{id:btn.dataset.visitorCategoryDisable,disabled:true},crypto.randomUUID());await load();await navigate('settings');notify('تم تعطيل الفئة');}catch(e){notify(e.message);}});
  document.getElementById('visitor-add-form')?.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));const body={name:values.name,categoryId:values.categoryId,organization:values.organization,phone:values.phone,notes:values.notes};if(values.badgeNo.trim())body.badgeNo=values.badgeNo.trim();try{await request('POST','/api/visitors',body,crypto.randomUUID());state.visitorQuery='';await load();await navigate('visitors');notify('تم حفظ الزائر');}catch(e){notify(e.message);}});
  document.getElementById('visitor-search-form')?.addEventListener('submit',async event=>{event.preventDefault();state.visitorQuery=new FormData(event.target).get('q').trim();await navigate('visitors');});
  root.querySelectorAll('[data-visitor-qr]').forEach(btn=>btn.onclick=async()=>{try{const qr=await unwrap(window.desktop.qrVisitor(btn.dataset.visitorQr));const card=document.createElement('div');card.className='card';card.innerHTML=`<div class="card-body stack"><h2>QR الزائر</h2><img alt="QR" src="${qr}"></div>`;root.querySelector('.page-content')?.prepend(card);}catch(e){notify(e.message);}});
  root.querySelectorAll('[data-reversal]').forEach(form=>form.addEventListener('submit',event=>saveForm(event,'/api/canteen/reverse',{id:form.dataset.reversal,reason:new FormData(form).get('reason')},()=>{})));
  const fit=document.getElementById('fitness-form');if(fit){fit.elements.value.step='0.01';fit.elements.value.min='0';fit.addEventListener('submit',event=>{const values=Object.fromEntries(new FormData(fit));saveForm(event,'/api/fitness',{...values,value:Number(values.value),soldierId:state.selectedInternal.id},()=>{});});}
  document.getElementById('report-form')?.addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.target));state.reportFilter={...values,outletId:values.outletId||''};await navigate('reports');});
  document.getElementById('report-form')?.querySelector('[name=type]')?.addEventListener('change',()=>{const form=document.getElementById('report-form');if(!form)return;const values=Object.fromEntries(new FormData(form));state.reportFilter={...values,outletId:values.outletId||''};render();});
  root.querySelectorAll('[data-report-preset]').forEach(btn=>{btn.onclick=()=>{const form=document.getElementById('report-form');if(!form)return;const t=today();if(btn.dataset.reportPreset==='today'){form.from.value=t;form.to.value=t;}else if(btn.dataset.reportPreset==='7d'){form.from.value=cairoAddDays(t,-6);form.to.value=t;}else if(btn.dataset.reportPreset==='month'){form.from.value=t.slice(0,8)+'01';form.to.value=t;}};});
  document.getElementById('daily-report-form')?.addEventListener('submit',async event=>{event.preventDefault();state.dailyReportDate=event.target.date.value;await navigate('daily-report');});
  root.querySelectorAll('[data-daily-preset]').forEach(btn=>{btn.onclick=()=>{const form=document.getElementById('daily-report-form');if(!form)return;form.date.value=btn.dataset.dailyPreset==='yesterday'?cairoAddDays(today(),-1):today();};});
  root.querySelectorAll('[data-doc="daily-report"]').forEach(button=>{if(!button.dataset.date&&state.dailyReportDate)button.dataset.date=state.dailyReportDate;});
  root.querySelectorAll('[data-correction]').forEach(form=>form.addEventListener('submit',event=>saveForm(event,'/api/gate/correct',{eventId:form.dataset.correction,reason:new FormData(form).get('reason')},()=>{})));
  document.getElementById('csv-export')?.addEventListener('click',async()=>{try{if(await unwrap(window.desktop.exportReport(state.reportFilter)))notify('تم حفظ التقرير');}catch(e){notify(e.message);}});
  root.querySelectorAll('[data-doc]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await unwrap(window.desktop.document({type:button.dataset.doc,id:button.dataset.id,mode:button.dataset.mode,filter:state.reportFilter,soldierId:button.dataset.soldierId,month:button.dataset.month,outletId:button.dataset.outletId,date:button.dataset.date||state.dailyReportDate}));}catch(e){notify(e.message);}finally{button.disabled=false;}});
  document.getElementById('printing-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.target;const values=new FormData(form);try{await unwrap(window.desktop.document({type:values.get('type'),copies:Number(values.get('copies')),ids:values.getAll('ids'),mode:event.submitter?.value||'preview'}));}catch(e){notify(e.message);}});
  document.getElementById('settings-form')?.addEventListener('submit',event=>{const form=event.target;const values=Object.fromEntries(new FormData(form));saveForm(event,'/api/settings',{...values,extraReasons:[values.reason1,values.reason2].filter(v=>v.trim()),showLogo:form.elements.showLogo.checked,autoBackup:form.elements.autoBackup.checked,autoBackupIntervalHours:Number(values.autoBackupIntervalHours),backupRetentionDays:Number(values.backupRetentionDays),logo:state.pendingLogo===undefined?state.catalog.settings.logo:state.pendingLogo,version:state.catalog.settings.version},()=>{state.pendingLogo=undefined;});});
  document.getElementById('choose-logo')?.addEventListener('click',async()=>{try{const file=await unwrap(window.desktop.pickAttachment());if(file&&file.mime.startsWith('image/')){state.pendingLogo=`data:${file.mime};base64,${file.content}`;notify('تم اختيار الشعار؛ اضغط حفظ');}else if(file)notify('اختر صورة PNG أو JPEG');}catch(e){notify(e.message);}});
  document.getElementById('remove-logo')?.addEventListener('click',()=>{state.pendingLogo=null;notify('اضغط حفظ لتأكيد إزالة الشعار');});
  document.getElementById('backup-create')?.addEventListener('click',async()=>{try{await request('POST','/api/backup/create',{},crypto.randomUUID());await navigate('backups');notify('تم إنشاء النسخة المشفرة على الخادم');}catch(e){notify(e.message);}});
  document.getElementById('backup-import')?.addEventListener('click',async()=>{try{const result=await unwrap(window.desktop.importBackup());if(result){await navigate('backups');notify('تم التحقق من ملف النسخة واستيراده');}}catch(e){notify(e.message);}});
  root.querySelectorAll('[data-backup-save]').forEach(button=>button.onclick=async()=>{try{await unwrap(window.desktop.saveBackup(button.dataset.backupSave));}catch(e){notify(e.message);}});
  root.querySelectorAll('[data-backup-preview]').forEach(button=>button.onclick=async()=>{try{state.restorePreview=await request('GET',`/api/backup/preview?id=${button.dataset.backupPreview}`);state.restoreId=button.dataset.backupPreview;render();}catch(e){notify(e.message);}});
  document.getElementById('restore-form')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{const values=Object.fromEntries(new FormData(event.target));await request('POST','/api/backup/restore',{...values,id:state.restoreId},crypto.randomUUID());state.session=null;state.restorePreview=null;await unwrap(window.desktop.logout()).catch(()=>{});render();notify('تمت الاستعادة وإنشاء نسخة أمان؛ سجل الدخول من جديد');}catch(e){notify(e.message);}finally{button.disabled=false;}});
}
