@echo off
echo Starting Music DNA Backend...
start cmd /k "cd backend && .\venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --reload"

echo Starting Ngrok Tunnel...
start cmd /k "C:\Users\hermb\AppData\Local\Microsoft\WinGet\Packages\ngrok.ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe http --url=patchwork-photo-salad.ngrok-free.dev 8000"

echo Starting Music DNA Frontend...
start cmd /k "npm run dev"

echo All servers are starting in separate windows!
echo Opening website in your default browser...

:: Wait a couple seconds for servers to start, then open the Vercel website
start https://sonic-view-gray.vercel.app/

exit
