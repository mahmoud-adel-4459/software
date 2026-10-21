# تجربة محلية — Electron + طباعة (Lab)

## أوضاع سريعة

| الوضع | الأمر | طباعة |
|--------|--------|-------|
| **تجربة كاملة** | `npm.cmd run demo` | نعم |
| Lab يدوي | `lab:server` + `lab:start` | نعم |
| متصفح فقط | `preview:local` | لا |
| إنتاج | `server` + Electron معتمد | نعم |

## مرة واحدة (أو يُنفَّذ تلقائياً مع `demo`)

```powershell
cd c:\Users\dola\OneDrive\Desktop\SOFTWAER
$env:OPENSSL="C:\laragon\bin\git\mingw64\bin\openssl.exe"
npm.cmd run lab:setup
```

بيانات الدخول في `private/lab-login.txt` (لا تشارك هذا الملف).

## لا تفتح :8443 في Chrome/Edge للواجهة

`https://127.0.0.1:8443` = **خادم بيانات فقط** (شاشة بيضاء أو JSON). الواجهة العربية في **Electron** أو `preview:local`.

## كل جلسة — الطريقة السهلة

```powershell
npm.cmd run demo
```

(يفتح الخادم في نافذة ويشغّل Electron.)

## كل جلسة — يدوي

**طرفية 1 — الخادم:**

```powershell
npm.cmd run lab:server
```

اتركها مفتوحة. البيانات في الذاكرة فقط؛ عند الإغلاق تُحذف.

**طرفية 2 — Electron:**

```powershell
npm.cmd run lab:start
```

أو من النسخة المحمولة (اختصار):

```text
"c:\Users\dola\OneDrive\Desktop\SOFTWAER\artifacts\desktop-portable\Military Affairs.exe" --lab
```

سجّل الدخول بـ `admin` وكلمة المرور من `private/lab-login.txt`.

## طباعة الكانتين

الكانتين → اختر عسكريًا → سجّل مشتريات → معاينة / طباعة / PDF.

## إنتاج حقيقي

استخدم PostgreSQL و `npm.cmd run server:init` ثم `npm.cmd run server` — راجع README.md.
