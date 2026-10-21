> نسخة حرفية من المرجع المُرسَل (دليل بناء الباك اند — مشروع رصد). لا تُعدَّل. ملاحظة: كلمة `sqlit` في النص الأصلي تعني **SQLite**، وكل ما يخص MariaDB/MySQL يُستبدل بـ SQLite؛ التفاصيل في [../MIGRATION_PLAN.md](../MIGRATION_PLAN.md).

# دليل بناء الباك اند (مشروع رصد) — لإعادة نفس البنية في مشروع جديد

الهدف: أن تبني مشروعًا جديدًا بنفس الطريقة والتقسيم والملفات والاتفاقيات. كل ما هنا مأخوذ من الكود الفعلي في `backend/`.

---

## 1) الحزمة التقنية (Stack)

| الجزء | الاختيار |
|---|---|
| بيئة التشغيل | Node.js 22+ (يعمل على 24)، ESM (`"type": "module"`) |
| الإطار | Express **5** |
| اللغة | TypeScript 5.9 (strict) |
| قاعدة البيانات | sqlit /  عبر **Prisma 7** + `@prisma/adapter-mariadb` |
| التحقق | **Zod 4** (مع رسائل عربية: `z.config(z.locales.ar())`) |
| المصادقة | JWT (access قصير) + refresh token عشوائي مخزّن مُجزَّأ (hash) |
| الكاش | Redis عبر `ioredis` (اختياري، يعمل التطبيق بدونه) |
| اللحظي | Socket.IO (غرف rooms حسب الصلاحية) |
| الرفع | multer (ذاكرة لـ Excel، قرص للصور/الملفات) |
| الأمان | helmet, cors, express-rate-limit, bcryptjs |
| أخرى | compression, morgan, exceljs, dotenv |
| التطوير | `tsx watch` |
| البناء | `tsup` (حزمة واحدة ESM إلى `dist/server.js`) |

الحزم (`package.json`):

```json
{
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsup",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@prisma/adapter-mariadb": "^7.10.0", "@prisma/client": "^7.10.0",
    "bcryptjs": "^3.0.3", "compression": "^1.8.2", "cors": "^2.8.6", "dotenv": "^18.0.5",
    "exceljs": "^4.4.0", "express": "^5.2.1", "express-rate-limit": "^8.7.1", "helmet": "^8.3.0",
    "ioredis": "^6.0.0", "jsonwebtoken": "^9.0.3", "morgan": "^1.12.1", "multer": "^2.4.0",
    "socket.io": "^4.8.4", "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1", "@types/cors": "^2.8.19", "@types/express": "^5.0.6",
    "@types/jsonwebtoken": "^9.0.10", "@types/morgan": "^1.9.10", "@types/multer": "^2.3.0",
    "@types/node": "^22.20.5", "prisma": "^7.10.0", "tsup": "^8.5.1", "tsx": "^4.23.15", "typescript": "5.9"
  }
}
```

## 2) هيكل المجلدات

```
backend/
├─ package.json
├─ tsconfig.json
├─ tsup.config.ts
├─ prisma.config.ts           # إعداد Prisma CLI (مسار schema والـ migrations و DATABASE_URL)
├─ .env / .env.example
├─ .gitignore                 # node_modules, dist, .env, src/generated, uploads
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/<تاريخ_اسم>/migration.sql    # تُكتب يدويًا (انظر القسم 8)
│  └─ seed.ts                 # بيانات أولية (مدير عام، صلاحيات، بيانات تجريبية) — قابل للتكرار
├─ postman/                   # مجموعة Postman
├─ uploads/                   # ملفات المستخدمين (خارج git)
└─ src/
   ├─ server.ts               # تشغيل + socket + مهام دورية + إيقاف آمن
   ├─ app.ts                  # createApp(): middlewares + routes + معالجات الأخطاء
   ├─ routes.ts               # تجميع كل routes تحت API_PREFIX
   ├─ config/
   │  ├─ env.ts               # تحقق من المتغيرات بـ Zod (يوقف التطبيق لو ناقصة)
   │  ├─ prisma.ts            # PrismaClient + adapter
   │  ├─ redis.ts             # كاش بأمان (get/set/version/bump/close)
   │  └─ realtime.ts          # Socket.IO: المصادقة + الغرف + realtime.toRoom/toUser/toAll
   ├─ common/
   │  ├─ errors/AppError.ts
   │  ├─ middlewares/         # auth, validate, error, upload, subscription...
   │  ├─ permissions.ts       # كتالوج الصلاحيات (مصدر واحد للحقيقة)
   │  ├─ types/express.d.ts   # توسيع Request (user)
   │  └─ utils/               # response, pagination, jwt, excel, dates, plate, geocode...
   ├─ generated/prisma/       # ناتج prisma generate (خارج git)
   └─ modules/
      └─ <module>/
         ├─ <module>.routes.ts
         ├─ <module>.controller.ts
         ├─ <module>.service.ts
         └─ <module>.validator.ts
```

