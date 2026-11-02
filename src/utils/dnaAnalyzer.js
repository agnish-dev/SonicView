// src/utils/dnaAnalyzer.js
// Client-side Music DNA Synthesizer (Instant 3D DNA analysis without server dependency)

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function synthesizeMusicDNA(track) {
  if (!track) return null;

  const title = (track.title || '').toLowerCase();
  const artist = (track.artist || '').toLowerCase();
  const text = `${title} ${artist}`;
  const seed = simpleHash(track.id || track.title || 'sonic');

  // 1. Language Detection
  let language = 'International';
  if (/[\u0900-\u097F]/.test(text) || /\b(arijit|pritam|shreya|kishore|lata|arijit|armaan|badshah|kumar|alka|udit|neha|jubin|atif|sonu|arijit singh|bollywood|hindi)\b/.test(text)) {
    language = 'Hindi';
  } else if (/[\u0A00-\u0A7F]/.test(text) || /\b(diljit|sidhu|ap dhillon|karan aujla|shubh|punjabi|bhangra|jatt)\b/.test(text)) {
    language = 'Punjabi';
  } else if (/[\u0B80-\u0BFF]/.test(text) || /\b(anirudh|ar rahman|yuvan|harris jayaraj|sid sriram|tamil)\b/.test(text)) {
    language = 'Tamil';
  } else if (/[\u0C00-\u0C7F]/.test(text) || /\b(thaman|devi sri prasad|telugu)\b/.test(text)) {
    language = 'Telugu';
  } else if (/\b(bts|blackpink|stray kids|k-pop|newjeans)\b/.test(text)) {
    language = 'K-Pop';
  }

  // 2. Mood & Energy Extraction
  let mood = 'Dynamic & Melodic';
  let energyBase = 0.65;
  let valenceBase = 0.60;
  let danceBase = 0.58;
  let tempoBase = 110;
  let aestheticTags = ['Pop', 'Melodic'];

  if (/\b(love|ishq|pyaar|dil|romance|saath|tere bina|tum hi|heart|humsafar|deewana|romantic)\b/.test(text)) {
    mood = 'Romantic & Soulful';
    energyBase = 0.52;
    valenceBase = 0.75;
    danceBase = 0.48;
    tempoBase = 92;
    aestheticTags = ['Romantic', 'Emotional', 'Acoustic', language];
  } else if (/\b(sad|judaai|dard|lonely|alone|cry|tears|broken|heartbreak|alvida|tujhe bhula|gham)\b/.test(text)) {
    mood = 'Melancholic & Reflective';
    energyBase = 0.42;
    valenceBase = 0.32;
    danceBase = 0.40;
    tempoBase = 84;
    aestheticTags = ['Sad', 'Melancholic', 'Nostalgic', language];
  } else if (/\b(party|nach|dance|club|dhol|daru|bhangra|bass|remix|dj|beat|fest|rock)\b/.test(text)) {
    mood = 'Energetic & Euphoric';
    energyBase = 0.88;
    valenceBase = 0.82;
    danceBase = 0.86;
    tempoBase = 128;
    aestheticTags = ['Party', 'High Energy', 'Dance', 'EDM'];
  } else if (/\b(chill|lofi|lo-fi|night|rain|coffee|sleep|relax|calm|peace|slowed)\b/.test(text)) {
    mood = 'Atmospheric & Chill';
    energyBase = 0.38;
    valenceBase = 0.50;
    danceBase = 0.45;
    tempoBase = 78;
    aestheticTags = ['Chillout', 'Ambient', 'Late Night Coding', 'Lo-fi'];
  } else {
    aestheticTags = ['Chart Toppers', 'Contemporary', 'Popular', language];
  }

  // Deterministic Jitter so every song has unique, realistic numbers
  const energy = Math.min(0.95, Math.max(0.2, energyBase + ((seed % 21) - 10) / 100));
  const valence = Math.min(0.95, Math.max(0.2, valenceBase + (((seed >> 2) % 21) - 10) / 100));
  const danceability = Math.min(0.95, Math.max(0.2, danceBase + (((seed >> 4) % 21) - 10) / 100));
  const instrumentalness = Math.min(0.3, Math.max(0.01, (((seed >> 6) % 15) + 1) / 100));
  const tempo = Math.round(tempoBase + ((seed % 31) - 15));

  // Year & Era extraction
  const yearMatch = text.match(/\b(19\d\d|20\d\d)\b/);
  const releaseYear = yearMatch ? yearMatch[1] : (2020 + (seed % 5)).toString();
  const era = parseInt(releaseYear) < 2000 ? 'Retro Era' : parseInt(releaseYear) < 2015 ? '2000s Era' : 'Modern Era';

  return {
    ai_artist: track.artist || 'Featured Artist',
    ai_album: track.title || 'Official Single',
    mood,
    language,
    release_time: releaseYear,
    era,
    description: `A distinctive ${mood.toLowerCase()} arrangement combining dynamic rhythmic foundations with expressive vocal textures.`,
    aesthetic_tags: aestheticTags,
    stats: {
      energy: parseFloat(energy.toFixed(2)),
      valence: parseFloat(valence.toFixed(2)),
      danceability: parseFloat(danceability.toFixed(2)),
      instrumentalness: parseFloat(instrumentalness.toFixed(2)),
      tempo
    }
  };
}
