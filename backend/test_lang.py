import asyncio
from main import analyze_track
from pydantic import BaseModel

class Track(BaseModel):
    id: str
    title: str
    artist: str

async def test():
    # Testing Shape of You
    track = Track(id='JGwWNGJdvx8', title='Shape of You', artist='Ed Sheeran')
    res = await analyze_track(track)
    print("AI Analysis Output:", res)

asyncio.run(test())
