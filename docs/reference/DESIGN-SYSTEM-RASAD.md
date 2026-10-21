> نسخة حرفية من المرجع المُرسَل (تصميم لوحة تحكم Rasad). لا تُعدَّل؛ تطبيقه على مشروعنا موضّح في [../MIGRATION_PLAN.md](../MIGRATION_PLAN.md).

# مرجع تصميم لوحة التحكم (Rasad Admin)

مرجع لإعادة استخدام نفس طريقة التصميم في أي داشبورد تانية مع اختلاف البزنس.
كل اللي هنا مأخوذ من الكود الفعلي في `admin/src`.

---

## 1. الستاك والمكتبات

### Dependencies

| الباكدج | الإصدار | الاستخدام |
|---|---|---|
| `react` / `react-dom` | ^19.3 | الواجهة |
| `@mui/material` | ^9.4 | مكتبة المكوّنات الأساسية (كل الأزرار، الحقول، الديالوج، الدروار...) |
| `@mui/icons-material` | ^9.4 | الأيقونات (نمط `Outlined` للقائمة و`Rounded` للأزرار) |
| `@mui/x-data-grid` | ^9.15 | الجداول بـ server pagination |
| `@mui/x-charts` | ^9.15 | الرسوم (`BarChart`, `PieChart`, `SparkLineChart`) |
| `@emotion/react` / `@emotion/styled` / `@emotion/cache` | ^11.14 | محرك الـ CSS لـ MUI |
| `stylis` (4.2.0) + `stylis-plugin-rtl` | ^2.1 | قلب الـ CSS تلقائياً لـ RTL |
| `@fontsource/rubik` + `@fontsource/cairo` | ^5.3 | الخطوط (محلية، بدون Google Fonts) |
| `motion` (Framer Motion) | ^14 | انتقالات الصفحات ومؤشر القائمة المتحرك |
| `@tanstack/react-query` | ^5.104 | جلب البيانات والكاش والـ invalidation |
| `axios` | ^1.20 | HTTP client + refresh token interceptor |
| `react-router-dom` | ^7.18 | الراوتنج + lazy pages |
| `react-hook-form` + `@hookform/resolvers` + `zod` | ^7.89 / ^5.9 / ^4.6 | الفورمز والـ validation |
| `react-toastify` | ^11.1 | التوستات |
| `socket.io-client` | ^4.8 | التحديث اللحظي (realtime) |
| `dayjs` | ^1.11 | التواريخ بالعربي مع أرقام لاتينية |

### Dev

`vite` ^8.3 + `@vitejs/plugin-react` ^6.1، `typescript` ^5.9 (strict)، `@types/*`.

### إعدادات مهمة

- **Alias:** `@` → `src` (في `vite.config.ts` و`tsconfig.json`).
- **Proxy للتطوير:** `/api` و`/socket.io` → `http://localhost:4000` (مع `ws: true`).
- **index.html:** `lang="ar" dir="rtl"` و`theme-color #08182E`.
- **Scripts:** `dev` / `build` (= `tsc --noEmit && vite build`) / `typecheck` / `preview`.

---

## 2. Design Tokens (`src/theme/tokens.ts`)

ملف واحد هو مصدر كل الألوان والظلال. **ممنوع hex مباشر في الصفحات**؛ دايماً `tokens.xxx`.

### الألوان

