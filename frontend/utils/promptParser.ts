
import { SlidePrompt } from '../types';

/**
 * Parses a batch prompt into individual slide data.
 * Designed to be flexible and "non-rigid" to handle various user input styles.
 */
export const parseBatchPrompt = (text: string): SlidePrompt[] => {
  // Flexible regex to handle:
  // - Optional Markdown headers (# to ######)
  // - Optional bolding (** or __)
  // - Keywords: Infographic, Infografica, Slide, Diapositiva, Page, etc. (optional)
  // - Formats: "1/10", "1 of 10", "1 \ 10", or just "1"
  // - Optional titles with colons or dashes
  const slideRegex = /(?:\r?\n|^)#{1,6}\s*[\*_]*\s*(?:[a-z\u00C0-\u017F]+)?\s*(\d+)\s*(?:\/|of|\\)?\s*(\d+)?\s*[\*_]*\s*[:\-\s]*(.*)/gi;
  
  const matches = Array.from(text.matchAll(slideRegex));
  
  if (matches.length === 0) {
    // Fallback: If no headers are found, try searching for any "X/Y" pattern at the start of lines
    const fallbackRegex = /(?:\r?\n|^)[\*_]*\s*(?:[a-z\u00C0-\u017F]+)?\s*(\d+)\s*(?:\/|of)\s*(\d+)\s*[\*_]*\s*[:\-\s]*(.*)/gi;
    const fallbackMatches = Array.from(text.matchAll(fallbackRegex));
    if (fallbackMatches.length > 0) {
      return extractSlides(text, fallbackMatches);
    }
    return [];
  }

  return extractSlides(text, matches);
};

function extractSlides(text: string, matches: RegExpMatchArray[]): SlidePrompt[] {
  return matches.map((match, i) => {
    const index = parseInt(match[1]);
    const total = match[2] ? parseInt(match[2]) : matches.length;
    
    // Clean up the title (remove trailing markdown bolding if captured)
    let title = match[3]?.replace(/[\*_]+$/, '').trim() || `Slide ${index}`;
    
    // Find content between this header and the next one
    const startPos = match.index! + match[0].length;
    const endPos = matches[i + 1] ? matches[i + 1].index : text.length;
    const rawContent = text.substring(startPos, endPos).trim();
    
    return {
      index,
      total,
      title,
      rawContent,
      status: 'pending',
    };
  });
}
