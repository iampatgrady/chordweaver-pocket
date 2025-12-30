import { ChordQuality } from '../types';
import { getChordNotes } from '../utils/musicTheory';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private isInit = false;

  init() {
    if (this.isInit) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);
    this.gainNode.gain.value = 0.3; // Master volume
    this.isInit = true;
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Frequency table for a few octaves
  private getFreq(note: string, octave: number = 4): number {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const semitones = notes.indexOf(note);
    if (semitones === -1) return 440;
    
    // A4 is 440Hz. A is index 9.
    // Distance from A4 in semitones:
    const octDiff = octave - 4;
    const baseSemitones = semitones - 9; 
    const totalSemitones = baseSemitones + (octDiff * 12);
    
    return 440 * Math.pow(2, totalSemitones / 12);
  }

  playNote(note: string, octave: number, duration: number, time: number, type: 'sine' | 'square' | 'triangle' | 'sawtooth' = 'triangle') {
    if (!this.ctx || !this.gainNode) return;

    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.value = this.getFreq(note, octave);

    osc.connect(env);
    env.connect(this.gainNode);

    // Adjust volume based on wave type (Square/Saw are naturally louder/harsher)
    const peakGain = (type === 'square' || type === 'sawtooth') ? 0.15 : 0.5;

    // Envelope
    // fast attack to avoid clicking but feel responsive
    const attackTime = 0.02; 
    
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(peakGain, time + attackTime);
    
    // For short notes (arps), decay quickly. For long notes, sustain slightly.
    if (duration < 0.5) {
       // Percussive/Pluck shape
       env.gain.exponentialRampToValueAtTime(0.001, time + duration); 
    } else {
       // Sustain shape
       env.gain.setValueAtTime(peakGain * 0.8, time + attackTime + 0.1);
       env.gain.exponentialRampToValueAtTime(0.001, time + duration);
    }

    osc.start(time);
    osc.stop(time + duration + 0.1);
  }

  playChord(root: string, quality: ChordQuality, durationSeconds: number, vibe: 'Piano' | 'Strum' | 'Synth') {
    this.resume();
    if (!this.ctx) return;
    
    const now = this.ctx.currentTime;
    const notes = getChordNotes(root, quality);
    
    if (vibe === 'Piano') {
      // Arpeggiated slightly for human feel (Roll)
      this.playNote(root, 3, durationSeconds, now, 'triangle'); // Bass
      notes.forEach((n, i) => {
         this.playNote(n, 4, durationSeconds, now + 0.03 + (i * 0.03), 'triangle');
      });
      
    } else if (vibe === 'Strum') {
      // Guitar-like strum delay (slower roll)
      this.playNote(root, 3, durationSeconds, now, 'sawtooth');
      notes.forEach((n, i) => {
         this.playNote(n, 4, durationSeconds, now + (i * 0.06), 'sawtooth');
      });
      
    } else {
      // SYNTH: Intelligent Arpeggiator (Eighth Notes)
      
      // 1. Bass Drone (Pad) - Low Octave
      this.playNote(root, 2, durationSeconds, now, 'sawtooth');
      
      // 2. Arpeggiator Notes
      // Construct a pool of available notes for the arp
      const arpPool = [
          { note: root, octave: 3 },
          ...notes.map(n => ({ note: n, octave: 4 })),
          ...notes.map(n => ({ note: n, octave: 5 })) // Extended range for variation
      ];

      // Assuming durationSeconds represents a Bar (4 beats). 
      // We want Eighth notes -> 8 steps.
      const steps = 8;
      const stepDuration = durationSeconds / steps;

      // Intelligent Pattern Selection (Up-Down for 8th notes)
      // This pattern indices work well for both Triads (hitting 5th-Octave) and 7ths (hitting 7th)
      // Pool structure: [Root3, Root4, 3rd4, 5th4, (7th4 or Root5), ...]
      const patternIndices = [0, 1, 2, 3, 4, 3, 2, 1];

      for (let i = 0; i < steps; i++) {
         const poolIndex = patternIndices[i % patternIndices.length];
         // Safety check
         if (poolIndex < arpPool.length) {
             const target = arpPool[poolIndex];
             // Play short, plucky square wave
             // duration * 0.8 leaves a small gap for articulation
             this.playNote(target.note, target.octave, stepDuration * 0.8, now + (i * stepDuration), 'square');
         }
      }
    }
  }
}

export const engine = new AudioEngine();