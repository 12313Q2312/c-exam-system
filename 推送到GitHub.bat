@echo off
chcp 65001 >nul
title 推送到 GitHub

echo ============================================
echo   正在推送到 GitHub ...
echo ============================================
echo.
echo 如果弹出登录窗口，点 "Sign in with your browser"
echo 或者输入你的 GitHub 账号密码
echo.

git push origin main

echo.
if %errorlevel% equ 0 (
    echo ✓ 推送成功！
    echo.
    echo 等待 1-2 分钟，访问：
    echo https://12313q2312.github.io/c-exam-system/
) else (
    echo ✗ 推送失败，看看上面的错误提示
)
echo.
pause
