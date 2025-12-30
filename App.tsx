import React, { useState, useEffect, useRef } from 'react';
import { Song, SongPart, ChordBlock, ChordDefinition, Note, GenreType } from './types';
import { engine } from './services/audioEngine';
import { generateSongLyrics } from './services/geminiService';
import { generateProgression } from './services/generativeEngine';
import ChordSelector from './components/ChordSelector';
import { 
  Play, Pause, Plus, Music, Settings, 
  Trash2, Wand2, ArrowLeftRight, Mic, Loader2, StopCircle,
  ListMusic, Layout, X, ChevronUp, ChevronDown, 
  FolderOpen, Save, FilePlus, Clock, Check, Edit3, Sparkles, PenTool
} from 'lucide-react';
import clsx from 'clsx';
import { getDiatonicChords } from './utils/musicTheory';

// Initial Empty Song State
const createInitialSong = (): Song => ({
  id: Math.random().toString(36).substr(2, 9),
  title: "New Idea",
  keyRoot: 'C',
  scaleType: 'Major',
  bpm: 100,
  vibe: 'Piano',
  parts: [
    { id: 'p1', name: 'Verse 1', progression: [] },
    { id: 'p2', name: 'Chorus', progression: [] }
  ],
  arrangement: ['p1', 'p2'],
  lastModified: Date.now()
});

