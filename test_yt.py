import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from ytmusicapi import YTMusic
yt = YTMusic()
print("--- Hindi Queries ---")
queries = ["Top 50 Hindi", "Hot Hits Hindi", "Latest Hindi Songs", "Top Hindi Songs", "Trending Hindi"]
for q in queries:
    results = yt.search(q, filter="playlists", limit=5)
    print(f"--- QUERY: {q} ---")
    for r in results:
        author = r.get('author', '')
        if isinstance(author, list) and len(author) > 0:
            author = author[0].get('name', '')
        elif isinstance(author, dict):
            author = author.get('name', '')
        print(f"Title: {r.get('title')} | Author: {author}")
