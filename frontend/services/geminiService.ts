import { ModelType, GenerationConfig } from "../types";

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

const LANGUAGE_MAP: Record<string, string> = {
  'en': 'English',
  'it': 'Italian'
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
        target_language: LANGUAGE_MAP[config.language] || 'English',
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
      groundingChunks: [], // Grounding handling is now in backend
    };
  } catch (error: any) {
    console.error("ADK Agent Error:", error);
    throw new Error(`Failed to generate script: ${error.message}`);
  }
};

/**
 * Generates a visual infographic image via the Python Backend.
 */
export const generateInfographicImage = async (
  prompt: string,
  model: ModelType,
  aspectRatio: string // Restored parameter to match App.tsx usage
): Promise<string> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error("API_KEY_REQUIRED");
  }

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }

    const response = await fetch(`${getBackendUrl()}/generate-image`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        prompt: prompt,
        model: model, // Using the parameter passed from UI
        aspect_ratio: aspectRatio 
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to generate image via Backend');
    }

    const data = await response.json();
    
    if (data.image_data) {
      return `data:${data.mime_type};base64,${data.image_data}`;
    }

    throw new Error("No image data found in response");
  } catch (error: any) {
    console.error("Backend Image Error:", error);
    if (error.message === "GENERATION_BLOCKED_BY_SAFETY") {
       throw error;
    }
    throw new Error(error.message || "Failed to generate image.");
  }
};
