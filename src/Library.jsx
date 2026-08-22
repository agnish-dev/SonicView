
import React, { useState, useEffect } from 'react';
import { getAllSavedTracks, deleteTrackFromDB } from './utils/db.js';
import { Play, Trash2 } from 'lucide-react';

export default function Library({ onPlayTrack }) {
  const [savedTracks, setSavedTracks] = useState([]);

  useEffect(() => {
    loadTracks();
  }, []);

  const loadTracks = async () => {
    try {
      const tracks = await getAllSavedTracks();
      setSavedTracks(tracks);
    } catch (err) {
      console.error('Failed to load saved tracks', err);
    }
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await deleteTrackFromDB(id);
    loadTracks();
  };

  if (savedTracks.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
        <h2 style={{ color: 'white', marginBottom: '1rem' }}>Your Offline Library is empty</h2>
        <p>Save tracks using the download button to listen without internet.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h2 style={{ color: 'white', marginBottom: '2rem', fontSize: '1.8rem' }}>My Offline Music</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {savedTracks.map((track) => {
          const imgUrl = track.imageBlob ? URL.createObjectURL(track.imageBlob) : null;
          return (
            <div 
              key={track.id}
              onClick={() => onPlayTrack(track)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem',
                background: 'hsla(0,0%,100%,0.05)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {imgUrl && <img src={imgUrl} alt={track.title} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.1rem' }}>{track.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{track.artist}</div>
              </div>
              <button 
                onClick={(e) => handleDelete(e, track.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ff3d3d',
                  cursor: 'pointer',
                  padding: '0.5rem'
                }}
                title="Remove from Library"
              >
                <Trash2 size={20} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

