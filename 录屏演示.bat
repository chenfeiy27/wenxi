@echo off
chcp 65001 >nul
setlocal
set "APP=%~dp0"
set "URL=file:///%APP:\=/%index.html?demo=1"
echo.
echo   闻息 · 停云 - 90 秒自动演示
echo   打开后点一下「开 始 演 示」即可（需真实点击，浏览器才允许放声音）
echo   Esc 随时中止
echo.
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --new-window "%URL%"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window "%URL%"
) else (
  start "" "%URL%"
)
endlocal
