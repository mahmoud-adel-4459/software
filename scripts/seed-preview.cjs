'use strict';
// Explicit, synthetic sample records for the temporary local preview only.
const {randomUUID}=require('node:crypto');
const {cairoDate}=require('../shared/time.cjs');
async function main(){
 const [origin,password]=process.argv.slice(2);const url=new URL(origin);
 if(url.hostname!=='127.0.0.1'||url.protocol!=='http:'||!password)throw new Error('Usage: node scripts/seed-preview.cjs <local-preview-url> <preview-password>');
 const bridge=await(await fetch(origin+'/preview-bridge.js')).text();const secret=JSON.parse(bridge.match(/^const previewSecret=("[a-f0-9]+")/)[1]);let session;
 async function call(action,args={}){const r=await(await fetch(origin+'/preview',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'X-Preview-Secret':secret},body:JSON.stringify({action,session,...args})})).json();if(!r.ok)throw Error(r.error);if(r.data?.previewSession)session=r.data.previewSession;return r.data;}
 await call('info',{kind:'internal'});await call('login',{data:{username:'admin',password}});
 const {soldiers:existing}=await call('request',{method:'GET',path:'/api/soldiers?q='});
 const names=['أحمد محمد علي حسن','محمود إبراهيم أحمد سالم','محمد حسن محمود علي','علي مصطفى سعيد أحمد','حسن خالد عبد الله عمر','عمر يوسف محمد حسن','خالد أحمد محمود سعيد','يوسف علي حسن إبراهيم','مصطفى محمود خالد محمد','إبراهيم حسن أحمد علي'];let count=0;
 for(let i=0;i<names.length;i++){
  const militaryNo='99000'+String(i+1).padStart(3,'0');if(existing.some(s=>s.military_no===militaryNo))continue;
  await call('request',{method:'POST',path:'/api/soldiers',requestId:randomUUID(),data:{name:names[i]+' (تجريبي)',militaryNo,nationalId:'9999999999'+String(i+1).padStart(4,'0'),rank:i<8?'جندي':'عريف',company:['الأولى','الثانية'][i%2],unit:'وحدة اختبار',phone:'',address:'بيانات وهمية للتجربة فقط',details:{}}});count++;
 }
 const get=path=>call('request',{method:'GET',path});
 const post=(path,data)=>call('request',{method:'POST',path,data,requestId:randomUUID()});
 const {soldiers}=await get('/api/soldiers?q=990000');
 const samples=soldiers.filter(s=>/^990000(0[1-9]|10)$/.test(s.military_no)).sort((a,b)=>a.military_no.localeCompare(b.military_no));
 const {permits}=await get('/api/permits');let movements=0,purchases=0,fitness=0;
 for(let i=0;i<samples.length;i++){
  const s=samples[i];
  if(i>=1&&i<=4&&!permits.some(p=>p.soldier_id===s.id)&&s.status==='in'){
   await post('/api/gate',{soldierId:s.id,kind:'exit',reason:['إجازة اعتيادية','مأمورية رسمية','كشف طبي','خروج ساعات'][i-1],expectedReturn:new Date(Date.now()+(i===4?3000:86400000*(i+1))).toISOString(),notes:'حركة وهمية للتجربة'});movements++;
   if(i===2){await post('/api/gate',{soldierId:s.id,kind:'entry',notes:'عودة تجريبية'});movements++;}
  }
  const ledger=await get('/api/canteen?soldierId='+s.id);
  if(!ledger.transactions.some(t=>t.notes==='شراء تجريبي')){
   await post('/api/canteen',{soldierId:s.id,amountCents:(i+1)*1250,notes:'شراء تجريبي'});purchases++;
  }
  if(i===0&&!ledger.transactions.some(t=>t.notes==='عملية تجريبية ملغاة')){
   const entry=await post('/api/canteen',{soldierId:s.id,amountCents:5000,notes:'عملية تجريبية ملغاة'});
   await post('/api/canteen/reverse',{id:entry.id,reason:'إلغاء تجريبي للتحقق من صافي الحساب'});
  }
  const records=await get('/api/fitness?soldierId='+s.id);
  for(const [type,value]of [['ضغط',20+i*3],['جري 3 كم',780+i*15]]){
   if(!records.records.some(r=>r.type===type&&r.notes==='قياس تجريبي')){await post('/api/fitness',{soldierId:s.id,type,value,date:cairoDate(),notes:'قياس تجريبي'});fitness++;}
  }
 }
 const summary=await get('/api/summary');
 const report=await get('/api/reports?type=fitness&from='+cairoDate()+'&to='+cairoDate());
 if(!report.rows.length)throw new Error('Fitness report did not return seeded records');
 await call('logout');console.log(`Added: ${count} soldiers, ${movements} gate events, ${purchases} purchases, ${fitness} fitness records. Backend report: ${report.rows.length} fitness rows. Outside: ${summary.outside}. Numbers: 99000001–99000010.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
