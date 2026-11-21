#!/usr/bin/env python3
# scripts/build-zip.py — بناء ملف ZIP جاهز للنقل: كل كود المشروع + قاعدة البيانات الحالية
# ═══════════════════════════════════════════════════════════════════════════
# المصدر: git ls-files (147 ملف) + db/custom.db (لقطة VACUUM متسقة) + START-HERE.txt
# الاستبعاد المتعمد: node_modules، .next، .env، db/backups — تُبنى/تُنشأ تلقائيًا أول تشغيل
import subprocess, zipfile, os, sys, datetime

ROOT = "/home/z/my-project"
SNAPSHOT = "/tmp/db-snapshot.db"
OUT = f"/home/z/my-project/download/pharmacy-project-with-data-{datetime.date.today().isoformat()}.zip"

START_HERE = """═══════════════════════════════════════════════════════
   نظام إدارة الصيدليات — نسخة كاملة جاهزة للتشغيل
═══════════════════════════════════════════════════════

هذا الملف فيه المشروع كامل + بياناتك الحالية بالفعل
(قاعدة البيانات مرفقة جاهزة داخل مجلد db) — مش محتاجة أي استعادة أو إعداد.

خطوات التشغيل على أي جهاز Windows:
──────────────────────────────────────────────────
1) ثبّتي Node.js لو مش مثبت — النسخة LTS من:  https://nodejs.org
   (مرة واحدة على الجهاز فقط)

2) دبل كليك على الملف:   start-windows.bat
   • أول تشغيل هيحمّل الاعتماديات وبياخد 2-5 دقائق — ده طبيعي متقلقيش
   • هيفتح المتصفح تلقائيًا على:  http://localhost:3000

3) بيانات الدخول:
   ─────────────────────────────────────────────
   الأدمن:      admin       / Admin@123
   الصيدلاني:   pharmacist  / Pharma@123
   الكاشير:     cashier     / Cashier@123   (PIN: 1234)
   الحسابات:    accountant  / Account@123
   المخزون:     inventory   / Inv@123

ملحوظات مهمة:
──────────────────────────────────────────────────
• للنسخ الاحتياطي والاستعادة: من داخل البرنامج ← الإعدادات ← تبويب «النسخ الاحتياطي»
  زر «نسخة احتياطية» بيحفظ لقطة كاملة، وزر «استعادة» بيرجّعها فورًا بدون إعادة تشغيل.
• لتشغيل البرنامج كل يوم: دبل كليك على start-windows.bat
  ولو عايزاه يشتغل تلقائيًا مع إقلاع الجهاز: Win+R ← اكتبي shell:startup
  وحطي اختصار للملف في المجلد اللي هيفتح.
• على macOS / Linux: شغّلي start.sh بدل الملف ده.
• التفاصيل الكاملة (الوحدات الـ13، الصلاحيات، الشرح التقني) موجودة في README.md.
"""


def main() -> int:
    files = [f for f in subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.splitlines() if f.strip()]
    if len(files) < 100:
        print(f"خطأ: عدد ملفات المستودع غير منطقي ({len(files)})"); return 1
    if not os.path.isfile(SNAPSHOT):
        print("خطأ: لقطة القاعدة غير موجودة — شغّلي خطوة VACUUM الأول"); return 1

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)

    now = datetime.datetime.now().timetuple()[:6]
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in files:
            z.write(os.path.join(ROOT, f), f)
        z.write(SNAPSHOT, "db/custom.db")
        info = zipfile.ZipInfo("START-HERE.txt", date_time=now)
        z.writestr(info, START_HERE.encode("utf-8-sig"))

    # ─── التحقق بعد البناء ───
    with zipfile.ZipFile(OUT) as z:
        bad = z.testzip()
        if bad:
            print(f"خطأ: ملف تالف داخل الأرشيف: {bad}"); return 1
        names = z.namelist()
        forbidden = [n for n in names if n.startswith(("node_modules/", ".next/", "download/", "upload/", "db/backups/")) or n == ".env" or n.startswith(".env")]
        required = ["package.json", "prisma/schema.prisma", "prisma/seed.ts", "scripts/setup-db.ts",
                    "src/instrumentation.ts", "start-windows.bat", "start.sh", "README.md",
                    "src/app/api/settings/backup/route.ts", "src/app/api/settings/restore/route.ts",
                    "db/custom.db", "START-HERE.txt"]
        missing = [r for r in required if r not in names]
        dbinfo = z.getinfo("db/custom.db")

    print(f"✓ الأرشيف: {OUT}")
    print(f"✓ عدد الملفات: {len(names)} (كود: {len(files)} + قاعدة البيانات + ملف الإرشادات)")
    print(f"✓ حجم القاعدة داخل الأرشيف: {dbinfo.file_size} bytes (مضغوطة: {dbinfo.compress_size})")
    print(f"✓ الحجم الكلي للأرشيف: {os.path.getsize(OUT)} bytes ({os.path.getsize(OUT)/1024/1024:.1f} MB)")
    print(f"✓ سلامة الأرشيف: testzip ناجح" )
    print(f"✓ لا ممنوعات (node_modules/.next/.env/backups): {'نظيف' if not forbidden else forbidden[:5]}")
    if missing:
        print(f"✗ ملفات ناقصة: {missing}"); return 1
    print("✓ كل الملفات المطلوبة موجودة")
    return 0


if __name__ == "__main__":
    sys.exit(main())
