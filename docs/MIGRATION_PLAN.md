# خطة التحويل: SQLite + Prisma + TypeScript + واجهة React/MUI

> الحالة: **خطة معتمدة للتنفيذ على مراحل** — أُعدّت بعد فحص الكود الحالي وتجربة عملية (PoC) للتأكد من إمكانية التنفيذ.
> المراجع الأصلية (كما وصلت) محفوظة حرفيًا في:
> - [reference/BACKEND-GUIDE-RASAD.md](reference/BACKEND-GUIDE-RASAD.md) — دليل بناء الباك اند
> - [reference/DESIGN-SYSTEM-RASAD.md](reference/DESIGN-SYSTEM-RASAD.md) — مرجع تصميم لوحة التحكم
>
> هذا الملف يشرح **كيف نطبّقها على هذا المشروع** تحديدًا، وما الذي نغيّره عن المرجع ولماذا.

---

## 0) النسخة الاحتياطية (تمّت قبل أي تعديل)

| ما تم نسخه | المكان |
|---|---|
| المشروع كاملًا (بدون `node_modules` و`artifacts`) مع `.git` وكل التعديلات غير المحفوظة | `D:\malitery-software-backup-20261021-1646\project` |
| بيانات التشغيل المحلية الحالية (قاعدة PGlite الفعلية + مفاتيح الأجهزة + النسخ الاحتياطية) | `D:\malitery-software-backup-20261021-1646\play-data` |

**للرجوع:** انسخ المجلد `project` فوق المشروع، و`play-data` إلى `%LOCALAPPDATA%\Military Affairs Play`.
قبل كل مرحلة كبيرة نأخذ نقطة رجوع في git (فرع `migration/phase-N`).

---

## 1) الوضع الحالي (نتيجة الفحص)

| الجزء | الحالة |
|---|---|
| الخادم | JavaScript (CommonJS)، `http` خام + راوتر داخلي، **PostgreSQL / PGlite**، بعد إعادة الهيكلة صار طبقات: `server/http` + `server/routes/*` + `validation` + `access` |
| الأمان | توقيع كل طلب بمفتاح الجهاز (Ed25519)، منع إعادة الإرسال (nonce)، جلسات داخل الذاكرة، ترخيص مرتبط بالجهاز، صلاحيات حسب الدور |
| سطح المكتب | Electron 41، `contextBridge` (`window.desktop`) و IPC محدود بقائمة بيضاء، خادم مدمج HTTPS محلي |
| الواجهة | JavaScript عادي (بدون bundler)، ملفات `renderer/core` و`renderer/features/*`، CSS يدوي |
| الاختبارات | 16 اختبارًا (عقد API + الواجهة في jsdom + PGlite حقيقي) + اختبار Electron حقيقي (`npm run test:electron`) |
| الجودة | ESLint + Prettier يعملان، نظيف |

**الهوية الحالية التي يجب الحفاظ عليها** (من `css/styles.css`):
أخضر داكن رسمي `#244b46` (hover `#183a36`) · ثانوي `#315f51` · خلفية `#f3f5f5` · نص `#1c302c`/`#586b65` ·
حدود `#dde5e2` · نجاح `#2f7d4f` · تحذير `#93650a` · خطر `#b42318` · الخط **IBM Plex Sans Arabic** (محلي) · RTL.

---

## 2) القرارات المعمارية (وما يختلف عن المرجع)

المرجع مكتوب لمنتج SaaS على الإنترنت. مشروعنا **تطبيق محلي (سطح مكتب) + خادم شبكة داخلية اختياري**، فنأخذ البنية ونتخلى عن ما لا يفيد.

