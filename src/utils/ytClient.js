// src/utils/ytClient.js
// Standalone direct client for YouTube Music InnerTube API (Zero Server Needed)

const INNERTUBE_API_BASE = 'https://music.youtube.com/youtubei/v1';

const BROWSER_CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.01.00',
    hl: 'en',
    gl: 'IN'
  }
};

/**
 * Direct search on YouTube Music catalog
 */
export async function searchYouTubeMusic(query) {
  if (!query || !query.trim()) return [];

  try {
    const url = `${INNERTUBE_API_BASE}/search?prettyPrint=false`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        context: BROWSER_CONTEXT,
        query: query.trim(),
        params: 'EgWKAQIIAWoKEAkQChAFEAgQEf4B' // Filter: Songs
      })
    });

    if (!res.ok) {
      console.warn('InnerTube search returned status', res.status);
      return [];
    }

    const data = await res.json();
    const secList = data.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const songs = [];
    const seen = new Set();

    for (const s of secList) {
      const item = s.itemSectionRenderer?.contents?.[0]?.musicResponsiveListItemRenderer || s.musicResponsiveListItemRenderer;
      if (!item) continue;

      const title = item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map(x => x.text).join('') || '';
      const subtitleRuns = item.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
      const subtitle = subtitleRuns.map(x => x.text).join('');
      
      const artistRun = subtitleRuns.find(r => 
        r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC') || 
        r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('FEmusic_library_privately_owned_artist')
      );
      const artist = artistRun ? artistRun.text : (subtitleRuns[0]?.text || 'Unknown Artist');
      
      const thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
      const art = thumbs.length ? thumbs[thumbs.length - 1].url : 'https://via.placeholder.com/150';

      const vid = item.playlistItemData?.videoId || 
                  item.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ||
                  item.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId;

      const durationRun = subtitleRuns[subtitleRuns.length - 1];
      const duration = (durationRun && /^\d+:\d+$/.test(durationRun.text?.trim())) ? durationRun.text.trim() : '3:30';

      if (vid && !seen.has(vid)) {
        seen.add(vid);
        songs.push({
          id: vid,
          title: title || 'Unknown Track',
          artist: artist || 'Unknown Artist',
          art,
          duration,
          genre: 'Pop'
        });
      }
    }
    return songs;
  } catch (err) {
    console.error('Direct searchYouTubeMusic error:', err);
    return [];
  }
}

/**
 * Fetch Regional Top Trending Charts directly from YouTube Music
 */
export async function fetchRegionalTopSongsClient(language = 'Hindi') {
  const query = `Top ${language} Songs`;
  try {
    const songs = await searchYouTubeMusic(query);
    if (songs && songs.length > 0) {
      return songs.map(s => ({ ...s, genre: language }));
    }
  } catch (err) {
    console.error('fetchRegionalTopSongsClient error:', err);
  }
  return [];
}

/**
 * Fetch 50 Up-Next / Radio Recommendations directly from YouTube Music (Infinite Mix)
 */
export async function fetchRadioRecommendationsClient(videoId) {
  if (!videoId) return [];

  try {
    const url = `${INNERTUBE_API_BASE}/next?prettyPrint=false`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        context: BROWSER_CONTEXT,
        videoId: videoId,
        playlistId: 'RDAMVM' + videoId
      })
    });

    if (!res.ok) return [];

    const data = await res.json();
    const mq = data.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer;
    const panel = mq?.content?.playlistPanelRenderer;
    const items = panel?.contents || [];

    const songs = [];
    const seen = new Set();

    for (const it of items) {
      const r = it.playlistPanelVideoRenderer;
      if (!r || !r.videoId || r.videoId === videoId) continue;

      const title = r.title?.runs?.[0]?.text || 'Unknown Title';
      const artist = r.longBylineText?.runs?.[0]?.text || r.shortBylineText?.runs?.[0]?.text || 'Unknown Artist';
      const thumbs = r.thumbnail?.thumbnails || [];
      const art = thumbs.length ? thumbs[thumbs.length - 1].url : 'https://via.placeholder.com/150';
      const duration = r.lengthText?.runs?.[0]?.text || '3:30';

      if (!seen.has(r.videoId)) {
        seen.add(r.videoId);
        songs.push({
          id: r.videoId,
          title,
          artist,
          art,
          duration,
          genre: 'Recommended'
        });
      }
    }
    return songs;
  } catch (err) {
    console.error('fetchRadioRecommendationsClient error:', err);
    return [];
  }
}

/**
 * Real-time search query suggestions
 */
export async function fetchSearchSuggestionsClient(query) {
  if (!query || !query.trim()) return [];
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data[1]) ? data[1].slice(0, 8) : [];
    }
  } catch (err) {
    // Fail silently on suggestion error
  }
  return [];
}
