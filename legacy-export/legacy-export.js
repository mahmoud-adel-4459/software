'use strict';
document.getElementById('export-legacy').onclick=()=>{
  const status=document.getElementById('export-status');
  try{
    const raw=localStorage.getItem('unit-system-v1');if(!raw)throw new Error('لا توجد بيانات محفوظة في هذا المصدر. افتح الأداة من نفس أصل النسخة القديمة.');
    const source=JSON.parse(raw);if(source.v!==1||!Array.isArray(source.soldiers))throw new Error('بيانات المصدر غير مدعومة');
    // The old plaintext password is deliberately omitted from the transfer file.
    if(source.settings?.admin)delete source.settings.admin.password;
    const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([JSON.stringify(source)],{type:'application/json;charset=utf-8'}));link.download='military-legacy-export.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    status.textContent=`تم تصدير ${source.soldiers.length} فردًا. راجع الملف من شاشة الاستيراد في الجهاز الداخلي.`;
  }catch(error){status.textContent=error.message;}
};