| المجموعة | Tokens | الاستخدام |
|---|---|---|
| Navy (الهوية الداكنة) | `navy900 #05101E`، `navy #08182E`، `navy700 #0D233F`، `navy600 #132F53`، `navy400 #394658`، `navy300 #5A6473`، `navy200 #8D959F`، `navy100 #C3CAD4` | السايدبار، النص الأساسي (`navy`)، النص الثانوي (`navy300`)، الـ disabled والتلميحات (`navy200`) |
| Blue (الأساسي) | `blue #235FB7`، `blue700 #1A4A90`، `blueGlow #3B82F6`، `blueLight #EBF3FF` | الـ primary، الـ focus ring، العنصر النشط |
| Ice (خلفيات ناعمة) | `ice #E9EFF8`، `ice100 #F3F6FB` | خلفية التابات، هيدر الجدول، hover الصفوف، أيقونات الكروت |
| Surfaces | `bg #F8FAFC`، `surface #FFF`، `surfaceSubtle #F8FAFC`، `surfaceMuted #F1F5F9` | خلفية الصفحة والكروت |
| حالات دلالية | كل لون له 3 درجات: **main / Soft / Ink** | |
| Red | `red #FF3B30`، `redSoft #FDECEB`، `redInk #C9271D`، `redGlow` | مطلوب/خطر/حذف |
| Green | `green #34C759`، `greenSoft #EAF8EE`، `greenInk #1E8A3C`، `greenGlow` | سليم/نشط/نجاح |
| Amber | `amber #F5A524`، `amberSoft #FEF5E6`، `amberInk #9A6100` | تحذير/معلّق/منتهي |
| Purple | `purple #8B5CF6`، `purpleSoft #F5F3FF` | تمييز إضافي (باقات سنوية) |
| Borders | `border #E2E8F0`، `borderSubtle #EEF2F6`، `borderHover #CBD5E1` | |

**قاعدة الـ Soft/Ink:** أي شارة أو أيقونة حالة = خلفية `xxxSoft` + نص/أيقونة `xxxInk`. اللون الـ main للنقاط والحدود والرسوم فقط.

### Radius

كل حاجة **8px** (section, control, pill, sm..xl كلها 8). ده جزء من الهوية: زوايا موحّدة هادية.

### Shadows

| Token | القيمة | الاستخدام |
|---|---|---|
| `sm` | `0 1px 2px rgba(0,0,0,.04)` | أزرار الهيدر والحقول |
| `card` | ظل طبقتين خفيف جداً بلون navy | كل الكروت |
| `cardHover` | أقوى شوية | hover على الكروت |
| `dropdown` | `0 18px 40px -18px …` + حد 1px | المنيو والتولتيب |
| `modal` | `0 24px 48px -12px …` | الديالوج |
| `glowBlue/Green/Red` | توهج ملوّن | عناصر "حية" (رادار، تنبيه) |

الظلال كلها مبنية على `rgba(8, 24, 46, …)` (navy) مش أسود، عشان تبقى ناعمة ومتناسقة.

---

## 3. الثيم (`src/theme/theme.ts` + `ThemeRegistry.tsx`)

### الأساسيات

- `direction: "rtl"`، `cssVariables: true`، `shape.borderRadius: 8`.
- Palette: `primary=blue`، `secondary=navy`، `error=red`، `success=green`، `warning=amber`، `background.default=bg`، `text.primary=navy`، `text.secondary=navy300`، `divider=border`.
- **RTL:** emotion cache بـ `key: "muirtl"` و`stylisPlugins: [prefixer, rtlPlugin]` ملفوف حوالين `ThemeProvider` + `CssBaseline`.
- **لغة MUI:** `arSD` من `@mui/material/locale` و`@mui/x-data-grid/locales` + نص ترقيم مخصص `"1–20 من 300"`.

### Typography

الخط: `"Rubik", "Cairo", system-ui, …`. Rubik للاتيني والأرقام وCairo للعربي. الأوزان المحمّلة: Cairo 400–800 وRubik 400–900.

| Variant | الحجم / الوزن |
|---|---|
| h1 | 32 / 800، letter-spacing -0.02em |
| h2 | 26 / 800 (عنوان الصفحة) |
| h3 | 22 / 700 |
| h4 | 18 / 700 (عنوان الكارت بيتعمل 16/800) |
| h5 / h6 | 16 / 14 — 700 |
| subtitle1 / subtitle2 | 15/600 — 13/600 navy300 |
| body1 / body2 | 15 (lh 1.7) — 14 (lh 1.6) |
| caption | 12 navy300 |
| button | 14 / 700، بدون uppercase |

الأرقام في الـ KPI: `fontVariantNumeric: "tabular-nums"` عشان ماتتهزّش وهي بتتغيّر.