| # | الموضوع | القرار | السبب |
|---|---|---|---|
| D1 | قاعدة البيانات | **SQLite** (ملف واحد) عبر **Prisma 7** + `@prisma/adapter-better-sqlite3` | إلزامي حسب الطلب؛ التطبيق محلي. **تم إثبات عمله داخل Electron 41** (انظر §3) |
| D2 | اللغة | **TypeScript strict** للخادم والواجهة | صيانة أسهل وأخطاء أقل |
| D3 | الإطار | **Express 5** بنفس بنية المرجع (`routes → controller → service → validator`) | موحّد مع بقية مشاريعك ومعروف لأي مطوّر |
| D4 | التحقق | **Zod 4** برسائل عربية (`z.config(z.locales.ar())`) | كما في المرجع؛ يحل محل `validation.cjs` الحالي |
| D5 | المصادقة | **نُبقي** توقيع الجهاز + جلسات (token عشوائي) ونضيف إليها الصلاحيات الدقيقة `entity.action` | أقوى من JWT لشبكة عسكرية مغلقة؛ JWT + refresh لا يضيف شيئًا هنا ويزيد التعقيد |
| D6 | الصلاحيات | `common/permissions.ts` (كتالوج واحد) + جدول `Role/Permission` | كما في المرجع؛ اليوم الأدوار ثابتة (`admin/gate/clerk`) فنبدأ بها كأدوار نظام ثم نتيح التخصيص |
| D7 | Redis | **لا** | لا فائدة محليًا؛ SQLite سريع كفاية |
| D8 | Socket.IO | **مرحلة اختيارية لاحقة** (للوضع الشبكي: تحديث لحظي بين البوابة والمكتب) | اليوم هناك polling كل 10 ثوانٍ يكفي |
| D9 | بناء الخادم | `tsup` → `dist/server.js` (للوضع الشبكي) + نفس الكود مُحمّل داخل Electron | مصدر واحد للمنطق |
| D10 | الواجهة | **React 19 + MUI 9 (RTL) + Vite + TypeScript** حسب مرجع التصميم | المطلوب |
| D11 | جلب البيانات | **TanStack Query** فوق `window.desktop.request` (IPC) وليس axios | الواجهة محجوبة عن الشبكة عمدًا (`connect-src 'none'`)، والتوكن يبقى في العملية الرئيسية |
| D12 | الهوية البصرية | نستخدم **بنية** مرجع التصميم (Layout، Sidebar، KPI، DataTable...) لكن **tokens بألواننا الخضراء والخط IBM Plex** | "مع الحفاظ على الهوية الحالية" |
| D13 | الأرقام المالية | نُبقي `Int` بالقروش (`amountCents`) | تجنّب أخطاء الفاصلة العشرية |

---

## 3) نتائج التجربة العملية (PoC) — حقائق مؤكَّدة

أُجريت التجربة في مجلد مؤقت (لم تلمس المشروع):

1. ✅ Prisma **7.10.1** + `@prisma/adapter-better-sqlite3` + `better-sqlite3@12` يعمل على Node.
2. ✅ يعمل أيضًا داخل **Electron 41.10** بعد `@electron/rebuild -w better-sqlite3` (الوحدة الأصلية native).
3. ⚠️ **لا نستخدم Prisma 8 (rc)** — الإصدار المستقر 7.10.x.
4. ⚠️ `Json @default("{}")` ينتج SQL غير صالح على SQLite → لا نضع default للـ Json، ونملؤه في الـ service.
5. ⚠️ `prisma migrate diff --script` يطبع سطرًا إضافيًا في البداية؛ نكتب الـ migrations يدويًا (كما يوصي المرجع) ونتحقق بـ `migrate diff --exit-code`.
6. ⚠️ `@default(autoincrement())` في SQLite مسموح **للمفتاح الأساسي فقط** → أرقام التصاريح (`permits.no`) وتسلسل الحركات (`gate_events.sequence`) تُولَّد من جدول عدّادات داخل نفس المعاملة.
7. ⚠️ الفهارس الجزئية (مثل `one_active_permit WHERE returned_at IS NULL AND voided=false`) لا يعبّر عنها `schema.prisma`؛ تُكتب في `migration.sql` يدويًا وتُوثّق بتعليق في المخطط.

**مخاطر لا بد من التعامل معها:**

| المخاطرة | العلاج |
|---|---|
| R1: الوحدة الأصلية `better-sqlite3` تحتاج بناء لكل إصدار Electron | سكربت `postinstall` = `electron-rebuild` + `asarUnpack` في `electron-builder`، وفحص في CI |
| R2: لغة SQL مختلفة (`ILIKE`, `FOR UPDATE`, `DISTINCT ON`, `FILTER`, advisory locks) | إعادة كتابة الاستعلامات عبر Prisma؛ التسلسل مضمون لأن SQLite كاتب واحد (`BEGIN IMMEDIATE`) |
| R3: CSP الحالي `style-src 'self'` يمنع الـ `<style>` الذي يحقنه emotion (MUI) | استعمال `nonce` لـ emotion مع ترويسة CSP من العملية الرئيسية — **بدون** `unsafe-inline` |
| R4: بيانات التشغيل الحالية في PGlite | أداة ترحيل لمرة واحدة (§6) + النسخة الاحتياطية الجاهزة |
| R5: حجم العمل كبير | مراحل صغيرة، كل مرحلة تنتهي باختبارات خضراء ونقطة رجوع |

