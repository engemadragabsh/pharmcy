# صيدلية الشفاء — نظام إدارة الصيدليات المتكامل

نظام إدارة صيدليات احترافي جاهز للإنتاج، مبني بـ **Next.js 16 + TypeScript + TailwindCSS + shadcn/ui + Prisma (SQLite)**، مع دعم كامل للعربية (RTL) والإنجليزية (LTR)، ومتوافق مع البيئة المصرية (جنيه، ضريبة 14%، فاتورة إلكترونية ETA).

---

## المزايا الرئيسية

| الوحدة | الوصف |
| --- | --- |
| تسجيل الدخول | JWT (وصول + تجديد)، دخول سريع بـ PIN للكاشير، اختيار الفرع (Multi-Branch)، تذكرني |
| لوحة التحكم | 8 مؤشرات KPI، مبيعات 14 يوم / 12 شهر، الأكثر مبيعاً، أعلى العملاء، تنبيهات فورية |
| نقطة البيع POS | بحث بالباركود/الاسم/المادة الفعالة، سلة، خصم صنف/فاتورة/كوبون، 5 طرق دفع، خدمات، نقاط ولاء، تعليق واسترجاع، مرتجعات مرتبطة بالفاتورة، فحص تداخلات وحساسية |
| الأدوية | CRUD كامل، تشغيلات وصلاحية FEFO، بدائل دوائية، باركود، حد إعادة الطلب، الرفوف |
| المخزون | حركات، استلام، تحويل بين الفروع، تسوية، جرد فعلي بفروقات، مراقبة صلاحية (90/30/7 يوم) |
| الوصفات | إدخال يدوي/صورة، أطباء، صرف مع خصم مخزون، فحص تداخلات دوائية وحساسية، أرشيف العميل |
| العملاء | ملف طبي (حساسية/أمراض مزمنة)، VIP/تأمين/عادي، نقاط ولاء، رصيد آجل، سجل مشتريات |
| الموردين | ملف مورد، أوامر شراء (مسودة/إرسال)، استلام GRN بإنشاء تشغيلات، أرصدة |
| الخزينة | ورديات (فتح/إغلاق بفرق متوقع)، مصروفات وإيرادات، كشوف حساب عميل/مورد |
| HR (مبسط) | موظفون، حضور وانصراف، رواتب شهرية بحوافز وخصومات |
| التقارير | 11 تقريراً + تصدير CSV + طباعة |
| الإعدادات | 12 تبويب كامل مع نسخ للتراجع (Rollback) وسجل نشاط Audit Log |

## الحسابات التجريبية

| الدور | المستخدم | كلمة المرور | PIN |
| --- | --- | --- | --- |
| مدير النظام | `admin` | `Admin@123` | — |
| صيدلي | `pharmacist` | `Pharma@123` | — |
| كاشير | `cashier` | `Cashier@123` | `1234` |
| محاسب | `accountant` | `Account@123` | — |
| مسؤول مخزون | `inventory` | `Inv@123` | — |

كوبونات تجريبية: `WELCOME10` (خصم 10%) و `PHARMA25` (خصم 25 ج.م).

## التشغيل السريع

```bash
# 1) تثبيت الحزم
bun install

# 2) بناء قاعدة البيانات (SQLite عبر Prisma)
bun run db:push

# 3) البيانات التجريبية (28 دواء، 144 فاتورة، تداخلات دوائية...)
bun run scripts/seed.ts

# 4) خادم التطوير
bun run dev        # http://localhost:3000

# 5) فحوصات
bun run lint
bunx tsc --noEmit
```

> ملاحظة: قاعدة البيانات SQLite (`db/custom.db`) — مخطط Prisma نفسه قابل للترحيل إلى PostgreSQL بتغيير `provider` في `prisma/schema.prisma` دون تعديل الكود.

## هيكل المشروع

