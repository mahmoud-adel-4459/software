'use strict';
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');
const QRCode=require('qrcode');const {buildQrPayload}=require('../shared/soldier-profile.cjs');const {csv,reportTable,dailyReportHtml,documentHtml,cards,voucher,canteenReceipt,canteenStatement}=require('./documents.cjs');
function registerOutput({expose,app,BrowserWindow,dialog,window:windowProvider,getSession,api}) {
  const previews=new Set();
  const owner=()=>{const s=getSession();if(!s)throw new Error('سجل الدخول أولًا');if(s.kind!=='internal'||s.user.role!=='admin')throw new Error('هذه الوظيفة متاحة للمسؤول فقط');return s;};
  const canteenPrinter=()=>{const s=getSession();if(!s)throw new Error('سجل الدخول أولًا');if(s.kind!=='internal'||!['admin','clerk'].includes(s.user.role))throw new Error('الطباعة متاحة للجهاز الداخلي (مسؤول أو كاشير)');return s;};
  const reportPath=filter=>{const query=new URLSearchParams();for(const key of ['type','from','to','q','company','outletId'])if(filter?.[key])query.set(key,String(filter[key]));return '/api/reports?'+query;};
  expose('app:printers',async()=>{owner();return windowProvider().webContents.getPrintersAsync();});
  expose('app:export-report',async filter=>{
    owner();const report=await api('GET',reportPath(filter));const result=await dialog.showSaveDialog(windowProvider(),{title:'حفظ تقرير CSV',defaultPath:`${report.type}-${report.from}.csv`,filters:[{name:'CSV',extensions:['csv']}]});
    if(result.canceled)return false;owner();fs.writeFileSync(result.filePath,csv(report),'utf8');return true;
  });
  expose('app:document',async arg=>{
    const session=getSession();if(!session)throw new Error('سجل الدخول أولًا');
    if(!arg||!['card','qr','voucher','report','daily-report','canteen','canteen-statement'].includes(arg.type)||!['print','pdf','preview'].includes(arg.mode))throw new Error('طلب طباعة غير صالح');
    if(arg.type==='canteen'||arg.type==='canteen-statement')canteenPrinter();
    else if(arg.type!=='voucher')owner();
    const catalog=await api('GET','/api/catalog');const settings=catalog.settings;
    let body;
    if(arg.type==='report')body=reportTable(await api('GET',reportPath(arg.filter)));
    else if(arg.type==='daily-report'){const q=arg.date?`?date=${encodeURIComponent(arg.date)}`:'';body=dailyReportHtml(await api('GET',`/api/reports/daily${q}`));}
    else if(arg.type==='voucher')body=voucher(await api('GET',`/api/permit?id=${encodeURIComponent(arg.id)}`));
    else if(arg.type==='canteen') {
      if(!arg.id)throw new Error('معرف العملية مطلوب');
      body=canteenReceipt(await api('GET',`/api/canteen/transaction?id=${encodeURIComponent(arg.id)}`));
    } else if(arg.type==='canteen-statement') {
      if(!arg.soldierId||!arg.month)throw new Error('اختر العسكري والشهر');
      const outletQ=arg.outletId?`&outletId=${encodeURIComponent(arg.outletId)}`:'';
      const ledger=await api('GET',`/api/canteen?soldierId=${encodeURIComponent(arg.soldierId)}&month=${encodeURIComponent(arg.month)}${outletQ}`);
      const soldier=(await api('GET',`/api/soldier?id=${encodeURIComponent(arg.soldierId)}`)).soldier;
      body=canteenStatement({soldier,...ledger});
    } else {
      if(!Array.isArray(arg.ids)||arg.ids.length<1||arg.ids.length>100||!Number.isInteger(arg.copies)||arg.copies<1||arg.copies>8)throw new Error('اختر من 1 إلى 100 عسكري ومن 1 إلى 8 نسخ');
      const soldiers=await Promise.all(arg.ids.map(async id=>(await api('GET',`/api/soldier?id=${encodeURIComponent(id)}`)).soldier));
      const qr=await Promise.all(soldiers.map(s=>QRCode.toDataURL(buildQrPayload(s),{errorCorrectionLevel:'L',width:420,margin:2})));
      body=cards(soldiers,qr,arg.copies,arg.type==='qr');
    }
    if(getSession()!==session)throw new Error('تغيرت الجلسة');
    const folder=path.join(app.getPath('userData'),'print');fs.mkdirSync(folder,{recursive:true});
    const source=path.join(folder,`${require('node:crypto').randomUUID()}.html`);
    fs.writeFileSync(source,documentHtml({title:'شؤون العسكريين',body,settings,fontUrl:pathToFileURL(path.join(__dirname,'../fonts/plex-arabic-arabic-400.woff2')).href}));
    const preview=new BrowserWindow({show:false,width:1000,height:850,parent:windowProvider(),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    previews.add(preview);preview.on('closed',()=>previews.delete(preview));
    preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));preview.webContents.on('will-navigate',event=>event.preventDefault());
    const cleanup=()=>{try{fs.unlinkSync(source);}catch{}};preview.on('closed',cleanup);
    let shown=false;
    try {
      await preview.loadFile(source);
      if(arg.mode==='preview'){preview.show();shown=true;return true;}
      if(arg.mode==='pdf') {
        const result=await dialog.showSaveDialog(windowProvider(),{title:'حفظ PDF',defaultPath:'document.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
        if(result.canceled)return false;
        const pdf=await preview.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});
        if(getSession()!==session)throw new Error('تغيرت الجلسة');fs.writeFileSync(result.filePath,pdf);return true;
      }
      await new Promise((resolve,reject)=>preview.webContents.print({silent:false,printBackground:true,deviceName:settings.printer||'',pageSize:settings.paper||'A4',margins:{marginType:settings.margins==='narrow'?'minimum':'default'}},(success,reason)=>success?resolve():reject(new Error(reason||'تعذرت الطباعة'))));return true;
    }finally{if(!shown)preview.close();}
  });
  expose('app:pick-attachment',async()=>{
    owner();const result=await dialog.showOpenDialog(windowProvider(),{title:'اختيار صورة أو مستند',filters:[{name:'Images / PDF',extensions:['png','jpg','jpeg','pdf']}],properties:['openFile']});
    if(result.canceled)return null;const file=result.filePaths[0];if(fs.statSync(file).size>5*1024*1024)throw new Error('الحد الأقصى 5 ميجابايت');
    const ext=path.extname(file).toLowerCase();const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.pdf':'application/pdf'}[ext];
    if(!mime)throw new Error('نوع غير مسموح');return {name:path.basename(file),mime,content:fs.readFileSync(file).toString('base64')};
  });
  expose('app:save-attachment',async id=>{
    const s=getSession();if(!s)throw new Error('سجل الدخول أولًا');const attachment=await api('GET',`/api/attachment?id=${encodeURIComponent(id)}`);
    const ext={'image/png':'png','image/jpeg':'jpg','application/pdf':'pdf'}[attachment.mime];if(!ext)throw new Error('نوع ملف غير صالح');
    const result=await dialog.showSaveDialog(windowProvider(),{title:'حفظ المرفق',defaultPath:attachment.name.replace(/[\\/:*?"<>|]/g,'_'),filters:[{name:'Attachment',extensions:[ext]}]});
    if(result.canceled)return false;if(getSession()!==s)throw new Error('تغيرت الجلسة');fs.writeFileSync(result.filePath,Buffer.from(attachment.content,'base64'));return true;
  });
  expose('app:backup-save',async id=>{
    owner();const envelope=await api('GET',`/api/backup/download?id=${encodeURIComponent(id)}`);const result=await dialog.showSaveDialog(windowProvider(),{title:'حفظ النسخة الاحتياطية المشفرة',defaultPath:id,filters:[{name:'Encrypted backup',extensions:['mab']}]});
    if(result.canceled)return false;owner();fs.writeFileSync(result.filePath,JSON.stringify(envelope));return true;
  });
  expose('app:backup-import',async()=>{
    owner();const result=await dialog.showOpenDialog(windowProvider(),{title:'استيراد نسخة احتياطية مشفرة',filters:[{name:'Encrypted backup',extensions:['mab']}],properties:['openFile']});
    if(result.canceled)return null;if(fs.statSync(result.filePaths[0]).size>48*1024*1024)throw new Error('النسخة أكبر من المسموح');
    return api('POST','/api/backup/import',JSON.parse(fs.readFileSync(result.filePaths[0],'utf8')));
  });
  let legacySource,legacyRequest;
  expose('app:legacy-preview',async()=>{
    owner();const result=await dialog.showOpenDialog(windowProvider(),{title:'اختيار ملف بيانات النسخة القديمة',filters:[{name:'JSON',extensions:['json']}],properties:['openFile']});
    if(result.canceled)return null;if(fs.statSync(result.filePaths[0]).size>32*1024*1024)throw new Error('الحد الأقصى لملف الاستيراد 32 ميجابايت');
    legacySource=JSON.parse(fs.readFileSync(result.filePaths[0],'utf8'));legacyRequest=require('node:crypto').randomUUID();return api('POST','/api/import/preview',legacySource);
  });
  expose('app:legacy-apply',async confirmation=>{
    owner();if(!legacySource||confirmation!=='IMPORT')throw new Error('راجع الملف أولًا واكتب IMPORT');
    const result=await api('POST','/api/import/apply',{confirm:'IMPORT',source:legacySource},legacyRequest);legacySource=null;return result;
  });
  return {close:()=>{for(const preview of previews)preview.close();legacySource=null;}};
}
module.exports={registerOutput};
