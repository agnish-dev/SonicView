@echo off
echo Starting Music DNA Backend...
start cmd /k "cd backend && .\venv\Scripts\python.exe -m uvicorn main:app --reload"

echo Starting Music DNA Frontend...
start cmd /k "npm run dev"

echo Both servers are starting in separate windows!
echo Opening website in your default browser...

:: Wait a couple seconds for Vite to start, then open the browser
timeout /t 3 >nul
start http://localhost:5173

exit
