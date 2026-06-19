import os
import glob
import asyncio
import httpx
import syncedlyrics
from typing import Optional, List
import sys

# Add current directory to PATH so ffmpeg static binary can be found on Render
os.environ["PATH"] += os.pathsep + os.getcwd()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ytmusicapi import YTMusic
import yt_dlp
from groq import AsyncGroq
from dotenv import load_dotenv
import imageio_ffmpeg
from Crypto.Cipher import DES
import base64
import urllib.parse
import json

load_dotenv()

# Ensure yt-dlp can find ffmpeg for download_ranges
ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
ffmpeg_dir = os.path.dirname(ffmpeg_path)
os.environ["PATH"] += os.pathsep + ffmpeg_dir

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ytmusic = YTMusic()
groq_client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

class TrackRequest(BaseModel):
    id: str
    title: str
    artist: str
    genre: str
    duration: str = "0:00"
    art: str
    preview_url: str
    context_language: Optional[str] = None

def format_track(item):
    # Handle duration which can come in different formats
    duration_str = "0:00"
    if "duration" in item and isinstance(item["duration"], str):
        duration_str = item["duration"]
    elif "duration_seconds" in item:
        s = item["duration_seconds"]
        duration_str = f"{s // 60}:{s % 60:02d}"
    elif "duration" in item and isinstance(item["duration"], dict) and "seconds" in item["duration"]:
        s = item["duration"]["seconds"]
        duration_str = f"{s // 60}:{s % 60:02d}"

    # Extract art
    thumbnails = item.get("thumbnails") or item.get("thumbnail", [])
    art = thumbnails[-1]["url"] if thumbnails else "https://via.placeholder.com/150"
    
    # Extract artist
    artists = item.get("artists", [])
    artist = artists[0]["name"] if artists else "Unknown Artist"
    
    return {
        "id": item.get("videoId"),
        "title": item.get("title", "Unknown Title"),
        "artist": artist,
        "duration": duration_str,
        "art": art,
        "genre": "",
        "preview_url": ""
    }

def decrypt_jiosaavn_url(url: str) -> str:
    try:
        des_cipher = DES.new(b'38346591', DES.MODE_ECB)
        enc_url = base64.b64decode(url.strip())
        dec_url = des_cipher.decrypt(enc_url)
        dec_url = dec_url.decode('utf-8').rstrip('\0')
        return dec_url.replace('_96_p.mp4', '_320_p.mp4').replace('_96_p.m4a', '_320_p.m4a').replace('_96.mp4', '_320.mp4').replace('_96.m4a', '_320.m4a')
    except Exception as e:
        print(f"JioSaavn decryption error: {e}")
        return ""

