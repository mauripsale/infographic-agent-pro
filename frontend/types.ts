


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
  FLASH = 'gemini-2.5-flash',
  PRO = 'gemini-3-pro-image-preview',
  GEMINI_3_0 = 'gemini-3.0'
}



export enum DetailLevel {

  SUPER_SIMPLE = 'super-simple',

  BASIC = 'basic',

  SEMI_DETAILED = 'semi-detailed',

  DETAILED = 'detailed',

  SUPER_DETAILED = 'super-detailed'

}



export enum AspectRatio {

  SIXTEEN_NINE = '16:9',

  FOUR_THREE = '4:3',

  SQUARE = '1:1',

}







export enum Language {



  ENGLISH = 'en',



  ITALIAN = 'it'



}







export interface GenerationConfig {







  slideCount: number;







  detailLevel: DetailLevel;







  style: string;







  aspectRatio: AspectRatio;







  language: Language;







  model?: string;







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