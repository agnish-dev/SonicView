import os
import glob
import asyncio
import httpx
import syncedlyrics
from typing import Optional, List
import sys

# Add current directory to PATH so ffmpeg static binary can be found on Render
os.environ["PATH"] += os.pathsep + os.getcwd()

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
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
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Securely load YouTube cookies from base64 environment variable (for Render deployment)
youtube_cookies_b64 = os.getenv("YOUTUBE_COOKIES_BASE64")
if youtube_cookies_b64:
    try:
        with open("cookies.txt", "w", encoding="utf-8") as f:
            f.write(base64.b64decode(youtube_cookies_b64).decode("utf-8"))
        print("Successfully loaded YouTube cookies from environment variables.")
    except Exception as e:
        print(f"Failed to load YouTube cookies: {e}")

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

# Patch ytmusicapi watch parser to prevent KeyError on missing tabs
import ytmusicapi.mixins.watch as mw
def safe_get_tab_browse_id(watchNextRenderer, tab_id):
    try:
        tab = watchNextRenderer['tabs'][tab_id]['tabRenderer']
        if 'unselectable' not in tab:
            return tab.get('endpoint', {}).get('browseEndpoint', {}).get('browseId')
    except Exception:
        pass
    return None
mw.get_tab_browse_id = safe_get_tab_browse_id

def clean_music_text(text: str) -> str:
    if not text:
        return ""
    import re
    # Remove (From "Movie"), [Official Video], remixes, feat., etc.
    text = re.sub(r'\(.*?\)|\[.*?\]', '', text)
    text = re.sub(r' - Single| - EP| - Deluxe.*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(feat\.|ft\.|featuring)\b.*', '', text, flags=re.IGNORECASE)
    return text.strip()

async def resolve_ytmusic_track(query: str):
    try:
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(None, lambda: ytmusic.search(query, filter='songs', limit=1))
        if res and res[0].get("videoId"):
            return format_track(res[0])
    except Exception:
        pass
    return None

# Obfuscated catalog resolver for semantic graph mapping
_CATALOG_GRAPH_EP = base64.b64decode("aHR0cHM6Ly9pdHVuZXMuYXBwbGUuY29tL3NlYXJjaA==").decode()

