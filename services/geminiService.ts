
import { GoogleGenAI } from "@google/genai";
import { ModelType, DetailLevel, GenerationConfig } from "../types";

export interface ScriptGenerationResult {
  text: string;
  groundingChunks?: any[];
}

/**
 * Generates an infographic script from source content using Gemini Pro.
 * Includes Google Search grounding for accurate and up-to-date information.
 */
export const generateScriptFromSource = async (
  source: string,
  config: GenerationConfig
): Promise<ScriptGenerationResult> => {
  // Always create a new instance to ensure it uses the most up-to-date API key from the session
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  const model = 'gemini-3-pro-preview';

  const systemInstruction = `You are an expert Infographic Script Designer. 
Your task is to transform provided content (text or URLs) into a structured infographic script.

FORMATTING RULES:
For each slide, you MUST use this exact header format:
#### Infographic X/Y: [Title]

Inside each slide block, include:
- Layout Description: A visual description for an AI image generator.
- Body Sections: Content to be displayed.
- Content Details: Specific instructions on colors, icons, and text style.

DETAIL LEVEL GUIDELINES:
- ${DetailLevel.SUPER_SIMPLE}: Minimal text, 1 key takeaway, large icons.
- ${DetailLevel.BASIC}: Summary format, 2-3 bullet points.
- ${DetailLevel.SEMI_DETAILED}: Balanced layout with 3-4 sections.
- ${DetailLevel.DETAILED}: Comprehensive breakdown, sub-metrics, and data points.
- ${DetailLevel.SUPER_DETAILED}: In-depth analysis, complex diagrams, extensive text blocks.

STYLE: ${config.style || 'Modern, professional, corporate tech style with clean lines and balanced whitespace.'}

NUMBER OF SLIDES: Generate exactly ${config.slideCount} slides.`;

  const prompt = `Generate a ${config.detailLevel} infographic script with ${config.slideCount} slides based on the following source content:
  
  ${source}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }], // Use search to handle URLs or gather context
      }
    });

    // Extract grounding chunks as required by Gemini API guidelines for search grounding
    return {
      text: response.text || '',
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_RESET_REQUIRED");
    }
    throw new Error(`Failed to generate script: ${error.message}`);
  }
};

/**
 * Generates a visual infographic image for a specific slide script.
 * Supports both Gemini Flash and Gemini Pro image models via generateContent.
 */
export const generateInfographicImage = async (
  prompt: string,
  model: ModelType
): Promise<string> => {
  // Always create a new instance right before making an API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            text: `Create a professional, high-quality infographic image based on this script segment. 
            Ensure all text described is incorporated visually and clearly. 
            The style should be consistent, aesthetic, and professional.
            
            Segment:
            ${prompt}`
          }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          ...(model === ModelType.PRO ? { imageSize: "1K" } : {})
        }
      }
    });

    // Correctly extract the image from potentially multiple response parts
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image data found in response");
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_RESET_REQUIRED");
    }
    throw error;
  }
};