الوحدات الحالية (modules): `auth, users, companies, vehicles, inspections, alerts, notifications, dashboard, roles, permissions, reports, audit, applications, packages, subscriptions, tones`.

القاعدة: **كل ميزة = مجلد module بأربعة ملفات ثابتة** (routes → controller → service → validator). الـ controller رقيق، والمنطق كله في الـ service.

## 3) إعدادات المشروع

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2023", "module": "ESNext", "moduleResolution": "bundler", "lib": ["ES2023"],
    "types": ["node"], "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true, "noUnusedParameters": true, "noFallthroughCasesInSwitch": true,
    "baseUrl": ".", "paths": { "@/*": ["src/*"] }, "outDir": "dist"
  },
  "include": ["src", "prisma/seed.ts", "prisma.config.ts"]
}
```
الاستيراد بالاسم المختصر `@/…` (مثال: `import { prisma } from "@/config/prisma"`). `tsup` يحلّها عند البناء، و`tsx` أثناء التطوير.

### `tsup.config.ts`
```ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/server.ts"], format: ["esm"], target: "node22", platform: "node",
  outDir: "dist", clean: true, sourcemap: true, splitting: false,
});
```

### `prisma.config.ts`
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

### `prisma/schema.prisma` (رأس الملف)
```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"     // يُولَّد داخل src ويُتجاهل في git
}
datasource db { provider = "sqlit" }
```
الاستيراد: `import { PrismaClient } from "@/generated/prisma/client"`.

### `src/config/prisma.ts`
```ts
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { env, isProd } from "./env";

const adapter = new PrismaMariaDb({
  host: env.DATABASE_HOST, port: env.DATABASE_PORT, user: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD, database: env.DATABASE_NAME,
  connectionLimit: env.DATABASE_CONNECTION_LIMIT, allowPublicKeyRetrieval: !isProd,
});
export const prisma = new PrismaClient({ adapter, log: isProd ? ["error"] : ["warn", "error"] });
```

### `src/config/env.ts`
كل المتغيرات تُتحقق بـ Zod ويتوقف التطبيق برسالة واضحة عند الخطأ، ثم `export const env` و`isProd`:

```
NODE_ENV, PORT(4000), API_PREFIX(/api/v1)
DATABASE_HOST/PORT/USER/PASSWORD/NAME/CONNECTION_LIMIT   (+ DATABASE_URL لأوامر Prisma CLI فقط)
JWT_ACCESS_SECRET, JWT_REFRESH_SECRET (≥32 حرفًا), JWT_ACCESS_EXPIRES_IN(15m), JWT_REFRESH_EXPIRES_DAYS(30)
UPLOADS_DIR(uploads)
REDIS_URL (اختياري)
CORS_ORIGINS (قائمة مفصولة بفواصل → مصفوفة)
GEOCODER_URL, GEOCODER_CONTACT (للعناوين)
SEED_ADMIN_USERNAME, SEED_ADMIN_PASSWORD
```

## 4) طبقة التطبيق (`app.ts` / `server.ts` / `routes.ts`)

`app.ts`: ترتيب الـ middlewares ثابت:

```ts
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS, credentials: true, exposedHeaders: ["Content-Disposition"] }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(isProd ? "combined" : "dev"));
app.use(env.API_PREFIX, routes);
app.use(notFoundHandler);   // آخرًا
app.use(errorHandler);      // آخر شيء
```

`routes.ts`: `router.get("/health")` ثم `router.use("/auth", authRoutes)` … لكل module.

`server.ts`:
- `createApp()` ثم `app.listen`، ثم `initRealtime(server)`.
- مهام دورية صغيرة بـ `setInterval(...).unref()` (مثل كنس الاشتراكات المنتهية كل 5 دقائق).
- إيقاف آمن عند `SIGINT/SIGTERM`: إغلاق socket → الخادم → Redis → `prisma.$disconnect()` مع مهلة 10 ثوانٍ.

## 5) نمط الـ Module (انسخه لأي ميزة جديدة)

مثال كامل مبسّط على module "companies":

**`companies.validator.ts`** — مخططات Zod + أنواع مستنتجة:
```ts
import { z } from "zod";
import { paginationQuery } from "@/common/utils/pagination";

