# خطة النشر (Deployment Guide)

دليل تشغيل النظام على بيئات الإنتاج. النظام Next.js 16 (App Router) + Prisma — يعمل على أي مزود يدعم Node.js 20+.

---

## 1) متغيرات البيئة

أنشئ ملف `.env` (أو أضفها في لوحة المزود):

```env
# قاعدة البيانات — الإنتاج: PostgreSQL
DATABASE_URL="postgresql://user:password@host:5432/pharmacy?schema=public"
# أو SQLite للفروع الصغيرة:
# DATABASE_URL="file:/data/pharmacy.db"

# سر JWT — استبدله بقيمة عشوائية قوية (64 حرفاً)
JWT_SECRET="GENERATE-WITH: openssl rand -hex 32"

# البيئة
NODE_ENV=production
```

> ملاحظة الترحيل: الكود مكتوب بـ Prisma القياسي — للانتقال من SQLite إلى PostgreSQL: غيّر `provider = "postgresql"` في `prisma/schema.prisma` ثم `bun run db:push`. لا تغيير في الكود مطلوب (لا حقول Json ولا علاقات SQLite-specific).

## 2) بناء وتشغيل

```bash
# التبعيات
bun install        # أو: npm ci

# توليد عميل Prisma (التهيئة الكاملة تجري تلقائياً عند الإقلاع)
bun run db:generate

# البناء والتشغيل (Standalone)
bun run build
bun run start      # prestart يُنفّذ setup:db تلقائياً: قاعدة → جداول → بذر إن كانت فارغة
```

### التهيئة التلقائية (Auto Database Bootstrap)

لا حاجة لأي أمر قاعدة بيانات يدوي — عند كل إقلاع يعمل `npm run setup:db` (عبر `prestart`/`predev` وعبر `src/instrumentation.ts`) وهو آمن للتكرار تماماً:

1. **إنشاء القاعدة** — SQLite: إنشاء الملف والمجلد تلقائياً؛ مزودون مُدارون (Neon/Supabase/PlanetScale): تخطٍ بصمت بافتراض وجود القاعدة
2. **الجداول** — `prisma migrate deploy` إن وُجدت migrations وإلا `prisma db push --skip-generate`
3. **البذر** — فقط إذا كان جدول `User` فارغاً (لا يُعدّل ولا يكرر أي بيانات موجودة؛ upsert كطبقة أمان داخل `prisma/seed.ts`)

كل خطوة داخل try/catch — أي فشل يُسجل تحذيراً ولا يمنع إقلاع التطبيق.

> للبيانات الأولية اليدوية: `npm run setup:db` (آمنة). لإعادة التعيين الكاملة في التطوير: `npm run seed:reset` (⚠️ تحذف كل البيانات).

سكربت `build` ينتج `.next/standalone` جاهزاً للتشغيل بـ `node .next/standalone/server.js`.

## 3) النشر على VPS (Nginx + PM2)

### PM2

```bash
npm i -g pm2
pm2 start "bun run start" --name pharmacy-pms
pm2 save && pm2 startup    # تشغيل تلقائي مع إعادة التشغيل
```

### Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name pharmacy.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

ثم شهادة TLS:

```bash
sudo certbot --nginx -d pharmacy.example.com
```

## 4) النشر عبر Docker

**Dockerfile**

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run db:generate && bun run build

EXPOSE 3000
CMD ["bun", "run", "start"]
```

**docker-compose.yml**

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://pharmacy:secret@db:5432/pharmacy
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      - db
    volumes:
      - ./data:/data
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pharmacy
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: pharmacy
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
```

```bash
docker compose up -d --build
docker compose exec app bun run db:push
```

## 5) النشر على Vercel

1. ارفع المشروع إلى GitHub.
2. Vercel → New Project → استورد المستودع.
3. أضف متغيرات `DATABASE_URL` (Neon/Supabase PostgreSQL) و `JWT_SECRET`.
4. Build Command: `bun run db:generate && next build` — Output: افتراضي.
5. بعد أول نشر: شغّل `bun run db:push` محلياً مع `DATABASE_URL` الإنتاجي، ثم Seed إن رغبت.

