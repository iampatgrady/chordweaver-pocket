import { GoogleGenAI } from "@google/genai";
import { Song } from "../types";

export const generateSongLyrics = async (
  song: Song, 
  partId: string
): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini");
    return "API Key missing. Please configure environment.";
  }

  const part = song.parts.find(p => p.id === partId);
  if (!part) return "Part not found.";

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Construct detailed chord analysis for the AI
    const chordAnalysis = part.progression.map((b, i) => {
       let analysis = `${b.root}${b.quality}`;
       if (b.functionLabel === 'Secondary') analysis += " (Secondary Dominant)";
       if (b.functionLabel === 'Modal') analysis += " (Modal Interchange)";
       return `Bar ${i+1}: ${analysis}`;
    }).join('\n');

    const otherParts = song.parts
      .filter(p => p.id !== partId)
      .map(p => p.name)
      .join(', ');

    const prompt = `
      You are a professional songwriter.
      Write lyrics for the "${part.name}" of a song titled "${song.title}".
      
      Song Context:
      Key: ${song.keyRoot} ${song.scaleType}
      Vibe: ${song.vibe}
      Structure includes: ${otherParts || "No other parts yet"}
      
      Chord Progression:
      ${chordAnalysis}
      
      Instructions:
      1. Write lyrics that strictly fit the rhythm and structure of the provided chords.
      2. CRITICAL: Align the emotional content with the harmonic analysis (e.g., tension on Secondary Dominants).
      3. FORMATTING: Embed the chord names (e.g., [Am7] or [V7]) within the lyrics in brackets exactly where the chord change occurs relative to the words. 
         Example: "[C] Hello darkness [Am] my old friend"
      4. Keep the tone consistent with the "${song.vibe}" vibe.
      5. Only return the lyrics with the embedded chords. Do not include headers or conversational text.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Could not generate lyrics.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error connecting to AI service.";
  }
};