export const listCompaniesQuery = paginationQuery.extend({
  isActive: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});
export const createCompanySchema = z.object({
  name: z.string().trim().min(2, "اسم الجهة مطلوب").max(160),
  isActive: z.boolean().default(true),
});
export const updateCompanySchema = createCompanySchema.partial();  // انتبه: partial() يطبّق default

export type ListCompaniesQuery = z.infer<typeof listCompaniesQuery>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
```

**`companies.service.ts`** — كل منطق العمل والوصول للبيانات (كائن `export const xService = {...}`):
```ts
export const companiesService = {
  async list(query: ListCompaniesQuery) {
    const where: Prisma.CompanyWhereInput = { isActive: query.isActive, ...(query.q && { name: { contains: query.q } }) };
    const [items, total] = await prisma.$transaction([
      prisma.company.findMany({ where, orderBy: { createdAt: query.sortOrder }, ...toSkipTake(query) }),
      prisma.company.count({ where }),
    ]);
    return { items, meta: buildMeta(query.page, query.limit, total) };
  },
  create: (input: CreateCompanyInput) => prisma.company.create({ data: input }),
  // ... getById يرمي AppError.notFound("...") عند الغياب
};
```

**`companies.controller.ts`** — يستخرج المدخلات، يستدعي الـ service، يرد بصيغة موحدة، ويسجّل التدقيق:
```ts
export const companiesController = {
  async list(req: Request, res: Response) {
    const { items, meta } = await companiesService.list(req.query as unknown as ListCompaniesQuery);
    paginated(res, items, meta);
  },
  async create(req: Request, res: Response) {
    const company = await companiesService.create(req.body);
    auditService.log(req, { action: "CREATE", entity: "company", entityId: company.id, summary: `إضافة جهة "${company.name}"` });
    created(res, company, "تمت إضافة الجهة");
  },
};
```

**`companies.routes.ts`** — المصادقة والصلاحيات والتحقق في مكان واحد:
```ts
const router = Router();
router.use(authenticate, adminOnly);
const canView = requirePermission("companies.view", "companies.manage");
const canManage = requirePermission("companies.manage");