---

## 4) البنية المستهدفة

### 4.1 الخادم (TypeScript، نمط modules)

```
server/                          (يصبح backend بنفس مسارات الاستيراد @/)
├─ prisma/
│  ├─ schema.prisma              # SQLite
│  ├─ migrations/<تاريخ_اسم>/migration.sql   # تُكتب يدويًا (فهارس جزئية، triggers)
│  └─ seed.ts                    # الصلاحيات + بيانات تجربة (قابل للتكرار)
├─ prisma.config.ts
└─ src/
   ├─ server.ts                  # تشغيل HTTPS + إيقاف آمن + جدولة النسخ الاحتياطي
   ├─ app.ts                     # createApp(): middlewares + routes + errorHandler
   ├─ routes.ts
   ├─ config/                    # env.ts (Zod) · prisma.ts (adapter + PRAGMAs) · paths.ts
   ├─ common/
   │  ├─ errors/AppError.ts      # (موجود بنفس المعنى اليوم)
   │  ├─ middlewares/            # deviceAuth · session · validate · permission · error
   │  ├─ permissions.ts          # PERMISSION_CATALOG
   │  └─ utils/                  # response · pagination · time (Cairo) · crypto
   └─ modules/
      ├─ auth/                   # login / logout / me
      ├─ users/                  # + roles/permissions
      ├─ soldiers/               # + attachments + QR payload
      ├─ gate/                   # permits · movements · corrections · summary
      ├─ visitors/               # visitors · categories · visits
      ├─ canteen/                # outlets · transactions · reversals
      ├─ fitness/
      ├─ reports/                # + daily report
      ├─ settings/
      ├─ audit/
      ├─ backup/                 # §5
      └─ import/                 # الاستيراد من النسخة القديمة + ترحيل PGlite
         └─ <module>.routes.ts · .controller.ts · .service.ts · .validator.ts
```

**ما ننقله كما هو (منطق مثبت بالاختبارات):** التوقيع و`nonce` والجلسات (`server/http/*`)، الترخيص (`licensing`)،
`shared/time` (حدود اليوم بتوقيت القاهرة)، توليد الـ QR، قوالب الطباعة. يُعاد كتابتها بـ TypeScript فقط.

**اتفاقية الـ API ثابتة:** نفس المسارات ونفس شكل JSON الحالي (`/api/soldiers`, `/api/gate`...) — بهذا تعمل الواجهة
الحالية مع الخادم الجديد أثناء التحويل، ونستطيع تبديل الواجهة بعد ذلك دون أي انقطاع.

### 4.2 سطح المكتب (Electron)

كما هو اليوم (`desktop/*`) مع تحويله إلى TypeScript لاحقًا؛ التغييرات الوحيدة: مسار ملف SQLite داخل `userData`،
وتحميل الخادم الجديد المضمّن، و`asarUnpack` للوحدات الأصلية.

### 4.3 الواجهة (React + MUI + Vite)

```
renderer-app/                    (مجلد جديد بجانب renderer القديم حتى يكتمل النقل)
├─ index.html                    # lang="ar" dir="rtl"
├─ vite.config.ts · tsconfig.json
└─ src/
   ├─ api/        client.ts (IPC) · endpoints.ts · types.ts
   ├─ auth/       AuthContext · ProtectedRoute · RequirePermission · <Can>
   ├─ components/ PageHeader · SectionCard · KpiCard · DataTable · SegmentedTabs · StatusChip
   │              RowActions · ConfirmDialog · DetailList · SearchField · CommandPalette · SoldierChip
   ├─ features/<entity>/  <Entity>Page · <Entity>FormDialog · <Entity>Drawer
   │     soldiers · gate · visitors · canteen · buffet · fitness · reports · daily-report
   │     printing · settings · users · backups · import · audit
   ├─ layout/     AppLayout · Sidebar · navItems
   ├─ lib/        format · notify · useListState
   ├─ styles/     dashboard.css · toast.css
   └─ theme/      tokens.ts · theme.ts · ThemeRegistry.tsx
```

**tokens بالهوية الحالية** (بدل Navy/Blue في المرجع — نفس الأدوار ونفس قاعدة Soft/Ink):

