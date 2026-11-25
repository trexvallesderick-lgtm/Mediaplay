@echo off

REM REQUIREMENT: PHP must be installed.
REM
REM Download PHP:
REM https://windows.php.net/download/
REM
REM Installation instructions:
REM 1. Download the PHP ZIP package.
REM 2. Extract it into a folder (e.g. C:\php).
REM 3. Add that folder to your Windows PATH environment variable.
REM 4. Open Command Prompt and run: php -v
REM
REM PHP must be accessible through PATH before starting MediaPlay.

cd /d "%~dp0"
where php >nul 2>nul
if errorlevel 1 (
  echo PHP is required. Install PHP and add it to PATH.
  pause
  exit /b 1
)
echo Starting MediaPlay at http://127.0.0.1:8080
start http://%IP%:8080
php -S 0.0.0.0:8080
