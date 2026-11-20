#!/usr/bin/env bash
# scripts/clone-proof.sh — إثبات عملي: clone نظيف من GitHub يعمل كاملاً من أول مرة
# ═══════════════════════════════════════════════════════════════════════════
# يحاكي جهاز المستخدمة الجديد تماماً: مفيش db، مفيش .env، مفيش node_modules.
# الخطوات: clone → install → تشغيل → تهيئة تلقائية → دخول → نسخ احتياطي → استعادة
REPO="https://github.com/engemadragabsh/pharmcy.git"
DIR="/tmp/clone-test"
PORT=3210
BASE="http://localhost:$PORT"
PASS=0; FAIL=0
# ok $? "label" — $?=0 (الشرط صحيح) = نجاح
ok(){ if [ "$1" = "0" ]; then echo "  ✓ $2"; PASS=$((PASS+1)); else echo "  ✗ FAIL $2"; FAIL=$((FAIL+1)); fi; }

echo "═══ 1) clone نظيف من GitHub ═══"
rm -rf "$DIR"
if git clone --quiet "$REPO" "$DIR" 2>/tmp/clone-err.txt; then ok 0 "git clone نجح"; else echo "clone error: $(cat /tmp/clone-err.txt)"; exit 1; fi

echo "═══ 2) محتوى المستودع المنزّل ═══"
FILES=$(cd "$DIR" && git ls-files | wc -l)
LAST=$(cd "$DIR" && git log --oneline -1)
echo "  عدد الملفات المتتبعة: $FILES | آخر كوميت: $LAST"
[ "$FILES" -gt 100 ]; ok $? "أكثر من 100 ملف كود نزلت"
for f in package.json prisma/schema.prisma prisma/seed.ts scripts/setup-db.ts src/instrumentation.ts start-windows.bat start.sh README.md src/app/api/settings/backup/route.ts src/app/api/settings/restore/route.ts src/components/pharmacy/settings-screen.tsx src/lib/i18n.ts; do
  [ -f "$DIR/$f" ]; ok $? "موجود: $f"
done
[ ! -d "$DIR/db" ]; ok $? "db/ مش موجودة (متوقع — تُبنى تلقائياً أول تشغيل)"
[ ! -f "$DIR/.env" ]; ok $? ".env مش موجود (متوقع — يُنشأ تلقائياً)"

echo "═══ 3) npm install (+ postinstall: prisma generate) ═══"
cd "$DIR" || exit 1
if npm install --no-audit --no-fund --loglevel=error > /tmp/clone-npm.log 2>&1; then ok 0 "npm install نجح"; else echo "--- npm log ---"; tail -25 /tmp/clone-npm.log; exit 1; fi
[ -d "$DIR/node_modules/@prisma/client" ] && [ -d "$DIR/node_modules/.prisma/client" ]; ok $? "عميل Prisma تولّد تلقائياً"

echo "═══ 4) تشغيل السيرفر + التهيئة التلقائية للقاعدة ═══"
# env -u DATABASE_URL — محاكاة جهاز المستخدمة النظيف (بيئة الـ sandbox هنا تحتوي المتغير موروثًا)
nohup env -u DATABASE_URL node node_modules/next/dist/bin/next dev -p $PORT > "$DIR/server.log" 2>&1 &
SRV=$!
UP=0
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/" 2>/dev/null || echo 000)
  if [ "$code" = "200" ] || [ "$code" = "307" ]; then UP=1; break; fi
  sleep 2
done
[ "$UP" = "1" ]; ok $? "السيرفر قام على المنفذ $PORT"
echo "  --- سجل التهيئة التلقائية ---"
grep -a "setup-db" "$DIR/server.log" | sed 's/\x1b\[[0-9;]*m//g' | head -8 | sed 's/^/  | /'
[ -f "$DIR/db/custom.db" ]; ok $? "قاعدة البيانات اتبنت تلقائياً (db/custom.db)"
[ -f "$DIR/.env" ]; ok $? ".env اتبنى تلقائياً داخل الكلون (DATABASE_URL)"

echo "═══ 5) دخول الأدمن (يضمن أن الجداول مبنيّة والبذر اتعمل) ═══"
TOKEN=""
for i in $(seq 1 20); do
  R=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin@123"}')
  TOKEN=$(echo "$R" | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
  [ -n "$TOKEN" ] && break
  sleep 3
done
[ -n "$TOKEN" ]; ok $? "دخول admin/Admin@123 نجح — توكن JWT صادر"

echo "═══ 6) ميزة النسخ الاحتياطي والاستعادة داخل الكلون ═══"
R=$(curl -s -X POST "$BASE/api/settings/backup" -H "Authorization: Bearer $TOKEN")
NAME=$(echo "$R" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')
[ -n "$NAME" ]; ok $? "إنشاء نسخة احتياطية (زر الإعدادات) → $NAME"
[ -f "$DIR/db/backups/$NAME" ]; ok $? "ملف النسخة محفوظ فعلاً على القرص (db/backups)"
R=$(curl -s -X POST "$BASE/api/settings/restore" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d "{\"name\":\"$NAME\"}")
echo "  | $(echo "$R" | head -c 260)"
echo "$R" | grep -q "restoredCount"; ok $? "الاستعادة من النسخة نجحت فوراً (بدون إعادة تشغيل)"

kill $SRV 2>/dev/null; pkill -f "next dev -p $PORT" 2>/dev/null
echo ""
echo "═══ النتيجة النهائية: $PASS نجاح | $FAIL فشل ═══"
[ "$FAIL" = "0" ]
