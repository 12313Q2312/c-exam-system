@echo off
chcp 65001 >nul
title Ngrok - 公网映射

echo  ============================================
echo    AI ^& C 考试系统 - 公网映射
echo  ============================================
echo.
echo  第 1 步：请先双击 "启动服务器.bat"
echo          确保服务器已启动（端口 8765）
echo.
echo  第 2 步：按任意键启动 Ngrok
echo          得到公网网址后发给别人即可访问
echo.
echo  ============================================
echo.

pause

echo.
echo 正在连接 Ngrok ...
echo.

"C:\Users\Lenovo\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" http 8765

pause
