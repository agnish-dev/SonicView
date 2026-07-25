@echo off
echo Starting Music DNA Backend...
start cmd /k "cd backend && .\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --reload"

echo Starting Ngrok Tunnel...
start cmd /k "ngrok http --domain=patchwork-photo-salad.ngrok-free.dev 8000"

echo Starting Music DNA Frontend...
start cmd /k "npm run dev"

echo All servers are starting in separate windows!
echo Opening website in your default browser...

:: Wait a couple seconds for Vite to start, then open the browser
start http://localhost:5173

exit