```
├── prisma/schema.prisma          # مخطط قاعدة البيانات الكامل (30+ نموذجاً)
├── db/custom.db                  # قاعدة SQLite
├── scripts/seed.ts               # البيانات التجريبية المصرية الواقعية
├── docs/
│   ├── ERD.md                    # مخطط ERD + شرح الجداول والعلاقات
│   ├── SITEMAP.md                # خريطة النظام + تدفق المستخدم
│   ├── openapi.yaml              # توثيق REST API (OpenAPI 3.0)
│   └── DEPLOYMENT.md             # خطوات النشر للإنتاج
├── src/
│   ├── app/
│   │   ├── page.tsx              # نقطة الدخول (SPA)
│   │   ├── layout.tsx            # الخط العربي Cairo + RTL
│   │   └── api/                  # 18 مجموعة نقاط نهاية REST
│   │       ├── auth/             # login / pin / refresh / me
│   │       ├── dashboard/        # KPIs + رسوم + تنبيهات
│   │       ├── products/         # CRUD + lookup (POS) + [id]
│   │       ├── stock/            # حركات/استلام/تحويل/تسوية/جرد
│   │       ├── invoices/         # بيع + [id] + refund + hold
│   │       ├── prescriptions/    # وصفات + صرف
│   │       ├── interactions/     # فحص التداخلات والحساسية
│   │       ├── customers/ suppliers/ purchase-orders/
│   │       ├── finance/          # ورديات/مصروفات/كشوف
│   │       ├── reports/          # 11 تقريراً
│   │       ├── settings/ branches/ users/ audit/
│   │       ├── notifications/ hr/ master-data/
│   ├── components/
│   │   ├── ui/                   # shadcn/ui كاملة
│   │   └── pharmacy/             # 15 شاشة + مكونات مشتركة
│   └── lib/
│       ├── i18n.ts               # قاموس عربي/إنجليزي (~350 مفتاحاً)
│       ├── store.ts              # Zustand + RBAC Matrix
│       ├── client-api.ts         # fetch موحد + تجديد توكن تلقائي + CSV
│       ├── format.ts             # عملة/تاريخ (ar-EG / en-EG)
│       └── server/
│           ├── auth.ts           # jose JWT + حرس الأدوار + معالج أخطاء
│           └── core.ts           # FEFO + ترقيم تلقائي + Audit + إشعارات
```

## معايير الجودة المنفذة

- **TypeScript Strict** — `bunx tsc --noEmit` نظيف 100%
- **ESLint** — 0 أخطاء
- **Validation** — تحقق على الخادم والواجهة، رسائل خطأ عربية واضحة
- **الأمان**: bcrypt للكلمات، JWT HS256 (جوس)، Rate Limiting على الدخول، حرس RBAC على كل نقطة نهاية، Prisma Parameterized Queries (منع SQL Injection)، Audit Log لكل عملية حساسة
- **FEFO ذري**: خصم المخزون داخل `$transaction` — لا بيع من تشغيلة منتهية
- **الفاتورة الإلكترونية**: UUID لكل فاتورة + QR (بيانات ETA) — جاهزة للربط الفعلي
- **الطباعة**: حراري 80mm (`@media print` معتمد) + قالب A4/PDF
- **إتاحة (A11y)**: ARIA labels، تنقل بلوحة المفاتيح، `main/nav/aria-current`
- **متجاوب**: Mobile / Tablet / Desktop + شريط جانبي Sheet للجوال
- **PWA**: manifest.json جاهز (theme #059669)

## نقاط نهاية API (ملخص)

التوثيق الكامل في [`docs/openapi.yaml`](./openapi.yaml):

```
POST /api/auth/login | pin | refresh     GET /api/auth/me
GET  /api/dashboard                      GET|POST /api/products  GET|PUT|DELETE /api/products/[id]
GET  /api/products/lookup?q=             GET|POST /api/stock      (view=movements|batches)
GET|POST /api/customers                  GET|PUT|DELETE /api/customers/[id]
GET|POST /api/suppliers                  GET|POST|PUT /api/purchase-orders
POST /api/purchase-orders/[id]/receive   GET|POST /api/invoices
GET  /api/invoices/[id]                  POST /api/invoices/[id]/refund
GET|POST|DELETE /api/invoices/hold       GET|POST /api/prescriptions
POST /api/interactions/check             GET /api/reports?type=...
GET|PUT|POST /api/settings               GET|POST|PUT|DELETE /api/branches
GET|POST|PUT|DELETE /api/users           GET /api/audit
GET|PUT /api/notifications               GET|POST /api/hr
GET|POST /api/master-data                GET|POST /api/doctors
```

## خطوات النشر

راجع [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) — يشمل VPS/Docker/Vercel، النسخ الاحتياطي، وقائمة فحص الإنتاج.