### Component overrides

| المكوّن | التخصيص |
|---|---|
| `MuiButton` | `disableElevation`، minHeight 42 (small = 34)، `:active scale(.98)`، contained بظل أزرق خفيف يزيد مع hover. **variant جديد `tonal`**: خلفية `ice` ونص `blue` (للأزرار الثانوية زي استيراد/تصدير) |
| `MuiIconButton` | radius 8، `:active scale(.94)` |
| `MuiPaper` | elevation 0 دايماً، outlined = border + `shadows.card` |
| `MuiCard` | outlined افتراضي + `shadows.card` |
| `MuiOutlinedInput` | خلفية بيضا، hover border `navy200`، focus = border أزرق 1.5px + ring `0 0 0 3px rgba(35,95,183,.12)` |
| `MuiTextField` | `fullWidth` و`size="small"` افتراضياً |
| `MuiChip` | وزن 700، radius 8 |
| `MuiDialog` | radius 8، `shadows.modal`، العنوان 18/800 |
| `MuiTooltip` | خلفية navy، 12px |
| `MuiDataGrid` | بدون border، هيدر `ice100`، عنوان العمود 700 `navy300`، فواصل الصفوف `borderSubtle`، hover `ice100`، focus-visible أزرق بدل الـ outline الافتراضي |
| CssBaseline | `::selection` ice/blue، antialiasing، احترام `prefers-reduced-motion` |

---

## 4. هيكل الـ Layout

```
┌────────────┬───────────────────────────────────────────────┐
│            │ Header (sticky, blur): breadcrumb · بحث Ctrl+K │
│  Sidebar   │                · تحديث · إشعارات · حساب        │
│  navy      ├───────────────────────────────────────────────┤
│  272 / 84  │ main: PageHeader → KPI cards → Filter bar      │
│            │       → DataTable / SectionCards               │
└────────────┴───────────────────────────────────────────────┘
```

### Sidebar (`layout/Sidebar.tsx`)

- عرض **272px** وفي وضع الطي **84px**، والحالة محفوظة في `localStorage`.
- الخلفية `linear-gradient(180deg, #0A192F → #05101E)`، النص أبيض 72%.
- اللوجو (mark + wordmark) وتحته سطر تعريفي 11px `navy200`.
- الأقسام بعناوين صغيرة 11px/700 بـ letter-spacing. في وضع الطي العنوان بيتحوّل لخط فاصل.
- العنصر: ارتفاع 44، أيقونة 21px. **العنصر النشط** خلفيته blue مع ظل، ومتحرك بـ `motion` `layoutId="nav-active"` (spring 420/36)، فالخلفية بتنزلق بين العناصر.
- Badge أحمر بالعدد، وفي وضع الطي بيبقى نقطة حمرا.
- في وضع الطي كل عنصر ليه Tooltip.
- كارت المستخدم تحت: Avatar + الاسم + الدور + زرار خروج.
- القائمة نفسها data في `navItems.tsx`: `{to, label, hint, icon, permissions[]}` متجمّعة في sections. `visibleSections(can)` بتشيل اللي المستخدم مالوش صلاحية عليه، والـ `hint` بيستخدمه الـ Command Palette.

### Responsive

- `lg` وأكبر: Sidebar ثابت sticky بارتفاع 100vh.
- أقل من `lg`: Sidebar جوّه `Drawer` بيتفتح من زرار ☰، والـ wordmark بيظهر في الهيدر.
- padding الـ main: `xs 1.5 / sm 2.5 / md 3.5 / lg 4`.

### Header (`layout/AppLayout.tsx`)

- `position: sticky`، خلفية `rgba(248,250,252,.82)` + `backdrop-filter: saturate(180%) blur(14px)` + border سفلي.
- Breadcrumb من `navSections`: القسم ثم الصفحة، وآخر عنصر 800.
- زرار بحث شكله input (عرض 360) فيه `kbd` "Ctrl K"، وبيفتح `CommandPalette`. الاختصار Ctrl/⌘+K global.
- زرار تحديث بيعمل `invalidateQueries()`، والأيقونة بتلف (`radarSweep`) طول ما في fetching (`useIsFetching`).
- منيو الإشعارات، ومنيو الحساب (الملف الشخصي / خروج بلون `redInk`).
- كل الأزرار الأيقونية في الهيدر: border + خلفية بيضا + `shadows.sm`.

