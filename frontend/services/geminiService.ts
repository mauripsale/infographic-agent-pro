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

interface CancellablePromise<T> extends Promise<T> {
  cancel: () => void;
}

/**
 * Generates an infographic script asynchronously via Firestore Jobs.
 * This function returns a Promise with a `cancel()` method to abort the process.
 */
export const generateScriptFromSource = (
  source: string,
  config: GenerationConfig
): CancellablePromise<ScriptGenerationResult> => {
  const controller = new AbortController();
  const signal = controller.signal;

  const promise = new Promise<ScriptGenerationResult>(async (resolve, reject) => {
    let unsubscribe = () => {};

    const timeoutId = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Job timed out after 5 minutes.`));
    }, 300000);

    // Function to clean up listeners
    const cleanup = () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };

    signal.addEventListener('abort', () => {
      cleanup();
      reject(new Error("Cancelled"));
    });

    try {
      // 1. Start the Job
      const apiKey = getApiKey();
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;

      const response = await fetch(`${getBackendUrl()}/generate-script`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          source_content: source,
          slide_count: config.slideCount,
          detail_level: config.detailLevel,
          target_language: LANGUAGE_MAP[config.language] || 'English',
          model: config.model || 'gemini-2.5-flash' 
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error((await response.json()).detail || 'Failed to start job');
      }

      const { jobId } = await response.json();
      console.log(`Job started: ${jobId}`);

      // 2. Wait for Completion via Firestore
      const jobRef = doc(db, 'jobs', jobId);
      
      unsubscribe = onSnapshot(jobRef, (docSnap) => {
        if (!docSnap.exists()) return;
        
        const data = docSnap.data();
        console.log(`Job ${jobId} status: ${data.status}`);

        if (data.status === 'completed') {
          cleanup();
          resolve({ text: data.result.script, groundingChunks: [] });
        } else if (data.status === 'failed') {
          cleanup();
          reject(new Error(data.error || 'Job failed'));
        }
      }, (error) => {
        console.error("Firestore listen error:", error);
        cleanup();
        reject(error);
      });

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Fetch was aborted, which is expected. The promise will be rejected by the event listener.
        return;
      }
      cleanup();
      reject(error);
    }
  }) as CancellablePromise<ScriptGenerationResult>;

  promise.cancel = () => {
    controller.abort();
  };

  return promise;
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