async def fetch_acoustic_graph_candidates(title: str, artist: str, limit: int = 25):
    clean_t = clean_music_text(title)
    clean_a = clean_music_text(artist)
    if not clean_t:
        return []
        
    search_term = f"{clean_t} {clean_a}".strip()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    candidates = []
    seen = set()
    
    try:
        async with httpx.AsyncClient(headers=headers, timeout=6.0) as client:
            # 1. Resolve seed node in primary collaborative music graph
            catalog_res = await client.get(
                _CATALOG_GRAPH_EP,
                params={"term": search_term, "entity": "song", "limit": 1}
            )
            if catalog_res.status_code != 200:
                return []
                
            results = catalog_res.json().get("results", [])
            if not results:
                return []
                
            node_url = results[0].get("collectionViewUrl")
            cluster_url = results[0].get("artistViewUrl")
            
            # 2. Traverse collaborative neighbor cluster
            if node_url:
                try:
                    resp = await client.get(node_url, follow_redirects=True)
                    if resp.status_code == 200:
                        scripts = re.findall(r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>', resp.text, re.DOTALL)
                        if scripts:
                            page_json = json.loads(scripts[0])
                            sections = page_json.get("data", [{}])[0].get("data", {}).get("sections", [])
                            ymal = [s for s in sections if "you-might-also-like" in s.get("id", "")]
                            if ymal:
                                for it in ymal[0].get("items", []):
                                    t_links = it.get("titleLinks") or []
                                    sub_links = it.get("subtitleLinks") or []
                                    t = clean_music_text(t_links[0].get("title", "")) if t_links else ""
                                    a = sub_links[0].get("title", "") if sub_links else ""
                                    key = f"{t.lower()}:{a.lower()}"
                                    if t and key not in seen:
                                        seen.add(key)
                                        candidates.append((t, a))
                except Exception as e:
                    print(f"Collaborative node traverse error: {e}")
                    
            # 3. If neighbor count < 12, expand via related artist cluster
            if len(candidates) < 12 and cluster_url:
                try:
                    resp = await client.get(cluster_url, follow_redirects=True)
                    if resp.status_code == 200:
                        scripts = re.findall(r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>', resp.text, re.DOTALL)
                        if scripts:
                            page_json = json.loads(scripts[0])
                            sections = page_json.get("data", [{}])[0].get("data", {}).get("sections", [])
                            sim_sec = [s for s in sections if "SimilarArtists" in s.get("id", "")]
                            if sim_sec:
                                for it in sim_sec[0].get("items", []):
                                    sim_a = it.get("title", "")
                                    key = f":{sim_a.lower()}"
                                    if sim_a and key not in seen:
                                        seen.add(key)
                                        candidates.append(("", sim_a))
                except Exception as e:
                    print(f"Cluster expansion error: {e}")
                    
    except Exception as e:
        print(f"Graph candidate retrieval error: {e}")
        
    return candidates[:limit]

async def get_ytmusic_radio_tracks(seed_id: str, limit: int = 25):
    try:
        loop = asyncio.get_event_loop()
        res = await loop.run_in_executor(None, lambda: ytmusic.get_watch_playlist(videoId=seed_id, limit=limit + 5))
        tracks = []
        for item in res.get("tracks", []):
            vid = item.get("videoId")
            if vid and vid != seed_id:
                tracks.append(format_track(item))
                if len(tracks) >= limit:
                    break
        return tracks
    except Exception as e:
        print(f"YTMusic Radio error: {e}")
        return []

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

import base64
from Crypto.Cipher import DES

def decrypt_jiosaavn_url(url: str, quality: str = "high") -> str:
    try:
        des_cipher = DES.new(b'38346591', DES.MODE_ECB)
        enc_url = base64.b64decode(url.strip())
        dec_url = des_cipher.decrypt(enc_url)
        import re
        dec_url = dec_url.decode('utf-8')
        dec_url = re.sub(r'[^\x20-\x7E]', '', dec_url).strip()
        if quality == "high":
            return dec_url.replace('_96_p.mp4', '_320_p.mp4').replace('_96_p.m4a', '_320_p.m4a').replace('_96.mp4', '_320.mp4').replace('_96.m4a', '_320.m4a').strip()
        elif quality == "good":
            return dec_url.replace('_96_p.mp4', '_160_p.mp4').replace('_96_p.m4a', '_160_p.m4a').replace('_96.mp4', '_160.mp4').replace('_96.m4a', '_160.m4a').strip()
        return dec_url.strip()
    except Exception as e:
        print(f"JioSaavn decryption error: {e}")
        return ""



async def get_piped_stream(video_id: str) -> str:
    instances = [
        "https://pipedapi.in.projectsegfau.lt",
        "https://pipedapi.kavin.rocks",
        "https://piped-api.lunar.icu",
        "https://api.piped.privacydev.net"
    ]
    
    async with httpx.AsyncClient() as client:
        for instance in instances:
            try:
                url = f"{instance}/streams/{video_id}"
                # Piped APIs sometimes require a User-Agent to bypass Cloudflare
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
                res = await client.get(url, headers=headers, timeout=5.0)
                if res.status_code == 200:
                    data = res.json()
                    audio_streams = data.get("audioStreams", [])
                    if audio_streams:
                        m4a_stream = next((s for s in audio_streams if s.get("mimeType", "").startswith("audio/mp4")), None)
                        if m4a_stream:
                            return m4a_stream.get("url", "")
                        return audio_streams[0].get("url", "")
            except Exception as e:
                print(f"Piped API error on {instance}: {e}")
                continue
                
    return ""

import math

JUNK_KEYWORDS = [
    "slowed", "reverb", "8d audio", "bass boosted", "karaoke", 
    "instrumental", "reaction", "remake", "parody", "ringtone", 
    "nightcore", "sped up", "status"
]

def parse_views(v) -> int:
    """Converts '2.8B', '968M', '450K views' to an integer."""
    if not v:
        return 0
    clean = str(v).lower().replace("views", "").replace(",", "").strip()
    try:
        if "b" in clean:
            return int(float(clean.replace("b", "")) * 1_000_000_000)
        if "m" in clean:
            return int(float(clean.replace("m", "")) * 1_000_000)
        if "k" in clean:
            return int(float(clean.replace("k", "")) * 1_000)
        return int(clean)
    except Exception:
        return 0

def rank_track(item: dict, query: str) -> float:
    """Ranks tracks live based on popularity, official release status, and relevance."""
    score = 0.0
    title = (item.get("title") or "").lower()
    q_lower = query.lower().strip()

    # 1. YouTube Music's curated Top Result gets highest priority
    if item.get("category") == "Top result":
        score += 85.0

    # 2. Official release status bonus
    vtype = item.get("videoType", "")
    if vtype in ["MUSIC_VIDEO_TYPE_OMV", "MUSIC_VIDEO_TYPE_ATV"]:
        score += 45.0
    elif vtype == "MUSIC_VIDEO_TYPE_UGC":
        score -= 25.0

    if item.get("resultType") == "song":
        score += 30.0
    if item.get("album"):
        score += 15.0

    # 3. Penalize junk/fan edits unless explicitly searched for
    for junk in JUNK_KEYWORDS:
        if junk in title and junk not in q_lower:
            score -= 100.0

    # 4. Title match accuracy
    if title == q_lower:
        score += 50.0
    elif q_lower in title:
        score += 25.0

    # 5. Popularity bonus (logarithmic view count scaling)
    views = parse_views(item.get("views"))
    if views > 0:
        score += min(math.log10(views) * 5.0, 50.0)

    # 6. Recency bonus if year is available
    year_val = item.get("year")
    if year_val:
        try:
            import re
            m = re.search(r'\d{4}', str(year_val))
            if m:
                year_int = int(m.group())
                import datetime
                diff = datetime.datetime.now().year - year_int
                if diff <= 0:
                    score += 25.0
                elif diff == 1:
                    score += 18.0
                elif diff <= 3:
                    score += 10.0
        except Exception:
            pass

    return score

@app.get("/api/search")
async def search(q: str):
    try:
        loop = asyncio.get_event_loop()
        # Fetch both top general results and song catalog concurrently for speed and breadth
        gen_task = loop.run_in_executor(None, lambda: ytmusic.search(q))
        songs_task = loop.run_in_executor(None, lambda: ytmusic.search(q, filter="songs"))
        
        gen_res, songs_res = await asyncio.gather(gen_task, songs_task, return_exceptions=True)
        
        raw_items = []
        if isinstance(gen_res, list):
            raw_items.extend(gen_res)
        if isinstance(songs_res, list):
            raw_items.extend(songs_res)

        seen = set()
        unique_results = []
        for item in raw_items:
            vid = item.get("videoId")
            if vid and vid not in seen:
                seen.add(vid)
                unique_results.append(item)

        # Sort on-the-fly: famous, recent & official tracks bubble up to the top
        unique_results.sort(key=lambda x: rank_track(x, q), reverse=True)

        return [format_track(item) for item in unique_results]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/regional-top")
async def regional_top(language: str):
    try:
        # Map languages to official JioSaavn Trending/Top 50 Playlist IDs
        chart_ids = {
            'hindi': '49', # Hindi Top 50
            'tamil': '1134651042', # Tamil Top 50
            'telugu': '2574962', # Telugu Top 50
            'punjabi': '1134543511', # Punjabi Top 50
            'malayalam': '3344648', # Malayalam Top 50
            'kannada': '2676953', # Kannada Top 50
            'bhojpuri': '1134768973', # Bhojpuri Top 50
            'global': '1134595537', # English Top 50
            '90s': '1167751266', # Hindi 1990s
        }
        
        lang_key = language.lower()
        playlist_id = chart_ids.get(lang_key, chart_ids['hindi']) # fallback to Hindi Top 50

        url = f"https://www.jiosaavn.com/api.php?__call=playlist.getDetails&listid={playlist_id}&_format=json&_marker=0&ctx=android"
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
            if res.status_code == 200:
                data = res.json()
                # Parse JioSaavn playlist format (keys are '0', '1', '2'...)
                songs = [data[str(i)] for i in range(50) if str(i) in data]
                
                formatted_results = []
                for song in songs:
                    try:
                        s = int(song.get('duration', 0))
                        dur = f"{s//60}:{s%60:02d}"
                    except:
                        dur = "0:00"
                        
                    art = song.get('image', '').replace('150x150', '500x500')
                    artist = song.get('singers') or song.get('primary_artists') or "Unknown Artist"
                    title = song.get('song', 'Unknown Title')
                    
                    formatted_results.append({
                        "id": "jiosaavn:" + song.get('id', ''),
                        "title": title,
                        "artist": artist,
                        "duration": dur,
                        "art": art,
                        "genre": language,
                        "preview_url": ""
                    })
                
                import random
                random.shuffle(formatted_results)
                return formatted_results[:20]
        
        return []
    except Exception as e:
        print(f"Regional Top Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/proxy_stream")
async def proxy_stream(request: Request, url: str):
    headers = {"User-Agent": "Mozilla/5.0"}
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    client = httpx.AsyncClient()
    req = client.build_request("GET", url, headers=headers)
    r = await client.send(req, stream=True, follow_redirects=True)

    resp_headers = {}
    for k, v in r.headers.items():
        if k.lower() in ["content-type", "content-length", "content-range", "accept-ranges"]:
            resp_headers[k] = v

    async def stream_generator():
        try:
            async for chunk in r.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        status_code=r.status_code,
        headers=resp_headers
    )

@app.get("/api/stream")
async def get_stream(video_id: str, title: Optional[str] = None, artist: Optional[str] = None, quality: str = "high"):
    try:
        if video_id.startswith("jiosaavn:"):
            real_id = video_id.split(":", 1)[1]
            url = f"https://www.jiosaavn.com/api.php?__call=song.getDetails&pids={real_id}&_format=json&_marker=0&ctx=android"
            async with httpx.AsyncClient() as client:
                res = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
                if res.status_code == 200:
                    data = res.json()
                    song_info = data.get(real_id, {})
                    enc_url = song_info.get("encrypted_media_url")
                    if enc_url:
                        return {"stream_url": decrypt_jiosaavn_url(enc_url, quality=quality), "skip_segments": []}
            raise Exception("Failed to extract JioSaavn stream URL.")

        yt_format = 'bestaudio/best'
        if quality == "standard":
            yt_format = 'bestaudio[abr<=64]/bestaudio/best'
        elif quality == "good":
            yt_format = 'bestaudio[abr<=128]/bestaudio/best'

        ydl_opts = {
            'format': yt_format,
            'quiet': True,
            'no_warnings': True,
            'extractor_args': {'youtube': {'player_client': ['android']}},
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
        video_url = ""
        try:
            # Primary: yt-dlp with client spoofing
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
                url = info.get('url')
                if not url and 'requested_formats' in info:
                    url = info['requested_formats'][0]['url']
                elif not url and 'formats' in info:
                    url = info['formats'][-1]['url']
                stream_url = url
                
                # Extract background video URL
                if 'formats' in info:
                    # Look for low res MP4 video streams
                    v_formats = [f for f in info['formats'] if f.get('vcodec') != 'none' and f.get('height', 0) and f.get('height', 0) <= 480 and f.get('ext') == 'mp4']
                    if v_formats:
                        v_formats.sort(key=lambda x: x.get('height', 0), reverse=True)
                        video_url = v_formats[0].get('url')
                    else:
                        v_formats_any = [f for f in info['formats'] if f.get('vcodec') != 'none' and f.get('height', 0) and f.get('height', 0) <= 480]
                        if v_formats_any:
                            v_formats_any.sort(key=lambda x: x.get('height', 0), reverse=True)
                            video_url = v_formats_any[0].get('url')
                        else:
                            any_v = [f for f in info['formats'] if f.get('vcodec') != 'none']
                            if any_v:
                                video_url = any_v[0].get('url')
                            
        except Exception as e:
            print(f"yt-dlp failed: {e}")
            
        if not stream_url:
            print("Falling back to Piped API")
            stream_url = await get_piped_stream(video_id)
            

        if not stream_url:
            raise Exception("Failed to extract stream URL from all sources.")
            
        # Direct URL instead of proxy to prevent massive buffering and Blob downloads
        return {"stream_url": stream_url, "video_url": video_url, "skip_segments": skip_segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/canvas")
async def get_canvas(title: str, artist: str = ""):
    try:
        import re
        clean_title = re.sub(r'\(.*?\)|\[.*?\]', '', title).strip()
        query = f"ytsearch1:{clean_title} {artist} official video".strip()
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True
        }
        if os.path.exists('cookies.txt'):
            ydl_opts['cookiefile'] = 'cookies.txt'

        loop = asyncio.get_event_loop()
        def extract():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                res = ydl.extract_info(query, download=False)
                if 'entries' in res and res['entries']:
                    return res['entries'][0].get('id')
                return res.get('id')

        video_id = await loop.run_in_executor(None, extract)
        return {"video_id": video_id or ""}
    except Exception as e:
        print(f"Canvas extraction error: {e}")
        return {"video_id": ""}

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

AESTHETIC_TAGS = [
    "Pop", "Rock", "Alternative Rock", "Indie Rock", "Hard Rock", "Punk Rock", "Pop Punk", "Metal", "Heavy Metal", "Death Metal", "Black Metal", "Doom Metal", "Thrash Metal", "Progressive Metal", "Folk", "Folk Rock", "Country", "Bluegrass", "Blues", "Jazz", "Smooth Jazz", "Bebop", "Swing", "Classical", "Opera", "Symphony", "Orchestra", "Chamber Music", "Electronic", "EDM", "House", "Deep House", "Tech House", "Progressive House", "Future House", "Electro House", "Trance", "Psytrance", "Techno", "Minimal Techno", "Drum & Bass", "Dubstep", "Future Bass", "Trap", "Hip-Hop", "Rap", "Boom Bap", "Drill", "Lo-fi Hip-Hop", "R&B", "Soul", "Funk", "Disco", "Reggae", "Dancehall", "Ska", "Gospel", "Latin", "Salsa", "Bachata", "Merengue", "Reggaeton", "Flamenco", "Afrobeat", "Afro House", "K-Pop", "J-Pop", "C-Pop", "Bollywood", "Tollywood", "Punjabi", "Ghazal", "Qawwali", "Carnatic", "Hindustani Classical", "Bhangra", "Devotional", "Sufi", "Ambient", "Chillout", "New Age", "Instrumental", "Acoustic", "Cinematic", "Soundtrack", "Musical Theatre", "Children's Music", "Phonk", "Drift Phonk", "Brazilian Phonk", "Funk Phonk", "Hyperpop", "Nightcore", "Vaporwave", "Synthwave", "Retrowave", "Chillwave", "Dreamwave", "Future Funk", "Glitch Hop", "Breakcore", "Jersey Club", "UK Garage", "Lo-fi", "Bedroom Pop", "Indie Pop", "Cloud Rap", "Emo Rap", "Rage", "PluggnB", "Sigilkore", "HexD", "Witch House", "Dark Trap", "Happy", "Sad", "Emotional", "Romantic", "Heartbreak", "Melancholic", "Nostalgic", "Peaceful", "Calm", "Relaxing", "Energetic", "Excited", "Angry", "Aggressive", "Dark", "Mysterious", "Hopeful", "Dreamy", "Euphoric", "Confident", "Motivational", "Inspirational", "Lonely", "Depressed", "Bittersweet", "Emotional Healing", "Powerful", "Spiritual", "Fearful", "Tense", "Dramatic", "Reflective", "Cozy", "Warm", "Playful", "Very Low Energy", "Low Energy", "Medium Energy", "High Energy", "Extreme Energy", "Workout", "Gym", "Running", "Cycling", "Driving", "Road Trip", "Gaming", "Coding", "Studying", "Reading", "Meditation", "Sleeping", "Focus", "Party", "Club", "Wedding", "Festival", "Cleaning", "Cooking", "Traveling", "Hiking", "Yoga", "Office Work", "Love", "Crush", "First Love", "Friendship", "Missing Someone", "Breakup", "Healing", "Self Love", "Revenge", "Motivation", "Victory", "Failure", "Hope", "Regret", "Gratitude", "Confidence", "Anxiety", "Loneliness", "Freedom", "Adventure", "Indian", "Western", "Korean", "Japanese", "Chinese", "Arabic", "African", "Latin American", "French", "Spanish", "German", "Russian", "Turkish", "Pakistani", "Bangladeshi", "Nepali", "Tamil", "Telugu", "Kannada", "Malayalam", "Bengali", "Marathi", "Gujarati", "Punjabi", "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s", "Latest Releases", "Old Classics", "Vintage", "Retro", "Male Vocal", "Female Vocal", "Duet", "Choir", "Instrumental", "A Cappella", "Rap", "Spoken Word", "Piano", "Guitar", "Violin", "Flute", "Saxophone", "Drums", "Cello", "Harp", "Bass", "Trumpet", "Electronic Synth", "Orchestra", "Movie Soundtrack", "TV Series", "Anime", "Game OST", "Background Score", "Trailer Music", "Documentary Music", "Rainy", "Winter", "Summer", "Autumn", "Spring", "Night", "Sunrise", "Sunset", "Space", "Ocean", "Forest", "City Lights", "Coffee Shop", "Campfire", "Beach", "Mountains", "Waltz", "Tango", "Salsa", "Bachata", "Zumba", "EDM Dance", "Shuffle", "Breakdance", "Hip-Hop Dance", "Contemporary", "Trending", "Viral", "Hidden Gems", "Underrated", "Chart Toppers", "Evergreen", "Classics", "New Releases", "Minimalist", "Experimental", "Avant-Garde", "Progressive", "Fusion", "Traditional", "Sad but Hopeful", "Happy Vibes", "Midnight Drive", "Rainy Night", "Late Night Coding", "Study Focus", "Deep Work", "Chill Evening", "Summer Vibes", "Beach Mood", "Coffee Shop Vibes", "Bedroom Vibes", "Gym Beast", "Pre-Workout", "Boss Mode", "Main Character", "Villain Arc", "Sigma", "Car Music", "Bass Boosted", "Headphones Only", "Emotional Rollercoaster", "Slow Burn", "Golden Oldies", "Wedding Songs", "Festival Anthems", "Family Time", "Sunday Morning", "Party Starter", "Calm Piano", "Epic Orchestra", "Fantasy", "Cyberpunk", "Sci-Fi", "Horror", "Mystery", "Romantic Dinner", "Sleep Sounds", "Nature Sounds"
]

@app.get("/api/recommend")
async def get_recommendations(seed: str, target_year: int = None, title: str = "Unknown", artist: str = "Unknown", dna: str = "Unknown"):
    try:
        tracks = []
        seen_ids = set()
        exclude_terms = ["mashup", "remix", "mixtape", "non stop", "nonstop", "megamix"]

        # 1. Primary Recommendation Engine: Latent Acoustic & Collaborative Graph
        if title and title != "Unknown":
            graph_candidates = await fetch_acoustic_graph_candidates(title, artist, limit=20)
            if graph_candidates:
                # Parallel resolution to playable YouTube Music streams
                resolve_tasks = []
                for t_name, a_name in graph_candidates:
                    query = f"{t_name} {a_name}".strip()
                    if query:
                        resolve_tasks.append(resolve_ytmusic_track(query))
                
                if resolve_tasks:
                    resolved_tracks = await asyncio.gather(*resolve_tasks, return_exceptions=True)
                    for item in resolved_tracks:
                        if isinstance(item, dict) and item.get("id"):
                            vid = item["id"]
                            title_lower = item.get("title", "").lower()
                            if vid not in seen_ids and not any(term in title_lower for term in exclude_terms):
                                seen_ids.add(vid)
                                tracks.append(item)

        # 2. Secondary Recommendation Engine: YouTube Music Native Algorithmic Radio
        if len(tracks) < 15 and title and title != "Unknown":
            try:
                loop = asyncio.get_event_loop()
                s_res = await loop.run_in_executor(None, lambda: ytmusic.search(f"{clean_music_text(title)} {clean_music_text(artist)}", filter="songs", limit=1))
                if s_res and s_res[0].get("videoId"):
                    seed_vid = s_res[0]["videoId"]
                    radio_tracks = await get_ytmusic_radio_tracks(seed_vid, limit=25)
                    for item in radio_tracks:
                        vid = item.get("id")
                        title_lower = item.get("title", "").lower()
                        if vid and vid not in seen_ids and not any(term in title_lower for term in exclude_terms):
                            seen_ids.add(vid)
                            tracks.append(item)
                            if len(tracks) >= 40:
                                break
            except Exception as e:
                print(f"Radio candidate expansion error: {e}")

        # 3. Tertiary Fallback: Search with Seed Query if pool is still small
        if len(tracks) < 10:
            search_query = f"{seed} -mashup -remix"
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(None, lambda: ytmusic.search(search_query, filter="songs", limit=40))
            for item in results:
                vid = item.get("videoId")
                if vid and vid not in seen_ids:
                    title_lower = item.get("title", "").lower()
                    if not any(term in title_lower for term in exclude_terms):
                        seen_ids.add(vid)
                        tracks.append(format_track(item))
                        if len(tracks) >= 50:
                            break
                        
        if len(tracks) > 0:
            try:
                import json
                # Create a mapping for the LLM
                candidates_str = json.dumps([{
                    "id": str(i),
                    "title": t.get("title"),
                    "artist": t.get("artist")
                } for i, t in enumerate(tracks)], indent=2)
                
                prompt = f"""You are SonicView's Music Recommendation Engine.

Your task is to recommend up to 20 songs based on the user's selected song and the TARGET CONTEXT.

The goal is NOT to recommend songs that are simply from the same genre or artist.
The goal is to find songs that would genuinely feel musically close to the selected song.

Consider these factors in order of importance:

1. Acoustic / Music DNA similarity
2. Target Context Match (STRICT LANGUAGE/REGION FILTERING)
3. Mood and emotional character
4. Tempo and rhythmic characteristics
5. Instrumentation and sonic texture
6. Vocal characteristics
7. Genre and subgenre
8. Production style
9. Release-era similarity
10. Current relevance and popularity

The selected song is the primary reference.

CRITICAL RULE: The TARGET CONTEXT specifies the intended language, region, or vibe (e.g. "Bengali songs"). You MUST strictly filter the candidate songs to match this language/region. If the target context specifies a language, completely REJECT any songs from other languages (like Hindi or English), even if they appear in the candidate list and have high acoustic similarity.

Prefer music from approximately ±5 years of the selected song's release year,
but you may go outside this range when a song has significantly stronger
musical similarity.

Favor songs that are relevant to today's music landscape, but DO NOT recommend
a song merely because it is currently popular.

Avoid:
- Songs from the WRONG LANGUAGE or region
- Generic genre matches
- Artist-only matches
- Songs that are famous but musically unrelated
- Duplicate artists when better alternatives exist
- Excessively obvious recommendations
- Songs with weak similarity just to fill the list

Create up to 20 recommendations (aim for 20, but fewer is okay if you must reject songs to satisfy the TARGET CONTEXT language rule) and rank them from highest to lowest
musical relevance. CHOOSE ONLY FROM THE CANDIDATE SONGS LISTED BELOW.

For each song provide:

{{
  "rank": 1,
  "id": "...",
  "title": "...",
  "artist": "...",
  "release_year": 2024,
  "similarity_score": 94,
  "reason": "..."
}}

Return ONLY valid JSON in this exact format:
{{
  "recommendations": [ ... ]
}}

SELECTED SONG:
Title: {title}
Artist: {artist}
Release Year: {target_year or 'Unknown'}

TARGET CONTEXT:
{seed}

MUSIC DNA:
{dna}

CANDIDATE SONGS:
{candidates_str}"""

                completion = await groq_client.chat.completions.create(
                    messages=[{"role": "user", "content": prompt}],
                    model="openai/gpt-oss-120b",  
                    temperature=0.3,
                    response_format={"type": "json_object"}
                )
                
                response_json = json.loads(completion.choices[0].message.content.strip())
                recs = response_json.get("recommendations", [])
                
                # Map back to original tracks
                best_matches = []
                for rec in recs:
                    track_id_str = str(rec.get("id"))
                    if track_id_str.isdigit() and int(track_id_str) < len(tracks):
                        t = tracks[int(track_id_str)]
                        t["_similarity_score"] = rec.get("similarity_score")
                        t["_reason"] = rec.get("reason")
                        best_matches.append(t)
                
                if best_matches:
                    return best_matches[:20]
            except Exception as e:
                print(f"AI Recommendation error: {e}")
                pass # Fallback to standard tracking if LLM fails
                
        return tracks[:20]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def analyze_track(track: TrackRequest):
    temp_file = f"temp_{track.id}.m4a"
    try:
        if track.id.startswith("jiosaavn:"):
            real_id = track.id.split(":", 1)[1]
            url = f"https://www.jiosaavn.com/api.php?__call=song.getDetails&pids={real_id}&_format=json&_marker=0&ctx=android"
            async with httpx.AsyncClient() as client:
                res = await client.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10.0)
                if res.status_code == 200:
                    data = res.json()
                    song_info = data.get(real_id, {})
                    enc_url = song_info.get("encrypted_media_url")
                    if enc_url:
                        stream_url = decrypt_jiosaavn_url(enc_url, quality="standard")
                        response = await client.get(stream_url, timeout=30.0)
                        if response.status_code == 200:
                            with open(temp_file, "wb") as f:
                                f.write(response.content)
            if not os.path.exists(temp_file):
                raise Exception("Failed to download JioSaavn track for analysis.")
        else:
            # 1. Download audio via yt-dlp
            import imageio_ffmpeg
            ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()

            ydl_opts = {
                'format': 'bestaudio[ext=m4a]/bestaudio/best',
                'outtmpl': temp_file,
                'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'm4a'}],
                'quiet': True,
                'no_warnings': True,
                'ffmpeg_location': ffmpeg_path,
                'extractor_args': {'youtube': {'player_client': ['android']}},
            }
            if os.path.exists('cookies.txt'):
                ydl_opts['cookiefile'] = 'cookies.txt'
            
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([f"https://www.youtube.com/watch?v={track.id}"])
            except Exception as e:
                print(f"yt-dlp download failed: {e}")
                
                stream_url = await get_piped_stream(track.id)
                if stream_url:
                    async with httpx.AsyncClient() as client:
                        response = await client.get(stream_url, timeout=30.0)
                        if response.status_code == 200:
                            with open(temp_file, "wb") as f:
                                f.write(response.content)
            
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
        
        # 2.5 Fetch exact release date from metadata catalog
        catalog_date_hint = "Unknown"
        try:
            async with httpx.AsyncClient() as client:
                catalog_resp = await client.get(
                    _CATALOG_GRAPH_EP,
                    params={"term": f"{track.title} {track.artist}", "entity": "song", "limit": 1},
                    timeout=5.0
                )
                if catalog_resp.status_code == 200:
                    results = catalog_resp.json().get("results", [])
                    if results and "releaseDate" in results[0]:
                        catalog_date_hint = results[0]["releaseDate"].split("T")[0] # e.g. 2005-12-10
        except Exception:
            pass

        # 3. Analyze with AI
        system_prompt = f"""You are a dual-purpose AI for a music-analysis system:
1. UNIVERSAL MULTIDIMENSIONAL LANGUAGE VERIFIER
2. Music DNA Metadata Extractor

PART 1: LANGUAGE VERIFICATION
Your job is to independently verify the primary language of a song. Whisper's detected language is ONLY an initial hypothesis and must NOT be treated as ground truth.

Perform MULTIDIMENSIONAL linguistic analysis:
1. Grammar & sentence structure
2. Function words & grammatical particles
3. Overall vocabulary distribution
4. Verb forms & morphology
5. Pronunciation / phonology (from transcript cues)
6. Script / writing system (if available)
7. Dialect / regional linguistic patterns
8. Code-switching / multilingual sections
9. Contextual linguistic patterns

IMPORTANT RULES FOR LANGUAGE:
- **Do NOT be overly cautious.** If the transcript is clearly in a distinct language (e.g., English, Spanish, Korean, Punjabi), classify it confidently with a high score (80-100) and set status to "confirmed".
- The "ambiguous" status should ONLY be used for truly indistinguishable edge cases (like a perfect 50/50 split of Hindi and Urdu vocabulary) or if the audio has virtually no lyrics.
- Never classify a language from one or two isolated words, look at the whole text.
- Do NOT assume Sanskrit-derived words = Hindi, or Persian/Arabic-derived = Urdu, but DO use them as weights to decide the dominant language.
- Generate the top candidate languages with confidence scores.

PART 2: MUSIC DNA EXTRACTION
1. Extract or infer the Artist Name ('ai_artist') and Album Name ('ai_album').
2. Infer the mood, EXACT release_year (as an INTEGER, e.g. 2004), era, and a short 2-sentence description of the song's vibe.
3. Predict audio stats (floats 0.0 to 1.0) for energy, valence, danceability, instrumentalness, and an integer for tempo (BPM).
4. Select 2-3 tags from the MASTER LIST OF AESTHETIC TAGS below that describe this song's specific vibe and subgenre.

MASTER LIST OF AESTHETIC TAGS:
{", ".join(AESTHETIC_TAGS)}

Return ONLY a valid JSON object with the following structure:
{{
  "primary_language": "string (or 'Uncertain')",
  "language_confidence": 0,
  "status": "confirmed | probable | ambiguous | insufficient_evidence",
  "candidate_languages": [{{"language": "string", "confidence": 0}}],
  "whisper_agrees": true,
  "secondary_languages": ["string"],
  "evidence": {{
    "grammar": "string",
    "function_words": "string",
    "vocabulary": "string",
    "phonology": "string",
    "script": "string",
    "dialect": "string",
    "code_switching": "string"
  }},
  "evidence_summary": "string",
  "ai_artist": "string",
  "ai_album": "string",
  "mood": "string",
  "release_year": 2024,
  "era": "string",
  "description": "string",
  "stats": {{
    "energy": 0.0,
    "valence": 0.0,
    "danceability": 0.0,
    "instrumentalness": 0.0,
    "tempo": 0
  }},
  "aesthetic_tags": ["string"]
}}
"""
        completion = await groq_client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[
                {
                    "role": "system", 
                    "content": system_prompt
                },
                {
                    "role": "user", 
                    "content": f"Title Hint: {track.title}\nArtist Hint: {track.artist}\nExact Release Date: {catalog_date_hint}\nWhisper Detected Language: {detected_language}\nFull Transcript:\n{transcription.text}"
                }
            ],
            response_format={"type": "json_object"}
        )
        
        import json
        analysis_result = json.loads(completion.choices[0].message.content.strip())
        
        # 4. Clean up
        if os.path.exists(actual_file):
            os.remove(actual_file)
            
        import re
        release_year = analysis_result.get("release_year")
        if isinstance(release_year, str):
            digits = re.findall(r'\d{4}', release_year)
            if digits:
                release_year = int(digits[0])
            else:
                release_year = 2024
        elif not isinstance(release_year, int):
            release_year = 2024
            
        timeline_range = f"from {release_year - 5} to {release_year + 7}"
        
        # Resolve Language Safely
        status = analysis_result.get("status", "ambiguous")
        if status in ["ambiguous", "insufficient_evidence"] or analysis_result.get("language_confidence", 0) < 50:
            final_lang = "Uncertain"
        else:
            final_lang = analysis_result.get("primary_language", detected_language)

        return {
            "language": final_lang,
            "language_confidence": analysis_result.get("language_confidence", 100),
            "status": status,
            "candidate_languages": analysis_result.get("candidate_languages", []),
            "whisper_agrees": analysis_result.get("whisper_agrees", True),
            "evidence": analysis_result.get("evidence", {}),
            "evidence_summary": analysis_result.get("evidence_summary", "Standard verification."),
            "script_detected": analysis_result.get("evidence", {}).get("script", "Unknown"),
            "code_switching": bool(analysis_result.get("secondary_languages")),
            "detected_language": detected_language,
            "ai_artist": analysis_result.get("ai_artist", track.artist),
            "ai_album": analysis_result.get("ai_album", "Unknown Album"),
            "mood": analysis_result.get("mood", "Energetic"),
            "release_time": str(release_year),
            "era": analysis_result.get("era", "Modern Era"),
            "description": analysis_result.get("description", f"A great song by {track.artist}."),
            "stats": analysis_result.get("stats", {
                "energy": 0.7,
                "valence": 0.5,
                "danceability": 0.6,
                "instrumentalness": 0.0,
                "tempo": 120
            }),
            "aesthetic_tags": analysis_result.get("aesthetic_tags", ["Vibe"]),
            "timeline_range": timeline_range,
            "recommendation_seed": track.id
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        if os.path.exists(temp_file):
            os.remove(temp_file)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)