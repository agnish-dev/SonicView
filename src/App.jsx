import { useState, useRef, useEffect } from 'react';
import { Music, ArrowLeft, Play, Activity, RefreshCw, Pause, SkipBack, SkipForward, Shuffle, X, Repeat, Heart, Mic2, ListMusic, Volume2, Network, ArrowRight, Zap, Triangle, Waves, Square, ActivitySquare, Hexagon, Search } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function TrackPlayButton({ track, onPlay }) {
  return (
    <button 
      onClick={(e) => { e.stopPropagation(); onPlay(track); }}
      className="glass-panel"
      style={{
        background: 'transparent',
        border: '1px solid var(--accent-color)',
        color: 'var(--text-main)',
        padding: '0.4rem 1rem',
        borderRadius: '99px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontFamily: 'inherit',
        fontSize: '0.85rem',
        transition: 'var(--transition-smooth)'
      }}
    >
      <Play size={14} color="var(--accent-color)" /> Play Full Song
    </button>
  );
}

function WavySlider({ value, max, onChange, isPlaying }) {
  const containerRef = useRef(null);
  const percentage = max > 0 ? (value / max) * 100 : 0;

  const handlePointer = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const newPercent = x / rect.width;
    onChange(newPercent * max);
  };

  const handlePointerDown = (e) => {
    handlePointer(e);
    const onMove = (eMove) => handlePointer(eMove);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const maskSvg = "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 40 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 0 10 Q 10 0, 20 10 T 40 10' fill='none' stroke='black' stroke-width='6' stroke-linecap='round'/%3E%3C/svg%3E\")";

  return (
    <div 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      style={{
        flex: 1,
        height: '30px',
        position: 'relative',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        touchAction: 'none'
      }}
    >
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        height: '2px',
        background: 'rgba(255, 255, 255, 0.4)',
        borderRadius: '1px'
      }} />
      
      <div 
        className={isPlaying ? "wavy-fill active" : "wavy-fill"}
        style={{
          position: 'absolute',
          left: 0,
          width: `${percentage}%`,
          height: '20px',
          background: 'linear-gradient(to right, #ff7a00, #ff3d3d)',
          WebkitMaskImage: maskSvg,
          WebkitMaskSize: '40px 100%',
          WebkitMaskRepeat: 'repeat-x',
          maskImage: maskSvg,
          maskSize: '40px 100%',
          maskRepeat: 'repeat-x',
          pointerEvents: 'none'
        }} 
      />

      <div style={{
        position: 'absolute',
        left: `${percentage}%`,
        top: '50%',
        width: '18px',
        height: '18px',
        backgroundColor: '#ff3d3d',
        border: '3px solid white',
        borderRadius: '50%',
        transform: 'translate(-50%, -50%)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        zIndex: 2
      }} />
    </div>
  );
}

// CustomAudioPlayer removed - audio state lifted to App.jsx

function SoundBars() {
  return (
    <div className="sound-bars">
      <div className="sound-bar"></div>
      <div className="sound-bar"></div>
      <div className="sound-bar"></div>
      <div className="sound-bar"></div>
    </div>
  );
}

