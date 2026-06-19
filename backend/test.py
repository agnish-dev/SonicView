import httpx
import asyncio

async def main():
    res = await httpx.AsyncClient().get('https://lrclib.net/api/search?track_name=Saat+Samundar+Paar&artist_name=Sadhana+Sargam')
    if res.status_code == 200:
        data = res.json()
        print(len(data), 'synced:', any(r.get('syncedLyrics') for r in data))
        
asyncio.run(main())
