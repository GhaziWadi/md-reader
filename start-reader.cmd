@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing Markdown Reader dependencies...
  call npm.cmd install
  if errorlevel 1 exit /b 1
)
if "%~1"=="" (
  set /p "reader_folder=Enter the folder to browse (Enter for this folder): "
  call :run
) else (
  node server.js %*
)
pause
exit /b
:run
if defined reader_folder (node server.js "%reader_folder%") else (node server.js)
exit /b
