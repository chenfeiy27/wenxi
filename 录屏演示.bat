@echo off
chcp 65001 >nul
setlocal
set "APP=%~dp0"
set "URL=file:///%APP:\=/%index.html?demo=1"
echo.
echo   Wenxi - 60s auto demo
echo   Opening: %URL%
echo.
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --new-window "%URL%"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window "%URL%"
) else (
  start "" "%URL%"
)
endlocal
