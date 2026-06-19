import asyncio
from main import analyze_track, TrackRequest

async def main():
    track_data = TrackRequest(
        id="e_z-hBwWcIQ",
        title="Chole Gecho Tate Ki",
        artist="Keshab Dey",
        genre="Pop",
        art="https://via.placeholder.com/150",
        preview_url="https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview116/v4/df/75/f6/df75f6bc-e27c-dd2d-a2f2-1b1544bbd908/mzaf_3332560372338162817.plus.aac.p.m4a"
    )
    
    print("Starting internal profile...")
    try:
        await analyze_track(track_data)
    except Exception as e:
        print("Error:", e)

asyncio.run(main())