### انتقال الصفحات

`AnimatePresence mode="wait"` + `motion.div` بمفتاح `pathname`: من opacity 0 وy 6 → 1 و0 في 0.16s.

### الراوتنج

- كل صفحة `lazy()` وملفوفة في `Suspense` بسبينر في النص.
- `ProtectedRoute` بيحمي التطبيق، و`RequirePermission anyOf=[…]` بيحمي كل صفحة، و`<Can anyOf>` بيخفي عناصر جوّه الصفحة.
- الصفحة الرئيسية بتحوّل المستخدم لأول صفحة مسموحله بيها لو مالوش صلاحية الـ dashboard.
- صفحات Fullscreen زي الرادار الحي برّه الـ `AppLayout`.

---

## 5. المكوّنات المشتركة (`src/components`)

| المكوّن | الوصف |
|---|---|
| `PageHeader` | `title` (h2) + `description` (body2، max 760) + `actions`. على الموبايل الأزرار تحت بعرض كامل |
| `SectionCard` | كارت بعنوان 16/800 + subtitle + أيقونة في مربع `ice100` 32px + `badge` + `action` على الطرف التاني. `hoverable` اختياري |
| `KpiCard` | label + أيقونة في مربع ملوّن 36px (tones: blue/red/green/amber/purple/navy) + رقم 28/800 tabular + `DeltaChip` (نسبة التغيير مع الفترة السابقة، فيها `invert` للمؤشرات اللي نزولها كويس) + `SparkLineChart` + Skeleton وقت التحميل |
| `DataTable` | DataGrid بـ **server pagination** (page 1-based)، rowHeight 60، header 48، `autoHeight`، page sizes 10/20/50/100، empty state بأيقونة Inbox ونص مخصص |
| `StaticTable` | جدول بسيط للبيانات الصغيرة |
| `SegmentedTabs` | تابات pill على خلفية `ice`، والتاب النشط blue بمؤشر منزلق (`motion layoutId`)، وتقبل `count` |
| `StatusChip` (عائلة) | `ToneChip` بـ 4 tones (danger/success/warning/neutral) كل واحدة بأيقونتها. ومنها `ResultChip`، `VehicleStatusChip`، `UserStatusChip`، `ApprovalChip`، `SubscriptionStatusChip`، `BooleanChip`، `PackageTypeChip` |
| `RowActions` | زرار ⋮ في آخر الصف بيفتح Menu. كل action ليه `{label, icon, onClick, danger?, hidden?}`، والـ `hidden` بيتربط بالصلاحيات |
| `ConfirmDialog` | تأكيد قبل الحذف أو الأكشن الخطير: `tone` danger/primary + `loading` على الزرار، والديالوج مايتقفلش وهو بيحمّل |
| `DetailList` | صفوف label/value (عمود 120px) بخطوط فاصلة. بيتستخدم في الـ Drawers والـ Modals |
| `SearchField` | بحث debounced (350ms) بأيقونة، وأقصى عرض 320 |
| `CommandPalette` | Ctrl+K: تنقّل لأي صفحة مسموحة + أكشنات سريعة (إضافة، استيراد، تحديث...) |
| `PlateChip` | **عنصر خاص بالبزنس** (لوحة السيارة) بأحجام sm/md/lg وtones default/wanted/onDark |
| `RoleChip`، `Logo` | شارة الدور واللوجو (variants: mark/wordmark، tones: light/dark) |

> في أي بزنس تاني: انقل كل حاجة من دول ماعدا `PlateChip`، واعمل بدلها "chip الكيان الأساسي" بتاع البزنس الجديد بنفس الفكرة (أحجام + tones).