| دور في المرجع | قيمتنا |
|---|---|
| `navy` (السايدبار والنص) | الأخضر الداكن `#244b46` / نص `#1c302c` |
| `blue` (primary) | `#244b46` (hover `#183a36`)، فاتح `#edf5f2` |
| `ice` (خلفيات ناعمة) | `#d9ebe5` / `#eef2f0` |
| `bg / surface` | `#f3f5f5` / `#ffffff` |
| `red / green / amber` | `#b42318` / `#2f7d4f` / `#93650a` (+ Soft: `#fdecea` / `#e8f4ec` / `#fff4dc`) |
| الخط | IBM Plex Sans Arabic (محلي) بدل Rubik/Cairo |
| الزوايا | 8px موحّدة كما في المرجع |

**الصفحات تتبع التشريح القياسي (§6 من مرجع التصميم):** PageHeader → KPI → شريط الفلاتر → DataTable بـ pagination
→ Dialogs/Drawers. **صفحة البوابة** (POS) تبقى شاشة مخصصة بتصميم كبير وسريع للمسح.

---

## 5) النسخ الاحتياطي (مع SQLite) — تصميم جديد

| البند | التصميم |
|---|---|
| اللقطة | `better-sqlite3` **online backup API** (`db.backup()`) — لقطة متسقة والتطبيق شغّال، بلا إيقاف |
| الحماية | ضغط gzip ثم **AES-256-GCM** (نفس غلاف `.mab` الحالي، حقل جديد `format: "sqlite-1"`) ومفتاح `BACKUP_KEY_HEX` |
| الجدولة | كما اليوم: كل 6/12/24/48 ساعة + احتفاظ 7–365 يومًا + تخطي عند انشغال الخادم |
| الاستعادة | تحقق من الغلاف → نسخة أمان قبل الاستعادة → إغلاق Prisma → استبدال ملف القاعدة **ذريًا** (rename) → إعادة الفتح → تسجيل خروج الجميع. تُشترط كلمة مرور المسؤول |
| التوافق الخلفي | استيراد ملفات `.mab` القديمة (schema 3 / JSON) عبر مُحوّل إلى SQLite |
| الواجهة | صفحة «النسخ والاستعادة» بتصميم جديد: KPI (آخر نسخة، الموعد القادم، الحجم)، جدول النسخ، `RowActions` (معاينة/حفظ/استعادة)، `ConfirmDialog` قوي للاستعادة، حالة الجدولة |

---

## 6) ترحيل البيانات الموجودة

أداة لمرة واحدة `scripts/migrate-pglite-to-sqlite.ts`:

1. تقرأ قاعدة PGlite الحالية (`%LOCALAPPDATA%\Military Affairs Play\standalone\database`) **للقراءة فقط**.
2. تكتب في ملف SQLite جديد بالترتيب الصحيح للعلاقات (users → soldiers → permits → ... → visitor_visits).
3. تعيد توليد العدّادات (`permits.no`, `gate_events.sequence`).
4. تقارن **أعداد الصفوف والمجاميع المالية** بين المصدر والهدف وتطبع تقريرًا؛ تفشل عند أي فرق.
5. القاعدة القديمة تبقى كما هي (نسخة رجوع)؛ لا حذف تلقائي.

---

## 7) المراحل والتسليمات

كل مرحلة: **تُنفَّذ → تُختبر → نقطة رجوع**. لا ننتقل قبل أن تكون الاختبارات خضراء.

| المرحلة | المحتوى | معيار الإنهاء |
|---|---|---|
| **P0** ✅ | نسخة احتياطية + خطة + PoC | هذا الملف + النسخة في `D:\malitery-software-backup-…` |
| **P1** | أساس TypeScript: `tsconfig`, `tsup`, `env.ts`, `prisma.ts` (PRAGMAs: WAL, foreign_keys, busy_timeout)، `schema.prisma` كامل + أول migration يدويًا + `seed.ts` | `prisma migrate deploy` ثم `migrate diff --exit-code` = لا فرق؛ الخادم يقلع على SQLite |
| **P2** | نقل الـ http/pipeline (توقيع، جلسات، ترخيص) إلى TS/Express 5 كما هو | اختبار `core.test` (التوقيع/التزوير/إعادة الإرسال) أخضر |
| **P3** | modules بالترتيب: auth/users → soldiers (+مرفقات) → gate → visitors → canteen → fitness → settings/audit → reports/daily | بعد كل module: اختباراته الأصلية مُحوَّلة تعمل على SQLite بنفس العقد |
| **P4** | النسخ الاحتياطي الجديد (§5) + مُحوّل `.mab` القديم + الاستيراد من النسخة القديمة | اختبار النسخ/الاستعادة الذرية أخضر |
| **P5** | أداة الترحيل من PGlite (§6) | تقرير مطابقة على بياناتك الفعلية بلا فروق |
| **P6** | واجهة React: scaffold (Vite+MUI+RTL+tokens+layout+المكوّنات المشتركة) + `api/client.ts` فوق IPC + CSP بـ nonce | صفحة دخول + هيكل + لوحة فارغة تعمل داخل Electron |
| **P7** | نقل الصفحات واحدة واحدة بنفس التشريح: البوابة → العسكريون → الزوار → الكانتين/البوفيه → اللياقة → التقارير → الطباعة → الإعدادات → المستخدمون → النسخ → الاستيراد → السجل | كل صفحة: اختبار واجهة + فحص يدوي |
| **P8** | التغليف: `electron-builder` + `electron-rebuild` + `asarUnpack`، اختبار `test:electron` على الواجهة الجديدة، حذف `pg`/`@electric-sql/pglite`/`pg-mem` والواجهة القديمة | مثبّت يعمل على جهاز نظيف |
| **P9** (اختياري) | Socket.IO للتحديث اللحظي في الوضع الشبكي | — |

