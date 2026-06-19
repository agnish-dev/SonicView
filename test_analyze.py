import asyncio
import httpx

async def test_analyze():
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                'http://127.0.0.1:8000/api/analyze',
                json={
                    "id": "e_z-hBwWcIQ",
                    "title": "Chole Gecho Tate Ki",
                    "artist": "Keshab Dey",
                    "genre": "Pop",
                    "art": "https://via.placeholder.com/150",
                    "preview_url": ""
                },
                timeout=60.0
            )
            print("Status code:", res.status_code)
            print("Response:", res.text)
    except Exception as e:
        print("Error:", e)

asyncio.run(test_analyze())