---

## 6. تشريح الصفحة القياسية (List Page)

مثال كامل: `features/vehicles/VehiclesPage.tsx`. أي صفحة CRUD بتمشي بنفس الترتيب:

1. **`PageHeader`** وفيه الأكشنات: `tonal` للثانوي (استيراد/تصدير) و`contained` للأساسي (إضافة). كل زرار مربوط بـ `can("…")`.
2. **صف KPI كروت** `Grid size={{ xs:12, sm:6, md:3 }}`. الكارت ممكن يبقى **فلتر قابل للضغط**: لما يكون نشط حدّه 1.5px بلون الحالة + خلفية soft + ظل ملوّن، ومع hover بيترفع `translateY(-2px)`. ونقطة `liveDotPulse` بتبيّن إن البيانات حية.
3. **Filter bar** في `Paper` أبيض بحد: `SegmentedTabs` للحالة ثم spacer ثم `TextField select` للفلاتر ثم `SearchField`. على الموبايل column.
4. **`DataTable`**: أول عمود هو الكيان المميز (chip)، بعده أعمدة نصية بـ `flex` + `minWidth`، الحالة بـ `StatusChip`، التاريخ بـ `formatDate`، وآخر عمود `RowActions` بعرض 60. الضغط على الصف بيفتح التفاصيل، والـ emptyText بيختلف حسب لو في بحث ولا لأ.
5. **Dialogs و Drawers** في آخر الـ JSX:
   - `XxxFormDialog` للإضافة والتعديل (نفس الديالوج، و`editing=null` معناها إضافة).
   - `XxxDetailModal` أو `XxxDrawer` للعرض. الـ Drawer بيفتح من اليمين بعرض `{xs:"100%", sm:480}` وخلفيته `tokens.bg`.
   - `ImportDialog` لرفع Excel.
   - `ConfirmDialog` للحذف، برسالة بتشرح النتيجة والبديل الأخف.

### State والبيانات

```ts
const list = useListState<{ status: StatusFilter; companyId: string }>({ status: "WANTED", companyId: "" });
const { data, isFetching } = useQuery({
  queryKey: ["vehicles", params],
  queryFn: () => vehiclesApi.list(params),
  placeholderData: keepPreviousData, // الجدول مايفضاش وانت بتقلّب الصفحات
});
const m = useMutation({
  mutationFn: …,
  onSuccess: (res) => { notify.success(res.message ?? "تم"); queryClient.invalidateQueries({ queryKey: ["vehicles"] }); },
  onError: (err) => notify.apiError(err),
});
```

- `useListState`: page/limit/q/filters، وأي تغيير في فلتر أو بحث بيرجّع لصفحة 1.
- query keys بتبدأ باسم الكيان (`["vehicles", …]`)، فالـ invalidation بالاسم بيحدّث كل الشاشات اللي بتعرضه.
- `QueryClient` defaults: `retry: 1`، `refetchOnWindowFocus: false`، `staleTime: 20s`.
- Deep links: `?new=1` بيفتح الإضافة، `?import=1` بيفتح الاستيراد، `?status=…` بيحدد الفلتر. بعدها بتتمسح من الـ URL. ده اللي بيخلّي الـ Command Palette والـ dashboard يفتحوا أكشن مباشرة.

### الفورمز

`react-hook-form` + `zodResolver(schema)` + `Controller` للحقول اللي MUI بيتحكّم فيها (select، date). والـ validation messages بالعربي جوّه الـ schema.

---

## 7. صفحة الـ Dashboard

- `PageHeader` + كارت Hero (`HitsHero`) لأهم مؤشر بيزنس (الرصد الحالي).
- `SectionCard` فيها `BarChart` (يومي: مطلوب مقابل سليم) و`rangeTabs` (`SegmentedTabs` 7/30/90 يوم) في الـ `action`.
- `PieChart` لتوزيع الطرق، وقوائم "آخر الأحداث" بـ Avatar وأوقات نسبية (`fromNow`)، و`KpiCard` بـ delta وsparkline.
- `LinearProgress` للنسب، و`Skeleton` لكل كارت وقت التحميل.

