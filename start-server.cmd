@echo off
cd /d "%~dp0"
node scripts/build-assets.mjs
echo Open http://localhost:8080 in your browser.
python -m http.server 8080 --bind 127.0.0.1
pause
