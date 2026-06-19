import asyncio
import httpx

async def test_sponsorblock():
    video_id = "L_XJ_s5IsQc" # Example music video
    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                "https://sponsor.ajay.app/api/skipSegments",
                params={
                    "videoID": video_id,
                    "categories": '["sponsor","intro","outro","interaction","selfpromo","music_offtopic"]'
                }
            )
            print("Status:", res.status_code)
            if res.status_code == 200:
                print("Data:", res.json())
    except Exception as e:
        print("Error:", e)

asyncio.run(test_sponsorblock())
