import httpx
import asyncio

async def main():
    async with httpx.AsyncClient(headers={"User-Agent": "MusicDNA/1.0"}) as client:
        res = await client.get('https://lrclib.net/api/search?track_name=Bekhayali&artist_name=Sachet+Tandon')
        if res.status_code == 200:
            data = res.json()
            for d in data[:3]:
                print(d['id'], d['trackName'], d['duration'])
                if d.get('syncedLyrics'):
                    lines = d['syncedLyrics'].split('\n')
                    print(f"First 10 lines of lyrics for duration {d['duration']}:")
                    for l in lines[:10]:
                        print("  ", l)
                print("------")
        else:
            print("Error", res.status_code)

asyncio.run(main())
