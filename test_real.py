import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(timeout=120.0) as client:
        # Search for the song
        res = await client.get('http://127.0.0.1:8000/api/search?q=Love+You+Soniyo+Zubeen+Garg')
        tracks = res.json()
        if not tracks:
            print("No tracks found")
            return
            
        track = tracks[0]
        print("Analyzing track:", track['title'], track['id'])
        
        # Analyze the track
        res2 = await client.post('http://127.0.0.1:8000/api/analyze', json={
            "id": track['id'],
            "title": track['title'],
            "artist": track['artist'],
            "genre": "",
            "duration": track.get('duration', '0:00'),
            "art": track.get('art', ''),
            "preview_url": ""
        })
        print("Status Code:", res2.status_code)
        print("Response:", res2.text)

asyncio.run(main())