async def search_jiosaavn(title: str, artist: str) -> str:
    try:
        query = urllib.parse.quote(f"{title} {artist}")
        search_url = f"https://www.jiosaavn.com/api.php?__call=autocomplete.get&_format=json&_marker=0&ctx=android&query={query}"
        async with httpx.AsyncClient() as client:
            res = await client.get(search_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
            if res.status_code == 200:
                data = res.json()
                songs = data.get('songs', {'data': []})['data']
                if songs:
                    song_id = songs[0]['id']
                    details_url = f"https://www.jiosaavn.com/api.php?__call=song.getDetails&pids={song_id}&_format=json&_marker=0&ctx=android"
                    details_res = await client.get(details_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
                    if details_res.status_code == 200:
                        song_data = details_res.json()
                        song_info = song_data.get(song_id, {})
                        enc_url = song_info.get("encrypted_media_url")
                        if enc_url:
                            return decrypt_jiosaavn_url(enc_url)
    except Exception as e:
        print(f"JioSaavn search error: {e}")
    return ""

@app.get("/api/search")
async def search(q: str):
    try:
        results = ytmusic.search(q, filter="songs")
        return [format_track(item) for item in results if item.get("videoId")]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/regional-top")
async def regional_top(language: str):
    try:
        from datetime import datetime
        current_year = datetime.now().year

        # Search for an official or curated trending playlist for the language
        if language.lower() == "global":
            query = f"Global Top 100 songs"
        elif language.lower() == "90s":
            query = "90s Bollywood hit songs"
        else:
            query = f"Top 100 {language} songs"
        
        results = ytmusic.search(query, filter="songs", limit=50)
        valid_results = [item for item in results if item.get("videoId")]
        import random
        random.shuffle(valid_results)
        return [format_track(item) for item in valid_results][:20]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stream")
async def get_stream(video_id: str, title: Optional[str] = None, artist: Optional[str] = None):
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'extractor_args': {'youtube': {'client': ['tv_embedded', 'web_creator', 'android', 'ios']}},
            'js_runtimes': {'node': {}}
        }
        if os.path.exists('cookies.txt'):
            ydl_opts['cookiefile'] = 'cookies.txt'
        
        # 1. Fetch skip segments from SponsorBlock
        skip_segments = []
        try:
            async with httpx.AsyncClient() as client:
                res = await client.get(
                    "https://sponsor.ajay.app/api/skipSegments",
                    params={
                        "videoID": video_id,
                        "categories": '["sponsor","intro","outro","interaction","selfpromo","music_offtopic"]'
                    },
                    timeout=2.0
                )
                if res.status_code == 200:
                    data = res.json()
                    skip_segments = [item["segment"] for item in data if "segment" in item]
        except Exception:
            pass # Fail silently if SponsorBlock is down

        # 2. Extract stream URL
        stream_url = ""
        if title and artist:
            stream_url = await search_jiosaavn(title, artist)
            
        if not stream_url:
            # Fallback to yt-dlp just in case JioSaavn fails or we don't have title/artist
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                url = info.get('url')
                if not url and 'requested_formats' in info:
                    url = info['requested_formats'][0]['url']
                elif not url and 'formats' in info:
                    url = info['formats'][-1]['url']
                stream_url = url
                
        return {"stream_url": stream_url, "skip_segments": skip_segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import re

def parse_lrc(lrc_text):
    lines = lrc_text.strip().split('\n')
    parsed = []
    pattern = re.compile(r'\[(\d+):(\d+\.?\d*)\](.*)')
    for line in lines:
        match = pattern.search(line)
        if match:
            mins, secs, text = match.groups()
            start_ms = int(mins) * 60000 + int(float(secs) * 1000)
            parsed.append({"startTime": str(start_ms), "line": text.strip()})
    return parsed

@app.get("/api/lyrics")
async def get_lyrics(video_id: str, title: str, artist: str, duration: Optional[str] = None):
    try:
        # Clean title by removing anything in parentheses or brackets (e.g. "(From Movie)", "[Official Video]")
        import re
        clean_title = re.sub(r'\(.*?\)|\[.*?\]', '', title).strip()

        # 1. Primary Source: Exact match via Lrclib using duration (prevents fetching incorrect versions)
        lrc_text = None
        if duration:
            try:
                import requests
                # Convert duration from HH:MM:SS or MM:SS to total seconds
                parts = str(duration).split(':')
                if len(parts) == 3:
                    total_seconds = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                elif len(parts) == 2:
                    total_seconds = int(parts[0]) * 60 + int(parts[1])
                else:
                    total_seconds = int(duration)
                
                # Fetch search results from Lrclib
                lrclib_url = "https://lrclib.net/api/search"
                lrclib_res = requests.get(lrclib_url, params={"q": f"{clean_title} {artist}"}, timeout=15)
                if lrclib_res.status_code == 200:
                    results = lrclib_res.json()
                    # Find the first result that is within 3 seconds of our target duration
                    for res in results:
                        if res.get("duration") and abs(res["duration"] - total_seconds) <= 3:
                            if res.get("syncedLyrics"):
                                lrc_text = res["syncedLyrics"]
                                break
            except Exception as e:
                print(f"Lrclib exact match error: {e}")

        # 2. Secondary Source: syncedlyrics (searches Musixmatch, Megalobiz, etc. for synced timestamps)
        if not lrc_text:
            try:
                # Enforce strict sequential priority
                for provider in ["Lrclib", "Musixmatch", "Megalobiz"]:
                    lrc_text = await asyncio.to_thread(
                        syncedlyrics.search, 
                        f"{clean_title} {artist}", 
                        providers=[provider]
                    )
                    if lrc_text:
                        break
            except Exception as e:
                print(f"syncedlyrics fetch error: {e}")
                pass

        if lrc_text:
            parsed_lyrics = parse_lrc(lrc_text)
            return {"hasTimestamps": True, "lyrics": parsed_lyrics}

        # 2. Fallback Source: YouTube Music (plain text, very reliable)
        try:
            watch_playlist = ytmusic.get_watch_playlist(videoId=video_id)
            if "lyrics" in watch_playlist and watch_playlist["lyrics"]:
                lyrics_id = watch_playlist["lyrics"]
                lyrics_data = ytmusic.get_lyrics(lyrics_id)
                if lyrics_data and "lyrics" in lyrics_data:
                    return {"hasTimestamps": False, "lyrics": lyrics_data["lyrics"]}
        except Exception as e:
            print(f"YTMusic lyrics error: {e}")
            pass
            
        return {"hasTimestamps": False, "lyrics": "Lyrics not available for this track."}
    except Exception as e:
        print(f"Lyrics fetch error: {e}")
        return {"hasTimestamps": False, "lyrics": "Lyrics not available for this track."}

@app.get("/api/recommend")
async def get_recommendations(seed: str, genre: str = None, video_id: str = None):
    try:
        # Local / Genre Recommendations
        if genre:
            results = ytmusic.search(f"{genre} hit songs", filter="songs", limit=15)
            return [format_track(item) for item in results if item.get("videoId")]

        # Global Recommendations (True Global Hits)
        try:
            from datetime import datetime
            current_year = datetime.now().year
            results = ytmusic.search(f"Top 100 Global hit songs {current_year}", filter="songs", limit=50)
            valid_results = [item for item in results if item.get("videoId") and item.get("videoId") != seed]
            import random
            random.shuffle(valid_results)
            tracks = valid_results[:20]
        except Exception:
            # Fallback
            tracks = ytmusic.search("top popular songs", filter="songs", limit=15)
            
        return [format_track(item) for item in tracks if item.get("videoId")]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def analyze_track(track: TrackRequest):
    temp_file = f"temp_{track.id}.m4a"
    try:
        # 1. Download audio
        stream_url = await search_jiosaavn(track.title, track.artist)
        
        if stream_url:
            # Download using httpx
            async with httpx.AsyncClient() as client:
                response = await client.get(stream_url, timeout=30.0)
                if response.status_code == 200:
                    with open(temp_file, "wb") as f:
                        f.write(response.content)
                else:
                    stream_url = "" # Trigger fallback
        
        if not stream_url:
            # Fallback to yt-dlp
            import imageio_ffmpeg
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()

            ydl_opts = {
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'outtmpl': temp_file,
                'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'm4a'}],
                'quiet': True,
                'no_warnings': True,
                'ffmpeg_location': ffmpeg_path,
                'extractor_args': {'youtube': {'client': ['tv_embedded', 'web_creator', 'android', 'ios']}},
                'js_runtimes': {'node': {}}
            }
            if os.path.exists('cookies.txt'):
                ydl_opts['cookiefile'] = 'cookies.txt'
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={track.id}"])
            
        # Check if the file exists (yt-dlp might append .m4a based on postprocessor)
        actual_file = temp_file
        if not os.path.exists(temp_file):
            matches = glob.glob(f"temp_{track.id}*")
            if matches:
                actual_file = matches[0]
            else:
                raise Exception("Downloaded audio file not found")

        # 2. Transcribe with Whisper
        with open(actual_file, "rb") as file:
            transcription = await groq_client.audio.transcriptions.create(
                file=(actual_file, file.read()),
                model="whisper-large-v3",
                response_format="verbose_json"
            )
            
        detected_language = getattr(transcription, "language", "unknown")
        
        # 2.5 Fetch exact release date from iTunes API
        itunes_date_hint = "Unknown"
        try:
            async with httpx.AsyncClient() as client:
                itunes_resp = await client.get(
                    "https://itunes.apple.com/search",
                    params={"term": f"{track.title} {track.artist}", "entity": "song", "limit": 1},
                    timeout=5.0
                )
                if itunes_resp.status_code == 200:
                    results = itunes_resp.json().get("results", [])
                    if results and "releaseDate" in results[0]:
                        itunes_date_hint = results[0]["releaseDate"].split("T")[0] # e.g. 2005-12-10
        except Exception:
            pass

        # 3. Analyze with Llama
        completion = await groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system", 
                    "content": "You are an expert music metadata extractor. You are provided with the full audio transcript of a song. First, try to recall factual information about this specific track from your broad knowledge base (the internet). If you recognize it, base your answers on known facts. If you don't recognize it, rely entirely on the provided transcript and hints to make your best prediction. Your task is to:\n1. Identify the primary language of the song based STRICTLY on the majority voice (whichever language occupies the majority of the track's lyrics by duration or volume). Do NOT pick a language just because of a featured artist if it's not the majority.\n2. Extract or infer the Artist Name ('ai_artist') and Album Name ('ai_album').\n3. Infer the mood, release_time (provide the EXACT release year or exact date if known, e.g., '2004' or '2004-05-12'), era, and a short 2-sentence description of the song's vibe.\n4. Predict audio stats (floats 0.0 to 1.0) for energy, valence, danceability, instrumentalness, and an integer for tempo (BPM).\n\nReturn ONLY a valid JSON object with keys: 'language', 'ai_artist', 'ai_album', 'mood', 'release_time', 'era', 'description', 'stats' (object with energy, valence, danceability, instrumentalness, tempo). Do not include markdown formatting."
                },
                {
                    "role": "user", 
                    "content": f"Title Hint: {track.title}\nArtist Hint: {track.artist}\nExact Release Date (from iTunes): {itunes_date_hint}\nAudio Language Detected by Ear: {detected_language}\nFull Transcript:\n{transcription.text}"
                }
            ],
            response_format={"type": "json_object"}
        )
        
        import json
        analysis_result = json.loads(completion.choices[0].message.content.strip())
        
        # 4. Clean up
        if os.path.exists(actual_file):
            os.remove(actual_file)
            
        return {
            "language": analysis_result.get("language", detected_language),
            "detected_language": detected_language,
            "ai_artist": analysis_result.get("ai_artist", track.artist),
            "ai_album": analysis_result.get("ai_album", "Unknown Album"),
            "mood": analysis_result.get("mood", "Energetic"),
            "release_time": analysis_result.get("release_time", "Unknown"),
            "era": analysis_result.get("era", "Modern Era"),
            "description": analysis_result.get("description", f"A great song by {track.artist}."),
            "stats": analysis_result.get("stats", {
                "energy": 0.7,
                "valence": 0.5,
                "danceability": 0.6,
                "instrumentalness": 0.0,
                "tempo": 120
            }),
            "recommendation_seed": track.id
        }

    except Exception as e:
        if os.path.exists(temp_file):
            os.remove(temp_file)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)