router.get("/", canView, validate({ query: listCompaniesQuery }), companiesController.list);
router.post("/", canManage, validate({ body: createCompanySchema }), companiesController.create);
router.get("/:id", canView, validate({ params: idParam }), companiesController.getById);
router.patch("/:id", canManage, validate({ params: idParam, body: updateCompanySchema }), companiesController.update);
export default router;
```
ثم سجّله في `src/routes.ts`: `router.use("/companies", companiesRoutes)`.

**ملاحظة ترتيب المسارات:** المسارات الثابتة (`/me`, `/map`, `/export`, `/options`) تُعرَّف **قبل** `/:id`.

## 6) الاتفاقيات المشتركة

### صيغة الردود (`common/utils/response.ts`)
- نجاح: `{ success: true, message?, data }` (`ok`, `created` بحالة 201)
- قوائم: `{ success: true, data: [...], meta: { page, limit, total, totalPages, ...extras } }` (`paginated`)
- بلا محتوى: `noContent` (204)
- خطأ: `{ success: false, message, errors? }`
- كل الرسائل للمستخدم **بالعربية**.

### الأخطاء
- `AppError` بحالات جاهزة: `badRequest 400`, `unauthorized 401`, `forbidden 403`, `notFound 404`, `conflict 409`.
- `errorHandler` (آخر middleware) يحوّل: `AppError`، أخطاء Prisma (`P2002→409`، `P2025→404`، `P2003→409`)، `MulterError→400`، JSON خاطئ→400، وغير ذلك 500 (مع `stack` خارج الإنتاج فقط).
- Express 5 يلتقط أخطاء الدوال `async` تلقائيًا، فاستعمل `throw AppError.xxx()` مباشرة دون try/catch.

### التحقق (`validate.middleware.ts`)
`validate({ params, query, body })` يحقق بـ Zod ويعيد تعريف `req.query` بالقيم المحوّلة عبر `Object.defineProperty` (لأن `req.query` في Express 5 getter). يجمع الأخطاء حسب الحقل في `errors`. المخطط `idParam` جاهز لمسارات `/:id`.

### الترقيم (`pagination.ts`)
`paginationQuery` (page, limit≤100, q, sortOrder) + `toSkipTake` + `buildMeta`. وسّعه بـ `.extend({...})` لكل module.

### المصادقة والصلاحيات (`auth.middleware.ts`)
- `authenticate`: يقرأ `Bearer`، يتحقق من JWT، يجلب المستخدم من قاعدة البيانات (الحالة والحذف)، ويضع `req.user = { id, role, approvalStatus, permissions }`.
- `authorize(...roles)`، `adminOnly`، `inspectorOnly`، `requirePermission(...keys)` (تمر إذا امتلك المستخدم **أيًّا** من المفاتيح؛ المدير العام يملك الكل).
- الصلاحيات الدقيقة في `common/permissions.ts` كمصفوفة `PERMISSION_CATALOG` (key, name, group) وتُزرع في قاعدة البيانات بالـ seed، وواجهة الإدارة تقرأ نفس المفاتيح.
- أدوار: `SUPER_ADMIN | ADMIN | INSPECTOR`، ولـ ADMIN دور ديناميكي (`accessRoleId` → صلاحيات).
- توكنات: access JWT قصير (15 دقيقة)؛ refresh عشوائي 48 بايت، يُخزَّن **hash** (HMAC) فقط، ويُدوَّر عند كل تجديد (القديم يُلغى).
- توسيع النوع: `common/types/express.d.ts` يضيف `Request.user`.

### سجل التدقيق (audit)
`auditService.log(req, { action, entity, entityId, summary })` يُستدعى من الـ controller بعد كل عملية إدارية.

### الكاش (`config/redis.ts`)
- طبقة كاش **آمنة**: كل دالة تبتلع أخطاء Redis وترجع للمصدر، فلا يتعطل الـ API.
- `cache.get/set(key, value, ttl)` و`cache.version(ns)` + `cache.bump(ns)` لإبطال مجموعة مفاتيح دفعة واحدة (مفتاح يحتوي رقم النسخة؛ زيادة الرقم تهمل القديم دون مسح).

### اللحظي (`config/realtime.ts`)
- Socket.IO على المسار `/socket.io`، مصادقة بالـ JWT عند الاتصال.
- غرف: `user:<id>` لكل مستخدم، و`admins:monitor` و`admins:applications` و`admins:subscriptions` حسب الصلاحيات.
- الإرسال من أي service: `realtime.toRoom(ROOMS.monitor, "event", payload)` / `toUser` / `toAll`.
- وثّق الأحداث في تعليق أعلى الملف.

### الرفع (`upload.middleware.ts`)
- Excel: `multer.memoryStorage()` بحد 10 ميجا وفلتر الامتداد.
- ملفات المستخدمين: على القرص تحت `UPLOADS_DIR` مع فحص "الرقم السحري" للملف (magic bytes) وليس الامتداد فقط، وقراءتها عبر مسارات محمية.

## 7) قاعدة البيانات (Prisma 7)

- كل جدول يستخدم `@@map("snake_plural")` وأسماء الحقول camelCase.
- فهارس صريحة لكل استعلام ساخن (`@@index([inspectorId, createdAt])` …).
- تسجيل الحذف الناعم بـ `deletedAt`.
- `Decimal` للمبالغ، و`Json` للبيانات المرنة (شروط الباقة مثلًا).
- ملاحظات Prisma 7 مهمة:
  - **لا تستخدم** `{ field: { not: null } }` في الفلتر، بل `NOT: { field: null }`.
  - `groupBy` مع `orderBy: { _max: { createdAt: "desc" } }` + `take/skip` مدعوم.
  - في الاستعلامات الخام استعمل `Prisma.sql` و`Prisma.empty` (استيراد **قيمة**: `import { Prisma } from ...` وليس `import type`).
  - Zod 4: `.partial()` يطبّق قيم `default`؛ لمخططات التحديث ابنِها من حقول بلا default.

## 8) سير عمل الـ Migrations

`prisma migrate dev` تفاعلي ولا يعمل في بيئات غير تفاعلية، لذلك نكتب الـ migration يدويًا:

1. عدّل `schema.prisma`.
2. أنشئ مجلدًا `prisma/migrations/<YYYYMMDDHHMMSS>_<اسم>/migration.sql` واكتب فيه SQL.
3. طبّق: `npx prisma migrate deploy` ثم `npx prisma generate`.
4. تحقق أن المخطط يطابق قاعدة البيانات:
   `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`
   (يجب أن يطبع "No difference detected").
5. على الإنتاج: `npm run prisma:deploy` فقط. **لا تشغّل seed على الإنتاج.**

## 9) الـ Seed (`prisma/seed.ts`)

- قابل لإعادة التشغيل (`upsert`): يزرع الصلاحيات من `PERMISSION_CATALOG`، ومدير عام من `SEED_ADMIN_*`، وجهات/مركبات/مندوبين تجريبيين، وباقات الاشتراك.
- يُشغَّل بـ `npm run seed` في التطوير فقط.

## 10) البناء والنشر

```bash
npm ci
npx prisma generate          # ينتج src/generated/prisma (مطلوب قبل tsc/tsup)
npm run typecheck
npm run build                # tsup → dist/server.js
npm run prisma:deploy        # تطبيق migrations على قاعدة الإنتاج
npm start                    # node dist/server.js
```
- ضع `.env` على السيرفر (لا يدخل git)؛ مجلد `uploads/` يجب أن يكون **دائمًا** (volume) ولا يُمسح عند كل نشر.
- خلف nginx: مرّر `/api/v1` و`/socket.io/` مع ترويسات WebSocket:
  `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