## 6) النسخ الاحتياطي والاستعادة

### SQLite

```bash
# نسخ (أفضل وقت: منتصف الليل)
sqlite3 /data/pharmacy.db ".backup /backups/pharmacy-$(date +%F).db"

# حذف النسخ الأقدم من 30 يوماً
find /backups -name "pharmacy-*.db" -mtime +30 -delete
```

### PostgreSQL

```bash
pg_dump -U pharmacy pharmacy > backups/pharmacy-$(date +%F).sql
# الاستعادة:
psql -U pharmacy pharmacy < backups/pharmacy-2026-11-19.sql
```

### Cron يومي

```cron
0 2 * * * /usr/local/bin/backup-pharmacy.sh
```

> الشاشة نفسها تتيح «نسخة احتياطية الآن» من تبويب الإعدادات ← النسخ الاحتياطي (تُحدّث `lastBackupAt` وتسجل في Audit).

## 7) قائمة فحص الإنتاج (Production Checklist)

| # | البند | الأهمية |
| --- | --- | --- |
| 1 | توليد `JWT_SECRET` قوي وعدم مشاركته | حرجة |
| 2 | HTTPS (شهادة TLS) — الرموز تُنقل في ترويسات | حرجة |
| 3 | PostgreSQL بدل SQLite لأكثر من فرع/حمل عالٍ | عالية |
| 4 | تغيير كلمات مرور الحسابات الافتراضية فوراً | حرجة |
| 5 | تعطيل/حذف مستخدمي التجربة غير المستخدمين | عالية |
| 6 | جدولة نسخ احتياطي يومي + اختبار استعادة شهري | حرجة |
| 7 | إعداد الفاتورة الإلكترونية ETA: بديل `etaClientId/etaSecret` الحقيقي وربط واجهة التقديم الرسمية | عالية (مصر) |
| 8 | بوابات الدفع: استبدال مفاتيح Stripe/Paymob التجريبية | حسب الحاجة |
| 9 | مراقبة Logs (PM2 logs / Docker logs) + تنبيهات النواقص | عالية |
| 10 | طابعة حرارية 80mm: وصلها عبر ESC/POS وتجربة الطباعة من متصفح الكاشير | تشغيلية |
| 11 | حد الخصم للكاشير من الإعدادات ← POS (افتراضي 10%) | إدارية |
| 12 | مراجعة سجل النشاط دورياً (الإعدادات ← سجل النشاط) | إدارية |

## 8) التكاملات الجاهزة للربط (Stubs حالياً)

| التكامل | الموضع في الكود | الخطوة |
| --- | --- | --- |
| الفاتورة الإلكترونية ETA | `eInvoiceUuid` عند إنشاء الفاتورة + QR بالفاتورة | استبدل توليد UUID بنداء API مصلحة الضرائب ووقّع المستند |
| بوابات الدفع (Stripe/Paymob) | حقول المفاتيح في الإعدادات ← التكاملات | أضف مسار دفع إلكتروني عند الحاجة |
| واتساب/SMS | أزرار الإرسال في نافذة الطباعة | اربط WhatsApp Business API / بوابة SMS بالمفاتيح المحفوظة |
| PWA Offline | `public/manifest.json` جاهز | أضف Service Worker للتخزين المؤقت الكامل عند الحاجة |

## 9) استكشاف الأخطاء

| المشكلة | الحل |
| --- | --- |
| `P1001 Can't reach database` | تحقق من `DATABASE_URL` ومن تشغيل قاعدة البيانات |
| خطأ 401 متكرر | انتهى رمز الوصول — العميل يجدد تلقائياً؛ تحقق من `JWT_SECRET` ثابت بين إعادة التشغيل |
| الطباعة تخرج بتنسيق A4 | المطبعة تُطبّق `@media print` — اختر حجم 80mm في إعدادات الطابعة |
| بطء القوائم | تأكد من فهارس PostgreSQL (Prisma تنشئها على المعرفات)؛ زد `limit` الترقيم بحكمة |