const App: React.FC = () => {
  // App State
  const [song, setSong] = useState<Song>(createInitialSong());
  const [savedSongs, setSavedSongs] = useState<Song[]>([]);
  
  const [activePartId, setActivePartId] = useState<string>('p1');
  const [view, setView] = useState<'compose' | 'arrange'>('compose');
  
  // Modals & Panels
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState(false);
  const [isWandOpen, setIsWandOpen] = useState(false);
  
  // Wand Settings
  const [wandGenre, setWandGenre] = useState<GenreType>('Pop');

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingPartId, setPlayingPartId] = useState<string | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(-1);
  const [playbackMode, setPlaybackMode] = useState<'part' | 'song'>('part');
  
  // Queue State for Arrangement
  const [queuedPartIndex, setQueuedPartIndex] = useState<number | null>(null);
  
  // Gemini State
  const [isGenerating, setIsGenerating] = useState(false);
  const [isManualEditing, setIsManualEditing] = useState(false); // Helper to show textarea if lyrics are empty

  // Refs
  const playbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const songRef = useRef(song);
  const activePartIdRef = useRef(activePartId);
  const arrangementIndexRef = useRef(0);
  const queuedArrangementIndexRef = useRef<number | null>(null);
  const isLoadedRef = useRef(false); // Guard for initial load vs save

  // --- Persistence Logic ---

  // Load from LocalStorage on Mount
  useEffect(() => {
    // 1. Load the active workspace (auto-save)
    const storedCurrent = localStorage.getItem('chordFiles_current');
    if (storedCurrent) {
      try {
        const parsed = JSON.parse(storedCurrent);
        // Ensure ID exists for legacy data support
        if (!parsed.id) parsed.id = Math.random().toString(36).substr(2, 9);
        setSong(parsed);
        if (parsed.parts.length > 0) setActivePartId(parsed.parts[0].id);
      } catch (e) {
        console.error("Failed to parse stored song", e);
      }
    }

    // 2. Load the library
    const storedLibrary = localStorage.getItem('chordFiles_library');
    if (storedLibrary) {
      try {
        setSavedSongs(JSON.parse(storedLibrary));
      } catch (e) {
        console.error("Failed to parse library", e);
      }
    }
    
    // Mark as loaded so subsequent effects can save safely
    isLoadedRef.current = true;
  }, []);

  // Auto-save workspace on song change
  useEffect(() => {
    if (!isLoadedRef.current) return; // Prevent overwriting with initial state on load
    songRef.current = song;
    localStorage.setItem('chordFiles_current', JSON.stringify(song));
  }, [song]);

  useEffect(() => {
    activePartIdRef.current = activePartId;
  }, [activePartId]);
  
  const activePart = song.parts.find(p => p.id === activePartId) || song.parts[0];
  const playingPart = song.parts.find(p => p.id === playingPartId);

  // Visualization Logic
  const displayChord = (isPlaying && playingPart && playingPart.progression[playbackIndex]) 
    ? playingPart.progression[playbackIndex] 
    : null;

  useEffect(() => {
    // Initialize Audio Engine on first interaction
    const initAudio = () => engine.init();
    window.addEventListener('click', initAudio, { once: true });
    return () => window.removeEventListener('click', initAudio);
  }, []);

  // --- Playback Engine (Defined early for usage in actions) ---

  const startPlayback = (mode: 'part' | 'song', startIndex: number = 0) => {
    setIsPlaying(true);
    let currentIndex = 0;
    
    // Setup initial state based on mode
    let currentPartId = '';
    
    if (mode === 'song') {
        arrangementIndexRef.current = startIndex;
        currentPartId = songRef.current.arrangement[startIndex];
    } else {
        currentPartId = activePartIdRef.current;
    }
    
    // Safety check
    if (!currentPartId) {
        stopPlayback();
        return;
    }

    setPlayingPartId(currentPartId);

    // Initial Part Lookup
    let part = songRef.current.parts.find(p => p.id === currentPartId);
    if (!part || part.progression.length === 0) {
      // If song mode and first part empty/missing, try next?
      // For simplicity, just stop if start is invalid
      if(mode === 'part') {
         stopPlayback();
         return;
      }
    }

    const playNext = () => {
      // 1. Resolve Current Part & Block
      // In Song Mode, currentPartId comes from arrangement array
      // In Part Mode, we stick to the `currentPartId` variable (closure) 
      // until the sequence finishes and we loop, where we then check activePartIdRef.
      
      if (mode === 'song') {
        currentPartId = songRef.current.arrangement[arrangementIndexRef.current];
      }

      part = songRef.current.parts.find(p => p.id === currentPartId);

      // If part doesn't exist or empty, handle transition
      if (!part || part.progression.length === 0) {
         if (mode === 'song') {
            // Skip empty part in song mode
            const nextArrIndex = arrangementIndexRef.current + 1;
             if (nextArrIndex >= songRef.current.arrangement.length) {
              stopPlayback();
              return;
            }
            arrangementIndexRef.current = nextArrIndex;
            currentIndex = 0;
            playNext(); // Recurse immediately
            return;
         } else {
           stopPlayback();
           return;
         }
      }

      // 2. Check Sequence End
      if (currentIndex >= part.progression.length) {
        if (mode === 'song') {
            // Advance to next part in arrangement
            let nextArrIndex = arrangementIndexRef.current + 1;

            // Check if user queued a specific part
            if (queuedArrangementIndexRef.current !== null) {
                nextArrIndex = queuedArrangementIndexRef.current;
                queuedArrangementIndexRef.current = null;
                setQueuedPartIndex(null);
            }

            // Loop logic: if we go past the end, wrap around to 0
            if (nextArrIndex >= songRef.current.arrangement.length) {
              nextArrIndex = 0;
            }
            
            arrangementIndexRef.current = nextArrIndex;
            currentIndex = 0;
            // Loop updates will be handled in next recursion step 
            // but we need to update state now for UI
            const nextPartId = songRef.current.arrangement[nextArrIndex];
            setPlayingPartId(nextPartId);
            playNext();
            return;
        } else {
           // Part Mode: Loop
           // Here we switch to the currently selected part if the user changed it
           currentPartId = activePartIdRef.current;
           setPlayingPartId(currentPartId); 
           currentIndex = 0;
           playNext();
           return;
        }
      }
      
      // 3. Play Chord
      const block = part.progression[currentIndex];
      if (!block) {
        stopPlayback();
        return;
      }

      // Update UI
      setPlayingPartId(currentPartId); 
      setPlaybackIndex(currentIndex);
      
      const beatDuration = 60 / songRef.current.bpm;
      const totalDuration = block.duration * beatDuration;
      
      engine.playChord(block.root, block.quality, totalDuration, songRef.current.vibe);

      playbackRef.current = setTimeout(() => {
        currentIndex++;
        playNext();
      }, totalDuration * 1000);
    };

    playNext();
  };

  const stopPlayback = () => {
    setIsPlaying(false);
    setPlaybackIndex(-1);
    setPlayingPartId(null);
    setQueuedPartIndex(null);
    queuedArrangementIndexRef.current = null;
    if (playbackRef.current) {
      clearTimeout(playbackRef.current);
      playbackRef.current = null;
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      stopPlayback();
    } else {
      // Determine mode based on current view
      const mode = view === 'arrange' ? 'song' : 'part';
      setPlaybackMode(mode);
      startPlayback(mode, 0);
    }
  };

  // --- Library Actions ---

  const handleSaveToLibrary = () => {
    const updatedSong = { ...song, lastModified: Date.now() };
    setSong(updatedSong); // Update timestamp in current state

    setSavedSongs(prev => {
      const existingIdx = prev.findIndex(s => s.id === updatedSong.id);
      let newLibrary;
      if (existingIdx >= 0) {
        newLibrary = [...prev];
        newLibrary[existingIdx] = updatedSong;
      } else {
        newLibrary = [updatedSong, ...prev];
      }
      localStorage.setItem('chordFiles_library', JSON.stringify(newLibrary));
      return newLibrary;
    });
    
    // Simple visual feedback could go here
    setIsLibraryOpen(false);
  };

  const handleLoadSong = (loadedSong: Song) => {
    stopPlayback();
    setSong(loadedSong);
    if (loadedSong.parts.length > 0) {
      setActivePartId(loadedSong.parts[0].id);
    }
    setIsLibraryOpen(false);
  };

  const handleDeleteSong = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this song?")) return;
    
    setSavedSongs(prev => {
      const newLibrary = prev.filter(s => s.id !== id);
      localStorage.setItem('chordFiles_library', JSON.stringify(newLibrary));
      return newLibrary;
    });
  };

  const handleNewProject = () => {
    if (window.confirm("Start a new project? Unsaved changes to the current project will be lost.")) {
      stopPlayback();
      const newSong = createInitialSong();
      
      // Explicitly clear the 'current' storage to avoid merge issues
      localStorage.removeItem('chordFiles_current');
      
      setSong(newSong);
      setActivePartId(newSong.parts[0].id);
      setIsLibraryOpen(false);
      
      // Reset isLoaded ref briefly to prevent race condition saving old data
      isLoadedRef.current = false;
      setTimeout(() => { isLoadedRef.current = true; }, 100);
    }
  };

  // --- Composition Actions ---

  const handlePartSelect = (partId: string) => {
    setActivePartId(partId);
    // Playback continues on the current part until the loop finishes, then picks up the new partId
  };

  const handleAddPart = () => {
    const nextNum = song.parts.length + 1;
    const newPart: SongPart = {
      id: Math.random().toString(36).substr(2, 9),
      name: `Part ${nextNum}`,
      progression: []
    };
    setSong(prev => ({
      ...prev,
      parts: [...prev.parts, newPart],
      // Do not auto-add to arrangement, let user do that in arrange view
    }));
    setActivePartId(newPart.id);
  };

  const handleAddChord = (chordDef: ChordDefinition) => {
    const newBlock: ChordBlock = {
      id: Math.random().toString(36).substr(2, 9),
      root: chordDef.root,
      quality: chordDef.quality,
      duration: 4, 
      functionLabel: chordDef.function,
      roman: chordDef.roman
    };

    const updatedParts = song.parts.map(p => {
      if (p.id === activePartId) {
        return { ...p, progression: [...p.progression, newBlock] };
      }
      return p;
    });

    setSong({ ...song, parts: updatedParts });
    setIsDrawerOpen(false);
    engine.playChord(chordDef.root, chordDef.quality, 0.5, song.vibe);
  };

  const handleRemoveChord = (chordIdx: number) => {
    const updatedParts = song.parts.map(p => {
      if (p.id === activePartId) {
        const newProg = [...p.progression];
        newProg.splice(chordIdx, 1);
        return { ...p, progression: newProg };
      }
      return p;
    });
    setSong({ ...song, parts: updatedParts });
  };

  // --- Arrangement Actions ---

  const handleArrangementPartClick = (index: number) => {
    if (isPlaying && playbackMode === 'song') {
        // Queue this part to play next
        queuedArrangementIndexRef.current = index;
        setQueuedPartIndex(index);
    } else {
        // Start playback from this part
        setPlaybackMode('song');
        startPlayback('song', index);
    }
  };

  const addToArrangement = (partId: string) => {
    setSong(prev => ({
      ...prev,
      arrangement: [...prev.arrangement, partId]
    }));
  };

  const removeFromArrangement = (index: number) => {
    setSong(prev => {
      const newArr = [...prev.arrangement];
      newArr.splice(index, 1);
      return { ...prev, arrangement: newArr };
    });
  };

  const moveArrangementItem = (index: number, direction: 'up' | 'down') => {
    setSong(prev => {
      const newArr = [...prev.arrangement];
      if (direction === 'up' && index > 0) {
        [newArr[index], newArr[index - 1]] = [newArr[index - 1], newArr[index]];
      } else if (direction === 'down' && index < newArr.length - 1) {
        [newArr[index], newArr[index + 1]] = [newArr[index + 1], newArr[index]];
      }
      return { ...prev, arrangement: newArr };
    });
  };

  // --- Features ---

  const handleMagicWandClick = () => {
      setIsWandOpen(true);
  };

  const executeMagicWand = () => {
    const newBlocks = generateProgression(song.keyRoot, wandGenre, 4);

    const updatedParts = song.parts.map(p => {
      if (p.id === activePartId) {
        return { ...p, progression: [...p.progression, ...newBlocks] };
      }
      return p;
    });
    
    setSong({ ...song, parts: updatedParts });
    setIsWandOpen(false);
  };

  const handleGenerateLyrics = async () => {
    if (activePart.progression.length === 0) return;
    setIsGenerating(true);
    
    // Call the updated service
    const lyrics = await generateSongLyrics(song, activePartId);
    
    // Update the song state with the new lyrics
    const updatedParts = song.parts.map(p => {
        if (p.id === activePartId) {
            return { ...p, lyrics: lyrics };
        }
        return p;
    });
    setSong({ ...song, parts: updatedParts });
    setIsGenerating(false);
    setIsManualEditing(false); // Switch to viewing lyrics
  };

  const handleUpdateLyrics = (text: string) => {
    const updatedParts = song.parts.map(p => {
        if (p.id === activePartId) {
            return { ...p, lyrics: text };
        }
        return p;
    });
    setSong({ ...song, parts: updatedParts });
  };

  const handleOpenLyrics = () => {
      setIsLyricsOpen(true);
      // If there's content, we are in editing mode implicitly. 
      // If it's empty, we are in 'choice' mode, handled by the UI check.
      setIsManualEditing(false);
  };
  
  const hasLyrics = activePart.lyrics && activePart.lyrics.trim().length > 0;
  const showEditor = hasLyrics || isManualEditing;

  return (
    <div className="flex flex-col h-full bg-gray-950 text-white font-sans overflow-hidden">
      
      {/* Header */}
      <header className="px-3 py-3 bg-gray-900 border-b border-gray-800 flex justify-between items-center z-20 shadow-md flex-shrink-0">
        <div className="flex flex-col">
          <h1 className="text-[10px] text-gray-500 uppercase tracking-widest font-bold leading-tight">Chord Weaver</h1>
          <div className="flex items-center gap-2">
             <input 
               type="text" 
               value={song.title}
               onChange={(e) => setSong({...song, title: e.target.value})}
               className="font-bold text-base text-white bg-transparent outline-none w-32 placeholder-gray-600 focus:text-accent-blue transition-colors"
               placeholder="Song Title"
             />
             <span className="text-gray-700 text-xs">|</span>
             <span className="text-xs text-accent-blue">{song.vibe}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <button 
             onClick={togglePlay}
             className={clsx(
               "w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm transition-all active:scale-95 border border-gray-700",
               isPlaying ? "bg-red-500/20 text-red-500 border-red-500/50" : "bg-gray-800 hover:bg-gray-700 hover:border-accent-green hover:text-accent-green"
             )}
           >
             {isPlaying ? <StopCircle size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
           </button>

           <div className="w-px h-6 bg-gray-800 mx-1"></div>

           {/* Contextual Tools based on View */}
           {view === 'compose' ? (
             <>
                <button 
                  onClick={handleOpenLyrics}
                  className={clsx(
                    "w-9 h-9 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 transition-colors",
                    activePart.lyrics ? "text-accent-blue border-accent-blue" : "text-gray-400 hover:text-white"
                  )}
                >
                  <Edit3 size={16} />
                </button>

                <button 
                  onClick={handleMagicWandClick}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-accent-orange hover:border-accent-orange transition-colors"
                >
                  <Wand2 size={16} />
                </button>

                <button 
                  onClick={() => setIsDrawerOpen(true)}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-accent-blue text-white shadow-lg shadow-accent-blue/20 hover:bg-blue-500 transition-colors"
                >
                  <Plus size={20} />
                </button>
             </>
           ) : (
             <div className="text-xs text-gray-500 font-bold uppercase tracking-wider px-2">Arranger</div>
           )}
           
           <div className="w-px h-6 bg-gray-800 mx-1"></div>

           <button 
             onClick={() => setIsLibraryOpen(true)}
             className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors"
           >
             <FolderOpen size={16} />
           </button>

           <button 
             onClick={() => setIsSettingsOpen(true)}
             className="w-9 h-9 rounded-full flex items-center justify-center bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-colors"
           >
             <Settings size={16} />
           </button>
        </div>
      </header>

      {/* Main Content Area - Swappable based on View */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* VIEW: COMPOSE */}
        {view === 'compose' && (
          <div className="flex flex-col h-full animate-in fade-in duration-300">
             {/* Playback Visualization */}
            <div className="h-1/3 min-h-[160px] flex items-center justify-center bg-gray-950 relative border-b border-gray-900 flex-shrink-0">
              {displayChord ? (
                <div className="text-center animate-pulse">
                  <div className="text-7xl font-bold text-accent-blue mb-2">
                    {displayChord.root}
                    <span className="text-4xl font-light text-gray-400 ml-1">
                        {displayChord.quality === 'min' ? 'm' : displayChord.quality}
                    </span>
                  </div>
                  <div className="text-xs uppercase tracking-widest text-gray-600 font-semibold border border-gray-800 rounded-full px-3 py-1 inline-block mt-2">
                    {displayChord.functionLabel}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center opacity-40">
                    <Music size={48} className="text-gray-700 mb-2" />
                    <div className="text-gray-600 text-sm font-mono">Select a part to play</div>
                </div>
              )}
              
              {/* Lyrics Overlay / Editor */}
              {isLyricsOpen && (
                <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 backdrop-blur-md z-20 animate-in fade-in duration-200">
                    <div className="w-full max-w-md flex flex-col h-full max-h-[500px] relative">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xs font-bold text-accent-purple uppercase tracking-widest">
                                    Lyrics: {activePart.name}
                                </h3>
                                {/* Show Regenerate button if lyrics exist */}
                                {hasLyrics && (
                                    <button 
                                      onClick={handleGenerateLyrics} 
                                      disabled={isGenerating}
                                      className="p-1.5 bg-gray-800 rounded-lg text-accent-purple hover:bg-gray-700 transition-colors"
                                      title="Regenerate with AI"
                                    >
                                       {isGenerating ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>}
                                    </button>
                                )}
                            </div>
                            <button onClick={() => setIsLyricsOpen(false)} className="text-gray-400 hover:text-white">
                                <X size={20} />
                            </button>
                        </div>
                        
                        {/* Editor Area */}
                        {showEditor ? (
                            <textarea
                                className="flex-1 bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-lg font-serif leading-relaxed resize-none focus:outline-none focus:border-accent-purple text-white placeholder-gray-600"
                                placeholder="Start typing lyrics..."
                                value={activePart.lyrics || ""}
                                onChange={(e) => handleUpdateLyrics(e.target.value)}
                                autoFocus
                            />
                        ) : (
                            /* Empty State Choices */
                            <div className="flex-1 flex flex-col items-center justify-center gap-6 border-2 border-dashed border-gray-800 rounded-xl bg-gray-900/50">
                                <div className="text-center">
                                    <p className="text-gray-400 text-sm mb-4">No lyrics yet. How do you want to start?</p>
                                </div>
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => setIsManualEditing(true)}
                                        className="flex flex-col items-center justify-center w-24 h-24 bg-gray-800 rounded-2xl hover:bg-gray-700 border border-gray-700 hover:border-gray-500 transition-all group"
                                    >
                                        <Edit3 size={24} className="text-gray-400 group-hover:text-white mb-2" />
                                        <span className="text-xs font-bold text-gray-500 group-hover:text-white">Write</span>
                                    </button>
                                    
                                    <button 
                                        onClick={handleGenerateLyrics}
                                        disabled={isGenerating || activePart.progression.length === 0}
                                        className="flex flex-col items-center justify-center w-24 h-24 bg-gray-800 rounded-2xl hover:bg-gray-700 border border-gray-700 hover:border-accent-purple transition-all group relative overflow-hidden"
                                    >
                                        {isGenerating ? (
                                            <Loader2 size={24} className="text-accent-purple animate-spin mb-2" />
                                        ) : (
                                            <Sparkles size={24} className="text-accent-purple mb-2" />
                                        )}
                                        <span className="text-xs font-bold text-gray-500 group-hover:text-white">AI Generate</span>
                                        {!activePart.progression.length && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-center p-1 font-bold text-red-400">
                                                Add Chords First
                                            </div>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
              )}
            </div>

            {/* Timeline Editor */}
            <div className="flex-1 bg-gray-900/50 flex flex-col min-h-0">
              {/* Part Tabs */}
              <div className="flex bg-gray-900 border-b border-gray-800 overflow-x-auto no-scrollbar flex-shrink-0">
                {song.parts.map(part => {
                  const romanProg = part.progression.map(b => b.roman).filter(Boolean).slice(0, 4).join(' - ');
                  
                  // NEW: Calculate progress for this part if it is playing
                  const isPlayingThisPart = isPlaying && playingPartId === part.id;
                  let progress = 0;
                  let transitionDuration = 0;

                  if (isPlayingThisPart && playbackIndex >= 0 && playbackIndex < part.progression.length) {
                       const totalBeats = part.progression.reduce((s, b) => s + b.duration, 0);
                       let accumulatedBeats = 0;
                       for (let i=0; i <= playbackIndex; i++) {
                           accumulatedBeats += part.progression[i].duration;
                       }
                       progress = totalBeats > 0 ? (accumulatedBeats / totalBeats) * 100 : 0;
                       
                       const currentBlock = part.progression[playbackIndex];
                       const beatDuration = 60 / song.bpm;
                       transitionDuration = currentBlock.duration * beatDuration;
                  }

                  return (
                    <button
                      key={part.id}
                      onClick={() => handlePartSelect(part.id)}
                      className={clsx(
                        "px-5 py-3 text-left border-b-2 transition-colors min-w-[100px] relative overflow-hidden",
                        activePartId === part.id 
                          ? "border-accent-blue bg-gray-800" 
                          : "border-transparent hover:bg-gray-800/50"
                      )}
                    >
                      {/* Progress Overlay */}
                      <div 
                        className={clsx(
                            "absolute inset-y-0 left-0 bg-accent-blue/10 z-0 pointer-events-none ease-linear",
                            isPlayingThisPart ? "transition-all" : "transition-none"
                        )}
                        style={{
                            width: `${isPlayingThisPart ? progress : 0}%`,
                            transitionDuration: `${isPlayingThisPart ? transitionDuration : 0}s`
                        }}
                      />

                      <div className="relative z-10">
                          <div className={clsx("text-xs font-bold uppercase tracking-wide", activePartId === part.id ? "text-white" : "text-gray-600")}>
                            {part.name}
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                              <div className="text-[10px] text-accent-blue font-mono h-3 truncate opacity-80 max-w-[80px]">
                                {romanProg || "Empty"}
                              </div>
                              {part.lyrics && <div className="w-1.5 h-1.5 rounded-full bg-accent-purple/70" title="Has Lyrics" />}
                          </div>
                      </div>
                    </button>
                  );
                })}
                <button 
                  onClick={handleAddPart}
                  className="px-4 py-3 text-gray-600 hover:text-white hover:bg-gray-800 transition-colors flex items-center"
                >
                  <Plus size={16} />
                </button>
              </div>

              {/* Chords Scroll */}
              <div className="flex-1 overflow-x-auto p-4 flex items-center gap-3 no-scrollbar relative">
                {activePart.progression.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-600 pointer-events-none">
                    <span className="bg-gray-900/80 px-4 py-2 rounded-full border border-gray-800 text-sm">
                      Tap "+" to add a chord
                    </span>
                  </div>
                )}
                
                {activePart.progression.map((block, idx) => {
                  const isPlayingThisBlock = isPlaying && playingPartId === activePartId && playbackIndex === idx;
                  return (
                    <div 
                      key={block.id}
                      className={clsx(
                        "flex-shrink-0 w-28 h-28 rounded-2xl flex flex-col items-center justify-center relative group transition-all duration-200 border-2 select-none",
                        isPlayingThisBlock ? "border-accent-blue bg-gray-800 scale-105 shadow-xl shadow-accent-blue/10" : "border-gray-800 bg-gray-800/50 hover:border-gray-600"
                      )}
                    >
                      <span className={clsx("text-xl font-bold", 
                        block.functionLabel === 'Secondary' ? 'text-accent-orange' : 
                        block.functionLabel === 'Modal' ? 'text-accent-purple' : 'text-white'
                      )}>
                        {block.root}
                        <span className="text-lg font-normal opacity-70">
                          {block.quality === 'min' ? 'm' : block.quality}
                        </span>
                      </span>
                      <span className="text-[10px] uppercase font-bold text-gray-500 mt-2 tracking-wider">{block.roman || block.functionLabel}</span>
                      
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleRemoveChord(idx); }}
                        className="absolute -top-2 -right-2 bg-gray-800 border border-red-900/50 text-red-500 p-1.5 rounded-full shadow-sm opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  );
                })}
                
                <button
                  onClick={() => setIsDrawerOpen(true)}
                  className="flex-shrink-0 w-16 h-28 rounded-2xl border-2 border-dashed border-gray-800 flex items-center justify-center text-gray-600 hover:text-white hover:border-gray-500 transition-colors active:scale-95"
                >
                  <Plus size={24} />
                </button>
                <div className="w-8 flex-shrink-0" />
              </div>
            </div>
          </div>
        )}

        {/* VIEW: ARRANGE */}
        {view === 'arrange' && (
           <div className="flex flex-col h-full bg-gray-950 p-4 animate-in fade-in duration-300 overflow-y-auto">
              <div className="max-w-md mx-auto w-full space-y-4 pb-20">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-white">Song Structure</h2>
                  <p className="text-sm text-gray-500">Order your parts to create the full song. Tap a part to play/queue.</p>
                </div>
                
                {song.arrangement.length === 0 && (
                   <div className="text-center text-gray-600 py-10 border-2 border-dashed border-gray-800 rounded-xl">
                      No parts in arrangement. Add one below.
                   </div>
                )}

                <div className="space-y-2">
                  {song.arrangement.map((partId, idx) => {
                     const part = song.parts.find(p => p.id === partId);
                     const isActuallyPlaying = isPlaying && playbackMode === 'song' && arrangementIndexRef.current === idx;
                     const isQueued = queuedPartIndex === idx;

                     if (!part) return null;
                     
                     // Playback Progress Calculation
                     const totalBeats = part.progression.reduce((s, b) => s + b.duration, 0);
                     let targetProgress = 0;
                     let transitionDuration = 0;

                     if (isActuallyPlaying && playbackIndex >= 0 && playbackIndex < part.progression.length) {
                         let accumulatedBeats = 0;
                         for (let i=0; i <= playbackIndex; i++) {
                             accumulatedBeats += part.progression[i].duration;
                         }
                         // Target is the END of the current block
                         targetProgress = totalBeats > 0 ? (accumulatedBeats / totalBeats) * 100 : 0;
                         
                         const currentBlock = part.progression[playbackIndex];
                         const beatDuration = 60 / song.bpm;
                         transitionDuration = currentBlock.duration * beatDuration;
                     }

                     // Tick Marks Calculation
                     let tickAccumulator = 0;
                     const tickPositions = part.progression.map(b => {
                        tickAccumulator += b.duration;
                        return totalBeats > 0 ? (tickAccumulator / totalBeats) * 100 : 0;
                     });
                     tickPositions.pop(); // Remove 100% mark

                     // Get Roman analysis for preview
                     const romanProg = part.progression.map(b => b.roman).filter(Boolean).join(' - ');

                     return (
                        <div 
                            key={`${partId}-${idx}`} 
                            onClick={() => handleArrangementPartClick(idx)}
                            className={clsx(
                                "flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden",
                                isActuallyPlaying ? "bg-gray-800 border-accent-blue shadow-lg shadow-accent-blue/10" : "bg-gray-900 border-gray-800 hover:bg-gray-800/50",
                                isQueued && "border-accent-green"
                            )}
                        >
                           {/* Progress Bar Background */}
                           <div 
                                className={clsx(
                                    "absolute inset-y-0 left-0 bg-accent-blue/10 z-0 pointer-events-none ease-linear",
                                    isActuallyPlaying ? "transition-all" : "transition-none"
                                )}
                                style={{
                                    width: `${isActuallyPlaying ? targetProgress : 0}%`,
                                    transitionDuration: `${isActuallyPlaying ? transitionDuration : 0}s`
                                }}
                           />
                           
                           {/* Chord Ticks */}
                           <div className="absolute inset-0 pointer-events-none z-0">
                                {tickPositions.map((pos, i) => (
                                    <div 
                                        key={i}
                                        className="absolute top-0 bottom-0 border-r border-gray-700/30"
                                        style={{ left: `${pos}%` }} 
                                    />
                                ))}
                           </div>

                           {isQueued && (
                               <div className="absolute right-0 top-0 bg-accent-green text-black text-[9px] font-bold px-2 py-0.5 rounded-bl-lg z-20">
                                   NEXT
                               </div>
                           )}
                           <div className="flex items-center gap-4 overflow-hidden relative z-10">
                              <span className={clsx("font-mono text-sm w-6", isActuallyPlaying ? "text-accent-blue font-bold" : "text-gray-600")}>
                                  {isActuallyPlaying ? <div className="animate-bounce"><Music size={14}/></div> : idx + 1}
                              </span>
                              <div className="min-w-0">
                                 <div className="font-bold text-white truncate">{part.name}</div>
                                 <div className="text-xs text-accent-blue font-mono truncate">{romanProg || `${part.progression.length} Chords`}</div>
                              </div>
                           </div>
                           <div className="flex items-center gap-1 flex-shrink-0 relative z-10">
                              <button onClick={(e) => { e.stopPropagation(); moveArrangementItem(idx, 'up'); }} className="p-2 text-gray-500 hover:text-white"><ChevronUp size={16}/></button>
                              <button onClick={(e) => { e.stopPropagation(); moveArrangementItem(idx, 'down'); }} className="p-2 text-gray-500 hover:text-white"><ChevronDown size={16}/></button>
                              <button onClick={(e) => { e.stopPropagation(); removeFromArrangement(idx); }} className="p-2 text-red-500/50 hover:text-red-500 ml-2"><X size={16}/></button>
                           </div>
                        </div>
                     )
                  })}
                </div>

                <div className="pt-4">
                   <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Add Section</h3>
                   <div className="flex flex-wrap gap-2">
                      {song.parts.map(part => (
                        <button 
                          key={part.id}
                          onClick={() => addToArrangement(part.id)}
                          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition-colors"
                        >
                          + {part.name}
                        </button>
                      ))}
                   </div>
                </div>
              </div>
           </div>
        )}

      </main>

      {/* Bottom Navigation */}
      <nav className="h-16 bg-gray-900 border-t border-gray-800 flex justify-around items-center px-4 flex-shrink-0 z-30">
         <button 
           onClick={() => setView('compose')}
           className={clsx("flex flex-col items-center gap-1 transition-colors", view === 'compose' ? "text-accent-blue" : "text-gray-500 hover:text-gray-300")}
         >
            <Layout size={20} />
            <span className="text-[10px] font-medium uppercase tracking-wide">Studio</span>
         </button>
         <button 
           onClick={() => setView('arrange')}
           className={clsx("flex flex-col items-center gap-1 transition-colors", view === 'arrange' ? "text-accent-blue" : "text-gray-500 hover:text-gray-300")}
         >
            <ListMusic size={20} />
            <span className="text-[10px] font-medium uppercase tracking-wide">Arrange</span>
         </button>
      </nav>

      {/* Library Modal */}
      {isLibraryOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           <div className="bg-gray-900 w-full max-w-sm rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center p-4 border-b border-gray-800">
                 <h2 className="text-lg font-bold flex items-center gap-2"><FolderOpen size={20} className="text-accent-blue" /> Library</h2>
                 <button onClick={() => setIsLibraryOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              
              <div className="p-4 bg-gray-800/50 border-b border-gray-800">
                <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest mb-3">Current Project</h3>
                <div className="flex items-center justify-between gap-2">
                   <div className="flex-1 overflow-hidden">
                      <div className="font-bold text-white truncate">{song.title}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} /> 
                        {new Date(song.lastModified).toLocaleTimeString()} (Unsaved changes)
                      </div>
                   </div>
                   <div className="flex gap-2">
                      <button 
                        onClick={handleSaveToLibrary}
                        className="p-2 bg-accent-blue rounded-lg text-white hover:bg-blue-600 transition-colors"
                        title="Save current song"
                      >
                         <Save size={18} />
                      </button>
                      <button 
                        onClick={handleNewProject}
                        className="p-2 bg-gray-700 rounded-lg text-white hover:bg-gray-600 transition-colors"
                        title="Start new project"
                      >
                         <FilePlus size={18} />
                      </button>
                   </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                 <h3 className="text-xs text-gray-500 font-bold uppercase tracking-widest">Saved Projects</h3>
                 {savedSongs.length === 0 ? (
                    <div className="text-center py-8 text-gray-600 text-sm">No saved songs found.</div>
                 ) : (
                    savedSongs.sort((a,b) => b.lastModified - a.lastModified).map(s => (
                      <div key={s.id} onClick={() => handleLoadSong(s)} className="group p-3 rounded-xl bg-gray-800 border border-gray-700 hover:border-accent-blue transition-colors cursor-pointer flex justify-between items-center">
                         <div>
                            <div className="font-bold text-white group-hover:text-accent-blue transition-colors">{s.title}</div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                               <span>{s.bpm} BPM</span> • <span>{s.keyRoot} {s.scaleType}</span>
                            </div>
                         </div>
                         <button 
                           onClick={(e) => handleDeleteSong(s.id, e)}
                           className="p-2 text-gray-600 hover:text-red-500 hover:bg-gray-900 rounded-lg transition-all"
                         >
                           <Trash2 size={16} />
                         </button>
                      </div>
                    ))
                 )}
              </div>
           </div>
        </div>
      )}

      {/* Wand Modal */}
      {isWandOpen && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
              <div className="bg-gray-900 w-full max-w-sm rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-800/50">
                      <div className="flex items-center gap-2">
                          <Wand2 size={20} className="text-accent-orange" />
                          <h2 className="text-lg font-bold">Auto-Generate</h2>
                      </div>
                      <button onClick={() => setIsWandOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
                  </div>
                  
                  <div className="p-6">
                      <p className="text-sm text-gray-400 mb-6">
                          Generates a theory-based progression for <b>{activePart.name}</b>. This will append to your current chords.
                      </p>

                      <div className="space-y-4 mb-6">
                          <label className="block text-sm font-bold text-gray-500 uppercase tracking-wider">Select Style</label>
                          <div className="grid grid-cols-2 gap-3">
                              {(['Pop', 'Jazz', 'Rock', 'LoFi'] as GenreType[]).map(g => (
                                  <button
                                    key={g}
                                    onClick={() => setWandGenre(g)}
                                    className={clsx(
                                        "py-3 rounded-xl border font-bold text-sm transition-all",
                                        wandGenre === g 
                                            ? "bg-accent-orange border-accent-orange text-black shadow-lg shadow-accent-orange/20" 
                                            : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                                    )}
                                  >
                                      {g}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <button 
                        onClick={executeMagicWand}
                        className="w-full py-4 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                      >
                          <Sparkles size={18} className="text-accent-orange" />
                          Generate Progression
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
           <div className="bg-gray-900 w-full max-w-sm rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center p-4 border-b border-gray-800">
                 <h2 className="text-lg font-bold">Project Settings</h2>
                 <button onClick={() => setIsSettingsOpen(false)} className="text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="p-6 space-y-6">
                 {/* BPM */}
                 <div>
                    <div className="flex justify-between mb-2">
                       <label className="text-sm font-medium text-gray-400">Tempo</label>
                       <span className="text-sm font-bold text-accent-blue">{song.bpm} BPM</span>
                    </div>
                    <input 
                      type="range" 
                      min="60" max="200" 
                      value={song.bpm}
                      onChange={(e) => setSong({...song, bpm: parseInt(e.target.value)})}
                      className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-accent-blue"
                    />
                 </div>

                 {/* Key */}
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                       <label className="block text-sm font-medium text-gray-400 mb-2">Key</label>
                       <select 
                         value={song.keyRoot}
                         onChange={(e) => setSong({...song, keyRoot: e.target.value})}
                         className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-accent-blue outline-none"
                       >
                         {['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(k => (
                           <option key={k} value={k}>{k}</option>
                         ))}
                       </select>
                    </div>
                    <div>
                       <label className="block text-sm font-medium text-gray-400 mb-2">Scale</label>
                       <select 
                         value={song.scaleType}
                         onChange={(e) => setSong({...song, scaleType: e.target.value as 'Major'|'Minor'})}
                         className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:border-accent-blue outline-none"
                       >
                         <option value="Major">Major</option>
                         <option value="Minor">Minor</option>
                       </select>
                    </div>
                 </div>

                 {/* Vibe */}
                 <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Instrument</label>
                    <div className="grid grid-cols-3 gap-2">
                       {['Piano', 'Strum', 'Synth'].map((v) => (
                         <button
                           key={v}
                           onClick={() => setSong({...song, vibe: v as any})}
                           className={clsx(
                             "py-2 rounded-lg text-sm font-medium border transition-colors",
                             song.vibe === v 
                               ? "bg-accent-blue border-accent-blue text-white" 
                               : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                           )}
                         >
                           {v}
                         </button>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Drawer Overlay */}
      {isDrawerOpen && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
           <div className="h-[75vh] w-full bg-gray-900 rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 flex flex-col">
              <ChordSelector 
                rootKey={song.keyRoot} 
                onSelect={handleAddChord} 
                onClose={() => setIsDrawerOpen(false)} 
              />
           </div>
        </div>
      )}
      
    </div>
  );
};

export default App;