- `trust proxy` مفعّل (1) ليعمل حد الطلبات وعناوين IP خلف الوكيل.
- Redis اختياري: بدون `REDIS_URL` يعمل كل شيء من sqlit.

## 11) قائمة خطوات لبدء مشروع جديد بنفس الطريقة

1. `npm init`، ثبّت الحزم أعلاه، وانسخ `tsconfig.json` و`tsup.config.ts` و`prisma.config.ts`.
2. أنشئ `src/config/{env,prisma,redis,realtime}.ts` ثم `src/common/{errors,middlewares,utils,permissions.ts,types}`.
3. اكتب `schema.prisma` (generator خارج `src/generated/prisma`)، ثم أول migration يدويًا.
4. ابنِ `app.ts` و`server.ts` و`routes.ts` بنفس الترتيب.
5. ابدأ بـ module `auth` (login/refresh/logout/me) ثم `users` و`roles/permissions`.
6. لكل ميزة: مجلد module بالملفات الأربعة، وسجّل route، وأضف مفاتيح الصلاحيات في `permissions.ts`.
7. أضف `seed.ts` يزرع الصلاحيات والمدير العام.
8. اختبر بـ Postman (مجموعة جاهزة في `postman/`) وتحقق بـ `typecheck` قبل كل تسليم.

## 12) أخطاء واجهتها أثناء البناء (تجنّبها)

- `req.query` في Express 5 للقراءة فقط → استعمل `Object.defineProperty` كما في `validate`.
- نتيجة `groupBy` تحتاج `orderBy` عند استخدام `take/skip`.
- `import type { Prisma }` يمنع استعمال `Prisma.sql` كقيمة.
- رفع الملفات من الموبايل قد يصل بنوع `application/octet-stream`: اقبله بالامتداد ثم افحص الـ magic bytes.
- ملف Excel غير صالح يسبب 500 من المكتبة: افحص توقيع zip وارجع 400 برسالة واضحة.
- المنفذ 4000 مشغول بنسخة قديمة أثناء التطوير قد يخدم كودًا قديمًا؛ أوقفها قبل التشغيل.
- أي استدعاء لخدمة خارجية (تحديد العناوين مثلًا) يجب أن يكون بمهلة قصيرة وبعد إرسال الرد للمستخدم، وبكاش، حتى لا يبطئ المسار الساخن.