const formatTime = (time) => {
  if (!time || isNaN(time)) return '0:00';
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function SyncedLyrics({ lyricsData, currentTime, isPlaying }) {
  const containerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!lyricsData || !lyricsData.hasTimestamps) return;
    const lines = lyricsData.lyrics;
    
    // Find active line
    let newIndex = -1;
    // CurrentTime is in seconds, startTime is usually in milliseconds or seconds depending on string
    // YTMusic returns startTime in string like "12345" ms
    const currentMs = currentTime * 1000;
    
    for (let i = 0; i < lines.length; i++) {
      const lineTime = parseInt(lines[i].startTime, 10);
      if (currentMs >= lineTime) {
        newIndex = i;
      } else {
        break;
      }
    }
    
    if (newIndex !== activeIndex) {
      setActiveIndex(newIndex);
    }
  }, [currentTime, lyricsData, activeIndex]);

  useEffect(() => {
    if (activeIndex !== -1 && containerRef.current) {
      const activeEl = containerRef.current.querySelector('.lyric-line.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIndex]);

  if (!lyricsData) return <div className="lyrics-text">Lyrics are not available for this track.</div>;

  if (!lyricsData.hasTimestamps) {
    return <div className="lyrics-text">{lyricsData.lyrics}</div>;
  }

  return (
    <div className="synced-lyrics-container" ref={containerRef}>
      {lyricsData.lyrics.map((line, idx) => (
        <div 
          key={idx} 
          className={`lyric-line ${idx === activeIndex ? 'active' : ''} ${idx < activeIndex ? 'passed' : ''}`}
        >
          {line.line || '♪'}
        </div>
      ))}
    </div>
  );
}

function GlobalPlayer({ track, streamUrl, isLoading, isPlaying, currentTime, duration, onNext, onPrev, onClose, onClick, togglePlay, onSeek }) {
  if (!track) return null;

  return (
    <div className="global-player-pill-container">
      <div className="global-player-pill" onClick={onClick} style={{ cursor: 'pointer' }}>
        <img src={track.art} alt={track.title} className={`pill-art ${isPlaying ? 'rotating' : 'paused'}`} />
        <div className="pill-info">
          <span className="pill-title">{track.title}</span>
          <span className="pill-artist">{track.artist}</span>
        </div>
        
        <div className="pill-audio">
          {isLoading ? (
            <div className="spinner" style={{width: '24px', height: '24px', margin: '0 2rem'}}></div>
          ) : streamUrl ? (
            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1, width: '100%' }}>
              <div className="pill-controls">
                <button className="control-btn" onClick={onPrev}><SkipBack size={18} fill="currentColor" /></button>
                <button onClick={togglePlay} className="pill-play-btn">
                  {isPlaying ? <Pause size={18} fill="white" /> : <Play size={18} fill="white" style={{ marginLeft: '2px' }} />}
                </button>
                <button className="control-btn" onClick={onNext}><SkipForward size={18} fill="currentColor" /></button>
              </div>
              
              <div className="pill-progress">
                <span className="pill-time">{formatTime(currentTime)}</span>
                <div className="pill-wave-container">
                  <WavySlider 
                    value={currentTime} 
                    max={duration || 100} 
                    onChange={onSeek} 
                    isPlaying={isPlaying} 
                  />
                </div>
                <span className="pill-time">{formatTime(duration)}</span>
              </div>
            </div>
          ) : (
             <span style={{ color: 'red', fontSize: '0.8rem', margin: '0 2rem' }}>Stream unavailable</span>
          )}
        </div>
      <button className="pill-close-btn" onClick={onClose}>
        <X size={16} />
      </button>
      </div>
    </div>
  );
}

const INDIAN_LANGUAGES = ['Hindi', '90s', 'Punjabi', 'Tamil', 'Telugu', 'Bengali', 'Malayalam', 'Kannada', 'Marathi', 'Gujarati', 'Bhojpuri', 'Odia', 'Urdu', 'Nepali', 'Konkani', 'Kashmiri', 'Manipuri', 'Sanskrit', 'Haryanvi', 'Rajasthani', 'Assamese'];
const GLOBAL_LANGUAGES = ['English', 'Spanish', 'Korean', 'Japanese', 'Portuguese', 'French', 'Arabic', 'German', 'Turkish', 'Mandarin Chinese', 'Pakistani'];

function App() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });
  }, []);

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        setDeferredPrompt(null);
      });
    }
  };

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef(null);
  const abortControllerRef = useRef(null);
  const topSearchRef = useRef(null);
  const heroSearchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        (topSearchRef.current && topSearchRef.current.contains(event.target)) ||
        (heroSearchRef.current && heroSearchRef.current.contains(event.target))
      ) {
        return;
      }
      setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);
  
  const getHighResArt = (url) => {
    if (!url) return url;
    if (url.includes('googleusercontent.com') && url.includes('=')) {
      return url.split('=')[0] + '=w1080-h1080-l90-rj';
    }
    return url;
  };
  
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [languageRecommendations, setLanguageRecommendations] = useState([]);
  
  const [currentPlayingTrack, setCurrentPlayingTrack] = useState(null);
  const [error, setError] = useState('');
  const [isRefreshingGlobal, setIsRefreshingGlobal] = useState(false);
  const [isRefreshingGenre, setIsRefreshingGenre] = useState(false);
  const [isFetchingMoreGlobal, setIsFetchingMoreGlobal] = useState(false);
  const [isFetchingMoreGenre, setIsFetchingMoreGenre] = useState(false);

  // Regional Trending State
  const [activeRegion, setActiveRegion] = useState('Indian');
  const [activeLanguage, setActiveLanguage] = useState(null);
  const [regionalSongs, setRegionalSongs] = useState([]);
  const [isRegionalLoading, setIsRegionalLoading] = useState(false);

  const fetchRegionalSongs = async (language) => {
    setIsRegionalLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/regional-top?language=${encodeURIComponent(language)}`);
      if (res.ok) {
        const data = await res.json();
        setRegionalSongs(data);
      }
    } catch (err) {
      console.error('Failed to fetch regional songs', err);
    } finally {
      setIsRegionalLoading(false);
    }
  };

  useEffect(() => {
    if (activeLanguage) {
      fetchRegionalSongs(activeLanguage);
    } else {
      setRegionalSongs([]);
    }
  }, [activeLanguage, activeRegion]);

  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [currentLyrics, setCurrentLyrics] = useState(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState(false);


  // Audio State
  const audioRef = useRef(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [isLoadingStream, setIsLoadingStream] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [skipSegments, setSkipSegments] = useState([]);

  useEffect(() => {
    if (!currentPlayingTrack) {
      setStreamUrl(null);
      setSkipSegments([]);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    
    setCurrentTime(0);
    setDuration(0);
    
    let active = true;
    const fetchFullAudio = async () => {
      setIsLoadingStream(true);
      setStreamUrl(null);
      try {
        const res = await fetch(`${API_BASE}/api/stream?video_id=${currentPlayingTrack.id}&title=${encodeURIComponent(currentPlayingTrack.title)}&artist=${encodeURIComponent(currentPlayingTrack.artist)}`);
        if (!res.ok) throw new Error("Stream fetch failed");
        const data = await res.json();
        if (active) {
          setStreamUrl(data.stream_url);
          setSkipSegments(data.skip_segments || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setIsLoadingStream(false);
      }
    };
    fetchFullAudio();
    return () => { active = false; };
  }, [currentPlayingTrack]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    setCurrentTime(current);
    
    if (skipSegments && skipSegments.length > 0) {
      for (const [start, end] of skipSegments) {
        if (current >= start && current < end) {
          audioRef.current.currentTime = end;
          setCurrentTime(end);
          break;
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (val) => {
    setCurrentTime(val);
    if (audioRef.current) audioRef.current.currentTime = val;
  };

  const handleOpenFullPlayer = () => {
    if (!currentPlayingTrack) return;
    setShowFullPlayer(true);
  };

  useEffect(() => {
    if (!currentPlayingTrack) return;
    
    let active = true;
    const fetchLyricsData = async () => {
      setCurrentLyrics(null);
      setIsLoadingLyrics(true);
      try {
         const res = await fetch(`${API_BASE}/api/lyrics?video_id=${encodeURIComponent(currentPlayingTrack.id)}&title=${encodeURIComponent(currentPlayingTrack.title)}&artist=${encodeURIComponent(currentPlayingTrack.artist)}${currentPlayingTrack.duration ? `&duration=${encodeURIComponent(currentPlayingTrack.duration)}` : ''}`);
         if (active) {
             if (res.ok) {
                 const data = await res.json();
                 setCurrentLyrics(data);
             } else {
                 setCurrentLyrics({ hasTimestamps: false, lyrics: "Lyrics not available for this track." });
             }
         }
      } catch (err) {
         if (active) setCurrentLyrics({ hasTimestamps: false, lyrics: "Error fetching lyrics." });
      } finally {
         if (active) setIsLoadingLyrics(false);
      }
    };
    fetchLyricsData();
    return () => { active = false; };
  }, [currentPlayingTrack]);
  
  const refreshGlobal = async () => {
    if (!analysisResult) return;
    setIsRefreshingGlobal(true);
    try {
      const recRes = await fetch(`${API_BASE}/api/recommend?seed=${encodeURIComponent(analysisResult.recommendation_seed)}`);
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecommendations(recData);
      }
    } catch(err) { console.error(err); }
    setIsRefreshingGlobal(false);
  };

  const fetchMoreGlobal = async () => {
    if (!analysisResult) return [];
    setIsFetchingMoreGlobal(true);
    try {
      const recRes = await fetch(`${API_BASE}/api/recommend?seed=${encodeURIComponent(analysisResult.recommendation_seed)}`);
      if (recRes.ok) {
        const recData = await recRes.json();
        const newTracks = recData.filter(newTrack => !recommendations.some(t => t.id === newTrack.id));
        setRecommendations(prev => {
          const freshNewTracks = recData.filter(newTrack => !prev.some(t => t.id === newTrack.id));
          return [...prev, ...freshNewTracks];
        });
        setIsFetchingMoreGlobal(false);
        return newTracks;
      }
    } catch(err) { console.error(err); }
    setIsFetchingMoreGlobal(false);
    return [];
  };

  const handleScrollGlobal = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 20;
    if (bottom && !isFetchingMoreGlobal && !isRefreshingGlobal) {
      fetchMoreGlobal();
    }
  };
  
  const refreshGenre = async () => {
    if (!analysisResult || !selectedTrack) return;
    setIsRefreshingGenre(true);
    try {
      const langRes = await fetch(`${API_BASE}/api/recommend?seed=${encodeURIComponent(analysisResult.recommendation_seed)}&genre=${encodeURIComponent(selectedTrack.genre)}&video_id=${encodeURIComponent(selectedTrack.id)}`);
      if (langRes.ok) {
        const langData = await langRes.json();
        setLanguageRecommendations(langData);
      }
    } catch(err) { console.error(err); }
    setIsRefreshingGenre(false);
  };

  const fetchMoreGenre = async () => {
    if (!analysisResult) return [];
    setIsFetchingMoreGenre(true);
    try {
      const langRes = await fetch(`${API_BASE}/api/recommend?seed=${encodeURIComponent(analysisResult.recommendation_seed)}&genre=${encodeURIComponent(analysisResult.language)}&video_id=${encodeURIComponent(selectedTrack.id)}`);
      if (langRes.ok) {
        const langData = await langRes.json();
        const newTracks = langData.filter(newTrack => !languageRecommendations.some(t => t.id === newTrack.id));
        setLanguageRecommendations(prev => {
          const freshNewTracks = langData.filter(newTrack => !prev.some(t => t.id === newTrack.id));
          return [...prev, ...freshNewTracks];
        });
        setIsFetchingMoreGenre(false);
        return newTracks;
      }
    } catch(err) { console.error(err); }
    setIsFetchingMoreGenre(false);
    return [];
  };

  const handleScrollGenre = (e) => {
    const bottom = e.target.scrollHeight - e.target.scrollTop <= e.target.clientHeight + 20;
    if (bottom && !isFetchingMoreGenre && !isRefreshingGenre) {
      fetchMoreGenre();
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setIsSearching(true);
    setShowSuggestions(false);
    setError('');
    
    try {
      const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      setError("Failed to connect to the music database. Is the backend running?");
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    if (val.trim().length > 1) {
      searchTimeout.current = setTimeout(async () => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();
        
        try {
          const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(val)}`, {
            signal: abortControllerRef.current.signal
          });
          if (res.ok) {
            const data = await res.json();
            setSuggestions(data.slice(0, 20));
            setShowSuggestions(true);
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error("Search suggestion error:", err);
          }
        }
      }, 0);
    } else {
      if (abortControllerRef.current) abortControllerRef.current.abort();
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleTrackSelect = async (track) => {
    setSelectedTrack(track);
    setCurrentPlayingTrack(track);
    setIsAnalyzing(true);
    setError('');
    setAnalysisResult(null);
    setRecommendations([]);
    setLanguageRecommendations([]);
    
    try {
      const analyzeRes = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(track)
      });
      
      if (!analyzeRes.ok) throw new Error("Failed to analyze track");
      const analysisData = await analyzeRes.json();
      setAnalysisResult(analysisData);
      
      const recRes = await fetch(`${API_BASE}/api/recommend?seed=${encodeURIComponent(analysisData.recommendation_seed)}&exclude_genre=${encodeURIComponent(analysisData.language || '')}`);
      if (recRes.ok) {
        const recData = await recRes.json();
        setRecommendations(recData);
      }
      
      // 3. Fetch Genre/Language specific recommendations using the AI detected language
      const langRes = await fetch(`${API_BASE}/api/recommend?seed=${encodeURIComponent(analysisData.recommendation_seed)}&genre=${encodeURIComponent(analysisData.language || 'Bollywood')}&video_id=${encodeURIComponent(track.id)}`);
      if (langRes.ok) {
        const langData = await langRes.json();
        setLanguageRecommendations(langData);
      }
      
    } catch (err) {
      setError("Analysis failed. The backend might still be installing dependencies.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetSearch = () => {
    setSelectedTrack(null);
    setSearchResults([]);
    setQuery('');
    setAnalysisResult(null);
    setRecommendations([]);
    setLanguageRecommendations([]);
    setError('');
  };

  const handleNextTrack = () => {
    if (!currentPlayingTrack) return;
    
    let list = null;
    let idx = -1;
    
    if ((idx = recommendations.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = recommendations;
    } else if ((idx = languageRecommendations.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = languageRecommendations;
    } else if ((idx = searchResults.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = searchResults;
    } else if ((idx = regionalSongs.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = regionalSongs;
    }
    
    if (list && idx !== -1) {
       if (idx < list.length - 1) {
         setCurrentPlayingTrack(list[idx + 1]);
       } else {
         // Auto-fetch more if at the end of a recommendation list
         if (list === recommendations) {
            fetchMoreGlobal().then(newTracks => {
               if (newTracks && newTracks.length > 0) setCurrentPlayingTrack(newTracks[0]);
            });
         } else if (list === languageRecommendations) {
            fetchMoreGenre().then(newTracks => {
               if (newTracks && newTracks.length > 0) setCurrentPlayingTrack(newTracks[0]);
            });
         } else {
            setCurrentPlayingTrack(null);
         }
       }
    }
  };

  const handlePrevTrack = () => {
    if (!currentPlayingTrack) return;
    
    let list = null;
    let idx = -1;
    
    if ((idx = recommendations.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = recommendations;
    } else if ((idx = languageRecommendations.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = languageRecommendations;
    } else if ((idx = searchResults.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = searchResults;
    } else if ((idx = regionalSongs.findIndex(t => t.id === currentPlayingTrack.id)) !== -1) {
       list = regionalSongs;
    }
    
    if (list && idx > 0) {
       setCurrentPlayingTrack(list[idx - 1]);
    }
  };

  const handleClosePlayer = () => {
    setCurrentPlayingTrack(null);
  };

  return (
    <div className="app-wrapper">
      {/* App Logo */}
      <div className="app-logo" onClick={resetSearch} style={{ cursor: 'pointer' }} title="Return to Home">
        <span className="app-logo-text">SonicView</span>
      </div>

      {/* Global Top-Right Search Bar */}
      {(selectedTrack || searchResults.length > 0) && (
        <div style={{ position: 'absolute', top: '34px', right: '2rem', zIndex: 100 }}>
          <form ref={topSearchRef} onSubmit={async (e) => {
            e.preventDefault();
            if (!query.trim()) return;
            try {
              const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
              if (res.ok) {
                const data = await res.json();
                setSuggestions(data.slice(0, 20));
                setShowSuggestions(true);
              }
            } catch (err) {
              console.error(err);
            }
          }} style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Search another track..."
                value={query}
                onChange={handleInputChange}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                onClick={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                style={{
                  padding: '0.5rem 1rem',
                  paddingRight: query ? '36px' : '1rem',
                  borderRadius: '24px',
                  border: '1px solid var(--border-color)',
                  background: 'hsla(0, 0%, 100%, 0.1)',
                  color: 'var(--text-color)',
                  width: '220px',
                  outline: 'none'
                }}
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setShowSuggestions(false); }} style={{ position: 'absolute', right: '8px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                  <X size={16} />
                </button>
              )}
            </div>
            <button type="submit" style={{
              background: 'var(--accent-color)',
              color: 'white',
              border: 'none',
              borderRadius: '24px',
              padding: '0.5rem 1.25rem',
              cursor: 'pointer',
              fontWeight: '600'
            }}>
              Search
            </button>
            
            {showSuggestions && suggestions.length > 0 && (
              <div className="suggestions-dropdown" style={{ top: '100%', right: 0, width: '320px', marginTop: '0.5rem', position: 'absolute', zIndex: 10 }}>
                {suggestions.map((track) => (
                  <div key={track.id} className="suggestion-item" onClick={() => {
                    setQuery(track.title);
                    setShowSuggestions(false);
                    handleTrackSelect(track);
                  }}>
                    <img src={track.art} alt={track.title} className="suggestion-art" />
                    <div className="suggestion-info">
                      <div className="suggestion-header">
                        <span className="suggestion-title">{track.title}</span>
                        <span className="suggestion-duration">{track.duration}</span>
                      </div>
                      <span className="suggestion-artist">{track.artist}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Root Audio Element */}
      <div style={{ display: 'none' }}>
        {streamUrl && (
          <audio 
            ref={audioRef} 
            src={streamUrl} 
            autoPlay 
            onTimeUpdate={handleTimeUpdate} 
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => {
              setIsPlaying(false);
              handleNextTrack();
            }}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        )}
      </div>

      {/* Global Player */}
      {currentPlayingTrack && (
        <GlobalPlayer 
          track={currentPlayingTrack} 
          streamUrl={streamUrl}
          isLoading={isLoadingStream}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onNext={handleNextTrack} 
          onPrev={handlePrevTrack} 
          onClose={handleClosePlayer} 
          onClick={handleOpenFullPlayer} 
          togglePlay={togglePlay}
          onSeek={handleSeek}
        />
      )}
      
      {/* Full Player Modal */}
      {showFullPlayer && currentPlayingTrack && (
        <div className="full-player-modal" style={{
          backgroundImage: `linear-gradient(to bottom, hsla(0, 0%, 0%, 0.5), hsla(0, 0%, 0%, 0.9)), url(${getHighResArt(currentPlayingTrack.art)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}>
          <button className="full-player-close" onClick={() => setShowFullPlayer(false)}>
            <X size={28} />
          </button>
          <div className="full-player-content">
             <div className="full-player-left">
                <div className={`full-player-art-wrapper ${isPlaying ? 'rotating' : 'paused'}`}>
                  <img src={getHighResArt(currentPlayingTrack.art)} alt={currentPlayingTrack.title} className="full-player-art-image" />
                </div>
                <div style={{ marginTop: 'min(2rem, 3vh)', width: '100%', padding: '0 2rem' }}>
                  <h2 className="full-player-title-large">{currentPlayingTrack.title}</h2>
                  <p className="full-player-artist-large">{currentPlayingTrack.artist}</p>

                </div>
                
                {/* Full Player Controls inside the modal */}
                <div className="full-player-controls-container" style={{ width: '100%', padding: '0 2rem', marginTop: 'min(2rem, 3vh)' }}>
                  <div className="pill-progress" style={{ width: '100%' }}>
                    <span className="pill-time">{formatTime(currentTime)}</span>
                    <div className="pill-wave-container" style={{ flex: 1, margin: '0 1rem' }}>
                      <WavySlider 
                        value={currentTime} 
                        max={duration || 100} 
                        onChange={handleSeek} 
                        isPlaying={isPlaying} 
                      />
                    </div>
                    <span className="pill-time">{formatTime(duration)}</span>
                  </div>
                  
                  <div className="full-player-buttons" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '2rem', marginTop: '2rem' }}>
                    <button className="control-btn" onClick={handlePrevTrack}><SkipBack size={24} fill="currentColor" /></button>
                    <button onClick={togglePlay} className="full-play-btn">
                      {isPlaying ? <Pause size={28} fill="black" /> : <Play size={28} fill="black" style={{ marginLeft: '4px' }} />}
                    </button>
                    <button className="control-btn" onClick={handleNextTrack}><SkipForward size={24} fill="currentColor" /></button>
                  </div>
                </div>
             </div>
             <div className="full-player-right">
                <h3 className="lyrics-heading">Lyrics</h3>
                {isLoadingLyrics ? (
                  <div className="lyrics-loading-text" style={{margin: '2rem 0', color: 'var(--text-muted)', fontSize: '1.2rem', fontWeight: '500'}}>
                    Getting the lyrics<span className="blinking-dots">...</span>
                  </div>
                ) : (
                  <SyncedLyrics lyricsData={currentLyrics} currentTime={currentTime} isPlaying={isPlaying} />
                )}
             </div>
          </div>
        </div>
      )}

      <div className="container" style={{ paddingTop: currentPlayingTrack ? '120px' : '0' }}>
        {!selectedTrack ? (
          <>
            {(!isSearching && searchResults.length === 0) && (
              <>
                <div className="hero-section" style={{ position: 'relative' }}>
                  {deferredPrompt && (
                    <button 
                      onClick={handleInstallClick}
                      style={{
                        position: 'absolute',
                        top: '-20px',
                        right: '0px',
                        background: 'var(--accent-color)',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '24px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(111, 76, 255, 0.3)'
                      }}>
                      + Install App
                    </button>
                  )}
                  <div className="hero-left">
                    <h1 className="hero-title">
                      Unlocking the <br/>
                      <span className="highlight">Code of Sound</span>
                    </h1>
                    <p className="hero-subtitle">
                      Discover the science behind sound. Transform audio into intelligent Music DNA profiles, revealing hidden emotional landscapes, sonic similarities, and the intricate architecture of every track. Dive deeper into the world of music and uncover connections that were never meant to be seen, only heard.
                    </p>
                    <form ref={heroSearchRef} className="search-hero" onSubmit={handleSearch} style={{ position: 'relative' }}>
                      <Search color="var(--text-muted)" size={20} />
                      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                        <input 
                          type="text" 
                          placeholder="Search your favourite music..."
                          value={query}
                          onChange={handleInputChange}
                          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                          onClick={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                          style={{ width: '100%', paddingRight: query ? '40px' : '16px' }}
                        />
                        {query && (
                          <button type="button" onClick={() => { setQuery(''); setShowSuggestions(false); }} style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}>
                            <X size={18} />
                          </button>
                        )}
                      </div>
                      <button type="submit" className="search-hero-btn">
                        Search
                      </button>
                      
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="suggestions-dropdown" style={{ top: '100%', left: 0, right: 0, marginTop: '1rem', position: 'absolute' }}>
                          {suggestions.map((track) => (
                            <div key={track.id} className="suggestion-item" onClick={() => {
                              setQuery(track.title);
                              setShowSuggestions(false);
                              handleTrackSelect(track);
                            }}>
                              <img src={track.art} alt={track.title} className="suggestion-art" />
                              <div className="suggestion-info">
                                <div className="suggestion-header">
                                  <span className="suggestion-title">{track.title}</span>
                                  <span className="suggestion-duration">{track.duration}</span>
                                </div>
                                <span className="suggestion-artist">{track.artist}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </form>
                  </div>
                  <div className="hero-right">
                    <img src="/dna.png" alt="DNA Soundwave" className="hero-img" style={{ mixBlendMode: 'screen', pointerEvents: 'none' }} />
                  </div>
                </div>

                <div className="regional-section">
                  <div className="regional-header">
                    <div className="regional-title">
                      <h2>{activeRegion === 'Global' ? 'Trending Top Global Hits' : 'Trending Regional Hits'}</h2>
                      <p>Discover top charts across different languages and regions</p>
                    </div>
                    <div className="region-toggle">
                      <button 
                        className={activeRegion === 'Indian' ? 'active' : ''} 
                        onClick={() => { setActiveRegion('Indian'); setActiveLanguage(null); }}
                      >
                        Indian
                      </button>
                      <button 
                        className={activeRegion === 'Global' ? 'active' : ''} 
                        onClick={() => { setActiveRegion('Global'); setActiveLanguage(null); }}
                      >
                        Global
                      </button>
                    </div>
                  </div>

                  <>
                    <div className="language-chips-container">
                      {activeLanguage && (
                        <button
                          className="language-chip"
                          onClick={() => setActiveLanguage(null)}
                          title="Close list"
                          style={{ color: '#ff4444', borderColor: '#ff4444', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          <X size={20} />
                        </button>
                      )}
                      {(activeRegion === 'Indian' ? INDIAN_LANGUAGES : GLOBAL_LANGUAGES).map(lang => (
                        <button
                          key={lang}
                          className={`language-chip ${activeLanguage === lang ? 'active' : ''}`}
                          onClick={() => {
                            if (activeLanguage !== lang) {
                              setActiveLanguage(lang);
                            }
                          }}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>

                    {activeLanguage ? (
                      isRegionalLoading ? (
                        <div className="regional-loading">
                          <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                          <p>Fetching top {activeLanguage} hits...</p>
                        </div>
                      ) : regionalSongs.length > 0 ? (
                        <div className="list-view" style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                          {regionalSongs.map((track) => (
                            <div 
                              key={track.id} 
                              className="list-item-card" 
                              onClick={() => setCurrentPlayingTrack(track)} 
                              style={{ 
                                cursor: 'pointer',
                                backgroundColor: currentPlayingTrack?.id === track.id ? 'hsla(var(--primary-hue), 30%, 20%, 0.9)' : undefined,
                                borderColor: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : undefined
                              }}
                            >
                              <img src={track.art || '/default-art.png'} alt={track.title} className="list-track-art" />
                              <div className="list-track-info">
                                <span className="track-title" style={{ color: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : 'inherit' }}>
                                  {track.title}
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span className="track-artist">{track.artist}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>•</span>
                                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{track.duration || '0:00'}</span>
                                </div>
                              </div>
                              {currentPlayingTrack?.id === track.id && <SoundBars />}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="regional-loading">
                          <p>No trending songs found for {activeLanguage}.</p>
                        </div>
                      )
                    ) : null}
                  </>
                </div>
              </>
            )}

            {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}
            
            {isSearching && <div className="spinner"></div>}

            {searchResults.length > 0 && !isSearching && (
              <div className="results-section">
                <h2 className="section-title">
                  <Music size={24} color="var(--accent-color)"/> Search Results
                </h2>
                <div className="list-view" style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                  {searchResults.map((track) => (
                    <div 
                      key={track.id} 
                      className="list-item-card" 
                      onClick={() => handleTrackSelect(track)} 
                      style={{ 
                        cursor: 'pointer',
                        backgroundColor: currentPlayingTrack?.id === track.id ? 'hsla(var(--primary-hue), 30%, 20%, 0.9)' : undefined,
                        borderColor: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : undefined
                      }}
                    >
                      <img src={track.art} alt={track.title} className="list-track-art" />
                      <div className="list-track-info">
                        <span className="track-title" style={{ color: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : 'inherit' }}>
                          {track.title}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="track-artist">{track.artist}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>•</span>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{track.duration || '0:00'}</span>
                        </div>
                      </div>
                      {currentPlayingTrack?.id === track.id && <SoundBars />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="results-section">
            <div key={selectedTrack.id} className="analysis-header glass-panel">
              <img src={getHighResArt(selectedTrack.art)} alt={selectedTrack.title} className="analysis-art" />
              <div className="analysis-details" style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="marquee-wrapper">
                      <h2 className="marquee-title" data-title={selectedTrack.title} style={{ margin: 0 }}>{selectedTrack.title}</h2>
                    </div>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginTop: '0.5rem' }}>{selectedTrack.artist}</p>
                  </div>
                  <button 
                    onClick={() => setCurrentPlayingTrack(selectedTrack)}
                    title="Play this track"
                    style={{
                      background: 'var(--accent-color)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '48px',
                      height: '48px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      boxShadow: '0 4px 15px rgba(187, 134, 252, 0.4)',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(187, 134, 252, 0.6)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(187, 134, 252, 0.4)';
                    }}
                  >
                    <Play size={24} color="#000" fill="#000" style={{ marginLeft: '4px' }} />
                  </button>
                </div>
                
                {isAnalyzing ? (
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '1rem' }}>
                    <span style={{ color: 'var(--accent-color)', fontSize: '1.2rem', fontWeight: '500' }}>
                      Analyzing music and creating a world of recommendations for you
                      <span className="loading-dots" style={{ fontSize: '1.5rem', marginLeft: '4px', letterSpacing: '4px', lineHeight: '1' }}>
                        <span>.</span><span>.</span><span>.</span>
                      </span>
                    </span>
                  </div>
                ) : analysisResult ? (
                  <div style={{ width: '100%' }}>
                    <div className="analysis-tags" style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                      {analysisResult?.ai_artist && (
                        <span className="metadata-tag" style={{ maxWidth: '250px' }}>
                          <span 
                            className={analysisResult.ai_artist.length > 20 ? "marquee-title" : ""} 
                            style={{ 
                              paddingRight: analysisResult.ai_artist.length > 20 ? '1rem' : '0',
                              flexShrink: analysisResult.ai_artist.length > 20 ? 0 : 1
                            }}
                          >
                            Predicted Artist: {analysisResult.ai_artist}
                          </span>
                        </span>
                      )}
                      {analysisResult?.ai_album && analysisResult.ai_album !== "Unknown Album" && (
                        <span className="metadata-tag" style={{ maxWidth: '250px' }}>
                          <span 
                            className={analysisResult.ai_album.length > 20 ? "marquee-title" : ""} 
                            style={{ 
                              paddingRight: analysisResult.ai_album.length > 20 ? '1rem' : '0',
                              flexShrink: analysisResult.ai_album.length > 20 ? 0 : 1
                            }}
                          >
                            Predicted Album: {analysisResult.ai_album}
                          </span>
                        </span>
                      )}
                      <span className="metadata-tag">
                        <ActivitySquare size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> 
                        {analysisResult.mood}
                      </span>
                      <span className="metadata-tag">{analysisResult.language || 'Unknown'}</span>
                      <span className="metadata-tag">{analysisResult.release_time || 'Unknown Date'}</span>
                      <span className="metadata-tag">{(analysisResult.era || 'Modern Era').toUpperCase()}</span>
                    </div>
                    
                    <p style={{ marginTop: '1rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                      {analysisResult.description}
                    </p>
                    
                    <div className="metrics-grid">
                      <div className="metric-row">
                        <span className="metric-label">Energy</span>
                        <div className="metric-bar-bg">
                          <div className="metric-bar-fill" style={{ width: `${Math.min(100, analysisResult.stats.energy * 300)}%`, background: 'var(--accent-color)' }}></div>
                        </div>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Valence</span>
                        <div className="metric-bar-bg">
                          <div className="metric-bar-fill" style={{ width: `${(analysisResult.stats.valence || 0) * 100}%`, background: '#ffeb3b' }}></div>
                        </div>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Danceability</span>
                        <div className="metric-bar-bg">
                          <div className="metric-bar-fill" style={{ width: `${(analysisResult.stats.danceability || 0) * 100}%`, background: '#ff4081' }}></div>
                        </div>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Instrumental</span>
                        <div className="metric-bar-bg">
                          <div className="metric-bar-fill" style={{ width: `${(analysisResult.stats.instrumentalness || 0) * 100}%`, background: '#00e5ff' }}></div>
                        </div>
                      </div>
                      <div className="metric-row" style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Tempo: {analysisResult.stats.tempo} BPM</span>
                      </div>
                    </div>
                  </div>
                ) : (
                   <p style={{ color: 'red' }}>{error}</p>
                )}
              </div>
              

            </div>

            {!isAnalyzing && (recommendations.length > 0 || languageRecommendations.length > 0) && (
              <>
                <div style={{ marginTop: '3rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', minWidth: 0 }}>
                {/* Global Recommendations Column */}
                <div style={{ minWidth: 0 }}>
                  <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Play size={24} color="var(--accent-color)"/> Global Recommendations
                    </div>
                    <button onClick={refreshGlobal} disabled={isRefreshingGlobal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <RefreshCw size={28} style={{ animation: isRefreshingGlobal ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                  </h2>
                  <div className="list-view" style={{ minWidth: 0 }} onScroll={handleScrollGlobal}>
                    {recommendations.map((track) => (
                      <div key={track.id} className="list-item-card" style={{
                        backgroundColor: currentPlayingTrack?.id === track.id ? 'hsla(var(--primary-hue), 30%, 20%, 0.9)' : undefined,
                        borderColor: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : undefined
                      }}>
                        <img src={track.art} alt={track.title} className="list-track-art" />
                        <div className="list-track-info">
                          <span className="track-title" style={{ color: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : 'inherit' }}>
                            {track.title}
                          </span>
                          <span className="track-artist">{track.artist}</span>
                        </div>
                        {currentPlayingTrack?.id === track.id && <SoundBars />}
                        <TrackPlayButton track={track} onPlay={setCurrentPlayingTrack} />
                      </div>
                    ))}
                    {isFetchingMoreGlobal && (
                      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto' }}></div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Local Recommendations Column */}
                <div style={{ minWidth: 0 }}>
                  <h2 className="section-title" style={{ color: 'var(--success-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Music size={24} color="var(--success-color)"/> {analysisResult?.language || selectedTrack.genre} Recommendations
                    </div>
                    <button onClick={refreshGenre} disabled={isRefreshingGenre} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                      <RefreshCw size={28} style={{ animation: isRefreshingGenre ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                  </h2>
                  <div className="list-view" onScroll={handleScrollGenre}>
                    {languageRecommendations.map((track) => (
                      <div key={track.id} className="list-item-card" style={{ 
                        borderColor: 'var(--success-color)',
                        backgroundColor: currentPlayingTrack?.id === track.id ? 'hsla(var(--primary-hue), 30%, 20%, 0.9)' : undefined,
                      }}>
                        <img src={track.art} alt={track.title} className="list-track-art" />
                        <div className="list-track-info">
                          <span className="track-title" style={{ color: currentPlayingTrack?.id === track.id ? 'var(--success-color)' : 'inherit' }}>
                            {track.title}
                          </span>
                          <span className="track-artist">{track.artist}</span>
                        </div>
                        {currentPlayingTrack?.id === track.id && <SoundBars />}
                        <TrackPlayButton track={track} onPlay={setCurrentPlayingTrack} />
                      </div>
                    ))}
                    {isFetchingMoreGenre && (
                      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto', borderColor: 'var(--surface-color)', borderTopColor: 'var(--success-color)' }}></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div style={{ marginTop: '4rem', paddingBottom: '2rem' }}>
                <div className="regional-header" style={{ marginBottom: '1rem' }}>
                  <div className="regional-title">
                    <h2>Explore More Regions</h2>
                  </div>
                  <div className="region-toggle">
                    <button 
                      className={activeRegion === 'Indian' ? 'active' : ''} 
                      onClick={() => { setActiveRegion('Indian'); setActiveLanguage(null); }}
                    >
                      Indian
                    </button>
                    <button 
                      className={activeRegion === 'Global' ? 'active' : ''} 
                      onClick={() => { setActiveRegion('Global'); setActiveLanguage(null); }}
                    >
                      Global
                    </button>
                  </div>
                </div>
                <div className="language-chips-container">
                  {(activeRegion === 'Indian' ? INDIAN_LANGUAGES : GLOBAL_LANGUAGES).map(lang => (
                    <button
                      key={lang}
                      className={`language-chip ${activeLanguage === lang ? 'active' : ''}`}
                      onClick={() => {
                        if (activeLanguage !== lang) {
                          setActiveLanguage(lang);
                        }
                      }}
                    >
                      {lang}
                    </button>
                  ))}
                </div>

                {activeLanguage ? (
                  isRegionalLoading ? (
                    <div className="regional-loading">
                      <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                      <p>Fetching top {activeLanguage} hits...</p>
                    </div>
                  ) : regionalSongs.length > 0 ? (
                    <div className="list-view" style={{ maxHeight: '55vh', overflowY: 'auto', paddingRight: '0.5rem', marginTop: '1rem' }}>
                      {regionalSongs.map((track) => (
                        <div 
                          key={track.id} 
                          className="list-item-card" 
                          onClick={() => setCurrentPlayingTrack(track)} 
                          style={{ 
                            cursor: 'pointer',
                            backgroundColor: currentPlayingTrack?.id === track.id ? 'hsla(var(--primary-hue), 30%, 20%, 0.9)' : undefined,
                            borderColor: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : undefined
                          }}
                        >
                          <img src={track.art || '/default-art.png'} alt={track.title} className="list-track-art" />
                          <div className="list-track-info">
                            <span className="track-title" style={{ color: currentPlayingTrack?.id === track.id ? 'var(--accent-color)' : 'inherit' }}>
                              {track.title}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span className="track-artist">{track.artist}</span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>•</span>
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{track.duration || '0:00'}</span>
                            </div>
                          </div>
                          {currentPlayingTrack?.id === track.id && <SoundBars />}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="regional-loading">
                      <p>No trending songs found for {activeLanguage}.</p>
                    </div>
                  )
                ) : null}
              </div>
              </>
            )}
          </div>
        )}
      </div>
      <footer className="app-footer">
        <p>SonicView &copy; 2026 &bull; Engineered by Agnish</p>
      </footer>
    </div>
  );
}

export default App;