---

## 8. Feedback والحالات

| الحالة | الطريقة |
|---|---|
| تحميل أول مرة | `Skeleton` بنفس شكل المحتوى |
| تحميل صفحة جديدة في الجدول | `loading` على الـ DataGrid + `keepPreviousData` |
| تحميل أكشن | `loading` على الزرار نفسه (MUI Button `loading`) |
| نجاح/خطأ | `notify.success / error / apiError` (react-toastify، أعلى الشمال، RTL، 3.5s، Slide) |
| خطأ API | `getErrorMessage`: أول field error من `{errors}` وإلا `message`، ورسالة واضحة لو مفيش اتصال |
| فاضي | أيقونة Inbox + نص بيوجّه للخطوة الجاية |
| ممنوع | العنصر مش بيظهر خالص (`hidden` / `<Can>`)، مش disabled |

تخصيص التوست (`styles/toast.css`): نفس خطوط وألوان الثيم، radius 16، border `#e9eff8`، ظل navy، progress bar 3px.

---

## 9. الحركة والـ CSS العام (`styles/dashboard.css`)

| Class / Keyframe | الاستخدام |
|---|---|
| `liveDotPulse` / `.live-pulse-dot` | نقطة خضرا نابضة بتقول "مباشر" |
| `urgentBadgePulse` / `.urgent-pulse` | نبض أحمر للتنبيهات العاجلة |
| `radarSweep` | لف (أيقونة التحديث، الرادار) |
| `.kpi-card-hover` | رفع 2px + ظل مع hover |
| `.glass-panel` | أبيض 75% + blur 12px |
| `.aurora-bg` | تدرّج navy متحرك (شاشة الدخول والـ hero) |
| `.float-slow` / `.float-reverse` | طفو بطيء للعناصر الزخرفية |
| Scrollbar | 6px، thumb رمادي شفاف |

قواعد الحركة:
- hover/press: 0.15–0.22s بـ `cubic-bezier(0.4, 0, 0.2, 1)` أو `(0.16, 1, 0.3, 1)`.
- الضغط: `scale(.98)` للزرار و`(.94)` للأيقونة.
- المؤشرات المنزلقة: `motion layoutId` + spring.
- `prefers-reduced-motion` بيلغي كل الحركة.

الحاجات الخاصة بهوية "رصد" (ممكن تستبدلها في البزنس الجديد): شاشة الدخول بـ radar canvas (`LoginRadarPanel`)، `SonarPreloader` + `sonarAudio`، `radarKit`/`radarScene` للرادار الحي، وكلاسات sonar/blast-door/threat-blip.

---

## 10. البيانات والـ Realtime

- `api/client.ts`: axios بـ `baseURL` من `VITE_API_URL`. في الـ production لازم URL كامل، وفي الـ dev `/api/v1` عن طريق البروكسي.
- interceptor بيضيف Bearer، وعند 401 بيعمل **refresh واحد بس** (والطلبات التانية بتستناه) وبعدين يعيد الطلب، ولو فشل بيعمل logout.
- `cleanParams` بيشيل القيم الفاضية من الـ query، و`downloadFile` للتصدير (blob).
- `api/endpoints.ts`: object لكل كيان (`vehiclesApi.list/create/update/remove/export…`)، و`api/types.ts` فيه الأنواع و`ApiResponse<T>` و`Paginated<T>`.
- `useRealtimeSync`: socket.io بيوصل بالتوكن، وكل event بيعمل invalidate للـ query keys المرتبطة (مجمّعة كل 300ms عشان burst الأحداث يعمل refetch واحد)، وتوست للأحداث المهمة، وإعادة مزامنة كاملة عند reconnect.
- الصلاحيات: `useAuth().can(...perms)` بنمط `entity.action` (`vehicles.view`، `vehicles.create`، `vehicles.import`...).

### التنسيق (`lib/format.ts`)

