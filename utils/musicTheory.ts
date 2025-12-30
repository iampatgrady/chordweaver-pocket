import { Note, ChordQuality, ChordDefinition, FunctionType } from '../types';

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Simple interval mapping (semitones)
const SCALES = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10], // Natural Minor
};

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  'Maj': [0, 4, 7],
  'min': [0, 3, 7],
  '7': [0, 4, 7, 10],
  'Maj7': [0, 4, 7, 11],
  'min7': [0, 3, 7, 10],
  'dim': [0, 3, 6]
};

const getNoteIndex = (note: string) => NOTES.indexOf(note);

const getNoteFromInterval = (root: string, semitones: number): string => {
  const rootIdx = getNoteIndex(root);
  return NOTES[(rootIdx + semitones) % 12];
};

export const getChordNotes = (root: string, quality: ChordQuality): string[] => {
  const intervals = CHORD_INTERVALS[quality];
  return intervals.map(interval => getNoteFromInterval(root, interval));
};

// Returns the diatonic chords for a Key
export const getDiatonicChords = (keyRoot: string, scaleType: 'Major' | 'Minor'): ChordDefinition[] => {
  // Logic for Major Scale Diatonic Chords: I, ii, iii, IV, V, vi, vii°
  // Simplified for Pop/Rock: I, ii, iii, IV, V, vi
  
  if (scaleType === 'Major') {
    const scaleIndices = SCALES.Major;
    const qualities: ChordQuality[] = ['Maj', 'min', 'min', 'Maj', 'Maj', 'min', 'dim'];
    const romans = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
    
    return scaleIndices.map((interval, i) => {
      const root = getNoteFromInterval(keyRoot, interval);
      return {
        root,
        quality: qualities[i],
        display: root + (qualities[i] === 'min' ? 'm' : '') + (qualities[i] === 'dim' ? '°' : ''),
        roman: romans[i],
        function: 'Main' as FunctionType,
        notes: getChordNotes(root, qualities[i])
      };
    }).slice(0, 6); // Keep top 6 for main usage (I to vi)
  } 
  
  // Basic Minor implementation (can be expanded)
  const scaleIndices = SCALES.Minor;
    const qualities: ChordQuality[] = ['min', 'dim', 'Maj', 'min', 'min', 'Maj', 'Maj'];
    const romans = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
    
    return scaleIndices.map((interval, i) => {
      const root = getNoteFromInterval(keyRoot, interval);
      return {
        root,
        quality: qualities[i],
        display: root + (qualities[i] === 'min' ? 'm' : '') + (qualities[i] === 'dim' ? '°' : ''),
        roman: romans[i],
        function: 'Main' as FunctionType,
        notes: getChordNotes(root, qualities[i])
      };
    });
};

export const getSecondaryDominants = (keyRoot: string): ChordDefinition[] => {
  // V7 (Primary), V/ii, V/iii, V/IV, V/V, V/vi
  // Target roots relative to Key Root
  const targets = [
    { interval: 0, roman: 'V7', target: 'I' },     // Primary Dominant (G7 -> C)
    { interval: 2, roman: 'V/ii', target: 'ii' }, // D in C Maj
    { interval: 4, roman: 'V/iii', target: 'iii' }, // E in C Maj
    { interval: 5, roman: 'V/IV', target: 'IV' }, // F in C Maj
    { interval: 7, roman: 'V/V', target: 'V' }, // G in C Maj
    { interval: 9, roman: 'V/vi', target: 'vi' }, // A in C Maj
  ];

  return targets.map(t => {
    // The Secondary dominant is the V of the Target.
    // Target Root:
    const targetRoot = getNoteFromInterval(keyRoot, t.interval);
    // V of Target is Target + 7 semitones
    const domRoot = getNoteFromInterval(targetRoot, 7);
    
    return {
      root: domRoot,
      quality: '7',
      display: domRoot + '7',
      roman: t.roman,
      function: 'Secondary' as FunctionType,
      target: t.target,
      notes: getChordNotes(domRoot, '7')
    };
  });
};

export const getModalInterchange = (keyRoot: string): ChordDefinition[] => {
  // Borrowed from Parallel Minor (Aeolian)
  // bIII (Major), iv (minor), bVI (Major), bVII (Major)
  
  const borrowers = [
    { interval: 3, quality: 'Maj', roman: 'bIII' },
    { interval: 5, quality: 'min', roman: 'iv' },
    { interval: 8, quality: 'Maj', roman: 'bVI' },
    { interval: 10, quality: 'Maj', roman: 'bVII' }
  ];

  return borrowers.map(b => {
    const root = getNoteFromInterval(keyRoot, b.interval);
    return {
      root,
      quality: b.quality as ChordQuality,
      display: root + (b.quality === 'min' ? 'm' : ''),
      roman: b.roman,
      function: 'Modal' as FunctionType,
      notes: getChordNotes(root, b.quality as ChordQuality)
    };
  });
};

export const getAllSuggestions = (keyRoot: string) => {
  return {
    main: getDiatonicChords(keyRoot, 'Major'),
    secondary: getSecondaryDominants(keyRoot),
    modal: getModalInterchange(keyRoot)
  };
};

export const PRESETS = {
  "Pop Anthem": [
    { rootIdx: 0, quality: 'Maj' }, // I
    { rootIdx: 4, quality: 'Maj' }, // V
    { rootIdx: 5, quality: 'min' }, // vi
    { rootIdx: 3, quality: 'Maj' }  // IV
  ],
  "Jazz Turnaround": [
    { rootIdx: 1, quality: 'min' }, // ii
    { rootIdx: 4, quality: '7' },   // V7
    { rootIdx: 0, quality: 'Maj7' } // I
  ],
  "Emotional": [
    { rootIdx: 0, quality: 'Maj' },
    { rootIdx: 2, quality: 'min' },
    { rootIdx: 3, quality: 'Maj' },
    { rootIdx: 4, quality: 'Maj' }
  ]
};