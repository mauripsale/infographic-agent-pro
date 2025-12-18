
export interface SlidePrompt {
  index: number;
  total: number;
  title: string;
  rawContent: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
}

export enum ModelType {
  FLASH = 'gemini-2.5-flash-image',
  PRO = 'gemini-3-pro-image-preview'
}

export enum DetailLevel {
  SUPER_SIMPLE = 'super-simple',
  BASIC = 'basic',
  SEMI_DETAILED = 'semi-detailed',
  DETAILED = 'detailed',
  SUPER_DETAILED = 'super-detailed'
}

export interface GenerationConfig {
  slideCount: number;
  detailLevel: DetailLevel;
  style?: string;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    // Fixed: Making aistudio optional to match potential system-level definitions and resolve modifier mismatch errors
    aistudio?: AIStudio;
  }
}