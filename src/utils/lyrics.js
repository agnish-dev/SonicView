export function parseLrc(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.trim().split('\n');
  const parsed = [];
  const pattern = /\[(\d+):(\d+\.?\d*)\](.*)/;
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseFloat(match[2]);
      const text = match[3].trim();
      const startMs = Math.round(mins * 60000 + secs * 1000);
      parsed.push({ startTime: String(startMs), line: text });
    }
  }
  return parsed;
}

export function cleanTrackTitle(title) {
  if (!title) return '';
  return title
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(feat|ft|featuring)\.?\s+.*$/gi, '')
    .replace(/\b(official\s+video|official\s+audio|lyric\s+video|lyrics|audio|video|visualizer|hd|4k)\b/gi, '')
    .replace(/[-–—]\s*(from\s+.*|ost|soundtrack)/gi, '')
    .trim();
}

export function cleanArtistName(artist) {
  if (!artist) return '';
  return artist
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/,\s*.*$/, '')
    .trim();
}

export function parseDurationToSeconds(duration) {
  if (!duration) return 0;
  const parts = String(duration).split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return parseInt(duration, 10) || 0;
}

/**
 * Fetches synced or plain lyrics directly on the client side via LRCLIB (CORS-friendly, no API key).
 * Falls back to our backend /api/lyrics only if LRCLIB has no results or network fails.
 */
export async function fetchLyricsClient(track, apiBase, customFetch) {
  if (!track) return { hasTimestamps: false, lyrics: "Lyrics not available for this track." };

  const cleanTitle = cleanTrackTitle(track.title);
  const cleanArtist = cleanArtistName(track.artist);
  const durationSec = parseDurationToSeconds(track.duration);

  // 1. Direct LRCLIB exact match attempt (100% client-side, zero backend load)
  try {
    let getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
    if (durationSec > 0) {
      getUrl += `&duration=${durationSec}`;
    }
    const res = await fetch(getUrl, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        const parsed = parseLrc(data.syncedLyrics);
        if (parsed.length > 2) {
          return { hasTimestamps: true, lyrics: parsed };
        }
      }
      if (data.plainLyrics && data.plainLyrics.trim().split('\n').length > 2) {
        return { hasTimestamps: false, lyrics: data.plainLyrics };
      }
    }
  } catch (err) {
    // Continue to search attempt
  }

  // 2. Direct LRCLIB search fallback (100% client-side)
  try {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanTitle} ${cleanArtist}`)}`;
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (searchRes.ok) {
      const results = await searchRes.json();
      if (Array.isArray(results) && results.length > 0) {
        // Filter out junk/probe entries
        const validResults = results.filter(
          (r) => (r.syncedLyrics && r.syncedLyrics.split('\n').length > 2) || (r.plainLyrics && r.plainLyrics.split('\n').length > 2)
        );

        if (validResults.length > 0) {
          let bestMatch = null;
          if (durationSec > 0) {
            bestMatch = validResults.find(
              (r) => r.syncedLyrics && r.duration && Math.abs(r.duration - durationSec) <= 4
            );
          }
          if (!bestMatch) {
            bestMatch = validResults.find((r) => r.syncedLyrics) || validResults[0];
          }

          if (bestMatch?.syncedLyrics) {
            const parsed = parseLrc(bestMatch.syncedLyrics);
            if (parsed.length > 2) {
              return { hasTimestamps: true, lyrics: parsed };
            }
          }
          if (bestMatch?.plainLyrics) {
            return { hasTimestamps: false, lyrics: bestMatch.plainLyrics };
          }
        }
      }
    }
  } catch (err) {
    // Continue to backend fallback
  }

  // 3. Fallback to backend /api/lyrics if LRCLIB didn't have it (e.g. YTMusic/Musixmatch fallback)
  try {
    const durationParam = track.duration ? `&duration=${encodeURIComponent(track.duration)}` : '';
    const backendRes = await customFetch(
      `${apiBase}/api/lyrics?video_id=${encodeURIComponent(track.id)}&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}${durationParam}`
    );
    if (backendRes.ok) {
      return await backendRes.json();
    }
  } catch (err) {
    console.warn("Backend lyrics fallback error:", err);
  }

  return { hasTimestamps: false, lyrics: "Lyrics not available for this track." };
}
