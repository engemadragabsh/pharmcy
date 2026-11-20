@echo off
chcp 65001 >nul
title صيدلية الشفاء — نظام إدارة الصيدليات
cd /d "%~dp0"

echo ════════════════════════════════════════════════════
echo    صيدلية الشفاء — نظام إدارة الصيدليات
echo ════════════════════════════════════════════════════
echo.

rem ─── التأكد من وجود Node.js ───
where node >nul 2>nul
if errorlevel 1 (
    echo [خطأ] Node.js غير مثبت على الجهاز.
    echo حمّليه من: https://nodejs.org  — نسخة LTS ثم أعد المحاولة.
    echo.
    pause
    exit /b 1
)

rem ─── أول مرة فقط: تثبيت الحزم تلقائياً ───
if not exist "node_modules" (
    echo أول تشغيل — جاري تثبيت الحزم، انتظر دقيقتين...
    call npm install
    if errorlevel 1 (
        echo [خطأ] فشل التثبيت — تأكدي من اتصال الإنترنت ثم أعيدي المحاولة.
        pause
        exit /b 1
    )
)

rem ─── فتح المتصفح تلقائياً بعد جاهزية السيرفر ───
start "" cmd /c "timeout /t 8 /nobreak >nul & start "" http://localhost:3000"

echo جاري تشغيل النظام...
echo المتصفح هيفتح تلقائياً على:  http://localhost:3000
echo.
echo ⚠ مهم: سيب النافذة دي مفتوحة أثناء العمل.
echo   لو قفلتها، التطبيق هيتوقف (بياناتك محفوظة دايماً في db\custom.db).
echo   للإيقاف في نهاية اليوم: اقفل النافذة دي.
echo.
call npm run dev
pause
