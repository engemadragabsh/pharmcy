/* اختبار شامل: النسخ الاحتياطي والاستعادة */
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3000";

async function login(username, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error(`login failed ${r.status}`);
  const d = await r.json();
  return d.accessToken;
}

async function call(method, path, token, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text.slice(0, 120); }
  return { status: r.status, json, headers: r.headers };
}

(async () => {
  const db = new PrismaClient();
  let pass = 0, fail = 0;
  const ok = (cond, label) => { console.log(`${cond ? "✓" : "✗ FAIL"} ${label}`); cond ? pass++ : fail++; };

  const admin = await login("admin", "Admin@123");
  console.log("admin token ✓");

  // 1) قائمة فارغة أو موجودة
  let r = await call("GET", "/api/settings/backup", admin);
  ok(r.status === 200, `GET list → ${r.status} (${r.json.items?.length || 0} نسخ)`);

  // 2) إنشاء نسخة B1
  r = await call("POST", "/api/settings/backup", admin);
  ok(r.status === 201 && r.json.name, `POST create B1 → ${r.status} ${r.json.name || ""}`);
  const B1 = r.json.name;

  // 3) الملف موجود فعلاً على القرص
  await new Promise((res) => setTimeout(res, 300));
  r = await call("GET", "/api/settings/backup", admin);
  ok(r.json.items?.some((i) => i.name === B1 && i.sizeBytes > 0), `الملف على القرص (${r.json.items?.find(i => i.name === B1)?.sizeBytes} bytes)`);

  // 4) إنشاء نسخة B2 ثانية
  r = await call("POST", "/api/settings/backup", admin);
  ok(r.status === 201, `POST create B2 → ${r.status} ${r.json.name || ""}`);
  const B2 = r.json.name;
  ok(B2 !== B1, "أسماء فريدة (B2 ≠ B1)");

  // 5) إضافة علامة اختبار (عميل) بعد النسخة B1
  const markerCode = `TEST-${Date.now()}`;
  await db.customer.create({ data: { code: markerCode, name: "TEST-MARKER" } });
  const countWithMarker = await db.customer.count();
  console.log(`✓ عميل علامة مضاف (${markerCode}) — العملاء الآن: ${countWithMarker}`);

  // 6) استعادة B1 — العلامة لازم تختفي بدون إعادة تشغيل
  r = await call("POST", "/api/settings/restore", admin, { name: B1 });
  ok(r.status === 200 && r.json.restoredCount > 20, `POST restore → ${r.status} (جداول مستعادة: ${r.json.restoredCount}, متخطاة: ${r.json.skippedCount})`);
  if (r.json.skipped?.length) console.log("  متخطاة:", JSON.stringify(r.json.skipped));

  const countAfterRestore = await db.customer.count();
  ok(countAfterRestore === countWithMarker - 1, `العلامة اختفت بعد الاستعادة مباشرة (${countAfterRestore} عميل)`);
  const markerGone = await db.customer.findUnique({ where: { code: markerCode } });
  ok(!markerGone, "العميل التجريبي محذوف فعلاً من القاعدة الحية");

  // 7) تنزيل النسخة
  r = await call("GET", `/api/settings/backup?download=${encodeURIComponent(B1)}`, admin);
  ok(r.status === 200 && String(r.headers.get("content-disposition") || "").includes("attachment"), `GET download → ${r.status} attachment ✓`);

  // 8) اسم غير صالح (path traversal)
  r = await call("GET", `/api/settings/backup?download=..%2Fcustom.db`, admin);
  ok(r.status === 400 || r.status === 404, `حماية المسارات → ${r.status}`);

  // 9) حذف B2
  r = await call("DELETE", `/api/settings/backup?name=${encodeURIComponent(B2)}`, admin);
  ok(r.status === 200, `DELETE B2 → ${r.status}`);
  r = await call("GET", "/api/settings/backup", admin);
  ok(!r.json.items?.some((i) => i.name === B2), "B2 اختفت من القائمة");

  // 10) صلاحيات: الصيدلاني ممنوع
  const pharma = await login("pharmacist", "Pharma@123");
  r = await call("GET", "/api/settings/backup", pharma);
  ok(r.status === 403, `pharmacist GET → ${r.status} (متوقع 403)`);
  r = await call("POST", "/api/settings/restore", pharma, { name: B1 });
  ok(r.status === 403, `pharmacist restore → ${r.status} (متوقع 403)`);

  // 11) بدون توكن
  r = await call("GET", "/api/settings/backup", null);
  ok(r.status === 401, `بدون توكن → ${r.status} (متوقع 401)`);

  console.log(`\n═══ النتيجة: ${pass} نجاح | ${fail} فشل ═══`);
  await db.$disconnect();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
