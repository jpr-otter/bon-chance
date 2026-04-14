export interface OcrResult {
  text: string;
  confidence: number;
  items: ParsedItem[];
  store?: StoreDetection;
  total?: number;
  date?: Date;
  metadata: OcrMetadata;
}

export interface ParsedItem {
  description: string;
  price: number;
  quantity: number;
  unit?: string;
  confidence: number;
  position: ItemPosition;
  category?: string;
  rawLine?: string;
}

export interface StoreDetection {
  name: string;
  confidence: number;
  location?: string;
  address?: string;
  chainType?: string;
}

export interface OcrMetadata {
  processingTime: number;
  imageQuality: number;
  language: string;
  ocrEngine: string;
  version: string;
  preprocessingSteps: string[];
}

export interface ItemPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  lineNumber?: number;
}

// OCR Configuration
export interface OcrConfig {
  language: string;
  whitelist?: string;
  preserveInterwordSpaces: boolean;
  psm?: number; // Page Segmentation Mode
  oem?: number; // OCR Engine Mode
}

// OCR Processing Status
export interface OcrProgress {
  status: 'initializing' | 'recognizing' | 'parsing' | 'completed' | 'error';
  progress: number; // 0-100
  message: string;
  currentStep?: string;
}

// Store-specific parsing rules
export interface StoreParsingRule {
  storePattern: RegExp;
  itemLinePattern: RegExp;
  pricePattern: RegExp;
  totalPattern: RegExp;
  datePattern: RegExp;
  skipPatterns: RegExp[];
}
