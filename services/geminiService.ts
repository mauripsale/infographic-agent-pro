import { GoogleGenAI } from "@google/genai";
import { ModelType, DetailLevel, GenerationConfig } from "../types";

export interface ScriptGenerationResult {
  text: string;
  groundingChunks?: any[];
}

export const getApiKey = (): string | null => {
  // Return env var if present (priority), otherwise check local storage
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '');
  if (envKey) return envKey;
  return localStorage.getItem('gemini-api-key');
};

export const setApiKey = (key: string) => {
  localStorage.setItem('gemini-api-key', key);
};

const getBackendUrl = () => {
  const url = import.meta.env.VITE_BACKEND_URL;
  if (url) return url.replace(/\/$/, ''); // Remove trailing slash
  return '/api'; // Use local proxy
};

/**
 * Generates an infographic script from source content using the Python ADK Agent.
 */
export const generateScriptFromSource = async (
  source: string,
  config: GenerationConfig
): Promise<ScriptGenerationResult> => {
  try {
    const apiKey = getApiKey();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(`${getBackendUrl()}/generate-script`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        source_content: source,
        slide_count: config.slideCount,
        detail_level: config.detailLevel,
        // Pass model if available in config, otherwise backend defaults to flash
        model: config.model || 'gemini-2.0-flash' 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to generate script via ADK Agent');
    }

    const data = await response.json();
    return {
      text: data.script,
      groundingChunks: [], // Grounding info handling to be added to backend later
    };
  } catch (error: any) {
    console.error("ADK Agent Error:", error);
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
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error("API_KEY_REQUIRED");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
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

    // Check if any candidate was returned
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("GENERATION_BLOCKED_BY_SAFETY");
    }

    const candidate = response.candidates[0];
    
    // Check if generation was blocked by safety filters
    if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST' || candidate.finishReason === 'RECITATION') {
      throw new Error("GENERATION_BLOCKED_BY_SAFETY");
    }

    // Correctly extract the image from potentially multiple response parts
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("NO_IMAGE_DATA_RETURNED");
  } catch (error: any) {
    if (error.message?.includes("Requested entity was not found")) {
      throw new Error("API_KEY_RESET_REQUIRED");
    }
    
    // Pass through our specific errors
    if (error.message === "GENERATION_BLOCKED_BY_SAFETY" || error.message === "NO_IMAGE_DATA_RETURNED") {
      throw error;
    }

    throw error;
  }
};