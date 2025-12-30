
import { ChordBlock, ChordDefinition, GenreType, Note } from "../types";
import { getAllSuggestions, getChordByRoman, getHarmonicFunction } from "../utils/musicTheory";

// --- Genre Profiles ---

interface GenreProfile {
  name: GenreType;
  complexity: number; // 0-1 (Triads vs Extensions)
  secondaryChance: number; // 0-1
  modalChance: number; // 0-1
  harmonicRhythm: 'fast' | 'slow';
  transitionMatrix: Record<'Tonic' | 'Subdominant' | 'Dominant', Record<string, number>>;
}

const GENRES: Record<GenreType, GenreProfile> = {
  'Pop': {
    name: 'Pop',
    complexity: 0.2,
    secondaryChance: 0.1,
    modalChance: 0.1,
    harmonicRhythm: 'slow',
    transitionMatrix: {
      'Tonic': { 'Subdominant': 0.4, 'Dominant': 0.3, 'Tonic': 0.3 }, // Prefer I -> IV or I -> V
      'Subdominant': { 'Dominant': 0.6, 'Tonic': 0.4, 'Subdominant': 0 }, // IV -> V or IV -> I (Plagal)
      'Dominant': { 'Tonic': 0.8, 'Subdominant': 0.1, 'Dominant': 0.1 } // V -> I
    }
  },
  'Jazz': {
    name: 'Jazz',
    complexity: 0.8,
    secondaryChance: 0.4, // High Secondary Dominants (V/ii, V/V)
    modalChance: 0.2,
    harmonicRhythm: 'fast',
    transitionMatrix: {
      'Tonic': { 'Subdominant': 0.5, 'Dominant': 0.3, 'Tonic': 0.2 }, // ii-V-I focus
      'Subdominant': { 'Dominant': 0.9, 'Tonic': 0.1, 'Subdominant': 0 }, // ii -> V almost always
      'Dominant': { 'Tonic': 0.7, 'Subdominant': 0, 'Dominant': 0.3 } // V -> I or chain V -> V
    }
  },
  'Rock': {
    name: 'Rock',
    complexity: 0.1,
    secondaryChance: 0.2,
    modalChance: 0.3, // Mixolydian/Dorian influence (bVII, bIII)
    harmonicRhythm: 'slow',
    transitionMatrix: {
      'Tonic': { 'Subdominant': 0.4, 'Dominant': 0.4, 'Tonic': 0.2 },
      'Subdominant': { 'Dominant': 0.4, 'Tonic': 0.5, 'Subdominant': 0.1 },
      'Dominant': { 'Subdominant': 0.4, 'Tonic': 0.6, 'Dominant': 0 } // V -> IV allowed in Rock
    }
  },
  'LoFi': {
    name: 'LoFi',
    complexity: 0.6, // Maj7s, min9s
    secondaryChance: 0.1,
    modalChance: 0.4, // Nostalgic shifts
    harmonicRhythm: 'slow',
    transitionMatrix: {
      'Tonic': { 'Subdominant': 0.6, 'Dominant': 0.1, 'Tonic': 0.3 },
      'Subdominant': { 'Dominant': 0.2, 'Tonic': 0.6, 'Subdominant': 0.2 }, // IV <-> I loitering
      'Dominant': { 'Tonic': 0.9, 'Subdominant': 0.1, 'Dominant': 0 }
    }
  }
};

// --- Logic ---

const getRandomWeighted = (options: { item: string, weight: number }[]) => {
    const totalWeight = options.reduce((sum, opt) => sum + opt.weight, 0);
    let random = Math.random() * totalWeight;
    for (const opt of options) {
        if (random < opt.weight) return opt.item;
        random -= opt.weight;
    }
    return options[0].item;
};

export const generateProgression = (
    keyRoot: Note,
    genreName: GenreType,
    length: number = 4
): ChordBlock[] => {
    const genre = GENRES[genreName];
    const available = getAllSuggestions(keyRoot);
    const progression: ChordBlock[] = [];
    
    // Step 1: Start with Tonic (I) or Relative Minor (vi)
    // 80% I, 20% vi
    const startRoman = Math.random() > 0.2 ? 'I' : 'vi';
    let currentChord = getChordByRoman(keyRoot, startRoman) || available.main[0];
    
    // Add first chord
    progression.push(createBlock(currentChord));

    // Step 2: Loop
    for (let i = 1; i < length; i++) {
        let nextChord: ChordDefinition;

        // --- CONSTRAINT: The Arrow Rule ---
        // If prev was Secondary Dominant (e.g., V/ii), we MUST go to target (ii)
        if (currentChord.function === 'Secondary' && currentChord.target) {
            nextChord = getChordByRoman(keyRoot, currentChord.target) || available.main[0];
        } else {
            // --- Probabilistic Selection ---
            const currentFunc = getHarmonicFunction(currentChord.roman);
            const transitions = genre.transitionMatrix[currentFunc];
            
            // Pick next function class (Tonic, Sub, Dom)
            const nextFuncType = getRandomWeighted(
                Object.entries(transitions).map(([k, v]) => ({ item: k, weight: v }))
            );

            // Filter available chords by this function type
            let candidates = [...available.main].filter(c => getHarmonicFunction(c.roman) === nextFuncType);

            // --- Modal Interchange Injection ---
            if (Math.random() < genre.modalChance) {
                const modalCandidates = available.modal.filter(c => getHarmonicFunction(c.roman) === nextFuncType);
                if (modalCandidates.length > 0) candidates = [...candidates, ...modalCandidates];
            }

            // --- Secondary Dominant Injection ---
            // Only if target is 'Dominant' or 'Subdominant' usually
            if (Math.random() < genre.secondaryChance) {
                 const secCandidates = available.secondary; 
                 // We don't filter secondary by 'function' map usually, we just pick one.
                 // Ideally, we pick a secondary that resolves to something likely.
                 // Simplified: Allow random secondary.
                 candidates = [...candidates, ...secCandidates];
            }

            // Fallback
            if (candidates.length === 0) candidates = available.main;

            // Pick one from candidates
            nextChord = candidates[Math.floor(Math.random() * candidates.length)];
        }

        progression.push(createBlock(nextChord));
        currentChord = nextChord;
    }

    return progression;
};

const createBlock = (def: ChordDefinition): ChordBlock => ({
    id: Math.random().toString(36).substr(2, 9),
    root: def.root,
    quality: def.quality,
    duration: 4,
    functionLabel: def.function,
    roman: def.roman
});
