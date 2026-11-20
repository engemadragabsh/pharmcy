#!/usr/bin/env bash
# صيدلية الشفاء — تشغيل النظام (macOS / Linux)
cd "$(dirname "$0")" || exit 1

echo "════════════════════════════════════════════════"
echo "   صيدلية الشفاء — نظام إدارة الصيدليات"
echo "════════════════════════════════════════════════"

# التأكد من وجود Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[خطأ] Node.js غير مثبت — حمّليه من https://nodejs.org (نسخة LTS)"
  exit 1
fi

# أول مرة فقط: تثبيت الحزم تلقائياً
if [ ! -d "node_modules" ]; then
  echo "أول تشغيل — جاري تثبيت الحزم، انتظر دقيقتين..."
  npm install || { echo "[خطأ] فشل التثبيت — تأكدي من الإنترنت"; exit 1; }
fi

# فتح المتصفح تلقائياً بعد جاهزية السيرفر
( sleep 8
  open "http://localhost:3000" 2>/dev/null || xdg-open "http://localhost:3000" 2>/dev/null
) &

echo "المتصفح هيفتح تلقائياً على: http://localhost:3000"
echo "⚠ سيب النافذة مفتوحة أثناء العمل — للإيقاف: Ctrl+C"
npm run dev
