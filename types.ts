
export type Note = string;
export type ChordQuality = 'Maj' | 'min' | '7' | 'min7' | 'Maj7' | 'dim';
export type FunctionType = 'Main' | 'Secondary' | 'Modal';

export interface ChordDefinition {
  root: Note;
  quality: ChordQuality;
  display: string;
  roman: string;
  function: FunctionType;
  target?: string; // For secondary dominants (e.g., "Resolves to Dm")
  notes: string[]; // Frequencies or note names
}

export interface ChordBlock {
  id: string;
  root: Note;
  quality: ChordQuality;
  duration: number; // in beats (4 = 1 bar)
  functionLabel: FunctionType;
  roman?: string; // Analysis (e.g., "V7")
}

export interface SongPart {
  id: string;
  name: string; // "Verse", "Chorus"
  progression: ChordBlock[];
  lyrics?: string; // Persisted lyrics for this part
}

export interface Song {
  id: string; // Unique ID for storage
  title: string;
  keyRoot: Note;
  scaleType: 'Major' | 'Minor';
  parts: SongPart[];
  arrangement: string[]; // Array of Part IDs
  bpm: number;
  vibe: 'Piano' | 'Strum' | 'Synth';
  lastModified: number; // Timestamp
}

export interface PlaybackState {
  isPlaying: boolean;
  currentPartIndex: number; // Index in arrangement
  currentBlockIndex: number; // Index in progression
  currentBeat: number;
}