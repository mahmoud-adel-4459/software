# نشر نظام شؤون العسكريين — دليل IT

## 1. المتطلبات

- Windows Server أو PC ثابت للخادم
- Node.js 24+
- PostgreSQL 15+
- مجلد خارج OneDrive (مثل `C:\MilitaryAffairsServer`)

## 2. قاعدة البيانات

```sql
CREATE USER military_app WITH PASSWORD 'كلمة_قوية';
CREATE DATABASE military_affairs OWNER military_app;
```

## 3. ملف `.env`

انسخ `.env.example` وعدّل: `DATABASE_URL`, `SERVER_ID` (UUID ثابت), `ADMIN_PASSWORD`, `BACKUP_KEY_HEX`, مسارات TLS والترخيص.

## 4. شهادات HTTPS

أنشئ CA داخلية وشهادة خادم بـ SAN يتضمن اسم/عنوان الخادم. راجع `scripts/lab-setup.cjs` كمثال أو OpenSSL في [scripts/LAB-AR.md](../scripts/LAB-AR.md).

## 5. تهيئة وترخيص

```powershell
npm.cmd ci
npm.cmd run server:init
npm.cmd run server:activation
```

- صدّر طلبي جهاز (داخلي + بوابة) من Electron.
- `node scripts/license-manifest.cjs`
- `npm.cmd run license -- issue private/issuer-private.pem private/manifest.json private/license.json`

## 6. تشغيل الخدمة

```powershell
npm.cmd run server
```

أو WinSW: [server/install-service.ps1](../server/install-service.ps1)

## 7. العميل

- `npm.cmd run pack:portable` أو `scripts/build-release.ps1` من مسار بناء خارج OneDrive
- على كل جهاز: عنوان HTTPS + استيراد `ca-cert.pem` + تسجيل دخول

## 8. تحقق ما قبل التشغيل

```powershell
node scripts/prod-preflight.cjs
```

## 9. SmartScreen

المثبت غير موقع — استخدم «مزيد من المعلومات» → «تشغيل على أي حال» أو وقّع المثبت لاحقًا.

## 10. اختبار PostgreSQL

```powershell
$env:TEST_DATABASE_URL="postgresql://..."
npm.cmd test
```
