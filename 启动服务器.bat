@echo off
chcp 65001 >nul 2>nul
title KaoShi FuWuQi

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set IP=%%a
    goto :found
)
:found
set IP=%IP: =%

echo.
echo  ============================================
echo    AI ^& C YuYan KaoShi XiTong
echo  ============================================
echo.
echo    FuWu Yi QiDong !
echo.
echo    >>> http://%IP%:8765
echo.
echo    BenJi: http://localhost:8765
echo.
echo    An Ctrl+C TingZhi
echo  ============================================
echo.

netsh advfirewall firewall add rule name="AI_C_Exam_Server" dir=in action=allow protocol=TCP localport=8765 >nul 2>nul

python -m http.server 8765 --bind 0.0.0.0
pause