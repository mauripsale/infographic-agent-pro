import { ModelType, GenerationConfig } from "../types";
import { db } from "./firebaseConfig";
import { doc, onSnapshot } from "firebase/firestore";

export interface ScriptGenerationResult {
  text: string;
  groundingChunks?: any[];
}

export const getApiKey = (): string | null => {
  const envKey = import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '');
  if (envKey) return envKey;
  return localStorage.getItem('gemini-api-key');
};

export const setApiKey = (key: string) => {
  localStorage.setItem('gemini-api-key', key);
};

const getBackendUrl = () => {
  const url = import.meta.env.VITE_BACKEND_URL;
  if (url) return url.replace(/\/$/, '');
  return '/api'; 
};

const LANGUAGE_MAP: Record<string, string> = {
  'en': 'English',
  'it': 'Italian'
};

/**
 * Generates an infographic script asynchronously via Firestore Jobs.
 */
export const generateScriptFromSource = async (
  source: string,
  config: GenerationConfig
): Promise<ScriptGenerationResult> => {
  const apiKey = getApiKey();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  // 1. Start the Job
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
    throw new Error(errorData.detail || 'Failed to start script generation job');
  }

  const { jobId } = await response.json();
  console.log(`Job started: ${jobId}`);

  // 2. Wait for Completion via Firestore
  return new Promise((resolve, reject) => {
    const jobRef = doc(db, 'jobs', jobId);
    
    const unsubscribe = onSnapshot(jobRef, (docSnap) => {
      if (!docSnap.exists()) return;
      
      const data = docSnap.data();
      console.log(`Job ${jobId} status: ${data.status}`);

      if (data.status === 'completed') {
        unsubscribe();
        resolve({
          text: data.result.script,
          groundingChunks: [],
        });
      } else if (data.status === 'failed') {
        unsubscribe();
        reject(new Error(data.error || 'Job failed'));
      }
      // If 'pending' or 'processing', keep waiting...
    }, (error) => {
      console.error("Firestore listen error:", error);
      unsubscribe();
      reject(error);
    });
  });
};

/**
 * Generates a visual infographic image via the Python Backend.
 */
export const generateInfographicImage = async (
  prompt: string,
  model: ModelType,
  aspectRatio: string
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
        model: model, 
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
