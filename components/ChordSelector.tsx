import React from 'react';
import { getAllSuggestions } from '../utils/musicTheory';
import { ChordDefinition, Note } from '../types';
import { ArrowDown, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

interface ChordSelectorProps {
  rootKey: Note;
  onSelect: (chord: ChordDefinition) => void;
  onClose: () => void;
}

const ChordSelector: React.FC<ChordSelectorProps> = ({ rootKey, onSelect, onClose }) => {
  const suggestions = getAllSuggestions(rootKey);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white overflow-y-auto pb-8">
      <div className="flex justify-between items-center p-4 border-b border-gray-800 sticky top-0 bg-gray-900 z-10">
        <h2 className="text-lg font-bold">Add Chord</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-white">Close</button>
      </div>

      <div className="p-4 space-y-6">
        
        {/* Tier 1: Main Chords */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 bg-accent-blue rounded-full"></div>
            <h3 className="text-md font-semibold text-accent-blue">Main Chords (Diatonic)</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {suggestions.main.map((chord, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(chord)}
                className="flex flex-col items-center justify-center p-4 bg-gray-800 rounded-xl active:bg-accent-blue transition-colors border border-gray-700 hover:border-accent-blue"
              >
                <span className="text-xl font-bold">{chord.display}</span>
                <span className="text-xs text-gray-400">{chord.roman}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Tier 2: Secondary Dominants */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 bg-accent-orange rounded-full"></div>
            <h3 className="text-md font-semibold text-accent-orange">Secondary Dominants (Push)</h3>
          </div>
          <p className="text-xs text-gray-500 mb-2">Select a chord to push to its target.</p>
          <div className="grid grid-cols-3 gap-3">
            {suggestions.secondary.map((chord, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(chord)}
                className="flex flex-col items-center justify-center p-3 bg-gray-800 rounded-xl border border-gray-700 active:bg-accent-orange/20 transition-colors hover:border-accent-orange"
              >
                 <span className="text-lg font-bold text-white">{chord.display}</span>
                 <span className="text-[10px] text-accent-orange mb-1">{chord.roman}</span>
                 <div className="flex items-center gap-1 opacity-60">
                    <ArrowRight size={10} />
                    <span className="text-[10px] uppercase font-bold">{chord.target}</span>
                 </div>
              </button>
            ))}
          </div>
        </section>

        {/* Tier 3: Modal Interchange */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-6 bg-accent-purple rounded-full"></div>
            <h3 className="text-md font-semibold text-accent-purple">Modal Interchange (Color)</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {suggestions.modal.map((chord, idx) => (
              <button
                key={idx}
                onClick={() => onSelect(chord)}
                className="flex flex-col items-center justify-center p-3 bg-gray-800 rounded-xl border border-gray-700 active:bg-accent-purple/20"
              >
                <span className="text-lg font-bold">{chord.display}</span>
                <span className="text-xs text-accent-purple">{chord.roman}</span>
              </button>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};

export default ChordSelector;