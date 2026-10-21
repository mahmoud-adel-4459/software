'use strict';
let previewSession;
try { previewSession = sessionStorage.getItem('previewSession') || undefined; } catch { previewSession = undefined; }
async function previewCall(action,values={}){
 let response;
 try{
  response=await fetch('/preview',{method:'POST',headers:{'Content-Type':'application/json','X-Preview-Secret':previewSecret},body:JSON.stringify({action,session:previewSession,...values})});
 }catch{
  return {ok:false,error:'تعذر الاتصال بالخادم المحلي (Failed to fetch). شغّل: npm.cmd run preview:local — واترك الطرفية مفتوحة، ثم افتح الرابط الذي يظهر فيها.'};
 }
 let result;
 try{result=await response.json();}catch{return {ok:false,error:'استجابة غير متوقعة من الخادم. أعد تشغيل المعاينة.'};}
 if(result.data?.previewSession){previewSession=result.data.previewSession;try{sessionStorage.setItem('previewSession',previewSession);}catch{/* ignore */}}
 if(!response.ok&&!result.error)result.error='طلب مرفوض ('+response.status+')';
 return result;
}
const unavailable=async()=>({ok:false,error:'هذه الوظيفة تحتاج نسخة Electron؛ معاينة المتصفح لا تختبر الطباعة وPDF والملفات والنسخ الاحتياطية.'});
const fmtTime=value=>value?new Intl.DateTimeFormat('ar-EG-u-nu-latn',{dateStyle:'short',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(value)):'';
function showPreviewOverlay(title,lines,arg){
 document.querySelector('.preview-voucher')?.remove();
 const overlay=document.createElement('section');overlay.className='preview-voucher';
 const h=document.createElement('h2');h.textContent=title;overlay.append(h);
 for(const text of lines){const p=document.createElement('p');p.textContent=text;overlay.append(p);}
 const controls=document.createElement('div');controls.className='actions preview-voucher-controls';
 const print=document.createElement('button');print.className='btn btn-primary';print.textContent='طباعة / حفظ PDF';print.onclick=()=>window.print();
 const close=document.createElement('button');close.className='btn btn-secondary';close.textContent='إغلاق';close.onclick=()=>overlay.remove();controls.append(print,close);overlay.append(controls);document.body.append(overlay);
 if(arg.mode==='print'||arg.mode==='pdf')window.print();return {ok:true,data:true};
}
async function previewDocument(arg){
 if(arg.type==='voucher'){
  const result=await previewCall('request',{method:'GET',path:'/api/permit?id='+encodeURIComponent(arg.id)});if(!result.ok)return result;
  const catalog=await previewCall('request',{method:'GET',path:'/api/catalog'});if(!catalog.ok)return catalog;
  const p=result.data;
  document.querySelector('.preview-voucher')?.remove();
  const overlay=document.createElement('section');overlay.className='preview-voucher';
  const add=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;overlay.append(e);};
  const time=value=>value?fmtTime(value):'لم يسجل الدخول بعد';
  add('h1',catalog.data.settings.unitName);add('h2','إذن خروج ودخول رقم '+p.no);
  for(const text of [`${p.rank} / ${p.name}`,`الرقم العسكري: ${p.military_no}`,`السرية: ${p.company}`,`سبب الخروج: ${p.reason}`,`وقت الخروج: ${time(p.exit_at)}`,`موعد العودة المتوقع: ${time(p.expected_return)}`,`وقت الدخول الفعلي: ${time(p.returned_at)}`,p.voided?'الإذن ملغى':p.returned_at?'إذن مكتمل — عاد العسكري':'إذن نشط — العسكري خارج الوحدة','توقيع مسؤول الخروج: ................','توقيع مسؤول الدخول: ................','ختم الوحدة: ................'])add('p',text);
  const controls=document.createElement('div');controls.className='actions preview-voucher-controls';
  const print=document.createElement('button');print.className='btn btn-primary';print.textContent='طباعة / حفظ PDF';print.onclick=()=>window.print();
  const close=document.createElement('button');close.className='btn btn-secondary';close.textContent='إغلاق';close.onclick=()=>overlay.remove();controls.append(print,close);overlay.append(controls);document.body.append(overlay);
  if(arg.mode==='print'||arg.mode==='pdf')window.print();return {ok:true,data:true};
 }
 if(arg.type==='canteen'){
  const result=await previewCall('request',{method:'GET',path:'/api/canteen/transaction?id='+encodeURIComponent(arg.id)});if(!result.ok)return result;
  const t=result.data;const amount=(Math.abs(t.amount_cents)/100).toFixed(2);
  const reversal=t.amount_cents<0||t.reversal_of;
  return showPreviewOverlay(reversal?'إيصال تصحيح الكانتين':'إيصال الكانتين',[`${t.rank} / ${t.name}`,`الرقم العسكري: ${t.military_no} · السرية: ${t.company}`,`التاريخ: ${fmtTime(t.at)}`,`المبلغ: ${amount} ج.م`,t.notes?`ملاحظات: ${t.notes}`:'',t.cashier?`مسؤول التسجيل: ${t.cashier}`:'','توقيع العسكري: ................','توقيع الكاشير: ................'].filter(Boolean),arg);
 }
 if(arg.type==='canteen-statement'){
  if(!arg.soldierId||!arg.month)return {ok:false,error:'اختر العسكري والشهر'};
  const ledger=await previewCall('request',{method:'GET',path:`/api/canteen?soldierId=${encodeURIComponent(arg.soldierId)}&month=${encodeURIComponent(arg.month)}`});if(!ledger.ok)return ledger;
  const soldier=await previewCall('request',{method:'GET',path:'/api/soldier?id='+encodeURIComponent(arg.soldierId)});if(!soldier.ok)return soldier;
  const s=soldier.data.soldier;const total=((ledger.data.totalCents||0)/100).toFixed(2);
  const lines=[`${s.rank} / ${s.name}`,`الرقم العسكري: ${s.military_no} · السرية: ${s.company}`,`إجمالي الشهر: ${total} ج.م`,...(ledger.data.transactions||[]).slice(0,12).map(r=>`${fmtTime(r.at)} · ${(r.amount_cents/100).toFixed(2)} ج.م${r.notes?` · ${r.notes}`:''}`)];
  if((ledger.data.transactions||[]).length>12)lines.push(`… و${ledger.data.transactions.length-12} حركة أخرى`);
  return showPreviewOverlay(`كشف حساب الكانتين — ${arg.month}`,lines,arg);
 }
 return unavailable();
}
window.desktop=Object.freeze({
 info:()=>previewCall('info',{kind:new URLSearchParams(location.search).get('device')}),
 login:data=>previewCall('login',{data}),logout:()=>previewCall('logout'),
 request:(method,path,data,requestId)=>previewCall('request',{method,path,data,requestId}),qr:data=>previewCall('qr',{data}),
 configure:unavailable,importCA:unavailable,exportDevice:unavailable,printers:async()=>({ok:true,data:[]}),
 document:previewDocument,exportReport:unavailable,pickAttachment:unavailable,saveAttachment:unavailable,saveBackup:unavailable,importBackup:unavailable,previewLegacy:unavailable,applyLegacy:unavailable
});
document.title='تجربة محلية مؤقتة — شؤون العسكريين';
const banner=document.createElement('div');banner.className='preview-mode-banner';banner.setAttribute('role','status');
banner.innerHTML='<strong>معاينة متصفح</strong> — كلمة المرور في الطرفية أو <code>private/preview-login.txt</code> (ليست lab-login). للطباعة: <code>npm.cmd run demo</code>.';
document.body.prepend(banner);