- dayjs بالعربي بأرقام لاتينية: `formatDate` = "5 سبتمبر 2026"، `formatDateTime`، `formatTime`، `fromNow`.
- `formatNumber` بـ `en-US`.
- كل الـ enum labels في مكان واحد (`ROLE_LABELS`، `VEHICLE_STATUS_LABELS`، `RESULT_LABELS`، …).

---

## 11. هيكل الفولدرات

```
src/
  api/          client.ts · endpoints.ts · tokenStorage.ts · types.ts
  auth/         AuthContext · ProtectedRoute · RequirePermission (+ <Can>)
  components/   المكوّنات المشتركة (القسم 5)
  features/<entity>/
                <Entity>Page.tsx · <Entity>FormDialog.tsx · <Entity>Drawer.tsx / DetailModal.tsx
  layout/       AppLayout · Sidebar · navItems · NotificationsMenu
  lib/          format · notify · useListState · useRealtimeSync
  styles/       dashboard.css · toast.css
  theme/        tokens.ts · theme.ts · ThemeRegistry.tsx
  assets/logo/  SVG بنسختين (عادي و light)
```

---

## 12. خطوات نقل التصميم لداشبورد بيزنس تاني

1. انسخ `theme/`، `styles/`، `components/` (ماعدا الخاص بالبزنس)، `layout/`، `lib/`، `api/client.ts`، `auth/`.
2. غيّر في `tokens.ts` لون الـ brand بس (`blue*` و`navy*`) وسيب ألوان الحالات (red/green/amber) زي ما هي.
3. حط اللوجو الجديد في `assets/logo` وحدّث `Logo.tsx`.
4. اكتب `navItems.tsx` الجديد (الأقسام والصلاحيات).
5. لكل كيان: `endpoints` + `types` + فولدر `features/<entity>` بنفس تشريح القسم 6.
6. الـ Dashboard: Hero لأهم مؤشر في البزنس + `KpiCard`s + `SectionCard` بالرسوم.
7. اعمل chip للكيان الأساسي بدل `PlateChip`.
8. اربط أحداث الـ socket الجديدة في `useRealtimeSync`.

---

## 13. الـ Skills الموجودة في `.cursor/skills`

دي skills للـ agent (مش باكدجات npm). هي مراجع وسكريبتات بيستخدمها الـ AI وهو بيصمّم:

| Skill | بتعمل إيه | علاقتها بالداشبورد |
|---|---|---|
| `ui-ux-pro-max` | قاعدة بيانات قابلة للبحث (Python بدون أي dependencies): 79 style، 192 palette، 74 font pairing، 119 UX guideline، 25 chart type، 22 stack | اختيار الستايل والألوان والخطوط وإرشادات الـ UX والـ accessibility للوحة |
| `design-system` | Tokens على 3 طبقات (primitive → semantic → component)، CSS variables، scales، component specs + سكريبتات `generate-tokens` / `validate-tokens` | الأساس اللي اتبنى عليه `tokens.ts` والـ theme |
| `ui-styling` | shadcn/ui + Tailwind + canvas design، accessibility، dark mode | مبادئ عامة بس. الداشبورد مبنية على **MUI مش Tailwind/shadcn** |
| `design` | skill شاملة: هوية، tokens، لوجو (55 style)، CIP، slides، بانرات، أيقونات SVG، صور سوشيال | اللوجو والأيقونات والهوية |
| `brand` | صوت البراند، الهوية البصرية، قواعد استخدام اللوجو، إدارة الـ palette، checklist للتناسق + سكريبتات `extract-colors` / `sync-brand-to-tokens` | توحيد ألوان التطبيق (Figma) مع الداشبورد |
| `banner-design` | بانرات سوشيال وإعلانات وhero (22 style) | للتسويق، مش جزء من الداشبورد |
| `slides` | عروض HTML بـ Chart.js وtokens | للعروض، مش جزء من الداشبورد |

> التوكنز اتاخدت من تصميم تطبيق الموبايل على Figma (ودا مكتوب في أول `tokens.ts`)، وبعدين اتكبّرت عشان تناسب الويب.