### تعريف "تم" للمشروع كله
1. كل اختبارات العقد الحالية (16) مُحوَّلة وتنجح على SQLite.
2. `npm run test:electron` ينجح على الواجهة الجديدة (دخول → إضافة عسكري → QR → خروج/دخول بوابة → سجل → نسخ احتياطي → استعادة).
3. `tsc --noEmit` و`eslint` و`prettier --check` بلا أخطاء.
4. ترحيل بياناتك الفعلية بتقرير مطابقة نظيف.
5. التثبيت من الصفر يعمل، وعدم وجود أي اعتماد على PostgreSQL.

---

## 8) قواعد الكتابة (لتبقى الصيانة سهلة)

- كل ميزة = مجلد module بأربعة ملفات: `routes / controller / service / validator`. الـ controller رقيق، والمنطق في الـ service.
- لا SQL خام إلا للفهارس/الـ triggers في migrations وللتقارير الثقيلة (وبـ `Prisma.sql`).
- لا ألوان hex في الصفحات؛ دائمًا `tokens.xxx`. شارة الحالة = `xxxSoft` + `xxxInk`.
- كل رسائل المستخدم بالعربية. أسماء الملفات والدوال بالإنجليزية.
- كل دالة عامة لها تعليق سطر واحد يشرح **الغرض** لا التنفيذ.
- لا ملف يتجاوز ~300 سطر؛ لا سطر يتجاوز 120 حرفًا (Prettier يفرض ذلك).

---

## 9) قرارات أحتاج تأكيدك عليها (لكل منها قيمة افتراضية سأعمل بها إن لم تعترض)

1. **Express 5 بدل الراوتر الداخلي الحالي** — الافتراضي: نعم (كما في دليلك).
2. **Socket.IO** — الافتراضي: مؤجّل (P9).
3. **أدوار قابلة للتخصيص من الواجهة** (Roles/Permissions كاملة كما في المرجع) — الافتراضي: نبدأ بالأدوار الثلاثة الحالية كأدوار نظام، ونضيف التخصيص بعد P7.
4. **الوضع الشبكي (خادم على Windows Server)** — الافتراضي: يبقى مدعومًا بنفس الكود (`dist/server.js`) لكن بقاعدة SQLite على ذلك الخادم.

---

## 10) حالة التنفيذ (P1–P8 مكتملة)

| المرحلة | النتيجة |
|---|---|
| P1–P5 | `backend/` (TypeScript + Express 5 + Prisma 7 + SQLite)، 16 اختبارًا، نسخ احتياطي `sqlite-1`، أداة ترحيل PGlite |
| P6–P7 | `renderer-app/` (React 19 + MUI 9 RTL)، 23 اختبارًا، كل الصفحات |
| P8 | Electron يحمّل الباك اند والواجهة الجديدين؛ ترحيل تلقائي لبيانات PGlite عند أول تشغيل؛ تغليف `electron-builder` ناجح؛ `scripts/e2e-electron.cjs` ينجح على النسخة المطوّرة **والمغلَّفة** (`E2E_EXECUTABLE`) |

**الكود القديم** (الخادم PostgreSQL والواجهة القديمة وأدوات المعاينة) حُذف؛ بقي فقط `legacy-export/` (أداة تصدير البيانات من النسخة القديمة) ولا يدخل في البناء ولا الاختبارات.
**الأوامر:** `npm run desktop` (تشغيل) · `npm run test:all` · `npm run test:electron` · `npm run native:electron` (وحدة SQLite الأصلية لـ Electron) · `npm run dist` (المثبّت).
